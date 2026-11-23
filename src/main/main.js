// Andromeda main process: one native-feeling window over the night sky.
const { app, BrowserWindow, Menu, shell, ipcMain, screen, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { DataStore } = require('./data');
const { createToolServer } = require('./tools');
const { extract } = require('./extract');
const { ClaudeRunner } = require('./claude');
const { GitHub } = require('./github');
const { GuideStore, GuideBuilder, guessSubjects, SUBJECTS } = require('./guides');

const isMac = process.platform === 'darwin';
const isDev = !app.isPackaged || process.argv.includes('--dev');
const SKY = '#05060F';

let win = null;

// ---------- window size and position ----------
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; }
}

function saveState() {
  if (!win || win.isDestroyed()) return;
  const b = win.getNormalBounds();
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch { /* not critical */ }
}

function onScreen(b) {
  return screen.getAllDisplays().some(({ workArea: a }) =>
    b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y);
}

// ---------- the window ----------
function createWindow() {
  const s = loadState();
  const opts = {
    width: s.width || 1440,
    height: s.height || 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Andromeda',
    backgroundColor: SKY, // no white flash: the window is night sky from the first frame
    show: false,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  };
  if (isMac) {
    opts.trafficLightPosition = { x: 20, y: 24 };
  } else {
    // Windows: the system buttons float over the sky instead of a white bar.
    opts.titleBarOverlay = { color: 'rgba(0,0,0,0)', symbolColor: '#C9D0E4', height: 64 };
  }
  if (s.x != null && s.y != null && onScreen({ x: s.x, y: s.y, width: opts.width, height: opts.height })) {
    opts.x = s.x;
    opts.y = s.y;
  }

  win = new BrowserWindow(opts);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    if (s.maximized) win.maximize();
    win.show();
  });

  let saveTimer = null;
  const queueSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveState, 400); };
  win.on('resize', queueSave);
  win.on('move', queueSave);
  win.on('close', saveState);
  win.on('closed', () => { win = null; });

  const wc = win.webContents;

  // No pinch zoom like a web page; the interface size is set from Settings or Ctrl/Cmd + = and -.
  wc.setVisualZoomLevelLimits(1, 1);
  wc.on('did-finish-load', applyZoom);
  win.on('moved', () => { if (zoomMode === 'auto') applyZoom(); });

  // Never navigate away from the app; outside links go to the normal browser.
  wc.on('will-navigate', (e, url) => {
    if (url !== wc.getURL()) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Right-click: only Cut/Copy/Paste where it makes sense. No Inspect, no Back.
  wc.on('context-menu', (_e, p) => {
    const items = [];
    if (p.isEditable) {
      items.push({ role: 'cut', enabled: p.editFlags.canCut }, { role: 'copy', enabled: p.editFlags.canCopy },
        { role: 'paste', enabled: p.editFlags.canPaste }, { type: 'separator' }, { role: 'selectAll' });
    } else if (p.selectionText && p.selectionText.trim()) {
      items.push({ role: 'copy' });
    }
    if (isDev) items.push({ type: 'separator' }, { label: 'Inspect', click: () => wc.inspectElement(p.x, p.y) });
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
}

// ---------- interface size ----------
// Auto picks a size from the screen the window is on, so big monitors don't get tiny text.
const ZOOMS = [0.9, 1, 1.1, 1.25, 1.5, 1.75];
const zoomFile = () => path.join(app.getPath('userData'), 'zoom.json');
let zoomMode = 'auto';
function autoZoom() {
  if (!win) return 1;
  const w = screen.getDisplayMatching(win.getBounds()).workAreaSize.width;
  return w >= 3200 ? 1.5 : w >= 2200 ? 1.25 : w >= 1800 ? 1.1 : 1;
}
const zoomFactor = () => (zoomMode === 'auto' ? autoZoom() : zoomMode);
const zoomInfo = () => ({ mode: zoomMode, factor: zoomFactor(), auto: autoZoom(), levels: ZOOMS });
function applyZoom() {
  if (!win || win.isDestroyed()) return;
  win.webContents.setZoomFactor(zoomFactor());
  toWin('zoom:changed', zoomInfo());
}
function setZoom(mode) {
  zoomMode = mode === 'auto' ? 'auto' : Math.min(1.75, Math.max(0.9, Number(mode) || 1));
  try { fs.writeFileSync(zoomFile(), JSON.stringify({ mode: zoomMode })); } catch { /* fine */ }
  applyZoom();
  return zoomInfo();
}
function stepZoom(dir) {
  if (!dir) return setZoom('auto');
  const cur = zoomFactor();
  const next = dir > 0 ? ZOOMS.find((z) => z > cur + 0.001) || 1.75 : [...ZOOMS].reverse().find((z) => z < cur - 0.001) || 0.9;
  return setZoom(next);
}

// ---------- menus ----------
const send = (channel, value) => { if (win) { win.show(); win.webContents.send(channel, value); } };

function buildMenu() {
  const tabs = [
    { label: 'Courses', accelerator: 'CmdOrCtrl+1', click: () => send('nav', 'courses') },
    { label: 'Guides', accelerator: 'CmdOrCtrl+2', click: () => send('nav', 'guides') },
    { label: 'Settings', accelerator: 'CmdOrCtrl+3', click: () => send('nav', 'settings') },
  ];
  const template = [];
  if (isMac) {
    template.push({
      label: 'Andromeda',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: () => send('nav', 'settings') },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }
  template.push(
    {
      label: 'File',
      submenu: [
        { label: 'Ask Claude', accelerator: 'CmdOrCtrl+K', click: () => send('focus-prompt') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        ...tabs,
        { type: 'separator' },
        { label: 'Bigger', accelerator: 'CmdOrCtrl+=', click: () => stepZoom(1) },
        { label: 'Bigger', accelerator: 'CmdOrCtrl+Plus', visible: false, acceleratorWorksWhenHidden: true, click: () => stepZoom(1) },
        { label: 'Smaller', accelerator: 'CmdOrCtrl+-', click: () => stepZoom(-1) },
        { label: 'Auto size', accelerator: 'CmdOrCtrl+0', click: () => stepZoom(0) },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Window',
      submenu: isMac
        ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
        : [{ role: 'minimize' }, { label: 'Maximize', click: () => win && (win.isMaximized() ? win.unmaximize() : win.maximize()) }],
    },
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// On Windows the menu lives behind the Andromeda logo, since there's no menu bar.
ipcMain.on('menu:popup', (_e, pos) => {
  const menu = Menu.getApplicationMenu();
  if (menu && win) menu.popup({ window: win, x: Math.round(pos?.x || 20), y: Math.round(pos?.y || 56) });
});

// ---------- data, Claude and GitHub ----------
let store, tools, runner, github, guides, builder;
const usageFile = () => path.join(app.getPath('userData'), 'usage.json');
let usage = {};
const toWin = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };

async function setupServices() {
  const dataDir = process.env.ANDROMEDA_DATA || path.join(app.getPath('home'), 'Andromeda Data');
  store = new DataStore(dataDir);
  await store.init();
  tools = createToolServer(store, extract);
  await tools.ready;
  try { usage = JSON.parse(fs.readFileSync(usageFile(), 'utf8')); } catch { usage = {}; }
  try { zoomMode = JSON.parse(fs.readFileSync(zoomFile(), 'utf8')).mode ?? 'auto'; } catch { zoomMode = 'auto'; }
  screen.on('display-metrics-changed', () => { if (zoomMode === 'auto') applyZoom(); });
  runner = new ClaudeRunner({
    store, tools,
    getUsage: () => usage,
    setUsage: (u) => { usage = u; try { fs.writeFileSync(usageFile(), JSON.stringify(u)); } catch { /* fine */ } },
  });
  // Guides build on their own Claude Code run, so the course chat stays free meanwhile.
  guides = new GuideStore(store);
  const guideRunner = new ClaudeRunner({
    store, tools,
    getUsage: () => usage,
    setUsage: (u) => { usage = u; try { fs.writeFileSync(usageFile(), JSON.stringify(u)); } catch { /* fine */ } toWin('usage', u); },
  });
  builder = new GuideBuilder({ guides, store, runner: guideRunner, getUsage: () => usage, onCommit: () => backup() });
  guides.on('changed', async () => toWin('guides:changed', await guides.list()));
  builder.events.on('part', (p) => toWin('guide:part', p));
  builder.events.on('claude', ({ id, piece, ev }) => { if (ev.type === 'step' && ev.step.state === 'running') toWin('guide:step', { id, piece, label: ev.step.label }); if (ev.type === 'usage') toWin('usage', ev.usage); });
  github = new GitHub(app.getPath('userData'), store);
  await github.load();
  // Connected before, but this data folder isn't linked yet (new folder, or a fresh start): link it.
  if (github.token) {
    const origin = await store.runGit(['remote', 'get-url', 'origin']);
    if (!origin.ok) github.link().catch(() => {});
  }
  store.on('changed', async () => toWin('data:changed', { courses: await store.listCourses(), inbox: await store.inbox() }));
  builder.pickUp().catch(() => {});
}

// Save to GitHub in the background after any change.
const backup = () => { if (github && github.token) github.push().then((ok) => toWin('github:pushed', { ok })); };
// Quiz scores and typed answers are saved straight away, and backed up once things go quiet.
let progressTimer = null;
const progressDirty = () => { clearTimeout(progressTimer); progressTimer = setTimeout(flushProgress, 45e3); };
async function flushProgress() { clearTimeout(progressTimer); progressTimer = null; if (store && await store.commit('Quiz progress')) backup(); }

const handlers = {
  'app:state': async () => ({
    courses: await store.listCourses(), inbox: await store.inbox(), usage,
    github: github.state(), claude: await runner.status(), dataDir: store.dir, version: app.getVersion(),
    guides: await guides.list(), subjects: Object.fromEntries(Object.entries(SUBJECTS).map(([k, v]) => [k, v.name])),
  }),
  'claude:status': () => runner.status(),
  'claude:run': (_e, req) => {
    runner.run(req, (ev) => {
      toWin('claude:event', ev);
      if (ev.type === 'done' && ev.stepId) backup();
      if (ev.type === 'done' && ev.ok && win && !win.isFocused() && Notification.isSupported()) {
        new Notification({ title: 'Andromeda', body: ev.changes && ev.changes.length ? `${ev.changes.length} change${ev.changes.length === 1 ? '' : 's'} saved` : 'Claude replied' }).show();
      }
    });
    return true;
  },
  'claude:stop': () => runner.stop(),
  // Only ever started by the user clicking Find dates.
  'dates:find': (_e, req) => { runner.findDates(req, (ev) => toWin('claude:event', ev)); return true; },
  'dates:add': async (_e, { courseId, items }) => {
    const changes = await store.addFoundDates(courseId, items);
    const stepId = changes.length ? await store.commit(`Added ${changes.length} date${changes.length === 1 ? '' : 's'} from a document`) : null;
    await store.writeSummary();
    store.emit('changed');
    if (stepId) backup();
    return { changes, stepId };
  },
  // The user's Yes or No for a delete. Only a Yes from the window can delete anything.
  'confirm:answer': async (_e, { pending, yes }) => {
    if (!yes) return { changes: [] };
    const changes = pending.kind === 'delete_course'
      ? await store.deleteCourse(pending.courseId)
      : await store.removeFiles(pending.courseId, pending.files || []);
    const stepId = await store.commit(pending.kind === 'delete_course' ? `Deleted ${pending.course}` : `Removed files from ${pending.course}`);
    await store.writeSummary();
    store.emit('changed');
    backup();
    return { changes, stepId };
  },
  'undo': async (_e, stepId) => { const r = await store.undo(stepId); if (r.ok) backup(); return r; },
  'files:pick': async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Slides and documents', extensions: ['pdf', 'pptx', 'ppt', 'docx', 'doc', 'xlsx', 'xls', 'txt', 'md', 'png', 'jpg', 'jpeg', 'webp'] }] });
    return r.canceled ? [] : r.filePaths;
  },
  'files:receive': async (_e, paths) => { await store.receive(paths); store.emit('changed'); return store.inbox(); },
  // Dropped straight onto a course card: filed with no Claude needed.
  'files:attachTo': async (_e, { courseId, paths }) => {
    const names = await store.receive(paths);
    const changes = await store.attachFiles(courseId, names, extract);
    const stepId = await store.commit(`Added files to ${changes[0] ? changes[0].course : 'a course'}`);
    await store.writeSummary();
    store.emit('changed');
    backup();
    return { changes, stepId };
  },
  'files:clearInbox': async () => { for (const n of await store.inbox()) fs.rmSync(store.p('.andromeda', 'inbox', n), { force: true }); store.emit('changed'); },
  'github:start': () => github.start(),
  'github:wait': async () => { await github.wait(); return github.link(); },
  'github:cancel': () => github.cancel(),
  'github:retryLink': () => github.link(),
  'guides:get': (_e, id) => guides.get(id),
  'guides:guess': (_e, name) => guessSubjects(name),
  'guides:create': async (_e, plan) => { const g = await guides.create(plan); backup(); builder.build(g.id).catch(() => {}); return g; },
  'guides:stop': (_e, id) => builder.stop(id),
  'guides:resume': (_e, id) => { builder.resume(id).catch(() => {}); return true; },
  'guides:delete': async (_e, id) => { await builder.stop(id).catch(() => {}); await guides.remove(id); backup(); return true; },
  'guides:progress': async (_e, { id, k, v }) => { await guides.saveProgress(id, k, v); progressDirty(); return true; },
  'zoom:get': () => zoomInfo(),
  'zoom:set': (_e, mode) => setZoom(mode),
  'zoom:step': (_e, dir) => stepZoom(dir),
  'open:external': (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); },
  'open:dataFolder': () => shell.openPath(store.dir),
};
for (const [name, fn] of Object.entries(handlers)) {
  ipcMain.handle(name, async (...a) => {
    try { return { ok: true, value: await fn(...a) }; } catch (e) { return { ok: false, error: e.message }; }
  });
}

// ---------- app lifecycle ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  app.setAboutPanelOptions?.({
    applicationName: 'Andromeda',
    applicationVersion: app.getVersion(),
    credits: 'A night-sky learning app. Built with Claude.',
  });

  app.whenReady().then(async () => {
    buildMenu();
    await setupServices();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (!isMac) app.quit(); });
  app.on('before-quit', () => { if (progressTimer) flushProgress(); });
}
