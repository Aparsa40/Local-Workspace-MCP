# Security Policy

## Scope

Local-Workspace-MCP is intended to expose explicitly authorized local workspace operations to MCP clients. Security issues may affect the server, policy evaluation, filesystem boundary enforcement, transports, configuration handling, or future developer-tool modules.

The project is under active development. Features described in the documentation may not yet be implemented. Do not use an incomplete development build to expose sensitive workspaces or untrusted clients.

## Supported versions

Until the first release is published, only the current development branch is expected to receive security fixes. Once releases exist, this section will list supported versions.

## Reporting a vulnerability

Please do **not** report exploitable vulnerabilities in a public issue.

Use GitHub's **Report a vulnerability** workflow on the repository if private vulnerability reporting is enabled. If it is unavailable, contact the repository maintainers privately through a channel listed in the repository profile. Do not include secrets, access tokens, private keys, or personal data in a report.

A useful report includes:
- A concise description and potential impact.
- Affected commit, version, operating system, and configuration.
- Reproduction steps or a minimal proof of concept.
- Any suggested mitigation, if known.

Please allow maintainers reasonable time to investigate and coordinate a fix before public disclosure.

## Security design requirements

The following are design requirements, not a claim that every control is already implemented:

- **Default deny:** an operation is rejected unless policy explicitly allows it.
- **Least privilege:** run as a standard user and grant only the minimum required operations.
- **Root confinement:** filesystem operations remain inside authorized roots after canonicalization.
- **Path traversal defense:** reject traversal and verify the resolved target, not only the input string.
- **Windows reparse points:** account for symbolic links, junctions, and other reparse points to prevent escaping an authorized root.
- **Nested-root policy:** define and test deterministic precedence for overlapping roots; ambiguous authorization must fail closed.
- **Sensitive data:** protect credentials, private keys, environment files, and other configured sensitive paths.
- **Safe writes:** avoid unsafe partial writes; validate parent and target paths and handle overwrite behavior explicitly.
- **Destructive operations:** deletion and other irreversible actions require narrowly scoped permissions and additional safeguards.
- **Auditability:** record security-relevant operations without logging file contents, credentials, or other secrets.
- **Transport security:** keep `stdio` as the initial local transport. Any future network transport requires authentication, authorization, and network exposure restrictions.
- **Module isolation:** future Git, shell, PowerShell, and developer-tool capabilities must use separate policies and must not inherit filesystem permissions automatically.

## Desktop application threat model

The Electron renderer, preload bridge, main-process IPC, policy persistence, and managed Core process boundaries are documented in [docs/THREAT_MODEL_DESKTOP.md](docs/THREAT_MODEL_DESKTOP.md). The threat model records implemented controls separately from residual risks and required Windows verification.

## Deployment guidance

- Do not run the server as Administrator.
- Do not expose a network listener to the public internet.
- Do not place secrets in sample configuration files or commit them to source control.
- Review every configured root and permission before connecting an AI client.
- Treat prompts, model output, tool arguments, and workspace files as untrusted input.
- Keep dependencies and the runtime updated.
