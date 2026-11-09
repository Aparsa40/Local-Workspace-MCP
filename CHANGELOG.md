# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project intends to follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Product Blueprint defining the standalone Windows desktop app and independent MCP Core.
- UI/UX specification for Dashboard, Workspaces, Permissions, Tools, Activity & Audit, Connections, and Settings.
- Implementation roadmap with repository baseline, phases, and acceptance gates.
- Architecture Decision Records for product independence, stdio, Core authorization, management-plane separation, and module isolation.
- README links to the product and technical planning documents.

### Existing foundation
- Initial Node.js and TypeScript project foundation.
- MCP stdio server using the official TypeScript server SDK.
- Read-only filesystem tools: `list_files`, `read_file`, `get_file_info`, and `search_files`.
- Explicit workspace-root configuration and capability-based permission evaluation.
- Canonical path checks, symlink/junction escape checks, sensitive-file deny rules, and bounded output.
- Security audit events written to stderr.
- Unit tests for path confinement and permission precedence.
- GitHub Actions checks for typecheck, lint, Linux and Windows tests, build, npm audit, CodeQL, and Dependency Review.
- Dependabot configuration for npm and GitHub Actions.

### Security
- Filesystem mutation tools, network transports, Git, terminal, and PowerShell are intentionally not enabled in this foundation.
- All filesystem tool paths must be relative to configured roots.

## [0.1.0] - Unreleased

Initial development milestone reserved for the first usable, pre-stable implementation. Do not treat this version as released until a corresponding release is published.
