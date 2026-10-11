# Admin dashboard: research and implementation roadmap

Date: 10 October 2026. Source baseline: `941973b0acdc9f5d6c52a507d1135e994fb7dc28`.

Owner: Noah. Reviewer: Kang En. Kang En retains normal-user account flows; Noah owns the approved shared infrastructure and admin integration. This roadmap separates that local implementation from remaining researched proposals. Final acceptance is tracked in [the task ledger](../tasks/plan.md), and P1 security controls remain unapproved policy proposals. Retain the existing ownership and assessment boundaries.

Read the [shared authentication standard](shared-authentication.md) first. It defines Google/OTP, canonical identities, linking, logout/recovery and the administrator assurance gap.

## 1. Already in the repository

**Accounts, `/admin/accounts`:** account search/details and role filters, cursor pagination, versioned role changes, review of merchant requests, named-stall grants/revocation and transactionally recorded account-action history. Loading/empty/error/denied states, stale-record guards and duplicate-submit protection exist.

**Ingestion, `/admin/ingestion`:** email/password sign-in, source readiness, bounded manual import, safe failure/run history, evidence-preserving draft approval/rejection with notes and read-only OneMap lookup. Source imports are default-off. Authenticated live OneMap lookup is not established.

**Server protections:** fresh database-backed ADMIN checks, exact trusted-Origin mutations, strict inputs, optimistic versions and permission fences. Public projections do not expose complete auth records. Deletion, live admin provisioning, scheduling and deployment are not supplied by these modules.

The existing account-action history is application-level append-only, not a tamper-proof database archive. It does not establish a central audit of every authentication, import or security event. The existing synthetic browser tests and disposable API integration tests are not a connected production demo. See [platform administration](platform-admin.md) and [ingestion](ingestion.md).

## 2. Research findings and adoption decisions

1. **One login, explicit authorization.** Keep the shared auth system and enforce permissions on every protected request. An admin menu is navigation, not an authorization boundary. Adopt deny-by-default access and object/stall scope. [D1]
2. **A framework admin plugin is not a ready-made dashboard.** Better Auth offers user listing, ban/unban, session revocation, role management and impersonation. Its default `user`/`admin` roles and extra schema differ from this project's enum and audited/versioned services. Do not enable it as a parallel role-management path; any future use requires explicit mapping and preserves the existing mutation fence, expected versions and audit guarantees. Exclude impersonation from the MVP. [D2]
3. **Security history is separate from business history.** Capture login/access failures and relevant admin actions with identity, target, action, time, outcome and safe correlation data. Do not record passwords, OTPs, bearer/session/OAuth tokens, connection strings or raw provider bodies. Keep access and retention deliberate. [D3]
4. **Operational tables first.** Search/filter and pagination help staff find work; concise row actions, detail views and labelled confirmation give a clearer workflow than a chart-heavy dashboard. Adapt Carbon's table guidance to the existing Bootstrap/Vue stack rather than add a UI framework. [D4]
5. **Accessible auth and administration.** Keep full-code paste, password-manager support, keyboard navigation, visible focus and clear field/error labels. Do not implement six isolated code boxes that prevent full-code paste. [D5]

The local completion branch registers `/admin`, public `GET /api/auth-methods`, protected `GET /api/admin/overview` and versioned `PATCH /api/ingestion/drafts/:dealId/outlet`. The overview reports pending merchant requests, pending imported drafts, stored failed imported posts and the newest ten canonical-source runs. Readiness flags are configuration and source-state projections, not live-provider acceptance. The shell integrates shared sign-in, logout and recovery into all admin pages. Existing-outlet association stays pending, increments the content version and preserves source evidence. Native compatibility and four real local connected-browser auth cases have passed on recorded source snapshots. Actual admin UI sliding renewal now passes controlled connected-browser proof. The integrated full gate passes, with frozen independent reviews pending; controlled provider proof is not live-provider acceptance. Other route/group names below remain proposed information architecture, not implemented endpoints.

## 3. P0: finish the connected admin experience

### P0.1 Shared login, logout and staff security

**Owner:** Noah for approved shared infrastructure/admin integration, coordinated with Kang En for normal-user flows. **Local status:** Google/OTP wiring and visible admin logout are implemented. Native compatibility and controlled connected proof passed their scoped gates; actual admin UI renewal passes its scoped connected gate, with the integrated full gate passed and frozen independent reviews pending. Admin MFA, staff enrollment and new security controls remain separate policy proposals.

