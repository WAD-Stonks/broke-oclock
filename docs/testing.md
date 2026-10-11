# Testing guide

## CI triggers

The `quality` workflow runs only for pull requests targeting `main`: when opened, reopened or updated with new commits. It does not run on pushes/merges to `main` or manual dispatch. The required pre-merge `quality` check and all test steps remain unchanged. Deployment is a separate concern; this workflow does not deploy.

Integration suites run serially to avoid concurrent first-download races in the shared MongoDB binary cache. Disposable Prisma pushes use asynchronous child processes so the parent can drain MongoDB stdout; synchronous spawn can stall larger schema pushes. Tests within a suite still exercise concurrent requests; no security cases are skipped.

## Test layers

- **Node tooling contracts**: `pnpm run test:tooling` checks the sole pnpm lockfile, isolated-linker/lifecycle/audit settings, direct test dependencies, CI/hosting commands and the environment-preserving workspace launcher. The cold Node tooling regression creates a fresh store/cache, installs pinned tsx/esbuild from a frozen fixture lockfile with hooks disabled and builds/loads a real ESM artifact through the esbuild API. A failing legacy-executable sentinel proves Prisma generation never invokes the removed runtime. This test requires registry access. Real child-process fixtures verify missing commands, exit/signal status, SIGINT/SIGTERM descendant cleanup and fail-fast sibling shutdown. Separate offline installs verify both project and dependency hooks remain disabled (including an allowlisted fixture dependency), without relying on inherited environment settings. It is included in the unit gate.
- **Vitest unit**: pure functions, configuration, Vue render/navigation and component behaviour. Fast and no real database required. Includes REST error/route policy, shared contract parsing and web Axios-client behavior.
- **Vitest package**: Resend and WordPress transports with explicit fetch mocks. No real emails are sent.
- **Vitest integration**: actual Express REST + Better Auth + Prisma HTTP flows against a disposable MongoDB replica set. No production database or real accounts. The helper may download a MongoDB binary on its first run. Axios integration tests use the real Axios HTTP adapter against Express for success, write, error and request-identity cases. The local production and Vercel packaging regressions copy each artifact outside the repository and run real auth/Prisma under plain Node without workspace dependencies. The local production test starts the real server entry point and checks graceful SIGTERM shutdown. Auth role tests cover default USER, hostile signup/profile input and fresh-session promotion/demotion using disposable accounts. Schema tests cover applicability persistence, uniqueness, review defaults, Decimal-free Mongo-compatible amounts and pinned import snapshots; they do not prove unimplemented domain API invariants.
- **Playwright E2E**: starter page/navigation/layout and same-origin auth/upload/REST client smoke tests (provider/client fixtures are synthetic and labelled); each student adds their actual product journeys as features land. Scaffold smoke coverage is NOT the final project core-feature coverage.

```sh
pnpm run test:unit
pnpm run test:packages
pnpm run test:integration
pnpm exec playwright install chromium
pnpm run test:e2e
pnpm run check:all
```

`pnpm run test` runs the Node tooling contracts and Vitest unit suites. Tests should not depend on live Telegram, OneMap or WordPress responses. Save approved representative fixtures and mock those external boundaries, while keeping the application's main browser/API/DB path real. Keep synthetic browser fixtures clearly labelled, and preserve assertions for interaction ordering, stale responses, duplicate-submit prevention, authorization recovery and other existing races.

Use role/label selectors, isolated records and assertions on observable outcomes. Test invalid input, ownership, unauthorized access, duplicate actions and error recovery. Do not add hard sleeps or silent retries to hide race conditions.

Browser artifacts are ignored under `test-results/` and `playwright-report/`. Never commit a Playwright auth-state JSON containing session cookies. CI uploads failure artifacts only; inspect them for personal data before sharing externally.

## Platform-admin verification

See [platform-admin contracts](platform-admin.md). The API suite uses real cookies and disposable MongoDB for permissions, privilege escalation, optimistic versions, concurrent changes and audit rollback. Vue and browser suites exercise the real UI with synthetic API responses, including account/request actions and 320/390/1280px layouts. They do not replace a connected browser-to-API-to-database acceptance journey or a separately approved live demo.

A new worktree without `.env` needs a non-connecting DATABASE_URL for Prisma validation, for example `DATABASE_URL=mongodb://127.0.0.1:1/platform_admin_validation_only pnpm run check:all`. Each integration suite replaces it with its own disposable replica-set URI before schema setup. No existing application database is used.

## Admin completion acceptance boundaries

- Public auth availability, protected overview and imported-outlet association are exercised through actual Express/Axios/native-cookie/Prisma calls against disposable replicas. Counts and source readiness are credential-safe projections; GET/HEAD must preserve database snapshots, including expired session rows.
- Native Google callback/state/linking and OTP expiry/attempt/quota/concurrency/recovery suites control only Google token/JWKS and mail boundaries. The canonical user, native session, role checks and Mongo adapter remain real. Google admission regressions cover still-verified local-email substitution before validation, between validation/account hooks and after stamping, Request-owned proof isolation, deterministic overlapping callbacks, native redirect/ID-token compatibility and lowercase-only comparison. Rejected admission must preserve account counts and authorization rows. Controlled Google/Resend responses are not live-provider acceptance.
- Shared admin shell, overview/deep links and existing-outlet picker tests keep the actual Vue UI and typed client. Existing browser interceptions remain labelled synthetic; their layout and interaction results do not establish real database authorization. `e2e/admin-connected.spec.ts` uses the real local API/native auth/disposable database with controlled Google/Resend boundaries. Its recorded four-case run covers password, OTP identity/recovery and Google callback/role/logout behavior; it does not cover connected outlet association or live providers. The transaction-bound explicit Google insertion guard is covered separately by native integration cases, including actual Mongo conflict codes, rollback and trusted-stamp admission. The added aged-session consumer case has genuine unchanged-source RED followed by GREEN: original-SPA lifecycle renewal triggers native POST and extends the actual database expiry while preserving canonical user/session/owned records. All five connected cases passed their recorded run.
- Preserve failed attempts and their complete reporters before rerunning. A Playwright output-directory override does not move JSON/HTML reporter destinations. Bind final logs/review verdicts to exact source bytes, keep unchanged password and stale-review regressions, and never weaken assertions, add retries or remove failures to publish a PR. Native quiet test runs must not record OAuth states, OTPs or session cookies.

Native compatibility and the recorded controlled connected auth cases passed their scoped gates. The actual UI renewal correction passed its scoped frontend and connected gates. The provider-proven email correction's six-file focused gate passes 103 cases, including 54 native Google cases, with no failed or skipped cases and process exit 0. Earlier full-gate counts describe their recorded source snapshots, not later changes. Final branch acceptance requires the full integrated gate and sequential frozen independent spec and quality/security reviews on the final bytes. The source-bound task ledger distinguishes those gates; this guide does not itself certify the final branch. No live-provider, production provisioning, schema application, deployment or merge is authorized.

## Final project testing obligations

The official brief asks for at least E2E testing of core features. Unit tests supplement, not replace, the main user journeys. Each workstream's acceptance path is in [feature-plan.md](feature-plan.md). README instructions must remain runnable on a fresh clone.
