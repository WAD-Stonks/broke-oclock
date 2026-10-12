# Contributing

1. Read [How to code here](docs/development-guide.md), including route/handler/index wiring. Follow README setup, [AGENTS.md](AGENTS.md), the [folder guide](docs/architecture.md) and [import conventions](docs/coding-standards.md#imports-and-aliases).
2. Pick one workstream from [the feature plan](docs/feature-plan.md). Agree shared DTO/schema changes first.
3. Follow [branching and worktree guidance](AGENTS.md#branching-and-worktrees): inspect the checkout, fetch `origin`, then start independent work from `origin/main` with a descriptive branch such as `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>` or `chore/<short-name>`. Reuse an open PR's branch for follow-ups; use a separate worktree when the existing checkout contains unrelated work.
4. Keep changes small. Add Vitest tests and the relevant Playwright journey; never use real accounts or production databases in tests.
5. Run `pnpm run format` and `pnpm run check:all`. Review the diff, including lockfile changes and AI disclosure.
6. Open a pull request with scope, screenshots if UI changed, test evidence and remaining limitations. Get a teammate review; do not assume green CI means approval to merge.

[Standards](docs/coding-standards.md) · [Testing](docs/testing.md) · [AI boundaries](docs/ai-use.md)
