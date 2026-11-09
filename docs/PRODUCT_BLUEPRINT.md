# Local-Workspace-MCP — Product Blueprint

> **Document status:** Agreed product direction / implementation baseline  
> **Product:** Local-Workspace-MCP  
> **Repository:** `Aparsa40/Local-Workspace-MCP`  
> **Default platform:** Windows desktop  
> **Initial protocol transport:** MCP over stdio  
> **Last updated:** 2026-11-10

## 1. Product vision

Local-Workspace-MCP is an independent Windows desktop application and local MCP server that provides AI assistants and other compatible MCP clients with controlled, auditable access to explicitly authorized local workspaces and selected developer resources.

It is a standalone product. It must be installable, configurable, and useful without ParsSynapse Chat, Continue, or any other particular AI application. ParsSynapse Chat is one first-party consumer of the server, not its owner or runtime dependency.

The product consists of two independently useful parts:

1. **Desktop Management App:** a graphical application for configuring workspaces, permissions, tools, server settings, diagnostics, and client setup.
2. **MCP Core:** a separately executable policy-enforcing server that exposes authorized capabilities through the MCP protocol.

The desktop application must not be required for an MCP client to launch and use the Core. Conversely, the desktop application must be able to manage and diagnose the Core without depending on ParsSynapse Chat.

## 2. Product goals

- Provide a safe, understandable GUI for managing local AI access to Windows files.
- Let users define multiple workspace roots and grant capabilities per root.
- Enforce authorization inside the MCP Core, not only in the UI or client.
- Make the Core usable by ParsSynapse Chat and other compatible MCP clients.
- Keep filesystem, Git, terminal, PowerShell, and developer-tool capabilities modular and separately permissioned.
- Make operations observable through useful diagnostics and audit records.
- Start local-first and least-privilege; do not require Administrator privileges.
- Preserve a clear product plan so implementation does not drift from the agreed outcome.

## 3. Non-goals and boundaries

- The product is not an unrestricted remote-control agent.
- The UI is not a security boundary; every operation must be authorized by the Core.
- ParsSynapse-specific model selection and per-model tool assignment do not belong in this product. Those are client-side policies in ParsSynapse Chat.
- The initial release does not expose an unauthenticated network listener.
- The initial release does not execute arbitrary shell or PowerShell commands.
- The product does not silently grant access to an entire drive, user profile, or machine.
- A successful UI confirmation does not replace server-side capability checks.

## 4. Product architecture at a glance

```text
Local-Workspace-MCP Desktop App
  React + TypeScript UI
       |
       | restricted, validated desktop IPC
       v
  Desktop Runtime / Main Process
  - application lifecycle
  - policy/configuration management
  - MCP process launch and diagnostics
  - client configuration export
       |
       +---- manages configuration and process instances
       |
       v
Local-Workspace-MCP Core (independent executable)
  - MCP protocol and tool registration
  - workspace policy and permission engine
  - path validation and filesystem services
  - module registry
  - audit and diagnostics
       |
       v
Windows filesystem and separately authorized resources


External MCP clients (including ParsSynapse Chat)
       |
       | MCP stdio: client launches its own Core process
       v
Local-Workspace-MCP Core
```

The Desktop App and external MCP clients are peers of the Core, not layers through which all requests must pass. External clients must be able to launch the Core directly using documented command, arguments, and configuration.

## 5. Navigation and screens

The agreed primary navigation is:

1. Dashboard
2. Workspaces
3. Permissions
4. Tools
5. Activity & Audit
6. Connections
7. Settings

### 5.1 Dashboard

Purpose: give the user an accurate operational overview.

Must show:
- Core readiness and configuration validation state.
- Active MCP process sessions that the Desktop App can actually observe.
- Number of configured workspaces and enabled tools.
- Recent security events and errors.
- Current configuration location and Core version.
- Quick actions: add workspace, review permissions, open client setup, run diagnostics.

Do not display a misleading global "Running" state for stdio when no client process is active. Distinguish **Ready**, **Active session**, **Idle**, **Configuration error**, and **Unavailable**.

### 5.2 Workspaces

Purpose: manage the filesystem roots that may be exposed to MCP clients.

Must support:
- Add an existing directory using a native directory picker.
- Edit a workspace display name and path.
- View canonical path and validation status.
- Enable/disable a workspace without deleting its configuration.
- Remove a workspace after a clear confirmation.
- Detect duplicate and overlapping roots.
- Explain nested-root precedence in plain language.
- Show a summary of the capabilities currently granted to each workspace.

A workspace path is not authorized merely because it appears in the UI. The Core must validate and canonicalize it before accepting the policy.

### 5.3 Permissions

Purpose: configure capabilities per workspace.

Initial capability vocabulary:
- `list`
- `read`
- `search`
- `metadata`

Planned mutation capabilities, disabled until their implementation and security tests are accepted:
- `write`
- `create`
- `rename`
- `move`
- `delete`

Requirements:
- Show permissions per workspace in a clear matrix.
- Explain the effect of each permission.
- Show inherited/overridden/denied states only if the policy engine truly implements those semantics.
- Display warnings for broad or risky grants.
- Require an explicit review step before enabling destructive capabilities.
- Validate proposed policy in the Backend/Core before saving.
- Save policy atomically and preserve a recoverable previous version.
- Show whether a Core restart or client reconnection is required.

The most-specific-root behavior currently documented by the Core is **no implicit permission inheritance**: the most specific matching root controls the decision, and missing capabilities are denied. Any change to this rule requires a documented migration and tests.

### 5.4 Tools

Purpose: manage which MCP tools the Core registers and makes available.

Must show:
- Tool name and description.
- Module that owns the tool.
- Required capability/capabilities.
- Availability state: available, disabled, unavailable, or blocked by policy.
- Whether the tool is read-only or mutating.
- Security notes and confirmation requirements.

