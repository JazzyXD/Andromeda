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
  mcp__andromeda__add_upcoming: 'Adding tests and assignments',
  mcp__andromeda__change_upcoming: 'Changing a test or assignment',
  mcp__andromeda__remove_upcoming: 'Removing tests or assignments',
  mcp__andromeda__add_weeks: 'Adding weeks',
  mcp__andromeda__propose_weeks: 'Listing the weeks found',
  mcp__andromeda__change_week: 'Changing a week',
  mcp__andromeda__attach_files: 'Filing slides',
  mcp__andromeda__delete_course: 'Asking before deleting',
  mcp__andromeda__offer_find_dates: 'Offering Find dates',
  mcp__andromeda__offer_guide: 'Offering a guide plan',
  mcp__andromeda__save_part: 'Saving to the guide',
  mcp__andromeda__propose_dates: 'Listing the dates found',
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
- A waiting picture is at .andromeda/inbox/<its name>. When the user asks about what's in it, such as dates to add, Read it there and act on it. Pictures named "Pasted image ..." are never filed; Andromeda clears them afterwards.
- Tests, midterms and finals are exams; everything else (quizzes, assignments, cases, projects) is an assignment. Set kind when adding.
- To pull due dates out of a course file (an outline, schedule or critical path), call offer_find_dates instead of reading the file yourself.
- To set up weeks from a course file (a schedule or critical path), read it, then call propose_weeks with every week. The user checks them; never add them with add_weeks.
- If the user wants a learning guide, call offer_guide (with the test, if they named one). Never write a guide or long notes in the chat.
- Changing something that already exists (renaming a test, moving a date, relabelling a week) uses change_upcoming or change_week on that item. The add tools are only for things that don't exist yet. If a change tool says it can't find the item or finds several, ask the user which one.`;

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
  // Find dates: always Sonnet at medium effort, started only by the user clicking the button.
  async findDates({ courseId, file }, emit) {
    const c = await this.store.findCourse(courseId);
    const f = c.files.find((x) => x.name === file);
    if (!f) return emit({ type: 'done', ok: false, error: { code: 'error', message: 'That file isn\'t in this course anymore.' } });
    const orig = ['courses', c.id, 'files', f.name].join('/');
    const today = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
    const system = `You find dates in one course document for Andromeda, a study app.
