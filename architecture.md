# Architecture

## 1. Purpose

Local-Workspace-MCP is a local capability gateway between MCP clients and explicitly authorized workstation resources. Its first responsibility is controlled filesystem access. Future integrations may include Git, terminal, PowerShell, and selected developer tools, but each must remain an independently authorized module.

The server is not intended to be an unrestricted remote-control agent.

## 2. Design principles

- **Default deny:** no capability is available without an explicit grant.
- **Least privilege:** grant access per root, operation, and module.
- **Separation of concerns:** protocol handling, policy, path validation, filesystem operations, and auditing are separate components.
- **Fail closed:** invalid configuration, ambiguous policy, or failed security checks reject the operation.
- **Local first:** begin with a local `stdio` process and avoid network exposure.
- **Auditable behavior:** record security-relevant metadata without recording sensitive contents.
- **Testable boundaries:** security rules must be covered by automated tests, including adversarial path cases.

## 3. Logical components

```text
MCP Client
    |
    | stdio (initial transport)
    v
MCP Server / Tool Router
    |
    +--> Input validation
    |
    +--> Permission Engine <---- Policy Configuration
    |          |
    |          +--> Capability decision
    |
    +--> Path Validator
    |
    +--> Filesystem Services
    |          |
    |          +--> Reader
    |          +--> Writer
    |          +--> Directory Manager
    |          +--> Search / Metadata
    |
    +--> Audit Logger
```

The diagram is logical; implementation boundaries may be refined while preserving the security responsibilities.

## 4. Suggested source layout

```text
Local-Workspace-MCP/
├── src/
│   ├── server/
│   │   ├── mcp-server.ts
│   │   └── tool-router.ts
│   ├── modules/
│   │   └── filesystem/
│   │       ├── filesystem.module.ts
│   │       ├── file-reader.ts
│   │       ├── file-writer.ts
│   │       ├── directory-manager.ts
│   │       ├── search-service.ts
│   │       └── metadata-service.ts
│   ├── security/
│   │   ├── permission-engine.ts
│   │   ├── access-policy.ts
│   │   ├── path-validator.ts
│   │   └── sensitive-paths.ts
│   ├── audit/
│   │   └── audit-logger.ts
│   ├── config/
│   │   ├── config-loader.ts
│   │   └── config-schema.ts
│   └── shared/
│       ├── errors/
│       └── types/
├── config/
│   └── permissions.example.json
├── tests/
│   ├── unit/
│   ├── integration/
│   └── security/
├── logs/
├── README.md
├── SECURITY.md
├── CONTRIBUTING.md
├── VERSIONING.md
├── CHANGELOG.md
├── architecture.md
├── LICENSE
├── package.json
└── tsconfig.json
```

This is a proposed layout, not a statement that these files or modules already exist.

## 5. Request lifecycle

For every tool invocation:

1. Parse and validate the tool input against a strict schema.
2. Resolve the requested module and capability.
3. Resolve the configured policy for the requested resource.
4. Canonicalize the path and verify that it remains within an authorized root.
5. Check filesystem link and reparse-point behavior to prevent boundary escapes.
6. Authorize the exact operation (for example, `read`, `write`, `create`, `rename`, or `delete`).
7. Execute the operation using the least-privileged process identity.
8. Record the outcome and relevant metadata in the audit log.
9. Return a bounded result that does not expose secrets or unnecessary host details.

Authorization must happen before the protected operation. A UI confirmation is not a substitute for server-side authorization.

## 6. Filesystem policy

### 6.1 Roots and capabilities

A policy root maps a canonical filesystem location to a set of permitted operations. Suggested capability names include:

- `list`
- `read`
- `search`
- `write`
- `create`
- `rename`
- `move`
- `delete`
- `metadata`

The final schema should use a documented, validated set of names. Unknown permissions must not be silently accepted.

### 6.2 Nested roots

Overlapping roots require deterministic semantics. A recommended starting rule is:

- Match the most specific canonical root for the target path.
- A more-specific root may grant or restrict access only according to an explicitly documented override model.
- Explicit denies should not be bypassed by a broader allow.
- If resolution is ambiguous or cannot be proven safe, deny the request.

The exact policy must be implemented and covered by tests before nested roots are relied upon. Do not assume that the illustrative README configuration defines the final precedence rules.

