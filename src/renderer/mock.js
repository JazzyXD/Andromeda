// A pretend Andromeda backend, used only when the page is opened outside the app (for previews and
// tests). Inside the real app, window.andromeda comes from preload.js and this file does nothing.
(function () {
  if (window.andromeda) return;
  const P = window.AndromedaPreview;
  const q = new URLSearchParams(location.search);
  const listeners = { claude: [], data: [], pushed: [] };
  const emit = (k, v) => listeners[k].forEach((f) => f(v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const year = new Date().getFullYear();

  let courses = q.has('empty') ? [] : P.courses.map((c, i) => ({
    id: c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: c.name, constellation: c.con.toLowerCase(),
    instructor: c.meta.split(' · ')[1] || '', schedule: c.meta.split(' · ')[0] || '', school: '', notes: '',
    upcoming: c.none ? [] : [{ id: 'u' + i, title: c.up, date: i % 3 ? '' : `${year}-12-${10 + i}`, time: '', covers: '', done: false }],
    weeks: i ? [] : [{ id: 'w1', label: 'Chapter 12', title: 'Taxable income and tax payable for corporations', files: ['Chapter 12 slides.pptx'] }, { id: 'w2', label: 'Chapter 13', title: 'Other issues in corporate taxation', files: [] }],
    files: i ? [] : [{ name: 'Chapter 12 slides.pptx', kind: 'pptx', text: 'x', note: '2 hidden slides skipped' }, { name: 'Course outline.pdf', kind: 'pdf', text: 'x', note: '' }],
    created: String(i), updated: '',
  }));
  let inbox = [];
  const usage = { fiveHour: { pct: 0.23, resetsAt: Date.now() + 2.2 * 3600e3 }, week: { pct: 0.41, resetsAt: Date.now() + 3 * 86400e3 } };
  const github = q.has('setup') ? { connected: false } : { connected: true, login: 'JazzyXD', repo: 'JazzyXD/Andromeda-data' };

  async function fakeRun({ prompt }) {
    const out = (e) => emit('claude', e);
    out({ type: 'start' });
    await sleep(250);
    const p = prompt.toLowerCase();
    if (/speaker|weather|capital/.test(p)) { await sleep(500); out({ type: 'done', ok: true, refused: true, text: '', changes: [], pending: [] }); return; }
    if (/delete/.test(p)) {
      const c = courses[courses.length - 1];
      out({ type: 'step', step: { id: 's1', label: 'Asking before deleting', state: 'running' } });
      await sleep(300);
      const pending = { id: 'p1', kind: 'delete_course', courseId: c.id, course: c.name, files: [] };
      out({ type: 'confirm', pending });
      out({ type: 'step', step: { id: 's1', label: 'Asking before deleting', state: 'done' } });
      for (const w of `${c.name} is waiting for your OK below.`.split(/(?<= )/)) { out({ type: 'text', delta: w }); await sleep(30); }
      out({ type: 'done', ok: true, text: `${c.name} is waiting for your OK below.`, changes: [], pending: [pending] });
      return;
    }
    out({ type: 'thinking-start' });
    for (const w of 'The final goes under Coming up for Income Tax 2, with the date they gave. The scope is everything after the midterm, so chapter 15 onward.'.split(/(?<= )/)) { out({ type: 'thinking', delta: w }); await sleep(25); }
    out({ type: 'step', step: { id: 's1', label: 'Updating Coming up', state: 'running' } });
    await sleep(500);
    const c = courses.find((x) => /income/i.test(x.name)) || courses[0];
    const changes = c ? [{ course: c.name, courseId: c.id, where: 'Coming up', what: 'Final exam, Dec 15, chapter 15 onward' }] : [];
    if (c) { c.upcoming = [{ id: 'f', title: 'Final exam', date: `${year}-12-15`, time: '', covers: 'Chapter 15 onward', done: false }]; }
    out({ type: 'step', step: { id: 's1', label: 'Updating Coming up', state: 'done' } });
    out({ type: 'changes', changes });
    emit('data', { courses, inbox });
    out({ type: 'usage', usage: { ...usage, fiveHour: { ...usage.fiveHour, pct: 0.25 } } });
    const reply = 'Done. The final is on Income Tax 2 now, covering chapter 15 onward.';
    for (const w of reply.split(/(?<= )/)) { out({ type: 'text', delta: w }); await sleep(30); }
    out({ type: 'done', ok: true, text: reply, changes, pending: [], stepId: 'abc1234', sessionId: 's', tokens: { input: 12, output: 96, cacheRead: 1840, cacheWrite: 310 } });
  }

  window.andromeda = {
    mock: true,
    platform: 'web',
    onNav() {}, onFocusPrompt() {}, popupMenu() {},
    state: async () => ({ courses, inbox, usage, github, claude: { installed: !q.has('noclaude'), version: '2.1.330' }, dataDir: '~/Documents/Andromeda' }),
    claudeStatus: async () => ({ installed: true, version: '2.1.330' }),
    run: async (req) => { fakeRun(req); return true; },
    stop: async () => {},
    onClaude: (f) => listeners.claude.push(f),
    answer: async (pending, yes) => {
      if (!yes) return { changes: [] };
      courses = courses.filter((c) => c.id !== pending.courseId);
      emit('data', { courses, inbox });
      return { changes: [{ course: pending.course, where: 'Courses', what: `Deleted ${pending.course}` }], stepId: 'def5678' };
    },
    undo: async () => ({ ok: true }),
    onData: (f) => listeners.data.push(f),
    pickFiles: async () => [], receive: async (paths) => { inbox = inbox.concat(paths.map((p) => p.split(/[\\/]/).pop())); emit('data', { courses, inbox }); return inbox; },
    attachTo: async () => ({ changes: [] }), clearInbox: async () => { inbox = []; emit('data', { courses, inbox }); },
    pathFor: (f) => f.name,
    githubStart: async () => ({ code: 'WDJB-MJHT', url: 'https://github.com/login/device' }),
    githubWait: async () => { await sleep(1500); github.connected = true; github.login = 'JazzyXD'; github.repo = 'JazzyXD/Andromeda-data'; return github; },
    githubCancel: async () => {}, githubRetry: async () => github,
    onPushed: (f) => listeners.pushed.push(f),
    zoomGet: async () => ({ mode: 'auto', factor: 1, auto: 1, levels: [0.9, 1, 1.1, 1.25, 1.5, 1.75] }),
    zoomSet: async (m) => ({ mode: m, factor: m === 'auto' ? 1 : m, auto: 1, levels: [0.9, 1, 1.1, 1.25, 1.5, 1.75] }),
    zoomStep: async () => ({ mode: 'auto', factor: 1, auto: 1, levels: [] }),
    onZoom() {},
    openExternal: async (u) => window.open(u), openDataFolder: async () => {},
  };
})();
