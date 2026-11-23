// The only bridge between the window and the rest of the computer.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (name, arg) => ipcRenderer.invoke(name, arg).then((r) => {
  if (!r || !r.ok) throw new Error((r && r.error) || 'Something went wrong.');
  return r.value;
});
const on = (channel) => (fn) => ipcRenderer.on(channel, (_e, v) => fn(v));

contextBridge.exposeInMainWorld('andromeda', {
  platform: process.platform,
  onNav: on('nav'),
  onFocusPrompt: (fn) => ipcRenderer.on('focus-prompt', () => fn()),
  popupMenu: (x, y) => ipcRenderer.send('menu:popup', { x, y }),

  state: () => call('app:state'),
  claudeStatus: () => call('claude:status'),
  run: (req) => call('claude:run', req),
  stop: () => call('claude:stop'),
  findDates: (req) => call('dates:find', req),
  addDates: (courseId, items) => call('dates:add', { courseId, items }),
  onClaude: on('claude:event'),
  answer: (pending, yes) => call('confirm:answer', { pending, yes }),
  undo: (stepId) => call('undo', stepId),
  onData: on('data:changed'),

  pickFiles: () => call('files:pick'),
  receive: (paths) => call('files:receive', paths),
  attachTo: (courseId, paths) => call('files:attachTo', { courseId, paths }),
  clearInbox: () => call('files:clearInbox'),
  pathFor: (file) => webUtils.getPathForFile(file),

  githubStart: () => call('github:start'),
  githubWait: () => call('github:wait'),
  githubCancel: () => call('github:cancel'),
  githubRetry: () => call('github:retryLink'),
  syncNow: () => call('sync:now'),
  onSync: on('sync'),
  renameDevice: (name) => call('device:rename', name),
  zoomGet: () => call('zoom:get'),
  zoomSet: (mode) => call('zoom:set', mode),
  zoomStep: (dir) => call('zoom:step', dir),
  onZoom: on('zoom:changed'),
  openExternal: (url) => call('open:external', url),
  openDataFolder: () => call('open:dataFolder'),

  guideGet: (id) => call('guides:get', id),
  guideGuess: (courseName) => call('guides:guess', courseName),
  guideCreate: (plan) => call('guides:create', plan),
  guideStop: (id) => call('guides:stop', id),
  guideResume: (id) => call('guides:resume', id),
  guideDelete: (id) => call('guides:delete', id),
  guideProgress: (id, k, v) => call('guides:progress', { id, k, v }),
  guideExport: (title, html) => call('guides:export', { title, html }),
  guidePrint: (title, html) => call('guides:print', { title, html }),
  onGuides: on('guides:changed'),
  onGuidePart: on('guide:part'),
  onGuideStep: on('guide:step'),
  onUsage: on('usage'),
});
