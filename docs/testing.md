# Testing guide

## CI triggers

The `quality` workflow runs only for pull requests targeting `main`: when opened, reopened or updated with new commits. It does not run on pushes/merges to `main` or manual dispatch. The required pre-merge `quality` check and all test steps remain unchanged. Deployment is a separate concern; this workflow does not deploy.

Integration suites run serially to avoid concurrent first-download races in the shared MongoDB binary cache. Disposable Prisma pushes use asynchronous child processes so the parent can drain MongoDB stdout; synchronous spawn can stall larger schema pushes. Tests within a suite still exercise concurrent requests; no security cases are skipped.

## Test layers

- **Vitest unit**: pure functions, configuration, Vue render/navigation and component behaviour. Fast and no real database required. Includes API tRPC policies/error transport and web client type inference.
- **Vitest package**: Resend and WordPress transports with explicit fetch mocks. No real emails are sent.
- **Vitest integration**: actual Express + tRPC + Better Auth + Prisma HTTP flows against a disposable MongoDB replica set. No production database or real accounts. The helper may download a MongoDB binary on its first run. The Vercel packaging regression also copies the bundled API outside the repository and runs its real auth/Prisma path under Node without workspace dependencies. Auth role tests cover default USER, hostile signup/profile input and fresh-session promotion/demotion using disposable accounts. Schema tests cover applicability persistence, uniqueness, review defaults, Decimal-free Mongo-compatible amounts and pinned import snapshots; they do not prove unimplemented domain API invariants.
- **Playwright E2E**: starter page/navigation/layout and same-origin auth/upload/RPC client smoke tests now (provider/client transport fixtures are synthetic); each student adds their actual product journeys as features land. Scaffold smoke coverage is NOT the final project core-feature coverage.

```sh
bun run test:unit
bun run test:packages
bun run test:integration
bunx playwright install chromium
bun run test:e2e
bun run check:all
```

`bun run test` is a Vitest alias; `bun test` would launch a different runner. Tests should not depend on live Telegram, OneMap or WordPress responses. Save approved representative fixtures and mock those external boundaries, while keeping the application's main browser/API/DB path real.

Use role/label selectors, isolated records and assertions on observable outcomes. Test invalid input, ownership, unauthorized access, duplicate actions and error recovery. Do not add hard sleeps or silent retries to hide race conditions.

Browser artifacts are ignored under `test-results/` and `playwright-report/`. Never commit a Playwright auth-state JSON containing session cookies. CI uploads failure artifacts only; inspect them for personal data before sharing externally.

## Final project testing obligations

The official brief asks for at least E2E testing of core features. Unit tests supplement, not replace, the main user journeys. Each workstream's acceptance path is in [feature-plan.md](feature-plan.md). README instructions must remain runnable on a fresh clone.
