# Project Delivery Milestones

> **Purpose:** give the product owner a clear, repository-visible view of progress from the current Core foundation to a production-ready Windows desktop application and independently usable MCP backend.
>
> **Source of truth:** [Product Blueprint](PRODUCT_BLUEPRINT.md), [Desktop Architecture](DESKTOP_ARCHITECTURE.md), and [Implementation Roadmap](IMPLEMENTATION_ROADMAP.md).

## How GitHub Milestones are used

Create and manage milestones in the repository:

**Issues → Milestones → New milestone**

A GitHub milestone groups Issues by a major delivery outcome. Each Issue should describe one reviewable piece of work and include testable acceptance criteria. Pull requests should reference the relevant Issue (for example, `Closes #123`) so progress is reflected automatically.

Milestones are not substitutes for PRs, branches, CI, or the implementation roadmap:
- **Roadmap:** complete technical sequence and current implementation status.
- **Milestone:** one major product outcome and its completion percentage.
- **Issue:** an actionable, testable unit of work.
- **Pull request:** reviewed implementation and evidence.

Do not create a new milestone for every PR. Use one milestone per meaningful product stage.

## Delivery map

The sequence below is the planned route to the product goal. It is intentionally outcome-based; exact scope may be refined when each stage is decomposed into Issues. No target dates are assigned until capacity and dependencies are known.

| ID | Suggested GitHub milestone title | Outcome |
|---|---|---|
| M0 | Product & Architecture Baseline | Product scope, seven-screen UX, security boundaries, and delivery architecture agreed and documented. |
| M1 | Secure Electron Desktop Foundation | A real Windows desktop shell launches; hardened preload and validated IPC are in place; Electron main process safely owns PolicyStore and managed Core lifecycle. |
| M2 | Production MCP Core & Workspace Security | Core security review and Windows path tests are complete; workspace tree, safe write/update/move/delete operations, capability enforcement, and structured persistent audit meet acceptance criteria. |
| M3 | Functional Desktop Management | Workspaces, Permissions, Tools, Activity & Audit, Connections, Dashboard, and Settings are connected to real backend/Core state; no production screen relies on demo state. |
| M4 | MCP Client Interoperability | Direct stdio usage is verified with ParsSynapse Chat and at least one independent generic MCP client; client configuration and troubleshooting are documented. |
| M5 | Windows Packaging & Release Candidate | Installer, clean-machine install/upgrade/uninstall tests, configuration migration, release workflow, and user/security documentation are ready. |
| M6 | Production Release & Maintenance | A versioned Windows release is published with verified release artifacts, support/maintenance process, and known limitations documented. |

## Current position (2026-11-10)

**Active delivery stage: M1 — Secure Electron Desktop Foundation.**

Already implemented in the repository:
- Core policy runtime with immutable snapshots and revision-checked reload.
- Dedicated, bounded Core control protocol over inherited pipes, separate from MCP stdio.
- Node-only CoreProcessManager with real child-process integration tests on Linux and Windows.
- Versioned PolicyStore with validation, revision checks, backup/recovery, and failure-injection coverage.
- Approved seven-screen React visual system, now bundled in Electron with initial live backend integration.

Merged to main in PR #25:
- Electron app shell and main-process lifecycle foundation.
- Hardened preload bridge using `contextBridge`; renderer has no Node access or generic IPC forwarding.
- Strict, Zod-validated, allowlisted IPC handlers with invoking main-frame validation.
- Main-process service layer connecting PolicyStore and CoreProcessManager.
- Separate persisted-policy and normalized Core-runtime revision handling; a policy is reported active only when Core confirms the derived runtime revision.
- Persisted-but-not-applied policy handling; reload failure triggers a managed-Core stop attempt and remains reported as unapplied.

Implemented in the current M1 branch (pending review and CI):
- Bundled the approved React design into the Electron renderer.
- Connected workspace selection to the native folder picker and PolicyStore.
- Connected permission editing, policy save, and managed Core reload feedback.
- Replaced demo dashboard values and tool toggles with actual Core/policy state.
- Added actual stdio connection configuration generation from runtime paths.
- Made an empty workspace list a valid default-deny policy.

Still required to complete M1:
- Full Windows GUI launch and end-to-end folder selection, policy save/reload, failure handling, and shutdown verification.
- Complete the IPC threat model and Windows desktop security review.
- Verify that external stdio clients remain independent of the Desktop App lifecycle.

Structured persistent Activity & Audit and the remaining Settings workflows belong to the later functional-management delivery stage, not the M1 security foundation.

The merged Node-only CoreProcessManager was a prerequisite; this branch adds the first Electron integration but does not complete M1.

## Milestone completion rules

A milestone is complete only when all of the following are true:

1. Its Issues are closed with implementation and verification evidence.
2. Required CI checks pass on the final PR head.
3. Security-sensitive behavior has explicit tests and documented limitations.
4. The relevant documentation and roadmap are updated.
5. The final integration is reviewed and merged into `main`.
6. No planned item is silently marked complete merely because a prototype or mock exists.

At milestone completion, pause before starting the next major stage. The assistant will:
- summarize delivered functionality and remaining limitations;
- verify the milestone's Issues/PRs and update the roadmap;
- tell the product owner the exact next milestone title and provide its ready-to-paste description for creation under **Issues → Milestones**.

The product owner creates the next GitHub milestone manually. Do not create future milestones prematurely; this keeps the repository's milestone list aligned with verified progress.

## Product goal / final definition of done

The project is not considered finished merely because an Electron window opens. The intended product is a usable Windows desktop application backed by an independent, secure MCP Core that can be connected to AI clients and model platforms.

The final release must demonstrate:

- A Windows 10/11 desktop application with all seven functional screens.
- A secure Electron boundary: isolated renderer, narrow preload API, validated IPC, no arbitrary renderer filesystem or command execution.
- A complete, independently runnable MCP Core over stdio, with workspace-scoped capability authorization and tested filesystem operations.
- Persistent, structured, sanitized audit records with bounded retention/rotation and useful diagnostics.
- Reliable policy persistence, revision tracking, and correct behavior when applying/revoking permissions.
- Working client configuration and interoperability with ParsSynapse Chat and at least one independent MCP client.
- Installer, clean-machine install and upgrade tests, safe uninstall behavior, versioned releases, and user/developer/security documentation.
- No unauthenticated management HTTP endpoint. Any future network transport must be a separately reviewed product/security decision.

## Deferred beyond the first production release

Git, Terminal, PowerShell, Developer Tools, shared multi-client daemon behavior, and network transports remain separate future milestones or roadmap initiatives. They must not delay the first secure, useful Windows application unless a concrete release requirement makes them necessary. Each requires its own capability model, threat review, and acceptance tests.
