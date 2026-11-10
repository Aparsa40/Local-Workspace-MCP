import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ElectronMainRuntime } from "../../dist-desktop/desktop-app/electron/main-runtime.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;
let runtime;
let quitting = false;
let smokeTimer;
const smokeMode = smokeMode || process.argv.includes("--lwmcp-smoke-test");

function finishSmoke(exitCode) {
  if (smokeTimer) clearTimeout(smokeTimer);
  const activeRuntime = runtime;
  runtime = undefined;
  void Promise.resolve(activeRuntime?.dispose())
    .catch((error) => {
      process.stderr.write(`Electron smoke cleanup failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    })
    .finally(() => app.exit(exitCode));
}

function verifySmokeWindow(window) {
  smokeTimer = setTimeout(() => {
    process.stderr.write("Electron smoke verification timed out.\n");
    finishSmoke(1);
  }, 30_000);

  window.webContents.once("did-fail-load", (_event, errorCode, description) => {
    process.stderr.write(`Electron smoke renderer load failed (${errorCode}): ${description}\n`);
    finishSmoke(1);
  });

  window.webContents.once("did-finish-load", () => {
    const verification = `Promise.all([
      window.localWorkspace.app.getStatus(),
      window.localWorkspace.policy.get()
    ]).then(([appStatus, policy]) => ({
      rendererMounted: Boolean(document.querySelector("#root")?.childElementCount),
      appStatus,
      policy
    }))`;

    void window.webContents.executeJavaScript(verification).then((result) => {
      if (!result.rendererMounted || !result.appStatus?.ok ||
          !result.policy?.ok || result.policy.value.configured !== false) {
        throw new Error("Renderer, preload bridge, or initial unconfigured policy check failed.");
      }
      process.stdout.write("Electron Windows smoke test passed: React renderer, preload IPC, and backend status are live.\n");
      finishSmoke(0);
    }).catch((error) => {
      process.stderr.write(`Electron smoke verification failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
      finishSmoke(1);
    });
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: path.join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  // This shell does not require renderer navigation. Deny every page-initiated
  // navigation rather than trying to maintain an origin allowlist for file://.
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.once("ready-to-show", () => {
    if (!smokeMode) mainWindow?.show();
  });
  mainWindow.on("closed", () => { mainWindow = undefined; });

  return mainWindow;
}

app.whenReady().then(() => {
  const coreEntryPath = app.isPackaged
    ? path.join(process.resourcesPath, "core", "index.js")
    : path.resolve(currentDirectory, "..", "..", "dist", "index.js");

  runtime = new ElectronMainRuntime({
    appDataPath: app.getPath("userData"),
    coreEntryPath,
    electronExecutablePath: process.execPath,
    appVersion: app.getVersion(),
    ipcMain,
    selectDirectory: async () => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: "Select a workspace folder",
        properties: ["openDirectory"]
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    isTrustedSender: (event) => Boolean(
      mainWindow &&
      event.sender === mainWindow.webContents &&
      event.senderFrame === mainWindow.webContents.mainFrame
    )
  });
  const window = createMainWindow();
  if (smokeMode) {
    verifySmokeWindow(window);
  }
  void window.loadFile(path.join(currentDirectory, "..", "ui-dist", "index.html")).catch((error) => {
    process.stderr.write(`Desktop renderer failed to load: ${error instanceof Error ? error.message : "unknown error"}\n`);
    if (smokeMode) finishSmoke(1);
  });

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
