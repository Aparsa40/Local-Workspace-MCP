# Contributing

Thank you for helping improve Local-Workspace-MCP. This project handles access to local developer workspaces, so correctness, security, and clear documentation are essential.

## Before starting

- Read [README.md](README.md), [architecture.md](architecture.md), and [SECURITY.md](SECURITY.md).
- Check existing issues and pull requests to avoid duplicate work.
- For security-sensitive changes, discuss the design privately with maintainers before implementation.
- Keep changes focused and explain the security implications.

## Development workflow

1. Fork the repository or create a feature branch from the current default branch.
2. Use a descriptive branch name, such as:
   - `feat/filesystem-read-tools`
   - `fix/path-traversal-validation`
   - `docs/permission-policy`
   - `test/windows-reparse-points`
3. Make a focused change.
4. Add or update tests, especially for permission and path-boundary behavior.
5. Run the checks available in the repository.
6. Update documentation and `CHANGELOG.md` when behavior or user-visible interfaces change.
7. Open a pull request with a clear description and test evidence.

Do not push implementation work directly to `main`. Do not merge a pull request until required checks and review are complete.

## Commit messages

Use concise, imperative commit subjects. Conventional Commits are recommended:

```text
feat(filesystem): add bounded directory listing
fix(security): reject paths escaping configured roots
test(policy): cover nested root precedence
docs: clarify local stdio transport
```

Suggested types: `feat`, `fix`, `docs`, `test`, `refactor`, `build`, `ci`, and `chore`.

## Code expectations

- Use TypeScript types that make security boundaries explicit.
- Validate all external input at module boundaries.
- Keep policy decisions centralized; do not duplicate ad hoc permission checks in tools.
- Prefer small modules with clear responsibilities.
- Fail closed when policy or path validation is uncertain.
- Avoid administrator-only behavior.
- Never add credentials, tokens, private keys, `.env` files, or real user workspace data to the repository.
- Do not log file contents or secrets.
- Bound recursion, file sizes, execution time, and returned output.
- Keep platform-specific filesystem behavior isolated and tested.

## Tests

Add tests for normal behavior, denied behavior, malformed input, and relevant adversarial cases. Filesystem tests must use temporary test directories and must not modify real workspaces.

When adding or changing a tool, test:
- Input schema validation.
- Capability mapping.
- Allowed and denied policy outcomes.
- Path confinement.
- Output bounds and error behavior.

Document any tests that could not be run locally. Never report a test as passing unless it was actually executed.

## Pull request checklist

- [ ] The change has a clear scope and rationale.
- [ ] Relevant tests have been added or updated.
- [ ] Available checks pass, or failures are explained.
- [ ] Security implications and permission changes are documented.
- [ ] No secrets or private workspace data are included.
- [ ] README, architecture, and changelog are updated where applicable.
- [ ] Breaking changes and migration steps are clearly described.

## Security reports

Do not open a public issue for an exploitable vulnerability. Follow the private reporting process in [SECURITY.md](SECURITY.md).
