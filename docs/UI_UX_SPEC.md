# Local-Workspace-MCP — UI/UX Specification

> **Status:** Agreed screen map and interaction requirements  
> **Related:** [Product Blueprint](PRODUCT_BLUEPRINT.md)

## 1. Application shell

The desktop application uses a persistent navigation sidebar and a main content area.

### Primary navigation
- Dashboard
- Workspaces
- Permissions
- Tools
- Activity & Audit
- Connections
- Settings

### Global elements
- Product name and version.
- Core readiness indicator with explicit states.
- Current configuration profile/path.
- Help and diagnostics entry points.
- Clear visual distinction between saved policy and unsaved edits.

The interface should be calm, technical, and readable. Security-critical states must use text and icons, not color alone.

## 2. Global interaction rules

- Every control must have a defined real behavior before it is implemented.
- Destructive actions require a confirmation step that identifies the target and consequence.
- Permission changes show a review summary before save.
- Invalid paths and policies show actionable validation messages.
- Long-running operations show progress and can be cancelled where safe.
- Empty states explain the next useful action.
- Loading, success, warning, denied, and error states must be designed.
- Do not show mock data in production screens.
- Use accessible labels, keyboard navigation, visible focus, and sufficient contrast.
- Do not expose raw secrets or file contents in logs or diagnostic panels.

## 3. Dashboard

### Summary cards
- Core readiness.
- Active observable sessions.
- Configured workspaces.
- Available tools.
- Recent denied/failed operations.

### Status model
- **Ready:** executable and policy are valid; a client can launch the Core.
- **Active session:** one or more observed Core processes are active.
- **Idle:** configured and valid, but no observed process is active.
- **Configuration error:** policy or runtime validation failed.
- **Unavailable:** executable/runtime cannot be found or started.

For stdio, "Ready" is not the same as a continuously running daemon. The app must not claim to know about processes it does not manage or observe.

### Quick actions
- Add workspace.
- Review permissions.
- Configure an MCP client.
- Run diagnostics.

## 4. Workspaces screen

### Workspace list
Each row/card displays:
- Display name.
- Canonical path.
- Enabled/disabled state.
- Permission summary.
- Validation status.
- Last policy update.

### Add/edit flow
1. User selects a directory using the native picker.
2. App resolves and validates the path.
3. App detects duplicate or overlapping roots.
4. User assigns a display name.
5. User reviews initial permissions (default to none or the explicitly chosen safe read-only preset).
6. User saves.
7. Backend validates and atomically persists the policy.
8. UI refreshes from the authoritative saved policy.

### Remove flow
- Identify the workspace by name and full path.
- Explain that removal revokes future access but does not delete the actual directory.
- Require confirmation.
- Save the updated policy and show the result.

## 5. Permissions screen

### Layout
- Workspace selector or workspace-by-capability matrix.
- Capability descriptions and risk labels.
- Current policy vs proposed changes.
- Save, discard, and reset-to-saved controls.

### Permission groups
**Read-only:** list, read, search, metadata.

**Mutation (planned):** write, create, rename, move, delete.

### Save flow
1. Collect proposed changes in UI state only.
2. Submit the complete proposed policy to the Backend.
3. Validate schema, path existence/canonicalization, duplicate roots, capability names, and policy semantics.
4. Show a review summary of grants and revocations.
5. Persist atomically with a backup/recovery strategy.
6. Apply the policy by supported reload or controlled process restart.
7. Confirm the effective policy by reading it back from the authoritative source.
8. Display whether existing client sessions need reconnection.

Never show a permission as active before the Core is enforcing the corresponding policy.

## 6. Tools screen

Each tool entry includes:
- Tool name and description.
- Owning module.
- Required capabilities.
- Read-only or mutating classification.
- Implementation state.
- Enabled/disabled state.
- Limits and confirmation behavior.

Only implemented tools can be enabled. Planned tools must be visibly marked as unavailable/planned, not presented as working toggles.

## 7. Activity & Audit screen

### Filters
- Date range.
- Tool/module.
- Workspace.
- Allow/deny.
- Success/failure.
- Session/correlation ID, when available.

### Record fields
- Timestamp.
- Operation.
- Resource label (redacted where needed).
- Authorization decision.
- Outcome.
- Safe reason/error summary.
- Session identifier.

### Privacy
- Never log file contents or credentials.
- Sanitize control characters and untrusted strings.
- Apply retention and rotation limits.
- Export only sanitized records.

## 8. Connections screen

### Client setup
- Generic stdio configuration snippet.
- Executable/command path.
- Arguments and environment variables.
- Configuration file location.
- Copy buttons and setup guidance.
- ParsSynapse Chat guide.
- Troubleshooting and local validation.

### Session visibility
A stdio client typically launches a separate server process. The app may list processes it starts or can reliably observe, but must not claim to enumerate all third-party MCP clients without an explicit supported mechanism.

### Future transports
A future Streamable HTTP connection setup must have separate UI and security controls. Do not expose it as available until implemented and reviewed.

## 9. Settings screen

Sections:
- General
- Core/runtime
- Configuration and policy location
- Resource limits
- Security and sensitive paths
- Audit retention
- Diagnostics
- Updates

Every setting must identify whether it is app-only or affects Core enforcement. Core-affecting settings require validation and policy application feedback.

## 10. Required states for every screen

- Initial loading.
- Loaded with data.
- Empty state.
- Validation error.
- Permission denied.
- Operation in progress.
- Save success.
- Save failure.
- Offline/unavailable Core.
- Unsaved changes.
- Confirmation dialog for destructive actions.

## 11. Prototype acceptance

Before production implementation, a clickable prototype must cover:
- Navigation among every primary screen.
- Add/edit/remove workspace flow.
- Permission review and save flow.
- Tool availability states.
- Audit filtering and detail view.
- Client configuration copy flow.
- Settings and diagnostics.
- At least one representative error and confirmation state per major workflow.

A prototype validates information architecture and user flows. It does not count as a functioning security or policy implementation.
