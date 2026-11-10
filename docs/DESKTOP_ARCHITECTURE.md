# Local-Workspace-MCP — Desktop Application Architecture

> **Status:** Implementation contract baseline  
> **Target:** Windows 10/11, standard-user installation  
> **Related:** [Product Blueprint](PRODUCT_BLUEPRINT.md), [UI/UX Specification](UI_UX_SPEC.md), [Implementation Roadmap](IMPLEMENTATION_ROADMAP.md)

## 1. Decision summary

The first production desktop implementation will use:

- **Electron** for the Windows desktop shell and main process.
- **React + TypeScript + Vite** for the renderer, reusing the approved prototype UI.
- **Node.js + TypeScript** for the existing independent MCP Core.
- **Zod-validated IPC contracts** between renderer and Electron main process.
- **A versioned local policy file** stored in the current Windows user's application-data directory.
- **MCP stdio** for external MCP clients; no network management API.

Electron is selected because the existing Core and desktop main process both use Node.js. This avoids introducing a separate Rust/native service layer just to launch the Core, validate policy, access Windows directories, and manage local files. Electron's larger runtime footprint is accepted for the first implementation, but renderer security is mandatory.

The MCP Core remains independently executable. It must never require Electron to serve MCP clients.

## 2. Process boundaries

```text
Electron Main Process
  - owns application lifecycle
  - owns privileged filesystem and OS operations
  - opens native folder dialogs
  - reads / validates / atomically writes policy
  - starts Core subprocesses only for app-managed diagnostics
  - exposes a narrow IPC API
          |
          | contextBridge + allowlisted IPC
          v
React Renderer
  - renders the seven approved screens
  - holds temporary form state only
  - never imports Node.js modules
  - never reads or writes arbitrary local paths
          |
          v
Local-Workspace-MCP Core (independent process)
  - loads and validates policy
  - enforces workspace authorization for every tool call
  - registers only implemented MCP tools
  - writes sanitized audit records
          ^
          |
MCP-compatible clients launch Core directly over stdio
(ParsSynapse Chat is one client; Desktop is not required)
```

The renderer is untrusted input, even though it is bundled with the desktop application. Main-process handlers must validate every argument and must not expose a generic `ipcRenderer.invoke(channel, ...)` bridge.

## 3. Electron security baseline

Required before shipping any desktop build:

- `contextIsolation: true`.
- `nodeIntegration: false`.
- `sandbox: true` wherever compatible with the selected preload design.
- A small preload script using `contextBridge.exposeInMainWorld`.
- Explicit, named API methods only; no arbitrary channel names or generic IPC forwarding.
- Zod validation in the main process for every IPC payload.
- Restrictive Content Security Policy; no remote scripts or remote renderer content.
- Deny unexpected navigation, new windows, and untrusted web contents.
- No shell execution from renderer-provided strings.
- No arbitrary file read/write API exposed to renderer.
- Keep secrets and policy paths out of renderer-controlled command arguments.
- Run the application and Core as the signed-in standard user, not Administrator.
- Pin and audit Electron and build dependencies; keep Electron patched.

## 4. Proposed project layout

The current `desktop-prototype/` remains the UX reference until the production shell is integrated and reviewed. The production application will be introduced separately to avoid breaking the reviewed prototype.

```text
desktop-app/
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  electron/
    main.ts
    preload.ts
    ipc/
      register-handlers.ts
      schemas.ts
    services/
      app-paths.ts
      policy-store.ts
      core-process-manager.ts
      diagnostics-service.ts
  src/
    main.tsx
    App.tsx
    features/
      dashboard/
      workspaces/
      permissions/
      tools/
      activity/
      connections/
      settings/
    shared/
      api/
      components/
      contracts/
      state/
```

The first integration step may import or move approved UI components from `desktop-prototype/`; it must not maintain two divergent production UIs.

The Core remains in the repository's existing `src/` tree and retains its own root package/build/start commands.

## 5. Local application data

Use Electron's per-user application data location (resolved by the main process, not hard-coded in the renderer) for:

- Current policy/configuration.
- Previous policy backup.
- Application-only preferences.
- Sanitized persistent audit data and diagnostics, once implemented.

The UI receives display-safe paths and configuration summaries only when needed. It must not be able to choose arbitrary policy file locations without a dedicated validated operation.

