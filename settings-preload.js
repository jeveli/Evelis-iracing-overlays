const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("settingsAPI", {
  getState: () => ipcRenderer.invoke("get-state"),
  onStateInit: (cb) => ipcRenderer.on("state-init", (_e, v) => cb(v)),
  sendSettingChange: (data) => ipcRenderer.send("setting-change", data),
  setEditMode: (enabled) => ipcRenderer.send("edit-mode", enabled),
  setMasterHidden: (enabled) => ipcRenderer.send("master-hidden", enabled),
});

