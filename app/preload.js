// HawatriSense Center - by Kia Hawatri
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hawatri', {
  info: () => ipcRenderer.invoke('info'),
  readSettings: () => ipcRenderer.invoke('read-settings'),
  write: (key, value) => ipcRenderer.invoke('write', key, value),
  stats: () => ipcRenderer.invoke('stats'),
  asset: (name) => ipcRenderer.invoke('asset', name),
  robot: () => ipcRenderer.invoke('robot'),
  window: (action) => ipcRenderer.send('window', action),
});
