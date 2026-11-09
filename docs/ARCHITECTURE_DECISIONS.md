# Local-Workspace-MCP — Architecture Decision Records

This file records decisions that materially affect product structure and integration. Proposed decisions remain open until explicitly accepted or implemented.

## ADR-001 — Independent product and independent MCP Core

- **Status:** Accepted
- **Decision:** Local-Workspace-MCP is a standalone Windows desktop product with its own UI and a separately executable MCP Core.
- **Context:** The product must remain useful without ParsSynapse Chat or another specific MCP client.
- **Consequences:** Desktop UI manages the product; MCP Core owns actual resource authorization. External clients can launch Core directly.

## ADR-002 — Desktop UI technology

- **Status:** Proposed; validate during prototype
- **Decision:** Use React + TypeScript for the UI. Electron with a Node.js main process is the leading desktop runtime candidate.
- **Context:** Existing Core is Node.js/TypeScript; code reuse and a single primary runtime reduce integration complexity.
- **Security requirements:** context isolation enabled, renderer Node integration disabled, narrow preload bridge, validated IPC, restrictive content security policy, no arbitrary renderer-to-main method invocation.
- **Open validation:** installer size, process lifecycle, Windows integration, accessibility, and maintainability.

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

- **Status:** Accepted as design direction
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
