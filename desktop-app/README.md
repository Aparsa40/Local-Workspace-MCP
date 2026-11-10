# Electron desktop shell

This package contains the Electron application shell. The MCP Core remains a separate Node.js process and remains independently runnable by MCP clients.

## Development

From the repository root:

```powershell
npm install
npm install --prefix desktop-app
npm run build
npm run build:desktop
npm run desktop:dev
```

The desktop shell expects the Core build at `dist/index.js`. It stores the managed policy under Electron's per-user `userData` directory.

## Security boundary

- Renderer runs with `contextIsolation`, `sandbox`, and `nodeIntegration: false`.
- The preload exposes named operations only; it does not expose `ipcRenderer` or generic channel invocation.
- Main-process handlers validate every payload and verify the invoking WebContents.
- The Core child is launched without a shell, with MCP stdio separate from its inherited policy-control pipes.
- A saved policy is not reported as active unless the managed Core confirms the same revision.
- If a live reload fails, the desktop service attempts to stop the managed Core and reports the policy as unapplied.

The current HTML/renderer is a minimal integration harness for verifying the Electron boundary and Core lifecycle. The approved seven-screen React prototype is not yet connected; that work remains in the desktop UI integration stage.
