const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("KnowledgeForgeDesktop", Object.freeze({
  getLocalActionToken: () => ipcRenderer.invoke("knowledge-forge:get-local-action-token"),
  getDataDirectoryStatus: () => ipcRenderer.invoke("knowledge-forge:get-data-dir-status"),
  chooseDataDirectory: () => ipcRenderer.invoke("knowledge-forge:choose-data-dir"),
  saveDataDirectory: (dataDir) => ipcRenderer.invoke("knowledge-forge:save-data-dir", dataDir),
  resetDataDirectory: () => ipcRenderer.invoke("knowledge-forge:reset-data-dir"),
  relaunch: () => ipcRenderer.invoke("knowledge-forge:relaunch"),
}));
