# Local-Workspace-MCP — Implementation Roadmap

> **Purpose:** track delivery against the agreed product, not just isolated code tasks.  
> **Source of truth:** [Product Blueprint](PRODUCT_BLUEPRINT.md)

## Status legend

- **Done:** implemented and verified in the repository.
- **In progress:** actively being implemented.
- **Planned:** part of the agreed scope but not yet implemented.
- **Deferred:** intentionally postponed to a later milestone.

## Current baseline (repository inspection: 2026-11-10)

### Done / present in the current foundation
- Node.js 22+ and TypeScript project.
- MCP server over local stdio.
- Read-only tools: `list_files`, `read_file`, `get_file_info`, `search_files`.
- Workspace-root configuration.
- Capability-based permission engine.
- Most-specific configured root wins; permissions are not inherited.
- Path validation and Windows symlink/reparse-point checks are documented and partially implemented.
- Bounded file reads, listing, and search.
- Audit events written to stderr.
- Existing unit/security tests and GitHub Actions checks.
- Security, contribution, versioning, changelog, and initial architecture documents.

These are repository observations, not a claim that every security property has been exhaustively proven. A dedicated Windows security review remains required.

### Not yet present
- Desktop application and graphical management UI.
- Desktop runtime / process manager.
- Backend management API or secure IPC contract.
- Actual UI-driven policy editing and validation.
- Persistent structured audit viewer, retention, and rotation.
- Write/create/move/rename/delete tools.
- Workspace tree tool.
- Connections/client configuration screen.
- Git, Terminal, PowerShell, and Developer Tools modules.
- Installer and release/update workflow.
- Streamable HTTP transport.

## Phase 0 — Product and technical blueprint

**Status: In progress (documentation baseline being established).**

Deliverables:
- [x] Product vision and product boundaries.
- [x] Agreed screen map.
- [x] Initial UI/UX interaction requirements.
- [x] High-level implementation roadmap.
- [ ] Review and approve the blueprint in a pull request.
- [ ] Convert each major feature into GitHub issues or milestones after the blueprint is merged.

Acceptance:
- Product scope, independent-app requirement, Core boundary, screen map, and release criteria are unambiguous.
- Planned features are not represented as implemented.

## Phase 1 — UI prototype and design validation

**Status: Planned.**

Work:
- Build the desktop application shell and navigation.
- Prototype all seven screens.
- Validate the major workflows and states in the UI/UX specification.
- Confirm desktop runtime choice (Electron is the leading candidate).
- Validate accessibility, keyboard use, responsive desktop layouts, and error handling.

Acceptance:
- All screens and key workflows are reviewable in a clickable prototype.
- No mock control is mistaken for a functioning backend feature.
- The design covers real Core states, including stdio Ready/Idle/Active distinctions.

## Phase 2 — Architecture contracts and security design

**Status: Planned.**

Work:
- Define desktop IPC/API contracts.
- Define versioned policy schema and migration strategy.
- Define Core module registration contract.
- Define tool metadata and capability mapping.
- Define audit event schema, correlation IDs, retention, and redaction.
- Define Core process lifecycle and stdio session model.
- Threat-model the desktop boundary, policy writes, and Windows filesystem operations.

Acceptance:
- Contracts are documented and validated by schemas.
- UI cannot bypass Core authorization.
- Policy changes are atomic, recoverable, and applied predictably.
- External MCP clients can launch Core without Desktop App dependency.

## Phase 3 — Harden and complete MCP Core

**Status: Planned.**

Work:
- Perform a focused audit of existing path validation and permission behavior.
- Close or document TOCTOU and Windows reparse-point risks.
- Expand Windows tests for junctions, symlinks, UNC/device paths, ADS/reserved names, and path races.
- Improve structured audit and redaction.
- Implement missing read-only workspace tree behavior.
- Implement write/create operations only after safe-write design and tests.
- Implement move/rename with authorization of both source and destination.
- Implement delete with narrow permission, confirmation-compatible safeguards, and protected-target checks.
- Keep module registration and capability enforcement centralized.

Acceptance:
- Every tool has a strict input schema, capability mapping, bounded output, audit outcome, and allow/deny tests.
- Security tests run on Windows in disposable test directories.
- No mutation tool is enabled before its security acceptance criteria pass.

## Phase 4 — Desktop backend and process/configuration management

**Status: Planned.**

Work:
- Implement the desktop main process and restricted IPC.
- Manage application settings and policy files.
- Validate policy before save.
- Use atomic file replacement and backup/recovery.
- Launch Core subprocesses for diagnostics and supported managed sessions.
- Track only process sessions the app can reliably observe.
- Generate client configuration for stdio clients.
- Implement diagnostics and safe log access.

Acceptance:
- UI-facing operations are typed, validated, and permission-limited.
- No unauthenticated network management endpoint is introduced.
- External clients can still run Core independently.

## Phase 5 — Connect UI to real backend

**Status: Planned.**

Work:
- Replace prototype data with real backend state.
- Connect every form, action, and status display.
- Implement policy review, save, discard, reset, and restart/reconnect feedback.
- Implement tool inventory and capability display.
- Implement audit filtering and diagnostics.
- Add loading, empty, success, denied, and error states.

Acceptance:
- No production screen relies on hard-coded mock data.
- Every control performs its documented action.
- Policy shown as active is read back from the authoritative configuration/Core state.

## Phase 6 — MCP client interoperability

**Status: Planned.**

Work:
- Verify direct stdio launch from a generic MCP client.
- Add ParsSynapse Chat integration as one client.
- Document client configuration and troubleshooting.
- Test multiple independent stdio client processes.
- Decide whether a shared long-running transport is needed based on actual client requirements.

Acceptance:
- ParsSynapse Chat and at least one generic compatible MCP client can launch and use the Core.
- The Desktop App may be closed while an independently launched MCP client uses the Core.
- Client/model-level restrictions never exceed Core permissions.

## Phase 7 — Packaging, release, and maintenance

**Status: Planned.**

Work:
- Build a Windows installer.
- Define install/update/uninstall behavior.
- Decide optional startup behavior.
- Sign binaries if/when a signing certificate is available.
- Add release workflow and version migration.
- Publish user and developer documentation.

Acceptance:
- Clean-machine installation and upgrade tests pass.
- Uninstall behavior preserves or removes user policy only according to an explicit user choice.
- Release notes and security guidance match shipped functionality.

## Deferred milestones

- Streamable HTTP or other network transports.
- Shared multi-client daemon.
- Git module.
- Terminal and PowerShell modules.
- Additional developer-tool integrations.
- Advanced policy profiles and per-client identity policies.

These features must be re-evaluated against concrete requirements and threat models before implementation.

## Delivery rules

1. Work on focused feature branches; do not implement directly on `main`.
2. Every feature must link to a product requirement and acceptance criteria.
3. Add tests with the implementation, not as a later cleanup task.
4. Update the blueprint/spec/roadmap when scope or behavior changes.
5. Keep PRs small enough to review.
6. Do not merge until required checks pass and the change is reviewed.
7. Mark a roadmap item Done only after verification evidence exists.
