// The only tools Claude gets on the courses page. They run here, inside Andromeda, which checks
// every request before anything is saved. Served to Claude Code over a private local connection
// that only accepts the one-time key of the prompt that's running.
const http = require('http');
const crypto = require('crypto');
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { Invalid } = require('./data');

const TOOL_NAMES = {
  course: ['add_courses', 'update_course', 'add_upcoming', 'change_upcoming', 'remove_upcoming', 'add_weeks', 'propose_weeks', 'change_week', 'remove_weeks', 'attach_files', 'offer_find_dates', 'offer_guide', 'delete_course', 'remove_files'],
  dates: ['propose_dates'],
  guide: ['save_part'],
};

function createToolServer(store, extract) {
  const runs = new Map(); // key -> { changes: [], pending: [], onEvent }

  function build(run) {
    const server = new McpServer({ name: 'andromeda', version: '1.0.0' });
    if (run.mode === 'dates') return buildDates(server, run);
    if (run.mode === 'guide') return buildGuide(server, run);
    const course = z.string().describe('Course name or id');
    const wrap = (fn) => async (args) => {
      try {
        const changes = await fn(args);
        if (changes && changes.length) {
          run.changes.push(...changes);
          await store.writeSummary();
          run.onEvent({ type: 'changes', changes });
        }
        return { content: [{ type: 'text', text: 'Done.' }] };
      } catch (e) {
        const msg = e instanceof Invalid ? e.message : 'Something went wrong saving that.';
        return { content: [{ type: 'text', text: 'Not done: ' + msg }], isError: true };
      }
    };
    const ask = (kind) => async (args) => {
      try {
        const c = await store.findCourse(args.course);
        const files = kind === 'remove_files' ? (args.files || []).filter((f) => c.files.some((x) => x.name === f)) : [];
        if (kind === 'remove_files' && !files.length) throw new Invalid('None of those files belong to this course.');
        const p = { id: crypto.randomUUID(), kind, courseId: c.id, course: c.name, files };
        run.pending.push(p);
        run.onEvent({ type: 'confirm', pending: p });
        return { content: [{ type: 'text', text: 'Waiting for the user to confirm on screen. Tell them in one short line.' }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Not done: ' + (e instanceof Invalid ? e.message : 'could not find that.') }], isError: true };
      }
    };

    server.registerTool('add_courses', {
      description: 'Add one or more courses.',
      inputSchema: { courses: z.array(z.object({ name: z.string(), instructor: z.string().optional(), schedule: z.string().optional(), school: z.string().optional(), term: z.string().optional().describe('e.g. Fall 2026'), notes: z.string().optional() })) },
    }, wrap(({ courses }) => store.addCourses(courses)));

    server.registerTool('update_course', {
      description: "Change a course's name, instructor, schedule, school, term (e.g. Fall 2026) or notes.",
      inputSchema: { course, name: z.string().optional(), instructor: z.string().optional(), schedule: z.string().optional(), school: z.string().optional(), term: z.string().optional(), notes: z.string().optional() },
    }, wrap(({ course: ref, ...f }) => store.updateCourse(ref, f)));

    const which = z.string().describe('The existing item: its id from the summary, or its current name');
    const KIND = z.enum(['exam', 'assignment']).optional().describe('exam for tests, midterms and finals; assignment for everything else, quizzes included');

    server.registerTool('add_upcoming', {
      description: 'Add NEW tests, quizzes or assignments. Never use this to change one that already exists. Dates YYYY-MM-DD, times HH:MM (24h).',
      inputSchema: { course, items: z.array(z.object({ title: z.string(), kind: KIND, date: z.string().optional(), time: z.string().optional(), covers: z.string().optional() })) },
    }, wrap(({ course: ref, items }) => store.addUpcoming(ref, items)));

    server.registerTool('change_upcoming', {
      description: 'Change ONE existing test or assignment: rename it, move its date or time, set what it covers, move it between exams and assignments, or mark it done. Only include what changes.',
      inputSchema: { course, which, title: z.string().optional(), kind: KIND, date: z.string().optional(), time: z.string().optional(), covers: z.string().optional(), done: z.boolean().optional() },
    }, wrap(({ course: ref, which: w, ...f }) => store.changeUpcoming(ref, w, f)));

    server.registerTool('remove_upcoming', {
      description: 'Remove tests or assignments, each by id or current name.',
      inputSchema: { course, items: z.array(z.string()) },
    }, wrap(({ course: ref, items }) => store.removeUpcoming(ref, items)));

    server.registerTool('add_weeks', {
      description: 'Add one or two NEW weeks the user just told you about (labels like "Week 3" or "Chapter 12"), optionally listing which course files belong to each. For more, or weeks taken from a document, use propose_weeks.',
      inputSchema: { course, weeks: z.array(z.object({ label: z.string(), title: z.string().optional(), files: z.array(z.string()).optional() })) },
    }, wrap(({ course: ref, weeks }) => {
      if ((weeks || []).length > 2) throw new Invalid('For more than 2 weeks, call propose_weeks so the user can check them first.');
      return store.addWeeks(ref, weeks);
    }));

    // Weeks found in a document (a schedule or critical path) go to the user as a checklist: they
    // tick and rename them, then add. Nothing is saved by this tool.
    server.registerTool('propose_weeks', {
      description: 'Show weeks found in a course document (a schedule or critical path) as a checklist the user ticks and edits before adding. Give every week, in order. Label like "Week 3"; title is what it covers, like "Chapter 3: Professional Ethics". Leave out breaks with nothing taught.',
      inputSchema: { course, weeks: z.array(z.object({ label: z.string(), title: z.string().optional() })) },
    }, async ({ course: ref, weeks }) => {
      try {
        const c = await store.findCourse(ref);
        const items = (weeks || []).slice(0, 40).map((w) => ({ label: String(w.label || '').slice(0, 40).trim(), title: String(w.title || '').slice(0, 120).trim() })).filter((w) => w.label);
        if (!items.length) throw new Invalid('Give at least one week.');
        run.onEvent({ type: 'weeks', courseId: c.id, course: c.name, items });
        return { content: [{ type: 'text', text: `The checklist of ${items.length} weeks is showing. Nothing is added until the user adds them. Tell them in one short line to check and add them.` }] };
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: e.message }] };
      }
    });

    server.registerTool('change_week', {
      description: 'Change ONE existing week: relabel it, change its title, or set which course files belong to it. Only include what changes.',
      inputSchema: { course, which, label: z.string().optional(), title: z.string().optional(), files: z.array(z.string()).optional() },
    }, wrap(({ course: ref, which: w, ...f }) => store.changeWeek(ref, w, f)));

    server.registerTool('remove_weeks', {
      description: 'Remove weeks, each by id or current label. The course files in them stay in the course. Can be undone.',
      inputSchema: { course, weeks: z.array(z.string()) },
    }, wrap(({ course: ref, weeks }) => store.removeWeeks(ref, weeks)));

    server.registerTool('attach_files', {
      description: 'File newly added files (listed as "Waiting to be filed") into a course. Their text is pulled out automatically.',
      inputSchema: { course, files: z.array(z.string()) },
    }, wrap(({ course: ref, files }) => {
      // Pasted screenshots are only for looking at; Andromeda clears them once the prompt is done.
      const pasted = (files || []).filter((f) => /^Pasted image /.test(String(f)));
      if (pasted.length) throw new Invalid(`${pasted.join(', ')} ${pasted.length === 1 ? 'is a pasted picture' : 'are pasted pictures'}, which aren't kept as course files. Read ${pasted.length === 1 ? 'it' : 'them'} instead; ${pasted.length === 1 ? 'it gets' : 'they get'} cleared afterwards.`);
      return store.attachFiles(ref, files, extract);
    }));

    server.registerTool('offer_find_dates', {
      description: 'When the user wants due dates, tests or deadlines pulled out of a course file (an outline, schedule or critical path), offer the Find dates button instead of reading the file yourself. Shows the button; the user starts it.',
      inputSchema: { course, file: z.string().describe('The course file name') },
    }, async ({ course: ref, file }) => {
      try {
        const c = await store.findCourse(ref);
        const f = c.files.find((x) => x.name === file) || c.files.find((x) => x.name.toLowerCase().includes(String(file).toLowerCase()));
        if (!f) throw new Invalid(`${c.name} has no file "${file}". Files: ${c.files.map((x) => x.name).join(', ') || 'none'}.`);
        run.onEvent({ type: 'offer', courseId: c.id, course: c.name, file: f.name });
        return { content: [{ type: 'text', text: 'The Find dates button is showing. Tell the user in one line to click it.' }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Not done: ' + (e instanceof Invalid ? e.message : 'could not find that.') }], isError: true };
      }
    });

    server.registerTool('offer_guide', {
      description: 'When the user wants a learning guide (for a test, or for some weeks), offer to open the guide plan instead of writing one in the chat. Shows a button; the user plans and starts it.',
      inputSchema: { course, test: z.string().optional().describe('The Coming up item it is for: its id or name') },
    }, async ({ course: ref, test }) => {
      try {
        const c = await store.findCourse(ref);
        const t = test ? c.upcoming.find((u) => u.id === test || u.title.toLowerCase() === String(test).toLowerCase()) : null;
        run.onEvent({ type: 'guide-offer', courseId: c.id, course: c.name, testId: t ? t.id : null, test: t ? t.title : null });
        return { content: [{ type: 'text', text: 'The guide plan button is showing. Tell the user in one line to click it.' }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Not done: ' + (e instanceof Invalid ? e.message : 'could not find that.') }], isError: true };
      }
    });

    server.registerTool('delete_course', {
      description: 'Ask to delete a whole course. The user must confirm on screen; nothing is deleted by this call.',
      inputSchema: { course },
    }, ask('delete_course'));

    server.registerTool('remove_files', {
      description: 'Ask to remove files from a course. The user must confirm on screen; nothing is removed by this call.',
      inputSchema: { course, files: z.array(z.string()) },
    }, ask('remove_files'));

    return server;
  }

  // Guide building: one tool to save the piece being written. Andromeda checks it first.
  function buildGuide(server, run) {
    server.registerTool('save_part', {
      description: 'Save this piece of the learning guide: its complete HTML, using the guide-core markup patterns.',
      inputSchema: { html: z.string().describe('The complete HTML for this piece') },
    }, async ({ html }) => {
      try {
        const r = await run.ctx.save(html);
        if (r.ok) return { content: [{ type: 'text', text: 'Saved.' }] };
        return { content: [{ type: 'text', text: 'Not saved. Fix these, then call save_part again with the whole piece:\n- ' + r.problems.join('\n- ') }], isError: true };
      } catch {
        return { content: [{ type: 'text', text: 'Not saved: something went wrong on Andromeda\'s side. Try save_part once more.' }], isError: true };
      }
    });
    return server;
  }

  // Find dates: one tool that hands back what it found. Nothing is saved until the user ticks and adds.
  function buildDates(server, run) {
    server.registerTool('propose_dates', {
      description: 'Hand back every dated item found in the document, once, all together.',
      inputSchema: { items: z.array(z.object({
        title: z.string(), date: z.string().optional().describe('YYYY-MM-DD, only if the document gives or clearly implies it'),
        time: z.string().optional().describe('HH:MM 24h'), covers: z.string().optional(),
        kind: z.enum(['exam', 'assignment']).optional().describe('exam for tests, midterms and finals; assignment for everything else, quizzes included'),
        quote: z.string().describe('The exact words it came from'),
      })) },
    }, async ({ items }) => {
      const ok = /^\d{4}-\d{2}-\d{2}$/;
      run.proposed = items.slice(0, 80).map((it) => ({
        title: String(it.title || '').slice(0, 80), date: ok.test(it.date || '') ? it.date : '', time: /^\d{1,2}:\d{2}$/.test(it.time || '') ? it.time : '',
        covers: String(it.covers || '').slice(0, 160), quote: String(it.quote || '').slice(0, 240), kind: it.kind === 'exam' || it.kind === 'assignment' ? it.kind : undefined,
      }));
      run.onEvent({ type: 'dates', items: run.proposed });
      return { content: [{ type: 'text', text: 'Shown to the user to check.' }] };
    });
    return server;
  }

  const httpServer = http.createServer(async (req, res) => {
    const key = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const run = runs.get(key);
    if (!run || req.url !== '/mcp') { res.writeHead(403).end(); return; }
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 2e6) req.destroy(); });
    req.on('end', async () => {
      try {
        const server = build(run);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        res.on('close', () => { transport.close(); server.close(); });
        await server.connect(transport);
        await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
      } catch {
        if (!res.headersSent) res.writeHead(500).end();
      }
    });
  });

  let port = 0;
  const ready = new Promise((resolve) => httpServer.listen(0, '127.0.0.1', () => { port = httpServer.address().port; resolve(); }));

  return {
    ready,
    names: (mode = 'course') => TOOL_NAMES[mode].map((t) => `mcp__andromeda__${t}`),
    // One private key per prompt; the connection refuses anything else.
    open(onEvent, mode = 'course', ctx = null) {
      const key = crypto.randomBytes(24).toString('hex');
      const run = { mode, changes: [], pending: [], proposed: null, onEvent, ctx };
      runs.set(key, run);
      return {
        key, run,
        config: { mcpServers: { andromeda: { type: 'http', url: `http://127.0.0.1:${port}/mcp`, headers: { Authorization: `Bearer ${key}` } } } },
        close: () => runs.delete(key),
      };
    },
    stop: () => httpServer.close(),
  };
}

module.exports = { createToolServer };
