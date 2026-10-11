# Shared authentication standard

Date: 11 October 2026. Source baseline: `941973b0acdc9f5d6c52a507d1135e994fb7dc28`.

**Status:** Noah approved the shared infrastructure and admin integration on 10 October 2026. The local implementation adds native Google/email OTP, shared admin sign-in/logout/recovery, protected operational overview and versioned outlet association. It also binds Google account admission to validated provider email and native link state through the existing ownership/session transaction fence. Native compatibility, consuming-UI sliding renewal and controlled connected-browser results are source-bound evidence, tracked in [the acceptance ledger](../tasks/plan.md). Final acceptance requires integrated checks and sequential independent spec and quality/security approval on the final source. Kang En retains normal-user account and security screens. MFA, explicit-only linking, shared recipient budgets and new audited security controls remain separate policy proposals. No production credentials, provider setup, schema application or deployment is authorized.

Related: [admin roadmap](admin-dashboard-roadmap.md), [decision record](decisions/0001-shared-authentication.md), [platform-admin handoffs](platform-admin.md), [environment inventory](environment-variables.md), [testing](testing.md).

## 1. Current foundation and gaps

Implemented in the source baseline:

- `packages/auth/src/server.ts`: shared Better Auth factory with Prisma/MongoDB, email/password enabled, exact trusted origin, origin/CSRF checks and cookie caching disabled.
- `packages/auth/src/client.ts`: one Vue Better Auth client, same-origin `/api/auth`, and inferred server-owned additional fields.
- `apps/api/src/auth.ts`: API configuration injection and a deliberately limited current-user projection.
- One `User.role`: `USER`, `MERCHANT`, `MODERATOR`, `ADMIN`. Default `USER`; role input is disabled. Platform administration checks current database-backed ADMIN access and preserves transactional/version safeguards.
- Admin pages share the existing email/password sign-in. Basic auth has disposable-database HTTP coverage.
- `packages/email` contains a server-only Resend transport and escaped link templates, not connected email-auth flows.

At the source baseline, Google/OTP wiring, email-auth integration and visible admin logout were missing. The completion branch now implements those shared/admin capabilities and controlled connected-browser password/OTP/Google journeys. A complete normal-user account and linking/security UI remains Kang En's work. Sending-domain setup, production administrator availability, live-provider login and enforced admin MFA have not been established. Credentials alone do not complete these features.

The repository pins Better Auth and its Prisma adapter to **1.7.5**. Live documentation can describe later releases. Critical linking, OTP and two-factor details were checked against pinned source and the installed public exports; the native regression suites exercise the installed implementation. Do not copy latest-only options, run an unpinned auth CLI, upgrade dependencies or apply an application database schema as part of this plan.

## 2. One identity system for every role

Required shared boundary:

1. Extend the existing auth factory and client. Do not introduce a second admin auth server, session store, cookie, user table, JWT-in-localStorage flow or custom Google token verifier.
2. Keep Better Auth's native `/api/auth/*` handler and SDK. Application REST calls continue to use Axios. Do not force auth into the REST envelope or Axios internals.
3. Google, email OTP and existing email/password authenticate the same canonical User. Authentication proves identity; it does not grant a role or stall capability.
4. New identities default to `USER`. No browser role input, Google profile/domain, email address, signup option or route name can grant `MERCHANT`, `MODERATOR` or `ADMIN`.
5. Use the existing shared client through `apps/web/src/lib/auth-client.ts`. Share presentation and auth orchestration between normal and admin screens, with different destinations and access checks, not duplicated provider configuration.
6. Preserve request-local cookie identity, fresh ADMIN checks, exact trusted-Origin mutation guards, permission fences, expected versions and no automatic mutation retries. Application GETs remain read-only; native OAuth callbacks retain Better Auth's protocol.
7. Anonymous application access returns 401 and authenticated insufficient access returns 403. Existing resource/conflict mappings remain intact. Better Auth retains its own error contract.

Do not add `SUPERADMIN`, role arrays or brand-wide merchant access. MODERATOR remains outside platform-admin pages until the owning moderation policy is implemented. Every feature enforces its own ownership/access on the server, not just through router visibility. [A7]

## 3. Required login methods

### Google sign-in

