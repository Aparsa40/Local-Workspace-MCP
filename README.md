# Local-Workspace-MCP

A local, policy-controlled MCP server that gives AI assistants and agents explicitly authorized access to selected files and developer resources on a Windows workstation.

> **Status:** Early foundation implementation. The initial server exposes read-only filesystem tools. Write, delete, Git, terminal, and PowerShell capabilities are not enabled yet.

## Features in this foundation

- MCP over local **stdio**; no network listener.
- Explicit workspace roots and capability-based authorization.
- Read-only tools: `list_files`, `read_file`, `get_file_info`, and `search_files`.
- Canonical path validation and symlink/reparse-point escape checks.
- Bounded file size, search depth, and result count.
- Audit events written to stderr so stdout remains reserved for MCP JSON-RPC.
- CI checks for type safety, lint, tests, build, dependency audit, and CodeQL.

## Requirements

- Node.js 22 or later
- npm 10 or later

## Local setup

```powershell
npm install
Copy-Item config/permissions.example.json config/permissions.json
```

Edit `config/permissions.json` and replace the sample root with a real, existing absolute directory. Grant only the capabilities you need. The initial implementation supports `list`, `read`, `search`, and `metadata`.

Start the server:

```powershell
npm run dev
```

The process waits for an MCP client over stdin/stdout. Do not type ordinary commands into the server terminal while it is running.

For a non-default configuration path:

```powershell
$env:LWMCP_CONFIG = "F:\\AI-Config\\local-workspace-mcp.json"
npm run dev
```

## MCP tools

| Tool | Description |
|---|---|
| `list_files` | List direct entries in an authorized directory |
| `read_file` | Read a bounded UTF-8 text file |
| `get_file_info` | Read limited file/directory metadata |
| `search_files` | Search file names with bounded traversal |

Tool paths must be relative to a configured root. Absolute paths and traversal segments are rejected. The most specific matching configured root controls permissions for nested roots.

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm audit --audit-level=high
```

CI runs typecheck, lint, tests, build, and dependency audit. Dependency Review runs on pull requests; CodeQL runs on pushes, pull requests, and a weekly schedule.

## Security notes

- Run as the current user; do not use Administrator.
- Keep `config/permissions.json` private; it is ignored by Git.
- Do not configure broad roots such as an entire drive or user profile.
- Do not expose the server through a network transport.
- This initial implementation is read-only. Future write-capable modules require separate capabilities, tests, and review.

See [SECURITY.md](SECURITY.md) and [architecture.md](architecture.md).

## License

MIT. See [LICENSE](LICENSE).