The exact directory names and migration behavior must be finalized before the first installer. Existing developer configuration through `LWMCP_CONFIG` remains supported for direct Core execution.

## 6. IPC contract — first version

All methods are asynchronous, typed, versioned where appropriate, and validated in the main process. The names below describe the intended public preload API; they are not generic IPC channel strings exposed to the renderer.

| API method | Purpose | Privileged work |
|---|---|---|
| `app.getStatus()` | App/Core version and readiness summary | Main process |
| `workspaces.pickDirectory()` | Open native folder picker | Main process |
| `workspaces.validatePath(path)` | Validate an existing directory and canonical path | Main process + shared validation |
| `policy.get()` | Return sanitized current policy and revision | Policy store |
| `policy.validate(proposal)` | Validate complete proposed policy without saving | Policy store + Core schema |
| `policy.save(proposal, expectedRevision)` | Validate, backup, atomically persist, and return effective revision | Policy store |
| `tools.list()` | Return Core-owned tool catalog and implementation state | Core registry metadata |
| `audit.query(filters)` | Return sanitized, paginated audit events | Audit store |
| `connections.getStdioConfig(client)` | Generate a client config using the resolved Core and policy paths | Main process |
| `diagnostics.run()` | Run bounded local checks | Main process / disposable Core process |
| `settings.get()` | Read application and supported Core settings | Settings store |
| `settings.update(proposal)` | Validate and persist supported settings | Settings store |

Rules:

1. No API accepts an arbitrary shell command.
2. No API accepts a generic filesystem operation or arbitrary path for reading/writing.
3. Directory selection uses the native picker; the selected path is then independently validated.
4. The renderer submits a complete policy proposal, not a sequence of untrusted partial mutations.
5. The main process validates the expected revision to prevent overwriting a newer policy.
6. The main process validates the proposal against the same canonical schema and semantics used by Core.
7. Responses contain structured success/error codes and safe messages; never serialize raw Node.js errors or stack traces to the renderer.
8. All IPC methods enforce sender/frame validation and reject unexpected web contents.

## 7. Policy persistence and application

The current Core configuration is an unversioned JSON object containing `roots` and `limits`. The current schema requires at least one root and supports only `list`, `read`, `search`, and `metadata`.

The desktop implementation must not silently change that contract. Before production policy editing:

- Introduce an explicit schema version and migration path.
- Preserve compatibility with existing `LWMCP_CONFIG` files.
- Keep the existing capability names and most-specific-root/no-inheritance semantics unless a separately reviewed decision changes them.
- Reject unknown capabilities and malformed policy.
- Validate that each root exists, is a directory, and resolves to a safe canonical path.
- Reject duplicate canonical roots and define overlap/nested-root behavior.
- Start new workspaces with no permissions unless the user explicitly chooses a reviewed read-only preset.
- Keep the default authorization model fail-closed.

### Atomic save

The policy store must:

1. Read the current policy and revision.
2. Validate the complete proposed policy.
3. Write a temporary file in the same directory.
4. Flush and close the temporary file.
5. Preserve the previous valid policy as a backup.
6. Replace the active policy atomically using a Windows-safe same-volume strategy.
7. Read the saved policy back and verify its revision/hash.
8. Return the effective policy summary to the UI.

A failed save must leave the previous valid policy intact. Concurrent or stale saves must be rejected rather than silently overwriting changes.

### Policy changes and active stdio processes

This is a critical security requirement: stdio clients launch independent Core processes, and the current Core loads policy once at startup. Merely replacing the JSON file does **not** revoke permissions already loaded by an existing process.

Core now has an immutable in-process policy snapshot and an explicit revision-checked reload API. A reload validates and constructs the complete replacement before publishing it; failed validation leaves the current snapshot untouched, and competing stale reloads are rejected. Filesystem operations capture one snapshot for the full request. This API is not yet connected to a desktop management channel or file watcher, so replacing the policy JSON file alone still does not reload an already-running stdio process. Until that integration is implemented and verified, existing sessions must be treated as retaining their startup policy.

A UI must never label a policy revision as active until the Core behavior that enforces that revision is verified.

### Dedicated app-managed control channel (ADR-009)

