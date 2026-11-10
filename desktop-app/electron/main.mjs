import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ElectronMainRuntime } from "../../dist-desktop/desktop-app/electron/main-runtime.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;
let runtime;
let quitting = false;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: path.join(currentDirectory, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    const currentUrl = mainWindow?.webContents.getURL();
    if (currentUrl && new URL(targetUrl).origin !== new URL(currentUrl).origin) {
      event.preventDefault();
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  void mainWindow.loadFile(path.join(currentDirectory, "..", "index.html"));
  mainWindow.on("closed", () => { mainWindow = undefined; });

  return mainWindow;
}

app.whenReady().then(() => {
  runtime = new ElectronMainRuntime({
    appDataPath: app.getPath("userData"),
    coreEntryPath: path.resolve(app.getAppPath(), "dist", "index.js"),
    electronExecutablePath: process.execPath,
    appVersion: app.getVersion(),
    ipcMain,
    isTrustedSender: (sender) => Boolean(mainWindow && sender === mainWindow.webContents)
  });
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}).catch((error) => {
  process.stderr.write(`Desktop startup failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  app.exit(1);
});

app.on("before-quit", (event) => {
  if (quitting || !runtime) return;
  event.preventDefault();
  quitting = true;
  void runtime.dispose().catch((error) => {
    process.stderr.write(`Core shutdown warning: ${error instanceof Error ? error.message : "unknown error"}\n`);
  }).finally(() => app.exit(0));
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