Add the same login-method presentation and recovery paths to both admin entry points. Show safe signed-in identity, logout and access-denied recovery. Preserve current action safeguards. Complete the shared standard's Google/OTP and server-enforced administrator assurance tests. A primary-only Google/OTP session must not obtain protected data when the production-admin gate is enabled. Do not label the dashboard MFA-protected merely because the plugin or a redirect exists.

**Acceptance:** all three primary methods follow the same access boundary; revoked/demoted/expired/pending-factor sessions fail direct requests; logout clears UI and revokes the confirmed session; staff enrollment/recovery has an approved procedure. Production account provisioning remains separate.

### P0.2 Admin shell and operational overview

**Owner:** Noah. **Proposed group:** `/admin`, linking existing Accounts and Ingestion pages.

Add one coherent navigation shell with visible identity/security/logout and an overview of work awaiting action: pending merchant requests, pending review drafts, failed/recent imports and source availability. Every count must have an agreed query/status/window and come from a protected server projection; provide updated-at text and loading/empty/error states. Do not show fabricated sales, revenue, active-user or growth charts.

**Acceptance:** deep links open the selected queue; list/count semantics agree; unavailable sections say unavailable, not zero; mobile/keyboard navigation works; unauthorized users get no overview data.

### P0.3 End-to-end merchant-access handoff

**Owners:** Kang En request/status screens; Noah review/grants; Isaac protected merchant actions. **Gap:** the admin review side exists, but the entire user-to-merchant journey is not connected.

Connect `submitMerchantAccessRequest`, own-request status, the existing admin decision, then the authorized stall dashboard. Isaac uses `requireMerchantStall` inside the same transaction as each promotion write. Keep one-stall authorization and visible rejection/revocation status.

**Acceptance:** a USER requests stall A, Noah approves A, and the resulting merchant can manage A but not B. Pending/rejected/revoked access and tampered direct API requests fail. Concurrent permission changes retain the existing conflict behavior.

### P0.4 Approved demo fixtures and truthful readiness

**Owners:** Noah and Kang En; every feature owner supplies its records/tests.

Prepare an explicitly approved isolated dataset with a regular user, pending merchant, approved merchant, admin and two stalls. Record the exact connected test outcome, not only fixture-driven UI checks. Keep Google consent/callback setup, Resend delivery, database selection, schema application and deployment as separate readiness items. The earlier Atlas authentication/ping did not prove application-database selection or an available admin identity.

**Acceptance:** browser-to-API-to-disposable-database admin/login/merchant tests pass; the live-provider acceptance report is distinct; no real account credentials or session files appear in the public repository.

## 4. P1: complete administrative operations and security

### P1.1 Account security and session revocation

**Owners:** Noah administrative controls; Kang En shared lifecycle/security integration.

Add safe account security details: email-verification status and supported linked-method labels, excluding provider tokens. Provide confirmed, audited revoke-one/revoke-all session actions with a required reason and recent admin assurance. Use non-bearer identifiers in application responses; verify target ownership/actor permissions server-side. Do not expose raw Better Auth Account/Session records or rely on deleting a browser cookie for revocation.

**Acceptance:** revoked cookies fail next protected access across login methods; logs attribute actor/target/outcome; session-management actions cannot bypass the existing access policy. New audit action/schema contracts are reviewed explicitly.

### P1.2 Suspension, reinstatement and safe lifecycle

**Owners:** Noah controls; Kang En auth/lifecycle; domain owners enforce writes.

Research and agree a suspension state/reason/expiry and its persistence before adding controls. A role change is not a suspension policy. Suspension must block new password/Google/OTP sessions and protected actions by existing sessions, with audited reinstatement. Prevent self-lockout and agree how the final administrator is protected; the current self-role restriction does not prove a complete last-admin policy.

Hard account deletion remains unavailable until retention/anonymisation and affected ownership/evidence records have an agreed workflow. Do not enable a provider delete endpoint that bypasses this rule.

**Acceptance:** all auth methods and direct routes enforce suspension; concurrent disable/reinstate/access changes have defined outcomes; no implicit purge of deals, comments, grants or audit evidence.

### P1.3 Security events and audit investigation

