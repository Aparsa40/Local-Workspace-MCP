// Electron sandboxed preload scripts use the restricted CommonJS require API.\n// eslint-disable-next-line @typescript-eslint/no-require-imports\nconst { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, payload = {}) => ipcRenderer.invoke(channel, payload);

// Named operations only: never expose arbitrary IPC channel selection.
contextBridge.exposeInMainWorld("localWorkspace", Object.freeze({
  app: Object.freeze({
    getStatus: () => invoke("lwmcp:app:get-status")
  }),
  policy: Object.freeze({
    get: () => invoke("lwmcp:policy:get"),
    save: (proposal, expectedRevision) =>
      invoke("lwmcp:policy:save", { proposal, expectedRevision })
  }),
  core: Object.freeze({
    start: () => invoke("lwmcp:core:start"),
    stop: () => invoke("lwmcp:core:stop")
  })
}));
