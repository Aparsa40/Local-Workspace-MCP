# Local-Workspace-MCP Desktop UI Prototype

This is a standalone, interactive React + TypeScript prototype for the agreed Local-Workspace-MCP desktop product direction.

## Run locally

Requirements: Node.js 22+ and npm 10+.

```powershell
cd desktop-prototype
npm install
npm run dev
```

Open the local URL printed by Vite (bound to 127.0.0.1).

Build a static preview:

```powershell
npm run build
npm run preview
```

## Prototype scope

The prototype covers the seven agreed navigation areas:

- Dashboard
- Workspaces
- Permissions
- Tools
- Activity & Audit
- Connections
- Settings

It includes local-only interactions for navigation, workspace creation, workspace enable/disable, permission toggles, tool toggles, activity filtering, client configuration copy, settings controls, and confirmation/toast feedback.

## Important: demo data only

This is a UX validation prototype. It does **not** connect to the MCP Core, Windows filesystem, process manager, policy file, or audit log. All displayed workspaces, events, server status, and settings are illustrative in-memory demo data. Refreshing the page resets changes.

No real permissions are changed and no local files are accessed. Backend integration must be implemented later through the approved desktop IPC/control contracts and Core policy enforcement.
