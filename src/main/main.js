// Andromeda main process: one native-feeling window over the night sky.
const { app, BrowserWindow, Menu, shell, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

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

  // No pinch or keyboard zoom: it's an app, not a page.
  wc.setVisualZoomLevelLimits(1, 1);
  wc.on('zoom-changed', () => wc.setZoomFactor(1));

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

  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (!isMac) app.quit(); });
}
