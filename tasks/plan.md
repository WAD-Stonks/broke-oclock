# Admin authentication and ingestion completion

Authorization: Noah requested implementation and a PR only after independent review is green, on 10 October 2026. No merge or production-operation authorization.
Base: `941973b0acdc9f5d6c52a507d1135e994fb7dc28`
Branch: `feat/admin-auth-ingestion-completion`
Worktree: `/Users/noah/Code/smu/wad2/project/code/.worktrees/broke-oclock-admin-completion`

## Requested scope and acceptance ledger

- [ ] Shared Google/email-OTP/password authentication integration for administration, visible logout and accurate session/access recovery; expose one shared native Better Auth contract to Kang En, not a second identity system or his full account feature.
- [ ] Protected operational admin overview linking real pending merchant requests/review drafts/recent import failures and safe configuration readiness, reusing existing admin pages.
- [ ] Connected isolated request -> real admin approval -> transaction-scoped stall capability tests and explicit Kang En/Isaac handoffs; do not implement their unowned screens or promotion CRUD merely to fake a complete journey.
- [ ] Safe imported-draft association with an existing active outlet, preserving citations, pending review, expected content version, fresh roles and transaction/race safeguards. No fabricated location inference, new merchant/venue provisioning or automatic publication.
- [ ] OneMap/source-readiness and permission distinctions checked with controlled provider boundaries. Actual credentials, publisher permission, source activation and live-provider acceptance remain separately approved external gates.
- [ ] Maintained auth/admin/environment/testing/AI-disclosure docs match implemented behavior and remaining teammate/live dependencies.
- [ ] Test-first RED/GREEN evidence, focused checks and the full mandated repository gate pass on final bytes.
- [ ] Independent spec compliance and security/quality review pass on a frozen final tree.
- [ ] Commit/push and PR against current main, exact remote file/head readback, and latest quality CI verified. Leave PR open; do not merge.

## Explicit boundaries

Preserve current role enum/default/input protection, request-local cookie identity, native Better Auth/UploadThing transports, exact trusted Origin, server-backed ADMIN/revocation/stall access checks, permission fence, transactions, version race semantics, bounded input/error contracts and no mutation replay. No secret/configuration-value output. No production database reads/writes, schema application, account provisioning, provider setup, deployment, protection changes, unapproved dependency upgrades or audit suppressions. Tests use disposable MongoDB replicas. Preserve all unrelated worktrees and the protected AGENTS.md file. Normal user account features, deal CRUD, moderation and other owners' critical interactivity remain out of scope. Suspension, admin MFA policy and new session-revocation controls are next-stage proposals requiring policy review, not silently approved extras.

## Verified foundation and current implementation lanes

The shared browser-safe auth-method/overview/outlet DTOs and typed Axios methods have real RED logs and 28 passing focused tests (22 schema, 6 client), plus contracts and API-client typechecks. This is a focused foundation gate, not final independent review or full acceptance. The sole dependency change is the API's existing email workspace link; external versions and lock snapshots are unchanged.

Exclusive implementation ownership is recorded in the scratch `admin-completion/ownership-contracts.json`: native auth/config/email (A), protected overview/method metadata (B), imported outlet association/review fence (C), reusable auth/session UI (D1), later page/outlet integration (D2), connected isolated handoff/readiness proof (E). Parent owns frozen shared contracts, docs, final integration, sequential independent spec/security reviews and PR publication. No worker may commit, push or publish.

The concrete design reuses native Google/email OTP/password flows. New routes are `GET /api/auth-methods`, `GET /api/admin/overview` and `PATCH /api/ingestion/drafts/:dealId/outlet`. Association accepts only `{expectedContentVersion, venueId}` and derives its merchant from an existing active outlet inside a fenced transaction. It stays pending, increments the draft version and preserves immutable citation content. No schema or parser changes are planned.

The first six rows remain the functional scope. Shared foundation alone does not complete them; all remain open until source, focused proof and final independent review are verified. Teammate screens and live/provider permission acceptance remain separately identified dependencies, not substitutes for implementation.

