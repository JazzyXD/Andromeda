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
  course: ['add_courses', 'update_course', 'add_upcoming', 'change_upcoming', 'remove_upcoming', 'add_weeks', 'change_week', 'attach_files', 'offer_find_dates', 'delete_course', 'remove_files'],
  dates: ['propose_dates'],
};

function createToolServer(store, extract) {
  const runs = new Map(); // key -> { changes: [], pending: [], onEvent }

  function build(run) {
    const server = new McpServer({ name: 'andromeda', version: '1.0.0' });
    if (run.mode === 'dates') return buildDates(server, run);
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

    server.registerTool('add_upcoming', {
      description: 'Add NEW tests, quizzes or assignments to Coming up. Never use this to change one that already exists. Dates YYYY-MM-DD, times HH:MM (24h).',
      inputSchema: { course, items: z.array(z.object({ title: z.string(), date: z.string().optional(), time: z.string().optional(), covers: z.string().optional() })) },
    }, wrap(({ course: ref, items }) => store.addUpcoming(ref, items)));

    server.registerTool('change_upcoming', {
      description: 'Change ONE existing Coming up item: rename it, move its date or time, set what it covers, or mark it done. Only include what changes.',
      inputSchema: { course, which, title: z.string().optional(), date: z.string().optional(), time: z.string().optional(), covers: z.string().optional(), done: z.boolean().optional() },
    }, wrap(({ course: ref, which: w, ...f }) => store.changeUpcoming(ref, w, f)));

    server.registerTool('remove_upcoming', {
      description: 'Remove items from Coming up, each by id or current name.',
      inputSchema: { course, items: z.array(z.string()) },
    }, wrap(({ course: ref, items }) => store.removeUpcoming(ref, items)));

    server.registerTool('add_weeks', {
      description: 'Add NEW weeks or chapters (labels like "Week 3" or "Chapter 12"), optionally listing which course files belong to each.',
      inputSchema: { course, weeks: z.array(z.object({ label: z.string(), title: z.string().optional(), files: z.array(z.string()).optional() })) },
    }, wrap(({ course: ref, weeks }) => store.addWeeks(ref, weeks)));

    server.registerTool('change_week', {
      description: 'Change ONE existing week: relabel it, change its title, or set which course files belong to it. Only include what changes.',
      inputSchema: { course, which, label: z.string().optional(), title: z.string().optional(), files: z.array(z.string()).optional() },
    }, wrap(({ course: ref, which: w, ...f }) => store.changeWeek(ref, w, f)));

    server.registerTool('attach_files', {
      description: 'File newly added files (listed as "Waiting to be filed") into a course. Their text is pulled out automatically.',
      inputSchema: { course, files: z.array(z.string()) },
    }, wrap(({ course: ref, files }) => store.attachFiles(ref, files, extract)));

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

  // Find dates: one tool that hands back what it found. Nothing is saved until the user ticks and adds.
  function buildDates(server, run) {
    server.registerTool('propose_dates', {
      description: 'Hand back every dated item found in the document, once, all together.',
      inputSchema: { items: z.array(z.object({
        title: z.string(), date: z.string().optional().describe('YYYY-MM-DD, only if the document gives or clearly implies it'),
        time: z.string().optional().describe('HH:MM 24h'), covers: z.string().optional(),
        quote: z.string().describe('The exact words it came from'), page: z.number().optional(),
      })) },
    }, async ({ items }) => {
      const ok = /^\d{4}-\d{2}-\d{2}$/;
      run.proposed = items.slice(0, 80).map((it) => ({
        title: String(it.title || '').slice(0, 80), date: ok.test(it.date || '') ? it.date : '', time: /^\d{1,2}:\d{2}$/.test(it.time || '') ? it.time : '',
        covers: String(it.covers || '').slice(0, 160), quote: String(it.quote || '').slice(0, 240), page: it.page || null,
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
    open(onEvent, mode = 'course') {
      const key = crypto.randomBytes(24).toString('hex');
      const run = { mode, changes: [], pending: [], proposed: null, onEvent };
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