Configure `socialProviders.google` in the shared factory, using validated server-only `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. These are optional validated server-only API inputs in the local implementation. Missing or placeholder pairs leave Google unavailable; invalid supplied values fail with a credential-safe configuration error. Use the normal OAuth authorization-code redirect through Better Auth; the browser calls `authClient.signIn.social` with provider `google`. [A1]

Setup checklist:

- Create/review a Google Web application OAuth client and consent configuration. Use only basic sign-in identity scopes; this feature does not request Gmail, Drive, Calendar or offline data access.
- Register exact callbacks derived from `BETTER_AUTH_URL` plus `/api/auth/callback/google`. The callback is not the post-login page. Scheme, host, path and trailing slash must match the authorized URI. [A2]
- For the documented local API origin, the callback is `http://localhost:3000/api/auth/callback/google`. Production follows the approved public auth origin behind the frontend `/api` rewrite, not an arbitrarily chosen API-project URL.
- Validate provider email ownership through the supported pinned configuration. Do not invent a trusted email signal or promote by an email-domain match.
- Allow only reviewed same-origin post-login destinations. Reject external/protocol-relative return targets. Recheck admin access after callback before exposing protected content.
- Handle consent cancellation, configuration failure and account-linking refusal with safe UI messages. Do not print codes, tokens, provider responses or secrets.
- Keep previews disabled until isolated origins, callbacks, database and proxy settings are designed. Production provider setup and deployment require separate approval.

### Email OTP sign-in

Use Better Auth's `emailOTP` server plugin and `emailOTPClient` on the existing client. Connect `sendVerificationOTP` to the existing server-only email transport; add an escaped HTML/plain-text OTP template. Native operations are `emailOtp.sendVerificationOtp` with type `sign-in`, followed by `signIn.emailOtp`. These native methods are present in the shared local client. Runtime availability comes from the public auth-method projection, not from plugin presence alone. [A3]

The local native OTP configuration is explicit:

- `otpLength: 6`, `expiresIn: 300`, `allowedAttempts: 3`, `storeOTP: 'hashed'`, `resendStrategy: 'rotate'`.
- Codes are strings, retaining leading zeroes. Bind verification to the intended email and purpose. Consume successful codes and reject replay, expired codes, cross-purpose use and superseded codes.
- Permit verified first-time OTP onboarding with `disableSignUp: false`, but only as `USER`. An unknown identity entering an admin login may create an ordinary User after verification; it does not receive administrator access. There is no public admin-signup flow.
- Keep `sign-in`, `email-verification` and `forget-password` separate. A verification/check response alone is not an authenticated session.
- Do not assume older passwords survive first OTP ownership verification: pinned v1.7.5 removes a pre-existing unverified account's password and revokes its sessions when OTP proves ownership. Add a recovery explanation and regression test. [A3]

Rate/abuse policy is a proposed application requirement, not an existing guarantee: one send per recipient per 60 seconds, five sends per recipient per hour, an additional reviewed IP budget, and bounded verification attempts. Do not rely on a disabled button. The current factory has the general 100-per-60-second limiter but no explicit shared storage; Better Auth's default memory storage is not a distributed serverless limit. Choose/test a shared database or secondary-store design, including any schema change, before rollout. Review trusted proxy/IP extraction rather than trusting arbitrary forwarded headers. [A5]

Mail requirements: validate `RESEND_API_KEY` and `EMAIL_FROM` on the server; use an approved verified domain and test recipients. Domain ownership/verification is a separate operation. Provider acceptance does not establish inbox delivery. Keep bounded one-shot transport behavior and safe failures; never automatically retry an ambiguous send. [A6]

The UI needs a change-email path, visible resend cooldown, recoverable invalid/expired-code states, a generic account-existence response, provider-unavailable handling and no false 'email sent' success. Use a labelled single text input with numeric input mode and `autocomplete='one-time-code'`; preserve full-code paste and keyboard operation. Password fields support password managers and paste. [A9]

### Existing email/password

Retain the current method for compatibility. Complete registration, verification and password recovery alongside OTP, using Better Auth-owned tokens and handlers. Recommended normal-user verification UX is OTP-based; ensure signup sends one purpose-specific message, not duplicate link/OTP emails. A recovery OTP must not be usable as a sign-in or admin step-up code. Do not silently change password policy, session lifetimes or existing accounts. Explain the unverified-account transition described above.

## 4. Account linking and recovery

Current local policy permits native implicit Google linking only with provider email proof and existing local email verification. Accepted native create-user/link-account validation stores a single-use email proof keyed by the actual public Request object, not shared auth context or browser input. Explicit redirects also retain the natively validated link-state email and user ID. Authoritative local email must match that provider proof using pinned lowercase-only comparison, both during validation and before account admission; whitespace is not trimmed. Returning sign-in never mints account-creation proof, and missing, foreign or consumed request proof fails closed.

Pinned 1.7.5 direct `linkSocial` ID-token linking does not invoke `validateUserInfo` itself. Its Google before-hook therefore uses the public native `verifyProviderIdToken` and configured provider's `getUserInfo`, then the same application validator. The original native route still performs its own verification and policy. This does not introduce a custom token verifier, parse OAuth state again, change provider configuration or replace the native endpoint.

