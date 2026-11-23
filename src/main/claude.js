// Runs Claude Code for one prompt, locked down to the course tools, and turns its output into
// simple events for the window: thinking, steps, reply text, changes, confirmations and usage.
const { spawn } = require('child_process');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const bin = require('./bin');

const FRIENDLY = {
  mcp__andromeda__add_courses: 'Adding courses',
  mcp__andromeda__update_course: 'Updating course details',
  mcp__andromeda__set_upcoming: 'Updating Coming up',
  mcp__andromeda__remove_upcoming: 'Removing from Coming up',
  mcp__andromeda__set_weeks: 'Updating weeks',
  mcp__andromeda__attach_files: 'Filing slides',
  mcp__andromeda__delete_course: 'Asking before deleting',
  mcp__andromeda__remove_files: 'Asking before removing files',
};
const stepLabel = (name, input) => {
  if (name === 'Read') return `Read ${path.basename(String((input && input.file_path) || 'a file'))}`;
  return FRIENDLY[name] || 'Working';
};

const BRIEF = `You are the course assistant inside Andromeda, a study app. You only work on the user's courses and the material in them.

Rules:
- Treat every message as a request about the user's courses or course material. Act with your tools, or answer from the course summary and the course files.
- Start every reply with a source tag on its own line: [sources: the course names you used] or [sources: all courses]. Then the reply.
- If a message is not about their courses or course material, reply with exactly [none] and nothing else.
- Course files: read the saved text at the "text at" paths in the summary. Only open an original PDF page (Read with pages) when a picture on that page matters. Never read a whole original when its text exists.
- Keep replies short: one to three sentences, unless the user asks you to explain material.
- Use several items per tool call where you can. Dates go to tools as YYYY-MM-DD and times as 24-hour HH:MM. When no year is given, use the next date that is still ahead.
- If it's unclear which course they mean, ask one short question instead of guessing.
- Deleting a course or removing files: call the tool, then tell the user in one line that it's waiting for their OK.
- Files under "Waiting to be filed" go into a course with attach_files once you know which course.
- Changing something that already exists (renaming a test, moving a date, relabelling a week) means editing that item by its [id ...] from the summary, never adding a new one.`;

function parseUsage(info, prev) {
  const out = { ...(prev || {}) };
  const norm = (u) => (u == null ? null : u > 1.0001 ? u / 100 : u);
  const when = (t) => (t == null ? null : typeof t === 'number' ? (t < 1e12 ? t * 1000 : t) : Date.parse(t) || null);
  const wins = (info && (info.unifiedWindows || info.unified_windows || info.windows)) || {};
  const take = (key, w) => { if (w && (w.utilization != null || w.used_percentage != null)) out[key] = { pct: norm(w.utilization ?? w.used_percentage / 100), resetsAt: when(w.resetsAt ?? w.resets_at) }; };
  take('fiveHour', wins.five_hour || wins.fiveHour);
  take('week', wins.seven_day || wins.sevenDay);
  if (info && info.rateLimitType && info.utilization != null) {
    take(/five|5h/i.test(info.rateLimitType) ? 'fiveHour' : 'week', { utilization: info.utilization, resetsAt: info.resetsAt });
  }
  return out;
}

function friendlyError(text) {
  const t = String(text || '');
  if (/login|log in|not logged|authenticat|invalid api key|oauth/i.test(t)) return { code: 'signin', message: 'Claude Code isn\'t signed in on this laptop.' };
  if (/rate.?limit|usage limit|limit reached/i.test(t)) return { code: 'limit', message: 'You\'ve hit your Claude usage limit for now.' };
  if (/overloaded/i.test(t)) return { code: 'busy', message: 'Claude is busy right now. Try again in a moment.' };
  return { code: 'error', message: 'Claude stopped with a problem: ' + t.slice(0, 200) };
}

class ClaudeRunner {
  constructor({ store, tools, getUsage, setUsage }) {
    this.store = store;
    this.tools = tools;
    this.getUsage = getUsage;
    this.setUsage = setUsage;
    this.active = null;
  }

