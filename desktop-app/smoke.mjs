// Dedicated Electron entry point used only by the Windows CI launch smoke test.
// Set the marker before importing the regular main process so the smoke path is
// deterministic and does not depend on shell-specific environment propagation.
process.env.LWMCP_ELECTRON_SMOKE = "1";
await import("./electron/main.mjs");
