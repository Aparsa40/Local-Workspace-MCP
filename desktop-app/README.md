# Local-Workspace-MCP desktop application

The Windows desktop application is built with Electron, React, TypeScript, and Vite. The MCP Core remains a separate Node.js process and remains independently runnable by MCP clients.

## Development

From the repository root:

```powershell
npm install
cd desktop-app
npm install
cd ..
npm run desktop:dev
```

The desktop launch script builds the Core, Electron main-process TypeScript, and bundled React renderer before opening Electron.

## Connected functionality

- Dashboard reads the real Electron-managed Core state and persisted policy revision.
- Workspaces are selected through Electron's native directory picker and persisted through PolicyStore. New roots start with zero grants.
- Permissions edit only the four capabilities currently implemented by Core: `list`, `read`, `search`, and `metadata`.
- Tool catalog lists the actual read-only Core tools; it does not expose fake enable/disable switches.
- Connections copies a stdio client configuration using the current Core entry point and policy path.
- Resource limits are edited in the versioned policy document and validated by the Core schema.
- Activity & Audit explicitly reports that persistent structured audit storage is not yet implemented; it never displays fabricated events.

A policy is shown as active only after the managed Core confirms the matching runtime revision. If a live reload fails, the desktop service attempts to stop the managed Core and reports the policy as unapplied.

## Security boundary

- Renderer runs with `contextIsolation`, `sandbox`, and `nodeIntegration: false`.
- Preload exposes named operations only; it does not expose `ipcRenderer` or generic channel invocation.
- Main-process handlers validate payloads and verify the invoking WebContents and main frame.
- Native folder selection is performed in the Electron main process.
- The Core child is launched without a shell, with MCP stdio separate from its inherited policy-control pipes.
- No unauthenticated network management endpoint is exposed.

## Remaining M1 verification

A full Windows desktop launch smoke test and end-to-end manual verification of folder selection, policy save/reload, process shutdown, and renderer privilege boundaries are still required before M1 can be marked complete. Persistent audit storage, installer packaging, and full operationalization of all seven screens remain separate follow-up work.
