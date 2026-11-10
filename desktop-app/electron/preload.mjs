import { contextBridge, ipcRenderer } from "electron";

const invoke = async (channel, payload = {}) => {
  return ipcRenderer.invoke(channel, payload);
};

// Expose named operations only. Renderer code cannot choose IPC channel names
// or access ipcRenderer, Node.js, process, or arbitrary filesystem APIs.
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