A private single-use native-hook stamp binds account insertion to the normalized provider-proven email, exact raw authoritative local email, verified owner and exact current explicit session. The adapter checks those bindings before meaningful conditional timestamp writes and inserts the native account within the same real transaction, reusing the native first-Google transaction when present. Failure or conflict rolls back insertion and its touches without retry. The stamp cannot arrive through JSON and is removed before persistence; roles, platform versions, session creation and expiry are not changed. Controlled native tests cover still-verified email substitution before validation, between validation and the hook, and after stamping, plus request-proof isolation, ID-token compatibility, genuine Mongo conflict and rollback. Later revocation of a session does not retroactively unlink an already authorized committed Google credential.

Separate policy proposal: `account.accountLinking.disableImplicitLinking: true`. If adopted, same-email Google sign-in to an existing unlinked identity returns `account_not_linked`; authenticated users explicitly link Google using `linkSocial`. This proposal is not enabled by the completion branch. First-time Google onboarding remains possible. [A4]

Shared UX: sign in through the existing account method, establish recent ownership, then link Google from account security settings. For staff, require the administrator assurance below before linking/unlinking a login method. Never merge users or move bookmarks/deals/grants by an email-string comparison. Show a safe linking explanation; do not create a duplicate identity to hide a refused link.

Reject a provider account already attached to another User. Preserve the canonical User ID, current role, submissions, bookmarks and stall grants. Do not allow removal of the final usable login/recovery method. Account-email changes and staff factor recovery need a separate reviewed ownership flow, not a profile-edit field bypass.

## 5. Sessions, logout and administrator assurance

Shared session requirements:

- Keep same-origin HttpOnly cookie authentication under Better Auth. Do not put session tokens, OAuth tokens or OTPs in browser storage, URLs, logs or application DTOs.
- Provide visible logout on normal and admin screens through the native `signOut` operation. Clear protected UI/cache immediately; only report server logout after confirmation. On timeout, offer recovery without claiming the server session was revoked.
- Re-fetch server access after login, callback, relevant role changes and authorization failure. Remove protected data on expiry/demotion; cached client roles cannot authorize recovery.
- Native session GETs are read-only with deferred refresh. AdminSessionControls uses the pinned Vue session atom to perform trusted-Origin POST sliding renewal inside the same generation-fenced refresh, before probing current identity. The atom's data never authorizes access. Native errors fail closed; late renewal after logout or disposal cannot start a fresh identity probe.
- Add a self-service session/security view using supported native methods. Administrative session revocation is a separate audited capability; expose only a safe projection and non-bearer identifiers in admin REST responses.

**Recommended production-admin gate:** the same three primary login methods, followed by authenticator-app TOTP or a deliberately approved stronger factor, verified enrollment, recovery codes and recent step-up for role/grant/revocation or auth-setting changes. Email OTP used as the primary login is not an independent second factor.

**Pinned compatibility warning:** v1.7.5's two-factor plugin does not gate OAuth/social or email OTP by default. `allowPasswordless: true` permits factor enrollment/management for non-password accounts; it does not enforce second-factor sign-in. Adding the plugin or redirecting the UI does not close the server authorization gap. [A8]

Before accepting a future MFA-enforced production-admin policy:

- Design server-held session-bound assurance, checked by every admin read and write, not a client boolean. Unchallenged or pending sessions must not obtain protected data by calling REST directly.
- Bind assurance to the current identity/session; expire it on logout, session revocation, factor reset and relevant security/access changes. Proposed recent-action age: five minutes, based on completed step-up, not session refresh time.
- Preserve existing transactional role/version checks inside mutations after the assurance check. Demotion must deny an otherwise valid factor/session.
- Verify TOTP enrollment before enabling it; protect factor secrets/QR data and recovery material. Generate QR locally, not through a third-party QR URL. Recovery codes are one-use and never included in team demo documentation.
- Review the required TwoFactor/User/schema and session-assurance persistence changes separately. All verification runs use disposable replicas. No automatic ADMIN provisioning or database push to Atlas.

A primary-only admin login is not described as MFA-protected. This production gate is a recommendation to review, not current behavior.

## 6. Team implementation handoff

