# ADR 0001: shared authentication for users and administrators

Date: 10 October 2026
Status: Shared identity integration approved on 10 October 2026 and implemented locally, with final verification pending. MFA, explicit-only linking, shared recipient budgets and new audited security controls remain policy proposals, not runtime guarantees.
Owners: Kang En (authentication), Noah (platform administration). Reciprocal review remains unchanged.

## Context

The repository has one Better Auth factory/client, email/password cookie sessions, a server-owned default-USER role and protected account/ingestion modules. Normal-user account screens are unfinished. Adding separate staff authentication would duplicate identity/session/provider behavior and create mismatched recovery and authorization paths.

## Integration decision and separate policy proposals

Extend the existing shared system with Google authorization-code sign-in and Better Auth email OTP. Retain existing password login, native auth handlers and same-origin cookies. Share presentation/orchestration, not staff privileges. All new identities are USER; staff access is an independent fresh server-side check and merchant capability remains named-stall specific.

Recommended explicit linking, OTP onboarding/storage/limits and admin-factor assurance follow the [shared standard](../shared-authentication.md). The pinned two-factor plugin does not enforce OAuth/OTP challenges by default, so staff protection requires a tested server-side assurance design rather than just a login redirect. Do not introduce a parallel admin-plugin role mutation path around existing audited/versioned transactions.

## Alternatives considered

- Separate admin credentials/session service: rejected because it splits identity, recovery and access policy.
- Google-only or email-only login: does not meet the requested two additional methods and breaks existing compatibility.
- Implicit same-email account linking: simpler UX, but explicit ownership/linking is recommended for predictable staff-account handling.
- Dropping in the Better Auth admin plugin: evaluate only through deliberate role/schema/service integration; it is not an approved replacement for platform administration.

## Consequences and approval gates

Noah implements the approved shared provider/client/email infrastructure and admin integration; Kang En retains normal-user account/security screens and reciprocal review. The local scope includes shared UI, one-shot mail integration, linking/recovery and isolated tests without schema changes or external dependency upgrades. Possible factor/shared-rate/assurance persistence is deferred. This ADR does not enable providers or approve broader security policy. Actual credentials, database schema application, administrator provisioning, dependency changes and deployment require separate approval.

See [admin roadmap](../admin-dashboard-roadmap.md) for priorities, deferrals and owner handoffs. Automated tests use disposable databases and controlled provider boundaries; approved live acceptance is recorded separately.
