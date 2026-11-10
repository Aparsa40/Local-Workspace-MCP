# Desktop Electron Threat Model

## Scope and security objectives

This threat model covers the initial Windows desktop application: the Electron renderer, preload bridge, Electron main process, versioned policy persistence, managed MCP Core child process, and the local stdio/control-pipe boundary.

Primary objectives:

1. A renderer compromise must not provide direct filesystem, process, or Node.js access.
2. Only explicit, schema-valid policy changes may be persisted.
3. The managed Core must enforce the saved policy revision before the UI reports it as active.
4. MCP protocol traffic and desktop policy-control traffic must remain separate.
5. A failure must not silently widen access or fall back to stale permissions.

## Assets

- User workspace files and directory metadata.
- Versioned policy document and its recovery backup.
- Canonical workspace paths and capability grants.
- Core child-process integrity and inherited control-pipe messages.
- Local client configuration containing executable and policy paths.
- Sanitized operational/audit metadata.

## Trust boundaries

| Boundary | Trust assumption | Enforcement |
|---|---|---|
| Renderer → preload | Renderer content may be compromised | contextIsolation, sandbox, nodeIntegration disabled, CSP, no remote content |
| Preload → main IPC | Only named, narrow operations are exposed | contextBridge, allowlisted channel constants, strict Zod schemas |
| IPC caller → main handler | Subframes and other WebContents are untrusted | Validate both event.sender and event.senderFrame against the active main frame |
| UI → filesystem | Renderer never chooses arbitrary paths for direct I/O | Native directory picker runs in main; PolicyStore canonicalizes and validates the selected root |
| Main → Core child | Process arguments and environment are security-sensitive | Fixed executable/entry point, no shell, bounded control protocol, dedicated inherited pipes |
| MCP client → Core | Client/model restrictions are not authoritative | Core-side capability policy is the final authorization boundary |

## Threat scenarios and current controls

### Renderer compromise or malicious IPC invocation

**Threat:** XSS, compromised UI dependencies, or a malicious subframe attempts to read arbitrary files, execute commands, or invoke hidden main-process methods.

**Controls:** local bundled renderer assets, restrictive CSP, denied navigation and new windows, sandboxed BrowserWindow, no Node integration, named preload methods, main-frame sender validation, strict per-channel schemas. There is no generic IPC forwarding method, arbitrary filesystem method, shell API, or management HTTP listener.

**Residual risk:** a future renderer dependency or unsafe HTML feature could introduce an injection path. Keep dependencies audited, avoid unsanitized HTML, and re-review every new preload method.

### Malicious or invalid workspace path

**Threat:** a selected path is replaced, duplicated, points to a file rather than a directory, or resolves through a symlink/reparse point outside the intended boundary.

**Controls:** folder selection is performed by the native dialog; PolicyStore requires absolute existing directories, canonicalizes with realpath, verifies directory type, rejects duplicate canonical roots, and Core performs its own path authorization and filesystem checks.

**Residual risk:** Windows reparse-point and TOCTOU behavior needs a dedicated security test matrix. Canonicalization at save time does not eliminate all races between authorization and later filesystem access.

### Oversized or malformed policy payload

**Threat:** a compromised renderer submits unknown fields, unsupported capabilities, excessive roots, duplicate capabilities, or unreasonable paths.

**Controls:** the IPC boundary validates the complete versioned policy schema; roots are capped at 128, path strings at 32,767 characters, and capability lists at the four supported unique capabilities. PolicyStore validates again before persistence.

**Residual risk:** structured-clone payload size is not independently capped before Electron delivers the IPC message. Keep policy bounds conservative and consider an explicit serialized-size ceiling if policy complexity grows.

### Policy tampering, stale writes, or failed reload

**Threat:** another process changes the policy while the UI edits it, the active policy becomes malformed, or the Core continues running with a stale revision after a failed reload.

**Controls:** strict versioned schema, SHA-256 revisions, stale-revision rejection, temporary same-directory writes, backup recovery only when the active file itself is missing, immutable Core policy snapshots, revision-checked reload, and stop-on-reload-failure behavior. Empty roots are valid and default-deny.

**Residual risk:** PolicyStore serializes saves within one instance but does not yet provide a cross-process lock. Windows ACL behavior, filesystem replacement guarantees, and power-loss durability need further verification. A local process running as the same user can potentially modify the policy file.

### Child-process or control-channel confusion

**Threat:** shell metacharacters alter the launched command, MCP JSON-RPC data is confused with management messages, or malformed control frames exhaust resources.

**Controls:** child launch does not use a shell; arguments are fixed by the main process; MCP remains on stdin/stdout; management messages use separate inherited pipes with bounded JSONL framing, schema validation, request IDs, timeouts, and serialized operations.

**Residual risk:** packaged executable/resource path correctness and behavior on supported Windows versions require release smoke tests.

## Explicit non-goals for the first release

- No unauthenticated HTTP management endpoint.
- No renderer-provided shell, PowerShell, terminal, Git, or arbitrary process execution.
- No shared multi-client daemon.
- No claim that the Desktop App can observe external client-owned stdio processes.
- No write, move, rename, or delete capability until the Core implementations and Windows security tests are complete.

## M1 verification gates

- Windows CI builds the Core, Electron main process, and bundled renderer.
- Windows CI launches Electron in smoke mode and verifies the React renderer, preload bridge, and main-process status/policy IPC.
- Unit tests reject untrusted IPC senders, malformed payloads, oversized policy structures, and unsupported grants.
- Manual Windows verification still checks native folder selection, policy persistence and reload, Core failure handling, and clean shutdown.
- Complete the Windows path/reparse-point threat review before enabling any mutating filesystem capability.