The Core now provides a separately testable, bounded management protocol in src/desktop/policy-control-channel.ts. It is designed for two private OS pipes inherited only by an Electron-main-launched Core child: child descriptor 3 carries requests into Core and descriptor 4 carries responses back to the parent. MCP JSON-RPC remains on the child's stdin/stdout and is never multiplexed with management traffic.

Protocol version 1 supports policy.getRevision for the active Core revision handshake and policy.reload for applying a complete replacement config. Each newline-delimited JSON frame must be at most 64 KiB and contain a UUID request ID, the current expected SHA-256 revision, and the complete proposed Core config. Core validates the request and config, then delegates to PolicyRuntime.reload; stale revisions and invalid policies return stable error codes. Raw errors and stack traces are not returned.

The Core entrypoint activates this handler only when LWMCP_CONTROL_CHANNEL=1 is explicitly set and both inherited descriptors are verified as pipes. Ordinary client-owned Core processes do not set this marker and do not inspect or use descriptors 3/4. The CoreProcessManager service now owns a child process, reads the initial Core revision, sends serialized reload requests, bounds stderr capture, and performs graceful shutdown. The Electron main process and its restricted renderer IPC are not yet wired to this service, so the graphical policy-save workflow remains pending. Until that integration and Windows lifecycle tests are complete, policy file saves must not be described as immediately revoking permissions in existing sessions.

## 8. Core process lifecycle

The Core has two supported lifecycle modes:

1. **Client-owned stdio process:** launched directly by an MCP client using the generated command and configuration path. It must work without the Desktop App.
2. **App-managed Core process:** launched and owned by the Electron main process through CoreProcessManager, with dedicated management pipes, bounded stderr capture, request timeouts, policy revision handshake, and graceful shutdown. This is a separate managed process; it does not turn client-owned stdio processes into a shared daemon.

The Desktop App must not claim to start, stop, or observe third-party client-owned processes unless a concrete supported mechanism exists. A stdio server is not a shared daemon.

The initial implementation does not add a network listener or unauthenticated HTTP control endpoint.

## 9. Tool catalog ownership

The Core is the source of truth for tool metadata:

- tool name and description;
- owning module;
- required capabilities;
- read-only or mutating classification;
- implementation/availability state;
- input/output limits;
- audit behavior.

The desktop UI displays this catalog. It may request a supported configuration change only for tools that Core explicitly implements. A renderer toggle cannot register a tool or grant a capability.

The initial catalog must reflect the four implemented filesystem tools. Planned write, delete, Git, Terminal, and PowerShell tools remain unavailable until their implementation and security acceptance tests pass.

## 10. Audit architecture

The current Core writes audit messages to stderr. This preserves MCP stdout but is not sufficient for the production Activity & Audit screen.

The production audit design must define:

- a versioned structured event schema;
- per-process/session correlation IDs;
- timestamp, operation, module, workspace identifier, authorization decision, outcome, and safe reason;
- path redaction and control-character sanitization;
- no file contents, credentials, tokens, private keys, or environment secrets;
- bounded storage, retention, and rotation;
- safe behavior when the audit destination is unavailable;
- concurrent writes from multiple stdio Core processes.

The audit screen must show only records actually persisted by Core. Demo records must be removed from production mode.

## 11. Delivery sequence

1. Add shared policy and IPC contracts with tests.
2. Implement policy store, migration, revisioning, validation, backup, and atomic persistence.
3. Implement Electron shell and hardened preload bridge.
4. Integrate the approved seven-screen React UI.
5. Connect Workspaces and Permissions to real policy data.
6. Implement Core policy snapshot reload and revocation semantics.
7. Connect Tools to the Core registry.
8. Implement persistent structured audit and connect Activity & Audit.
9. Implement status, diagnostics, and client configuration generation.
10. Connect Settings to validated persisted configuration.
11. Run Windows integration/security tests, then package and sign when possible.

## 12. Definition of done for the first desktop foundation

- Electron starts a local window with the approved React UI.
- Renderer has no direct Node.js or arbitrary filesystem access.
- A native directory picker returns a candidate path through a narrow API.
- Main process validates IPC inputs and rejects malformed payloads.
- Core remains independently runnable over stdio.
- No fake state is represented as real Core status.
- A Windows CI job builds the desktop shell and runs its contract tests.
- Security boundaries and known limitations are documented.
