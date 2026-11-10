import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electronExecutable = require("electron");
const child = spawn(electronExecutable, ["--no-sandbox", "smoke.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, LWMCP_ELECTRON_SMOKE: "1" },
  stdio: "inherit",
  windowsHide: true
});

const timeout = setTimeout(() => {
  process.stderr.write("Electron smoke child exceeded the 45-second CI limit.\\n");
  child.kill();
  process.exitCode = 1;
}, 45_000);

child.once("error", (error) => {
  clearTimeout(timeout);
  process.stderr.write(`Unable to launch Electron smoke child: ${error.message}\\n`);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  clearTimeout(timeout);
  if (signal) {
    process.stderr.write(`Electron smoke child exited on signal ${signal}.\\n`);
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
});