  async status() {
    const file = await bin.find('claude');
    if (!file) return { installed: false };
    const spec = bin.spawnSpec(file, ['--version']);
    const r = await bin.run(spec.cmd, spec.args);
    const apiKey = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
    return { installed: r.ok, version: r.stdout.trim(), apiKey };
  }

  stop() {
    if (this.active) { try { this.active.child.kill(bin.isWin ? undefined : 'SIGINT'); } catch { /* gone */ } }
  }

  // emit(event) is called for everything the window shows.
  async run({ prompt, model = 'sonnet', effort = 'medium', sessionId = null }, emit) {
    if (this.active) return emit({ type: 'done', ok: false, error: { code: 'busy', message: 'Claude is still working on the last prompt.' } });
    const file = await bin.find('claude');
    if (!file) return emit({ type: 'done', ok: false, error: { code: 'install', message: 'Claude Code isn\'t installed on this laptop.' } });

    const runId = crypto.randomUUID();
    const handle = this.tools.open((e) => emit(e));
    const runDir = this.store.p('.andromeda', 'run');
    await fsp.mkdir(runDir, { recursive: true });
    const summary = await this.store.writeSummary();
    const waiting = await this.store.inbox();
    const today = new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    // Brief and summary first: they rarely change, so Claude's servers can reuse them cheaply.
    const system = `${BRIEF}\n\n# Courses\n${summary}\n\n# Waiting to be filed\n${waiting.length ? waiting.join('\n') : 'nothing'}\n\nToday is ${today}.`;
    const sysFile = path.join(runDir, `${runId}-system.md`);
    const mcpFile = path.join(runDir, `${runId}-mcp.json`);
    await fsp.writeFile(sysFile, system);
    await fsp.writeFile(mcpFile, JSON.stringify(handle.config));

    const args = [
      '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--restricted',
      '--model', model, '--effort', effort,
      '--system-prompt-file', sysFile,
      '--tools', 'Read',
      '--mcp-config', mcpFile, '--strict-mcp-config',
      '--allowedTools', ['Read', ...this.tools.names].join(','),
      '--permission-mode', 'dontAsk',
      '--disable-slash-commands',
      '--max-turns', '40',
    ];
    if (sessionId) args.push('--resume', sessionId);

    // Make sure the run uses the Pro plan sign-in, never an API key that would bill separately.
    const env = { ...process.env };
    for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']) delete env[k];

    const spec = bin.spawnSpec(file, args);
    const child = spawn(spec.cmd, spec.args, { cwd: this.store.dir, env, windowsHide: true });
    this.active = { child, runId };
    child.stdin.end(prompt);
    emit({ type: 'start', runId });

    // Reply text is held back until its first line (the source tag) has been checked.
    let session = sessionId, firstText = true, head = '', tagState = 'waiting', shown = '', usedTools = false, errText = '';
    const steps = new Map();
    const blocks = {};

    const onText = (delta) => {
      if (!firstText) { shown += delta; emit({ type: 'text', delta }); return; }
      if (tagState === 'ok') { shown += delta; emit({ type: 'text', delta }); return; }
      if (tagState === 'none') return;
      head += delta;
      const nl = head.indexOf('\n');
      const trimmed = head.trimStart();
      if (/^\[none\]/i.test(trimmed)) { tagState = 'none'; return; }
      if (nl === -1 && head.length < 200) return;
      const m = /^\s*\[sources?:[^\]]*\]\s*/i.exec(head);
      if (m) {
        tagState = 'ok';
        const rest = head.slice(m[0].length);
        if (rest) { shown += rest; emit({ type: 'text', delta: rest }); }
      } else {
        tagState = 'missing'; // decided at the end
      }
    };

    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let m; try { m = JSON.parse(line); } catch { continue; }
        this.handle(m, { emit, steps, blocks, onText, setSession: (s) => { session = s; }, markTools: () => { usedTools = true; }, endText: () => { if (head || shown) firstText = false; }, setErr: (t) => { errText = t; } });
      }
    });
    child.stderr.on('data', (d) => { errText += String(d); });

    child.on('close', async (code) => {
      this.active = null;
      handle.close();
      await fsp.rm(sysFile, { force: true }).catch(() => {});
      await fsp.rm(mcpFile, { force: true }).catch(() => {});
      const run = handle.run;
      let stepId = null;
      if (run.changes.length) stepId = await this.store.commit('Prompt: ' + prompt.slice(0, 120));
      if (run.changes.length) this.store.emit('changed');

      let refused = false, text = shown;
      const acted = run.changes.length || run.pending.length;
      if (tagState === 'none' || (tagState === 'missing' && !acted && !usedTools)) { refused = true; text = ''; }
      else if (tagState === 'missing') text = head.replace(/^\s*\[[^\]]*\]\s*/, '') + shown;
      else if (tagState === 'waiting' && head) text = head.replace(/^\s*\[[^\]]*\]\s*/, '');

      const failed = !this.resultOk;
      emit({
        type: 'done', ok: !failed, runId, sessionId: session, text, refused, stepId,
        changes: run.changes, pending: run.pending,
        error: failed ? friendlyError(this.resultText || errText || `exit ${code}`) : null,
      });
      this.resultOk = false; this.resultText = '';
    });
  }

  handle(m, h) {
    if (m.type === 'system' && m.subtype === 'init') {
      h.setSession(m.session_id);
      const mcp = (m.mcp_servers || []).find((s) => s.name === 'andromeda');
      if (mcp && mcp.status && !/connected|pending/.test(mcp.status)) h.emit({ type: 'warn', message: 'Andromeda\'s course tools didn\'t connect.' });
      return;
    }
    if (m.type === 'rate_limit_event' || m.rate_limit_info) {
      const u = parseUsage(m.rate_limit_info || m, this.getUsage());
      this.setUsage(u);
      h.emit({ type: 'usage', usage: u });
      return;
    }
    if (m.type === 'stream_event' && m.event && !m.parent_tool_use_id) {
      const ev = m.event;
      if (ev.type === 'content_block_start') {
        h.blocks[ev.index] = ev.content_block && ev.content_block.type;
        if (ev.content_block && ev.content_block.type === 'thinking') h.emit({ type: 'thinking-start' });
      } else if (ev.type === 'content_block_delta' && ev.delta) {
        if (ev.delta.type === 'thinking_delta') h.emit({ type: 'thinking', delta: ev.delta.thinking });
        else if (ev.delta.type === 'text_delta') h.onText(ev.delta.text);
      } else if (ev.type === 'content_block_stop') {
        if (h.blocks[ev.index] === 'text') h.endText();
      }
      return;
    }
    if (m.type === 'assistant' && m.message && !m.parent_tool_use_id) {
      for (const b of m.message.content || []) {
        if (b.type === 'tool_use') {
          h.markTools();
          const s = { id: b.id, label: stepLabel(b.name, b.input), state: 'running' };
          h.steps.set(b.id, s);
          h.emit({ type: 'step', step: s });
        }
      }
      return;
    }
    if (m.type === 'user' && m.message && Array.isArray(m.message.content)) {
      for (const b of m.message.content) {
        if (b.type !== 'tool_result') continue;
        const s = h.steps.get(b.tool_use_id);
        if (!s) continue;
        s.state = b.is_error ? 'failed' : 'done';
        h.emit({ type: 'step', step: s });
      }
      return;
    }
    if (m.type === 'result') {
      this.resultOk = !m.is_error && m.subtype !== 'error_during_execution';
      this.resultText = m.is_error ? String(m.result || m.subtype || '') : '';
      if (m.subtype === 'error_max_turns') { this.resultOk = true; h.emit({ type: 'warn', message: 'Stopped after 40 steps.' }); }
      if (m.session_id) h.setSession(m.session_id);
    }
  }
}

module.exports = { ClaudeRunner, parseUsage, BRIEF };