### 6.3 Path safety

Windows paths require careful handling of drive letters, UNC paths, case normalization, separator variants, device paths, symbolic links, junctions, and reparse points. String-prefix checks alone are insufficient for proving that a target is inside an authorized root.

The path validator should:
- Normalize and canonicalize paths using platform-aware APIs.
- Compare path segments, not raw string prefixes.
- Reject traversal and unsupported device namespaces.
- Verify resolved targets and relevant parent directories.
- Define safe behavior for missing targets and paths created during a write.
- Avoid time-of-check/time-of-use gaps where practical, and document residual platform limitations.

## 7. Filesystem tools

The first module is expected to provide:

| Tool | Capability | Safeguards |
|---|---|---|
| `list_files` | `list` | Bound depth and result count |
| `read_file` | `read` | Bound file size; do not follow paths outside roots |
| `search_files` | `search` + `read` as needed | Bound traversal, file size, and result count |
| `write_file` | `write` or `create` | Validate target and parent; define overwrite behavior |
| `create_directory` | `create` | Validate every path segment |
| `move_file` | `move` / `rename` | Authorize both source and destination |
| `delete_file` | `delete` | Explicit safeguard; reject protected targets |
| `get_file_info` | `metadata` | Return only necessary metadata |
| `get_workspace_tree` | `list` | Bound depth, entries, and output size |

Tool schemas, capability mapping, and confirmation behavior must be explicit. A client-side confirmation prompt must never be the only protection for a destructive operation.

## 8. Future modules

Future integrations should implement a common module contract while keeping independent capabilities and policy namespaces.

| Module | Potential capabilities | Security boundary |
|---|---|---|
| Git | status, diff, log, branch operations, selected mutations | Repository allowlist; no implicit shell execution |
| Terminal | narrowly defined commands | Command allowlist, working-directory restrictions, timeout and output limits |
| PowerShell | predefined scripts or constrained commands | Separate policy; no unrestricted arbitrary script execution by default |
| Developer tools | selected diagnostics and project tasks | Per-tool permissions, validated arguments, bounded execution |

Adding a module must not automatically grant it access to filesystem roots or capabilities assigned to another module.

## 9. Transport and client integration

### Initial: stdio

- Launch as a local child process from an MCP client.
- Do not open a listening network port.
- Keep configuration and process ownership local to the user.

### Future: Streamable HTTP

A network transport is a separate security milestone. It requires authentication, authorization, TLS where appropriate, origin and network restrictions, request limits, and an explicit deployment model. Private networking (for example, a VPN) does not replace application-level authentication and authorization.

ParsSynapse Chat may later connect as an MCP client from its backend. Model providers should not receive direct filesystem access; tool requests should pass through the backend and this policy-enforcing gateway.

## 10. Audit and operational safety

Audit events should include operation, module, capability, normalized resource identifier where safe, decision, outcome, timestamp, and correlation identifier. Do not log file contents, tokens, passwords, or private key material.

Logs need bounded size, rotation or retention policy, and protection against untrusted content forging log entries. Errors returned to clients should avoid leaking sensitive absolute paths or host details.

## 11. Testing strategy

At minimum, tests should cover:

- Allow and deny decisions for every capability.
- Nested-root precedence and explicit deny behavior.
- Traversal attempts and alternate path representations.
- Symlinks, junctions, and reparse-point escapes on supported Windows configurations.
- UNC and device-path handling.
- Read/write/create/move/delete authorization, including both ends of a move.
- Sensitive-file protection.
- Malformed and missing configuration.
- Bounded output, recursion, and file sizes.
- Audit behavior and secret redaction.
- MCP protocol behavior and client lifecycle.

Security tests should run in a disposable temporary workspace and must not depend on or mutate a developer's real project files.

## 12. Architectural decision record

The initial baseline decisions are:

1. Build a standalone local MCP server in Node.js and TypeScript.
2. Start with `stdio`; do not expose a network service by default.
3. Centralize authorization in a permission engine.
4. Treat filesystem access as the first independently permissioned module.
5. Keep future Git, terminal, PowerShell, and developer integrations isolated behind their own capabilities and policies.
6. Run without administrator privileges.
7. Require tests for path confinement and policy precedence before enabling write or destructive tools.
