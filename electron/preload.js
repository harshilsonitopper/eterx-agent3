const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  listFolder: (path) => ipcRenderer.invoke('list-folder', path),
  isElectron: true,
});
