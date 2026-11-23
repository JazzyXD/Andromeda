// A pretend Andromeda backend, used only when the page is opened outside the app (for previews and
// tests). Inside the real app, window.andromeda comes from preload.js and this file does nothing.
(function () {
  if (window.andromeda) return;
  const P = window.AndromedaPreview;
  const q = new URLSearchParams(location.search);
  const listeners = { claude: [], data: [], sync: [], guides: [], part: [], step: [], usage: [] };
  const emit = (k, v) => listeners[k].forEach((f) => f(v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const year = new Date().getFullYear();

  let courses = q.has('empty') ? [] : P.courses.map((c, i) => ({
    id: c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: c.name, constellation: c.con.toLowerCase(),
    instructor: c.meta.split(' · ')[1] || '', schedule: c.meta.split(' · ')[0] || '', school: '', notes: '',
    upcoming: c.none ? [] : [{ id: 'u' + i, title: c.up, date: i % 3 ? '' : `${year}-12-${10 + i}`, time: '', covers: '', done: false }],
    weeks: i ? [] : [{ id: 'w1', label: 'Chapter 12', title: 'Taxable income and tax payable for corporations', files: ['Chapter 12 slides.pptx'] }, { id: 'w2', label: 'Chapter 13', title: 'Other issues in corporate taxation', files: ['Chapter 13 slides.pptx'] }, { id: 'w3', label: 'Chapter 14', title: 'Integration', files: [] }],
    files: i ? [] : [{ name: 'Chapter 12 slides.pptx', kind: 'pptx', text: 'x', note: '2 hidden slides skipped' }, { name: 'Chapter 13 slides.pptx', kind: 'pptx', text: 'x', note: '' }, { name: 'Course outline.pdf', kind: 'pdf', text: 'x', note: '' }],
    created: String(i), updated: '',
  }));
  // ?many: a course with a term's worth of quizzes and tests, some already past.
  if (q.has('many') && courses[0]) courses[0].upcoming = [
    ...[3, 4, 5, 6, 7].map((n, i) => ({ id: 'q' + n, title: 'Quiz ' + n, date: `${year}-${['09-26', '10-10', '10-17', '10-24', '11-14'][i]}`, time: '', covers: '', done: false })),
    { id: 't1', title: 'Test One', kind: 'exam', date: `${year}-10-15`, time: '', covers: 'Chapters 1, 2, 5', done: false },
    ...[8, 9, 10, 11, 12].map((n, i) => ({ id: 'q' + n, title: 'Quiz ' + n, date: `${year}-${['11-28', '12-05', '12-12', '12-19', '12-22'][i]}`, time: '', covers: '', done: false })),
    { id: 'a1', title: 'Case 1', date: `${year}-12-03`, time: '', covers: 'Chapter 8', done: false },
    { id: 't2', title: 'Test Two', kind: 'exam', date: `${year}-12-02`, time: '14:00', covers: 'Chapters 6, 7, 8, 8A', done: false },
    { id: 'fe', title: 'Final exam', date: `${year}-12-16`, time: '', covers: '', done: false },
  ].sort((a, b) => a.date.localeCompare(b.date));
  let inbox = [];
  const usage = { fiveHour: { pct: 0.23, resetsAt: Date.now() + 2.2 * 3600e3 }, week: { pct: 0.41, resetsAt: Date.now() + 3 * 86400e3 } };
  const device = { id: 'dev-a', name: 'Jazzy MacBook Air' };
  let sync = q.has('offline') ? { state: 'offline', message: 'Saved on this laptop. Will sync when GitHub can be reached.', at: Date.now() - 9 * 60e3 }
    : q.has('syncerr') ? { state: 'error', message: 'Couldn\'t upload to GitHub: the connection was reset.', at: Date.now() - 30 * 60e3 }
    : { state: 'ok', message: '', at: Date.now() - 3 * 60e3 };
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
    out({ type: 'done', ok: true, text: reply, changes, pending: [], stepId: 'abc1234', sessionId: 's', model: 'haiku', tokens: { input: 12, output: 96, cacheRead: 1840, cacheWrite: 310 } });
  }

  // ---- pretend guide building, for checking the screens ----
  const SUBJ = { procedural: 'Procedures and calculations', rules: 'Rules and standards', sciences: 'Sciences', humanities: 'Humanities', 'social-sciences': 'Social sciences' };
  let guides = [];
  const gparts = {}, gprog = {};
  // ?lock: a guide building on the other laptop. ?stale: the same, but that laptop went quiet.
  if (q.has('lock') || q.has('stale')) {
    guides.push({ id: 'g-other', title: 'Income Tax 2: Midterm', badge: 'lyra', courseId: 'income-tax-2', courseName: 'Income Tax 2', test: null, weeks: [], subjects: ['procedural'], model: 'opus', effort: 'high',
      pieces: [{ id: 'w1', label: 'Chapter 12', status: 'done' }, { id: 'w2', label: 'Chapter 13', status: 'building' }, { id: 'finish', label: 'Final quiz', status: 'waiting' }, { id: 'start', label: 'Opening', status: 'waiting' }],
      status: 'building', pausedUntil: null, created: new Date().toISOString(), results: [],
      lock: { device: 'dev-b', name: 'School laptop', until: q.has('stale') ? Date.now() - 60e3 : Date.now() + 30 * 60e3 } });
    gparts['g-other'] = {}; gprog['g-other'] = {};
  }
  const sampleWeek = (n, label) => `<h2 id="w${n}">${label}: Taxable income for corporations</h2><p class="meta">Slides: Chapter ${11 + n} slides.pptx</p>
<h3 id="w${n}-t1">Net income to taxable income</h3><p><b>Net income for tax purposes</b> starts from accounting income and adjusts for items the Act treats differently. The adjustments add back amounts that were deducted for accounting but aren't allowed for tax, and subtract amounts the Act allows that accounting didn't record.</p>
<div class="box key"><div class="label">KEY: Division C deductions <span class="src">slide 6</span></div><p>Taxable income equals net income for tax purposes minus Division C deductions, such as net capital losses carried over and charitable donations.</p></div>
<p>For example, a corporation with $400,000 of net income and $20,000 of donations has taxable income of $380,000 before any loss carryovers.</p>
<div class="box watch"><div class="label">WATCH OUT</div><p>Donations are a deduction for a corporation but a credit for an individual. Mixing the two is the most common slip.</p></div>
<h3 id="w${n}-t2">Worked example</h3><div class="box example"><div class="label">EXAMPLE: from net income to taxable income</div><div class="tw"><table><tbody><tr><td>Net income for tax purposes</td><td class="n">400,000</td></tr><tr><td>Less: charitable donations</td><td class="n">(20,000)</td></tr><tr class="final"><td>Taxable income</td><td class="n"><input class="blank" data-ans="380000" aria-label="Taxable income"></td></tr></tbody></table></div></div>
<details class="answers"><summary>Answers: try first (worked example)</summary><div class="inner"><p>Taxable income is 380,000: 400,000 minus 20,000 of donations.</p></div></details>
<div class="box try quiz" id="w${n}-quiz" data-title="${label} quiz" data-ask><div class="q" data-a="B" data-hint="Is it a deduction or a credit for a corporation?"><p class="stem">A corporation donates $15,000 to a registered charity. How does it affect the corporation's tax?</p><ol type="A"><li>A non-refundable tax credit</li><li>A Division C deduction from net income</li><li>An expense in net income for tax purposes</li></ol><div class="why">Corporations deduct donations in Division C. A credit is how individuals get relief, which is the tempting wrong answer.</div></div><div class="q" data-a="A"><p class="stem">True or false: taxable income can be lower than net income for tax purposes.</p><ol type="A"><li>True</li><li>False</li></ol><div class="why">Division C deductions come off net income, so taxable income is often lower.</div></div></div>`;
  const gemit = () => emit('guides', guides.map((g) => ({ ...g, pieces: g.pieces.map((p) => ({ ...p })) })));
  async function fakeBuild(g) {
    for (const p of g.pieces) {
      if (g.status === 'stopped') return;
      g.status = 'building'; p.status = 'building'; gemit();
      for (const l of ['Read Chapter slides.md', 'Saving to the guide']) { emit('step', { id: g.id, piece: p.id, label: l }); await sleep(q.has('fast') ? 150 : 900); }
      gparts[g.id][p.id] = p.id === 'start' ? `<h2 id="start">Before you start</h2><p>This guide covers how a corporation gets from accounting income to taxable income, then to tax payable.</p><p>Read a topic, close the guide and write your notes from memory, then check what you missed. Take the week quiz before moving on. It asks how sure you feel first, and your scores save in Andromeda.</p><div class="box try quiz" id="warmup-quiz" data-title="Warm-up: guess first"><div class="q" data-a="A"><p class="stem">Which comes first?</p><ol type="A"><li>Net income for tax purposes</li><li>Taxable income</li></ol><div class="why">Taxable income is built from net income.</div></div></div>`
        : p.id === 'finish' ? `<div class="box try quiz" id="final-quiz" data-title="Final quiz" data-ask><div class="q" data-a="C"><p class="stem">Which is a Division C deduction?</p><ol type="A"><li>CCA</li><li>Salaries</li><li>Net capital losses carried over</li></ol><div class="why">Carryovers are Division C.</div></div></div>`
        : sampleWeek(+p.id.slice(1), p.label);
      p.status = 'done'; gemit(); emit('part', { id: g.id, piece: p.id });
    }
    g.status = 'done'; gemit();
  }

  window.andromeda = {
    mock: true,
    platform: 'web',
    onNav() {}, onFocusPrompt() {}, popupMenu() {},
    state: async () => ({ courses, inbox, usage, github, claude: { installed: !q.has('noclaude'), version: '2.1.330' }, dataDir: '~/Documents/Andromeda', version: '0.4.5', guides, subjects: SUBJ, device: { ...device }, sync }),
    claudeStatus: async () => ({ installed: true, version: '2.1.330' }),
    run: async (req) => { fakeRun(req); return true; },
    stop: async () => {},
    findDates: async ({ courseId, file }) => {
      const out = (e) => emit('claude', e);
      (async () => {
        out({ type: 'start' }); await sleep(300);
        out({ type: 'step', step: { id: 'r', label: 'Read ' + file.replace(/\.[^.]+$/, '.md'), state: 'running' } }); await sleep(600);
        out({ type: 'step', step: { id: 'r', label: 'Read ' + file.replace(/\.[^.]+$/, '.md'), state: 'done' } });
        const items = [
          { title: 'Assignment 1', date: `${year}-10-17`, time: '', covers: '', quote: 'Assignment 1 due Oct 17', page: 1 },
          { title: 'Midterm', date: `${year}-10-22`, time: '', covers: 'Chapters 12 to 14', quote: 'Midterm exam (Ch 12-14)', page: 1 },
          { title: 'Final exam', date: `${year}-12-15`, time: '14:00', covers: '', quote: 'Final exam Dec 15, 2:00 pm', page: 1 },
          { title: 'Case study', date: '', time: '', covers: '', quote: 'Case study due in week 9', page: 2 },
        ];
        out({ type: 'dates', items });
        for (const w of 'I found 4 items. Check them before adding.'.split(/(?<= )/)) { out({ type: 'text', delta: w }); await sleep(30); }
        out({ type: 'done', ok: true, text: '', changes: [], pending: [], model: 'sonnet', mode: 'dates', proposed: items, tokens: { input: 40, output: 420, cacheRead: 900, cacheWrite: 2600 } });
      })();
      return true;
    },
    addDates: async (courseId, items) => ({ changes: items.map((i) => ({ course: 'Income Tax 2', courseId, where: 'Coming up', what: [i.title, i.date].filter(Boolean).join(', ') })), stepId: 'fff0001' }),
    onClaude: (f) => listeners.claude.push(f),
    answer: async (pending, yes) => {
      if (!yes) return { changes: [] };
      if (pending.kind === 'remove_files') {
        const c = courses.find((x) => x.id === pending.courseId);
        c.files = c.files.filter((f) => !pending.files.includes(f.name));
        emit('data', { courses, inbox });
        return { changes: pending.files.map((f) => ({ course: c.name, where: 'Course files', what: f })), stepId: 'fff0002' };
      }
      courses = courses.filter((c) => c.id !== pending.courseId);
      emit('data', { courses, inbox });
      return { changes: [{ course: pending.course, where: 'Courses', what: `Deleted ${pending.course}` }], stepId: 'def5678' };
    },
    undo: async () => ({ ok: true }),
    onData: (f) => listeners.data.push(f),
    pickFiles: async () => [], receive: async (paths) => { inbox = inbox.concat(paths.map((p) => p.split(/[\\/]/).pop())); emit('data', { courses, inbox }); return inbox; },
    attachTo: async () => ({ changes: [] }), clearInbox: async () => { inbox = []; emit('data', { courses, inbox }); },
    pathFor: (f) => f.name,
    receiveData: async (name) => { inbox = inbox.concat(/^image\./.test(name) ? 'Pasted image Nov 23, 2.05 pm.png' : name); emit('data', { courses, inbox }); return inbox; },
    openFile: async (courseId, name) => { window.__opened = name; return true; },
    githubStart: async () => ({ code: 'WDJB-MJHT', url: 'https://github.com/login/device' }),
    githubWait: async () => { await sleep(1500); github.connected = true; github.login = 'JazzyXD'; github.repo = 'JazzyXD/Andromeda-data'; return github; },
    githubCancel: async () => {}, githubRetry: async () => github,
    syncNow: async () => { emit('sync', sync = { ...sync, state: 'syncing' }); await sleep(900); sync = { state: 'ok', message: '', at: Date.now() }; emit('sync', sync); return sync; },
    onSync: (f) => listeners.sync.push(f),
    renameDevice: async (name) => (device.name = String(name).trim().slice(0, 40) || 'This laptop'),
    zoomGet: async () => ({ mode: 'auto', factor: 1, auto: 1, levels: [0.9, 1, 1.1, 1.25, 1.5, 1.75] }),
    zoomSet: async (m) => ({ mode: m, factor: m === 'auto' ? 1 : m, auto: 1, levels: [0.9, 1, 1.1, 1.25, 1.5, 1.75] }),
    zoomStep: async () => ({ mode: 'auto', factor: 1, auto: 1, levels: [] }),
    onZoom() {},
    openExternal: async (u) => window.open(u), openDataFolder: async () => {},
    guideGuess: async (name) => (/tax/i.test(name) ? ['procedural', 'rules'] : /audit/i.test(name) ? ['rules'] : ['procedural']),
    guideCreate: async (plan) => {
      const c = courses.find((x) => x.id === plan.courseId), t = c.upcoming.find((u) => u.id === plan.testId);
      const weeks = c.weeks.filter((w) => plan.weekIds.includes(w.id));
      const g = { id: 'g' + Date.now(), title: `${c.name}: ${t ? t.title : weeks.map((w) => w.label).join(' to ')}`, badge: Object.keys(window.AndromedaConstellations.GUIDE)[guides.length % 6], courseId: c.id, courseName: c.name,
        test: t ? { id: t.id, title: t.title, date: t.date } : null, weeks: weeks.map((w) => ({ id: w.id, label: w.label, title: w.title, files: w.files })), subjects: plan.subjects, exam: plan.exam, model: plan.model, effort: plan.effort,
        pieces: [...weeks.map((w, i) => ({ id: 'w' + (i + 1), label: w.label, status: 'waiting' })), ...(weeks.length > 1 ? [{ id: 'finish', label: 'Final quiz', status: 'waiting' }] : []), { id: 'start', label: 'Opening', status: 'waiting' }],
        status: 'planned', pausedUntil: null, created: new Date().toISOString() };
      guides.unshift(g); gparts[g.id] = {}; gprog[g.id] = {};
      setTimeout(() => fakeBuild(g), 300);
      return { ...g };
    },
    guideGet: async (id) => ({ guide: { ...guides.find((g) => g.id === id) }, parts: { ...gparts[id] }, progress: { ...gprog[id] } }),
    guideStop: async (id) => { const g = guides.find((x) => x.id === id); g.status = 'stopped'; gemit(); },
    guideResume: async (id) => { const g = guides.find((x) => x.id === id); g.pieces.forEach((p) => { if (p.status !== 'done') p.status = 'waiting'; }); g.status = 'building'; fakeBuild(g); return true; },
    guideDelete: async (id) => { guides = guides.filter((g) => g.id !== id); gemit(); return true; },
    guideProgress: async (id, k, v) => { gprog[id][k] = v; window.__lastProgress = { id, k, v }; return true; },
    guideExport: async (title, html) => { window.__exported = html; return '/home/me/Documents/' + title + '.html'; },
    guidePrint: async (title, html) => { window.__printed = html; return true; },
    onGuides: (f) => listeners.guides.push(f),
    onGuidePart: (f) => listeners.part.push(f),
    onGuideStep: (f) => listeners.step.push(f),
    onUsage: (f) => listeners.usage.push(f),
  };
})();
