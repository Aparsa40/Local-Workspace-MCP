# Versioning Policy

Local-Workspace-MCP intends to use **Semantic Versioning 2.0.0** (`MAJOR.MINOR.PATCH`).

## Version format

`MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]`

- **MAJOR:** incompatible changes to public behavior, configuration, tool contracts, or supported integration interfaces.
- **MINOR:** backward-compatible functionality, new tools, new optional configuration, or new independently permissioned modules.
- **PATCH:** backward-compatible fixes, security fixes, documentation corrections, and internal improvements that do not change the public contract.

## Pre-1.0 development

Before `1.0.0`, the public interfaces are not considered stable. Breaking changes may occur between `0.x` releases. Such changes must still be documented in `CHANGELOG.md`.

The initial usable development milestone may be published as `0.1.0`. The repository's current version must be taken from its package metadata and release tags once those are created; this document does not itself declare a published release.

## Release process

A release should:

1. Have a reviewed pull request and passing required checks.
2. Update `CHANGELOG.md`.
3. Update the package version and any version references.
4. Confirm documentation matches the shipped behavior.
5. Create a Git tag using the `vMAJOR.MINOR.PATCH` convention.
6. Publish release notes describing user-visible changes and known limitations.

## Compatibility

Changes to MCP tool names, input/output schemas, permission names, configuration format, and transport behavior may affect clients and should be treated as public-interface changes.

Security fixes may require behavior changes. Document their impact and any required configuration migration clearly.