## Integrated verification checkpoint

- Native compatibility: 69 recorded native regressions pass, including reservation collisions/transactions, delivery failure cleanup, first-OTP identity recovery, expired read preservation and explicit Google proof-loss/session checks. The parent also verified the corrected provider-unit and overview gate.
- Rendered outlet acceptance: 17 owned browser tests pass, with synthetic API boundaries and 320/390/1280px coverage. This proves UI/client interaction, not database persistence.
- Connected auth acceptance: four recorded Chromium cases use the original SPA/native API/disposable MongoDB. Google and Resend are controlled boundaries; live-provider acceptance and connected outlet association are not established by them.
- The complete pre-renewal-correction gate passed 1,673 test rows (18 Node tooling, 920 API unit, 126 frontend unit, 215 package, 349 integration and 45 browser). Format, full checks, audit and diff checks passed; the audit retains its one existing documented ignored high advisory, with no new suppression.
- Inspection then found that the real admin UI used raw read-only session GETs, rather than the native Vue atom's sliding renewal. A standalone SDK proof did not establish consuming-UI renewal. The initial correction lane added a test/fixture only and stopped when its execution approval prompt closed unanswered; it did not execute RED/GREEN or change production UI.
- Noah gave fresh explicit approval to resume the local correction and verification. That lane completed genuine RED/GREEN: actual UI-triggered native GET-to-POST renewal extends Mongo expiry, while logout/unmount generation fences prevent late identity probes. All 131 frontend tests and five connected cases pass, with web/API/tools typechecks, scoped Biome and diff checks. The integrated full gate now passes 1,679 test rows, including 131 frontend and 46 canonical browser cases, with format, audit and diff checks. Sequential frozen spec then security/quality reviews remain pending.
- Frozen spec review v1 returned REQUEST_CHANGES for B1: explicit Google insertion was not transaction-bound to verified ownership/current session. The implemented guard now couples those checks and meaningful conditional timestamp writes with the native account insert in one real transaction, without schema, dependency, provider or policy changes. Its native gate passes 81 assertions with process exit 0 and no unhandled errors; repeated independent spec review must accept the new exact bytes before stage 2 or publication.
- The diagnostic initially showed passing assertions with a nonzero runner exit. A fixture Promise-brand assignment threw synchronously and orphaned database work after rollback. Awaited test-only transaction/delegate observers replace that instrumentation; conflict cases require genuine Prisma P2034, not an arbitrary HTTP 500. Earlier failed logs and review evidence remain preserved.

Historical green counts are scoped evidence, not acceptance of later changed bytes. The functional checkboxes stay open until the required final source-bound review completes.

## Provider-proven email correction

On 11 October 2026, the remaining quality finding was corrected in the native authentication boundary. Accepted Google create-user/link-account validation captures provider email and validated explicit link state in Request-owned proof; the account hook consumes it once and retains normalized provider email plus exact raw local email in the existing owner/session transaction fence. Direct ID-token linking uses the public native verifier/provider and the same validator because the pinned route omits that validator. Returning sign-in cannot mint insertion proof. No dependency, schema, provider setting or teammate feature changed.

Five behavior slices have preserved genuine RED/GREEN evidence. The final six-file focused gate passes 103 tests (54 native Google, 13 compatibility, 13 OTP security, 6 auth-method, 12 provider-config and 5 fence cases), with zero failures/skips and exit 0. Auth/API typechecks, scoped Biome and diff checks pass on the recorded final hashes. All 76 non-owned frozen paths remained unchanged during that correction. This focused evidence does not waive the complete integrated gate or sequential independent reviews required before publication.

## Workflow

1. Read-only concrete solution design and file mapping using inherited GPT/Sol routing.
2. Fresh-context scoped implementers with exclusive file ownership, strict vertical TDD and durable artifacts.
3. Parent integration, full gate, then frozen spec review followed by independent quality/security review.
4. Fix blocking findings, rebind/recheck final bytes, then publish the verified PR.

Unresolved external dependencies stay explicit; implementation capability, automated proof and deployed/live acceptance are separate states.
