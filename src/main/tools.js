// The only tools Claude gets on the courses page. They run here, inside Andromeda, which checks
// every request before anything is saved. Served to Claude Code over a private local connection
// that only accepts the one-time key of the prompt that's running.
const http = require('http');
const crypto = require('crypto');
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { Invalid } = require('./data');

const TOOL_NAMES = ['add_courses', 'update_course', 'set_upcoming', 'remove_upcoming', 'set_weeks', 'attach_files', 'delete_course', 'remove_files'];

function createToolServer(store, extract) {
  const runs = new Map(); // key -> { changes: [], pending: [], onEvent }

  function build(run) {
    const server = new McpServer({ name: 'andromeda', version: '1.0.0' });
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
      inputSchema: { courses: z.array(z.object({ name: z.string(), instructor: z.string().optional(), schedule: z.string().optional(), school: z.string().optional(), notes: z.string().optional() })) },
    }, wrap(({ courses }) => store.addCourses(courses)));

    server.registerTool('update_course', {
      description: "Change a course's name, instructor, schedule, school or notes.",
      inputSchema: { course, name: z.string().optional(), instructor: z.string().optional(), schedule: z.string().optional(), school: z.string().optional(), notes: z.string().optional() },
    }, wrap(({ course: ref, ...f }) => store.updateCourse(ref, f)));

    server.registerTool('set_upcoming', {
      description: 'Add or change tests, quizzes and assignments under Coming up. To change or rename an existing item, pass its id from the course summary; leave id out only for a brand-new item. Dates YYYY-MM-DD, times HH:MM (24h).',
      inputSchema: { course, items: z.array(z.object({ id: z.string().optional(), title: z.string().optional(), date: z.string().optional(), time: z.string().optional(), covers: z.string().optional(), done: z.boolean().optional() })) },
    }, wrap(({ course: ref, items }) => store.setUpcoming(ref, items)));

    server.registerTool('remove_upcoming', {
      description: 'Remove items from Coming up, by id or title.',
      inputSchema: { course, items: z.array(z.string()) },
    }, wrap(({ course: ref, items }) => store.removeUpcoming(ref, items)));

    server.registerTool('set_weeks', {
      description: 'Add or change weeks or chapters (labels like "Week 3" or "Chapter 12"), optionally listing which course files belong to each. To change or relabel an existing week, pass its id from the course summary.',
      inputSchema: { course, weeks: z.array(z.object({ id: z.string().optional(), label: z.string().optional(), title: z.string().optional(), files: z.array(z.string()).optional() })) },
    }, wrap(({ course: ref, weeks }) => store.setWeeks(ref, weeks)));

    server.registerTool('attach_files', {
      description: 'File newly added files (listed as "Waiting to be filed") into a course. Their text is pulled out automatically.',
      inputSchema: { course, files: z.array(z.string()) },
    }, wrap(({ course: ref, files }) => store.attachFiles(ref, files, extract)));

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
    names: TOOL_NAMES.map((t) => `mcp__andromeda__${t}`),
    // One private key per prompt; the connection refuses anything else.
    open(onEvent) {
      const key = crypto.randomBytes(24).toString('hex');
      const run = { changes: [], pending: [], onEvent };
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
