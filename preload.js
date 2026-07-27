const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  storage: {
    get: () => ipcRenderer.invoke('storage:get'),
    set: (data) => ipcRenderer.invoke('storage:set', data)
  },
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getEnv: () => ipcRenderer.invoke('app:getEnv'),
  onNewGame: (callback) => ipcRenderer.on('menu:new-game', callback),
  onAbout: (callback) => ipcRenderer.on('menu:about', callback)
});