- **Kang En, reviewer Noah:** shared auth factory/client extension; normal registration/login/logout, Google/OTP, email verification/recovery, account linking and self-service security UI. Own the common session/access contract.
- **Noah, reviewer Kang En:** reuse that contract in admin sign-in/logout and server-backed access recovery; admin assurance integration, audited account/security actions, admin connected tests and roadmap.
- **Isaac, reviewer Damien:** consume verified identity; preserve transactional `requireMerchantStall` checks for each promotion write. Neither Google nor OTP nor MERCHANT alone grants a stall.
- **Damien, reviewer Isaac:** authenticated vote/comment/report writes and current own-record/moderation checks. Do not derive staff privileges from browser roles.
- **Ashley, reviewer Allison; Allison, reviewer Ashley:** anonymous discovery remains available; save/contribute actions use the shared login destination and revalidated session. Do not build a second auth client.

Exact ownership follows the published README and shared proposal. Assurance/rate/linking recommendations are additions for joint review, not reassignment of other members' work.

## 7. Implementation order and acceptance

1. Joint review of this standard: account linking, OTP onboarding/limits, verification/recovery and admin-factor policy.
2. Extend validated server configuration and shared native auth, with typed browser inference. Inspect any pinned CLI/schema output locally, then agree the diff. No production push or dependency upgrade.
3. Implement common login and account security UI, then wire both admin routes to the same implementation. Preserve existing admin denial/stale/duplicate-submit behavior.
4. Add protected admin assurance and audited security capabilities. Only then call privileged Google/OTP administration ready.
5. Exercise actual HTTP/auth/database behavior with a disposable MongoDB replica, controlled OAuth/mail boundaries and labelled browser fixtures. Separately approved Google/Resend acceptance and connected browser tests precede deployment.

Required regressions:

- Existing password auth/session tests stay green; signup/profile input cannot set privileged roles.
- First Google and OTP users are USER; returning/linking methods preserve one User ID and owned records. Verify protected additional fields on all signup variants.
- Correct Google callback/session; state/tampering/unverified-email/cancel/refused-link/hostile-return-path cases fail safely. A forged browser role cannot open admin endpoints.
- Wrong, expired, consumed, superseded and cross-purpose OTPs fail; attempt limits, recipient throttles and concurrent redemption work. No real mail in automated tests.
- First OTP verification of an existing unverified account exercises password removal, old-session revocation and recovery.
- OTP/email failures never produce a false signed-in/sent state or leak account existence/secrets.
- Logout expires access; timeout is distinguished from confirmed revocation. Session expiry/demotion clears protected UI and rejects direct requests.
- Password, Google and OTP each pass the current fresh ADMIN/revocation boundary. If the separate MFA proposal is adopted, add assurance tests proving primary-only, pending-factor and expired-assurance sessions cannot bypass direct REST guards.
- Merchant access still requires the correct active grant; user ID comes from the cookie, and changing route/body/stall values cannot escape scope.
- Full-code paste, leading zeroes, keyboard/error focus, responsive screens and password-manager support work.

Future implementation gates follow [testing](testing.md): format, schema generation/validation, typecheck, all unit/integration/browser/build checks and the existing audit policy. Controlled native and connected-browser Google/OTP proof is recorded separately from final consuming-UI acceptance; neither proves MFA or live-provider readiness. Live credentials, staff provisioning, schema application and deployment need their own approvals.

## Research references

Reviewed 10 October 2026. Sources describe framework capabilities; the policy choices above are team design recommendations. Official pinned-tag documents were checked through GitHub API for OTP, linking, rate limits and two-factor behavior.

- [A1] Better Auth Google provider: `https://better-auth.com/docs/authentication/google`
- [A2] Google web-server OAuth, exact callback matching: `https://developers.google.com/identity/protocols/oauth2/web-server`
- [A3] Better Auth email OTP, including v1.7.5 source: `https://better-auth.com/docs/plugins/email-otp`; `https://github.com/better-auth/better-auth/blob/v1.7.5/docs/content/docs/plugins/email-otp.mdx`
- [A4] Better Auth account linking, including v1.7.5 source: `https://better-auth.com/docs/concepts/users-accounts`; `https://github.com/better-auth/better-auth/blob/v1.7.5/docs/content/docs/concepts/users-accounts.mdx`
- [A5] Better Auth rate-limit storage, including v1.7.5 source: `https://better-auth.com/docs/concepts/rate-limit`; `https://github.com/better-auth/better-auth/blob/v1.7.5/docs/content/docs/concepts/rate-limit.mdx`
- [A6] Resend verified domains: `https://resend.com/docs/dashboard/domains/introduction`
- [A7] OWASP authorization: `https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html`
- [A8] Better Auth two-factor enforcement, including v1.7.5 source: `https://better-auth.com/docs/plugins/2fa`; `https://github.com/better-auth/better-auth/blob/v1.7.5/docs/content/docs/plugins/2fa.mdx`
- [A9] W3C accessible authentication: `https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html`