Course: ${c.name}. Term: ${c.term || `not set; today is ${today}, so assume the current or next school term`}.
${f.text ? `Read the document's text at ${f.text}. If a table on a page looks scrambled, Read that page of the original at ${orig} (use pages).` : `Read the original at ${orig}.`}
Find every test, quiz, exam, assignment, project, presentation or other deadline. For each give: a short title ("Midterm", "Assignment 1"); the date as YYYY-MM-DD when the document gives or clearly implies it, with the year from the term; the time as 24-hour HH:MM if given; what it covers if stated; the exact quote it came from.
List items with no date too, with the date left out. Never invent a date the document doesn't support.
Call propose_dates exactly once with everything, then reply with one short line.`;
    return this.run({ prompt: `Find the dates in ${f.name}.`, model: 'sonnet', effort: 'medium', mode: 'dates', system, label: f.name }, emit);
  }

  async run({ prompt, model = 'haiku', effort = 'medium', sessionId = null, mode = 'course', system: customSystem = null, ctx = null }, emit) {
    if (this.active) return emit({ type: 'done', ok: false, error: { code: 'busy', message: 'Claude is still working on the last prompt.' } });
    const file = await bin.find('claude');
    if (!file) return emit({ type: 'done', ok: false, error: { code: 'install', message: 'Claude Code isn\'t installed on this laptop.' } });

    const runId = crypto.randomUUID();
    const handle = this.tools.open((e) => emit(e), mode, ctx);
    const runDir = this.store.p('.andromeda', 'run');
    await fsp.mkdir(runDir, { recursive: true });
    const summary = await this.store.writeSummary();
    const waiting = await this.store.inbox();
    const today = new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    // Brief and summary first: they rarely change, so Claude's servers can reuse them cheaply.
    const system = customSystem || `${BRIEF}\n\n# Courses\n${summary}\n\n# Waiting to be filed\n${waiting.length ? waiting.join('\n') : 'nothing'}\n\nToday is ${today}.`;
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
      '--allowedTools', ['Read', ...this.tools.names(mode)].join(','),
      '--permission-mode', 'dontAsk',
      '--disable-slash-commands',
      '--max-turns', mode === 'dates' ? '15' : mode === 'guide' ? '30' : '40',
    ];
    if (sessionId) args.push('--resume', sessionId);

    // Make sure the run uses the Pro plan sign-in, never an API key that would bill separately.
    const env = { ...process.env };
    for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']) delete env[k];
    // Keep the shared setup (instructions, tools, course summary) cached for an hour between prompts,
    // rather than relying on the default. FORCE_PROMPT_CACHING_5M would override it, so drop that too.
    env.CLAUDE_CODE_PROMPT_CACHE_TTL = '1h';
    delete env.FORCE_PROMPT_CACHING_5M;

    const spec = bin.spawnSpec(file, args);
    const child = spawn(spec.cmd, spec.args, { cwd: this.store.dir, env, windowsHide: true });
    this.active = { child, runId };
    child.stdin.end(prompt);
    emit({ type: 'start', runId });

    // Reply text is held back until its first line (the source tag) has been checked.
    let session = sessionId, firstText = mode === 'course', head = '', tagState = mode === 'course' ? 'waiting' : 'ok', shown = '', usedTools = false, errText = '';
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
        this.handle(m, { emit, steps, blocks, onText, setSession: (s) => { session = s; }, markTools: () => {
          usedTools = true;
          // Anything Claude said before using a tool was it thinking out loud ("I'll read the file").
          // Only the answer it gives after the last tool is the reply, so start the reply over.
          if (shown || (tagState === 'missing' && head)) { shown = ''; if (tagState === 'missing') head = ''; emit({ type: 'text-reset' }); }
        }, endText: () => { if (head || shown) firstText = false; }, setErr: (t) => { errText = t; } });
      }
    });
    child.stderr.on('data', (d) => { errText += String(d); });

    child.on('close', async (code) => {
      handle.close();
      await fsp.rm(sysFile, { force: true }).catch(() => {});
      await fsp.rm(mcpFile, { force: true }).catch(() => {});
      const run = handle.run;
      let stepId = null;
      if (run.changes.length) stepId = await this.store.commit('Prompt: ' + prompt.slice(0, 120));
      this.active = null; // only now, so a sync can't split Claude's changes from their Undo step
      if (run.changes.length) this.store.emit('changed');

      let refused = false, text = shown;
      const acted = run.changes.length || run.pending.length;
      if (tagState === 'none' || (tagState === 'missing' && !acted && !usedTools)) { refused = true; text = ''; }
      else if (tagState === 'missing') text = head.replace(/^\s*\[[^\]]*\]\s*/, '') + shown;
      else if (tagState === 'waiting' && head) text = head.replace(/^\s*\[[^\]]*\]\s*/, '');

      const failed = !this.resultOk;
      emit({
        type: 'done', ok: !failed, runId, sessionId: mode === 'course' ? session : null, text, refused, stepId, model, mode, proposed: run.proposed,
        changes: run.changes, pending: run.pending, tokens: this.tokens || null,
        error: failed ? friendlyError(this.resultText || errText || `exit ${code}`) : null,
      });
      this.resultOk = false; this.resultText = ''; this.tokens = null;
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
      // Exact token counts for this prompt, shown quietly under the reply.
      const u = m.usage || {};
      this.tokens = {
        input: u.input_tokens || 0, output: u.output_tokens || 0,
        cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0,
      };
      this.resultOk = !m.is_error && m.subtype !== 'error_during_execution';
      this.resultText = m.is_error ? String(m.result || m.subtype || '') : '';
      if (m.subtype === 'error_max_turns') { this.resultOk = true; h.emit({ type: 'warn', message: 'Stopped after 40 steps.' }); }
      if (m.session_id) h.setSession(m.session_id);
    }
  }
}

module.exports = { ClaudeRunner, parseUsage, BRIEF };
