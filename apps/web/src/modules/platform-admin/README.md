# Platform administration

Owner: Noah. Route: `/admin/accounts`; separate from `/admin/ingestion`.

This is an implementation for PR review, not an agreed team retention or authorization policy. Account deletion is unavailable pending the team's retention/anonymisation decision. No delete action, production writes or deployment are supplied here.

- `PlatformAdminPage.vue` renders account search, role filters and cursor pagination; selected account details and active stall grants; noted/confirmed role and grant/revoke actions; merchant-request status, pagination and review; immutable audit history including server-selected before/after roles.
- `use-platform-admin.ts` uses explicit same-origin Axios functions and browser-safe schemas/types from `@broke-oclock/contracts/platform-admin`. A client role never authorizes the administrator. A selected MERCHANT role only controls grant-form UX; the server must independently authorize every operation.
- `query-state.ts` invalidates superseded requests, including late errors and denials. Mutations capture record identity/version and are guarded against duplicate submissions and target switching. Ambiguous failures lock that account/request until matching evidence is fetched. Unrelated pagination never clears a conflict. New evidence or targets discard notes and confirmations.
- Account version guards retain the highest accepted list/detail version per identity across pending detail reloads, pagination and filter changes. Older detail never unlocks an account; older lists cannot invalidate newer reviewed detail. Superseded query responses are not accepted version evidence. Only a fresh detail at least as new as the highest observed version can clear the guard, with a new note and confirmation.
- Permission denial clears protected data and selection. A mutation `FORBIDDEN` can be an operation-specific refusal, so all panels and selections are cleared while a fresh ADMIN-only accounts query rechecks server access. Success restores administration with an action-specific refusal notice, never an automatic mutation retry; real revocation stays globally denied, and a failed recheck stays closed with an explicit retry. Neither cached roles nor error-message strings authorize this recovery. Anonymous users use the existing shared Better Auth sign-in; sign-in always rechecks server access. Loading, empty, forbidden, anonymous and retryable errors are distinct. Mutation completion is reported separately from failed follow-up reads.
- Notes are bounded to the API's 500-character limit; account/stall search inputs to 100. All API text uses escaped Vue interpolation; no raw HTML.

## Verification boundary

`apps/web/tests/platform-admin.test.ts` uses explicitly synthetic REST response fixtures. `e2e/platform-admin.spec.ts` intercepts the browser API boundary while exercising the real SPA and Axios transport. These assert exact mutation identity/version/payloads, stale-state protection, permission-denial rendering, 320/390/1280px layouts and role-change refreshes. They do **not** prove live authentication, database authorization, backend acceptance or real merchant activity. Integration authorization belongs to the API's disposable-database tests. Screenshots/reports belong in scratch, not Git.

Merchant request creation/status belongs to Kang En's separate user-facing flow. This UI only reads and reviews existing server requests. Merchant endpoint enforcement and retention decisions remain separate handoffs.
