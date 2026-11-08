# Local-Workspace-MCP

A local, policy-controlled MCP server that gives AI assistants and agents explicitly authorized access to selected files and developer resources on a Windows workstation.

> **Project status:** Documentation and architecture baseline. The filesystem implementation is not yet complete. Tool names and capabilities described as planned are design targets, not claims of currently available functionality.

## Goals

- Expose selected local workspace capabilities through the Model Context Protocol (MCP).
- Start with filesystem operations over a local `stdio` connection.
- Enforce access through explicit, per-root permissions and a centralized policy engine.
- Keep filesystem, security, audit, and transport concerns separate.
- Make future Git, terminal, PowerShell, and developer-tool integrations possible without granting them implicit access.
- Run with the minimum privileges required; administrator access is not a design requirement.

## Non-goals

- Providing unrestricted access to the host computer.
- Exposing a network listener by default.
- Acting as a general-purpose remote administration service.
- Treating an MCP client, model, or agent as trusted merely because it is connected.

## Planned capabilities

The initial filesystem tool set is expected to include:

| Tool | Intended purpose |
|---|---|
| `list_files` | List entries within an authorized directory |
| `read_file` | Read an authorized file |
| `search_files` | Search authorized workspace content |
| `write_file` | Create or update an authorized file |
| `create_directory` | Create a directory within an authorized root |
| `move_file` | Move or rename an authorized filesystem entry |
| `delete_file` | Delete an authorized entry, subject to explicit safeguards |
| `get_file_info` | Return metadata for an authorized entry |
| `get_workspace_tree` | Return a bounded directory tree |

These tools must not be considered available until implemented, tested, and documented in the release notes.

## Architecture at a glance

The intended request path is:

1. An MCP client connects to the local server.
2. The server validates the request and resolves the requested operation.
3. The permission engine evaluates the operation against configured roots and policy.
4. Path validation checks canonical paths and relevant Windows filesystem edge cases.
5. The filesystem service performs the operation only after authorization.
6. Security-relevant outcomes are recorded by the audit subsystem.

See [architecture.md](architecture.md) for the detailed design and security boundaries.

## Planned technology

- **Runtime:** Node.js
- **Language:** TypeScript
- **Protocol:** Model Context Protocol
- **Initial transport:** `stdio`
- **Target platform:** Windows, with platform-specific behavior isolated where practical
- **Tests:** Automated unit and security-focused tests

Exact package versions and commands will be added when the implementation baseline is selected.

## Security model

Access is denied unless a configured policy explicitly allows the requested operation. Permissions are scoped to configured filesystem roots and individual operations. Future modules such as Git and PowerShell must have separate capabilities and policies.

Sensitive files (for example, credentials, private keys, and environment files) should be denied by default or protected by explicit policy. Destructive operations require additional safeguards. The server should not run elevated.

Read [SECURITY.md](SECURITY.md) before deploying or reporting a vulnerability.

## Project status and roadmap

1. Establish documentation, repository conventions, and architecture.
2. Implement configuration loading and schema validation.
3. Implement path canonicalization and the permission engine.
4. Implement read-only filesystem tools.
5. Add write operations with safeguards and audit logging.
6. Add security tests and client integration guidance.
7. Evaluate optional transports and independently permissioned developer modules.

The roadmap is directional and may change as implementation and testing reveal additional requirements.

## Configuration

A sample policy will be provided under `config/` when the configuration schema is implemented. Do not assume that an example policy is enforced until the running server has loaded and validated it.

A future configuration may resemble the following conceptual example:

```json
{
  "roots": [
    {
      "path": "F:\\All-Projects-v3",
      "permissions": ["list", "read"]
    },
    {
      "path": "F:\\All-Projects-v3\\ParsSynapse-Chat",
      "permissions": ["list", "read", "write", "create", "rename"]
    }
  ]
}
```

This is illustrative only. The final schema, precedence rules for nested roots, and supported permission names must be defined and tested before use.

## Development

Contribution expectations are described in [CONTRIBUTING.md](CONTRIBUTING.md). The implementation's actual install, build, lint, and test commands will be documented here once `package.json` and the corresponding scripts exist.

## Versioning

The project intends to follow Semantic Versioning. See [VERSIONING.md](VERSIONING.md).

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