The UI may enable only tools that are implemented and supported by the Core. A UI toggle must never create a capability the Core does not implement.

### 5.5 Activity & Audit

Purpose: explain what happened and why.

Must show:
- Timestamp.
- Operation/tool and module.
- Workspace/resource identifier, redacted where appropriate.
- Allow/deny decision and success/failure outcome.
- Reason or safe error summary.
- Process/session correlation identifier when available.

Must not show or store file contents, passwords, API keys, tokens, private keys, or other secret material. Include filters, pagination, export of sanitized records, and retention/rotation settings when implemented.

### 5.6 Connections

Purpose: help users connect external MCP clients.

Must support:
- Show the Core executable path and configuration path.
- Provide copyable MCP client configuration for stdio.
- Explain that a stdio-capable client launches its own Core process.
- Provide setup guides for ParsSynapse Chat and generic MCP clients.
- Show sessions only when the Desktop App can actually observe them.
- Offer a local connection/diagnostic test.
- Explain that hosted clients which cannot launch a local stdio process need a separately designed transport; they are not supported by stdio alone.

Do not imply that all external MCP clients are automatically discoverable. A stdio server normally runs as a child process owned by the client.

### 5.7 Settings

Purpose: configure application and Core behavior.

Planned groups:
- General: language, theme, startup behavior.
- Core: executable/runtime path, configuration path, version.
- Limits: file size, list size, search depth, result count.
- Security: sensitive path rules, confirmation policy, default-deny behavior.
- Audit: log location, retention and rotation.
- Diagnostics: log level, validation, health checks.
- Updates: installed version and update channel.

Any setting affecting authorization must be validated by the Core and recorded as a policy/configuration change.

## 6. Core capability modules

### Filesystem (first module)
- list directory entries
- read bounded UTF-8 text files
- search file names with bounded traversal
- read limited metadata
- later: write, create directory, move/rename, delete, workspace tree

### Future modules
- Git: repository-scoped status, diff, history and selected operations.
- Terminal: narrowly allowlisted commands with working-directory, timeout and output restrictions.
- PowerShell: constrained commands or reviewed scripts; no unrestricted arbitrary script execution by default.
- Developer Tools: selected project diagnostics and workflows.

Each module must declare its tools, required capabilities, validation rules, limits, audit events, and tests. Enabling a module must not implicitly grant permissions to another module.

## 7. Client and model access policy

There are two distinct policy layers:

1. **Core policy (authoritative):** determines which resources and operations the local server permits, regardless of client or model.
2. **Client/model policy (optional additional restriction):** determines which already-available tools a particular client, agent, or model may invoke.

ParsSynapse Chat may provide a per-model tool matrix for Gemini, Ollama, OpenRouter, and other providers. This is an additional restriction, never an override of Core policy. The Core must not trust a client-provided model identity as proof of authorization.

## 8. Security and safety requirements

- Default deny and least privilege.
- Run as the current standard user; no Administrator requirement.
- Canonical path validation and path-segment-aware root confinement.
- Defenses for Windows symbolic links, junctions, reparse points, UNC paths, device namespaces, alternate data streams, and reserved names as appropriate.
- Explicit policy checks for both source and destination of move/rename operations.
- Sensitive-path protection.
- Bounded file sizes, traversal, results, execution time, and output.
- Safe write strategy and clear overwrite semantics.
- Additional safeguards for destructive operations.
- Audit without secret/content logging.
- Fail closed on malformed or ambiguous policy.
- Tests on Windows using disposable temporary directories.
- No unauthenticated network management endpoint.

A UI confirmation dialog is a usability safeguard, not an authorization mechanism. The Core must enforce permission independently.

## 9. Transport strategy

### Initial transport: stdio
- Local process launched by an MCP client.
- No network listener.
- External clients can use the Core without opening the Desktop App.
- Each client-managed stdio session generally owns its own Core process.

### Future transport: Streamable HTTP (separate milestone)
Consider only when there is a concrete requirement for clients that cannot launch a local process or for a shared long-running local service. It requires explicit authentication, authorization, loopback/network binding rules, origin controls, request limits, lifecycle design, and security review. VPN/private network access is not a substitute for application authentication.

## 10. Desktop technology direction

Agreed UI direction:
- React + TypeScript for the renderer.
- A desktop runtime with a Node.js main process and restricted IPC.
- Electron is the leading implementation candidate because the existing Core is Node.js/TypeScript and can be reused without introducing a second native runtime.

The Electron choice must be validated during the UI/technical prototype. Renderer must not receive unrestricted Node.js access. Use context isolation, disabled renderer node integration, a narrow preload bridge, validated IPC contracts, and a restrictive content security policy.

## 11. Product acceptance criteria

The product is not considered a usable standalone release until:

- A user can install and open the Desktop App on a supported Windows environment.
- A user can configure and validate one or more workspace roots.
- The app can display and edit actual Core policy, not mock state.
- The Core enforces the policy independently of the UI.
- A compatible external MCP client can launch the Core through stdio without the Desktop App running.
- The app can generate correct client configuration.
- Read-only filesystem tools work within configured roots and fail closed outside them.
- Audit records are useful and do not contain file contents or secrets.
- Security and integration tests pass on Windows.
- Documentation explains installation, configuration, permissions, client setup, limitations, and recovery.

## 12. Scope discipline

This blueprint describes the intended product, not the current implementation. Every feature must be tracked as **implemented**, **in progress**, **planned**, or **deferred** in the roadmap. Documentation must not describe planned behavior as shipped functionality.

Changes to this blueprint require an explicit product decision and a corresponding update to the roadmap and architecture records.
