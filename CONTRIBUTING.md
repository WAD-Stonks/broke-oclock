# Contributing

1. Follow README setup and the [folder guide](docs/architecture.md).
2. Pick one workstream from [the feature plan](docs/feature-plan.md). Agree shared DTO/schema changes first.
3. Branch from current `main`: `feature/<short-name>`, `fix/<short-name>`, `docs/<short-name>`. No `codex/` prefix.
4. Keep changes small. Add Vitest tests and the relevant Playwright journey; never use real accounts or production databases in tests.
5. Run `bun run format` and `bun run check:all`. Review the diff, including lockfile changes and AI disclosure.
6. Open a pull request with scope, screenshots if UI changed, test evidence and remaining limitations. Get a teammate review; do not assume green CI means approval to merge.

[Standards](docs/coding-standards.md) · [Testing](docs/testing.md) · [AI boundaries](docs/ai-use.md)
