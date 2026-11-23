// The only bridge between the window and the rest of the computer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('andromeda', {
  platform: process.platform,
  onNav: (fn) => ipcRenderer.on('nav', (_e, view) => fn(view)),
  onFocusPrompt: (fn) => ipcRenderer.on('focus-prompt', () => fn()),
  popupMenu: (x, y) => ipcRenderer.send('menu:popup', { x, y }),
});
