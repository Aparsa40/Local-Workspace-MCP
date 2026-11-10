# Local-Workspace-MCP — Architecture Decision Records

This file records decisions that materially affect product structure and integration. Proposed decisions remain open until explicitly accepted or implemented.

## ADR-001 — Independent product and independent MCP Core

- **Status:** Accepted
- **Decision:** Local-Workspace-MCP is a standalone Windows desktop product with its own UI and a separately executable MCP Core.
- **Context:** The product must remain useful without ParsSynapse Chat or another specific MCP client.
- **Consequences:** Desktop UI manages the product; MCP Core owns actual resource authorization. External clients can launch Core directly.

## ADR-002 — Desktop UI and runtime technology

- **Status:** Accepted
- **Decision:** Use Electron for the Windows desktop shell and main process, with React + TypeScript + Vite for the renderer.
- **Context:** The existing MCP Core is Node.js/TypeScript. Electron lets the desktop main process reuse the Node.js ecosystem for process management, Windows filesystem operations, configuration management, and validation without adding a second native runtime.
- **Consequences:** The renderer must run with context isolation, Node integration disabled, a narrow preload bridge, strict IPC validation, and a restrictive content security policy. Electron's runtime footprint is accepted for the first implementation and must be measured before release.
- **Validation still required:** installer size, Windows process lifecycle, accessibility, maintainability, and dependency/security maintenance.

## ADR-003 — MCP stdio as the initial transport

- **Status:** Accepted for initial release
- **Decision:** Start with MCP stdio and no network listener.
- **Context:** It is local-first and lets compatible MCP clients launch the server as a child process.
- **Consequences:** Each stdio client generally owns a separate Core process. The Desktop App must not imply that one stdio process is a shared server for all clients. The app can provide executable/configuration details and observe only processes it manages or can reliably inspect.
- **Future:** Streamable HTTP requires a separate security and deployment decision.

## ADR-004 — Core policy is authoritative

- **Status:** Accepted
- **Decision:** The MCP Core enforces the final authorization decision for every tool call. Desktop UI and client/model policies may only add restrictions.
- **Context:** UI-only or client-only authorization can be bypassed by another MCP client.
- **Consequences:** No UI toggle can grant a capability unsupported or denied by Core policy.

## ADR-005 — Separate management plane from MCP protocol plane

- **Status:** Accepted
- **Decision:** Desktop management operations (policy editing, application settings, diagnostics, process lifecycle) use a restricted desktop IPC/control boundary. MCP tool calls remain on the MCP protocol channel.
- **Context:** Management actions and tool invocations have different contracts and security requirements.
- **Consequences:** Do not add an unauthenticated HTTP management API to the MCP Core. Policy writes must be validated, atomic, recoverable, and applied through a defined reload/restart strategy.

## ADR-006 — Module-level capability isolation

- **Status:** Accepted
- **Decision:** Filesystem, Git, Terminal, PowerShell, and Developer Tools are separate modules with explicit capability declarations.
- **Context:** Filesystem permission must not imply command execution or repository mutation.
- **Consequences:** Each module defines its own tools, permissions, validation, limits, audit events, and tests.

## ADR-007 — Product blueprint precedes implementation

- **Status:** Accepted
- **Decision:** A Product Blueprint and supporting design/architecture/roadmap documents are required before substantial implementation begins on a new project or major product direction.
- **Context:** Starting from an incomplete backend skeleton causes rework when the intended UI and product behavior become clear later.
- **Consequences:** Product scope and user flows are agreed first; technical contracts are derived from them; implementation proceeds in testable phases. Changes are recorded in the project documents.

## ADR-008 — Policy changes must have explicit active-session semantics

- **Status:** Accepted
- **Decision:** A policy edit is not considered effective for active Core processes merely because the policy file was replaced. Core must validate and atomically adopt a new policy snapshot, or the UI must clearly state that existing sessions retain the previous revision until restart.
- **Context:** The current Core loads policy once at startup, while stdio clients launch independent processes. A file-only update could otherwise leave revoked permissions active in existing processes.
- **Consequences:** Implement and test a safe Core policy reload mechanism before claiming immediate revocation. Invalid updates must not partially replace the active policy; the effective revision must be observable.


## ADR-009 — Dedicated inherited pipes for app-managed Core control

- **Status:** Accepted for the Core-side protocol; Electron process integration remains pending
- **Decision:** App-managed Core children may receive a versioned, bounded newline-delimited management protocol over dedicated inherited OS pipes (child file descriptors 3 and 4). MCP protocol traffic remains exclusively on stdin/stdout.
- **Context:** A desktop process needs a trusted way to request policy reload in a Core process it launched, without adding a network listener or mixing management messages with MCP JSON-RPC.
- **Consequences:** The Core protocol accepts strict policy.getRevision and policy.reload requests with a UUID request ID, expected SHA-256 revision, and complete validated config. Core validates again and atomically publishes a new immutable snapshot. Frames are size-limited; responses contain stable error codes and no raw stack traces. The Electron main process must own the pipe handles and must never expose them to the renderer or MCP tools. Client-owned Core processes launched directly by external MCP clients do not receive or require this channel.
- **Limitations:** The protocol handler is implemented and tested, and src/index.ts activates it only when explicitly requested and both inherited descriptors are verified as pipes. The Electron main process does not yet create these pipes or manage Core children. No immediate revocation claim is valid until end-to-end desktop integration and Windows lifecycle tests are complete.