**Owner:** Noah with Kang En's auth events. Add search/filter by actor, target, event, outcome and bounded date range; keep protected pagination and timestamp/correlation detail. Extend events for sessions, linking/recovery and reviewed security actions. Business audit and operational/security logging remain distinguishable.

**Acceptance:** no secret-bearing payloads; failed actions are not reported as completed mutations; audit write failure cannot leave a privileged action falsely recorded as successful. Auth failures use safe structured security events, not a forced PlatformAudit row that requires a nonexistent actor. Retention, storage/availability and privileged audit-read policy are documented.

### P1.4 Moderation handoff, not duplicate business logic

**Owner:** Damien for reports/moderation logic; Noah only dashboard integration. Give staff an agreed report/submission queue and read-only detail context, then call the owner's reviewed operations. Distinguish community reports, policy hiding and scheduled expiry. MODERATOR capability needs its own explicit policy and tests, not automatic access to all admin account controls.

**Acceptance:** pending reports map to actual owned records/actions; one-outlet reports cannot end unrelated chain-wide promotions; audit and stale decisions preserve the owner's business rules.

### P1.5 Integration health without a secret-management UI

**Owner:** Noah, coordinating Isaac's location/upload consumers and Kang En's email/auth.

Display protected readiness/failure classifications for Google, email, MoneyDigest and OneMap without credential values, connection strings or raw diagnostics. Reuse existing ingestion readiness first. Document publisher permission and default-off activation; this screen does not activate sources, write environment values, provision providers or schedule jobs.

**Acceptance:** missing configuration is distinct from upstream failure; checks are bounded/read-only where appropriate; no false 'connected' based solely on environment-key presence. Live credential changes and deployment remain separate approvals.

## 5. P2 / deferred

- Bulk account/role/grant actions only after per-target authorization, preview, bounded batches, versions, partial-failure semantics and audit are defined. Do not add bulk destructive controls for visual polish.
- CSV/audit export only after field minimisation, access, retention and spreadsheet-formula safety are reviewed.
- Scheduled imports only with a separately reviewed authenticated trigger, cooldown/lease/retry policy and deployment approval. A run-history screen is not a scheduler.
- Analytics only after the team defines genuine metrics and data sufficiency. Venue history remains Ashley's stretch scope.
- Staff invitation/recovery policy only through reviewed ownership/provisioning; no public role picker, magic admin email allowlist or self-promotion.
- No user impersonation, raw production database console, credential editor, unrestricted HTML/source rendering or permanent audit-delete button.

## 6. UX acceptance across every new screen

Keep the current BootstrapVueNext stack. Use searchable/filterable, bounded lists with clear details and relevant row actions. Privileged changes show target identity, affected scope, current version, required reason and a confirmation. Denials, empty queues, unavailable providers and stale records are separate states. No silent mutation retry, no optimistic 'approved' after an ambiguous failure, and no older detail response unlocking a newer selected record.

Use escape-by-default rendering. Preserve keyboard focus/error announcements, full-code paste, mobile layouts and session/access-loss clearing. Keep read-only views separate from risky actions. No library/framework migration is part of this roadmap.

## 7. Team execution split

- Kang En builds the canonical user auth/security flow; Noah reviews and integrates it into admin pages.
- Noah finishes the admin shell, queues, security controls and evidence; Kang En reviews.
- Kang En, Noah and Isaac connect merchant request, approval/grant and stall-scoped promotion writes together.
- Damien supplies reviewed moderation/report operations; Noah consumes them rather than implementing a second policy engine.
- Ashley/Allison consume shared auth for saved/contribution entry points while their public discovery pages remain independently usable.

Start with P0.1 and P0.3 to unblock connected journeys; build only the overview metrics their existing protected data supports. P1 proposals do not override member ownership, course-policy clearance or approvals for real systems.

## Research references

Reviewed 10 October 2026. Framework capabilities and design guidance informed these recommendations, not a claim that every named feature is needed for the MVP.

- [D1] OWASP authorization: `https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html`
- [D2] Better Auth admin capabilities/default roles: `https://better-auth.com/docs/plugins/admin`
- [D3] OWASP logging and sensitive-data exclusions: `https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html`
- [D4] IBM Carbon data-table guidance: `https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines`
- [D5] W3C accessible authentication: `https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html`
