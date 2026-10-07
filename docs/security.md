# Security baseline and known limitation

## Threat boundaries

Browser → API: input validation, exact CORS/trusted origins, real session verification, response field allowlists and security headers. Platform administration and ingestion enforce current ADMIN roles server-side. Merchant promotion and other feature ownership checks must still be integrated in their own endpoints; the platform-admin capability helper is not automatic protection.

API → MongoDB: typed Prisma queries and server-only database configuration. Public source HTML/photos → application: imported text is untrusted and content-reuse permissions are separate from technical accessibility. No importer or uploader is enabled by the starter.

Local secrets are generated into mode0600 ignored `.env`; tests use disposable random credentials/databases. Public repository code contains no real accounts. Better Auth explicitly retains origin/CSRF checking in tests as well as normal runtime, rather than relying on its NODE_ENV=test defaults.

## Dependency audit exception

The unfiltered initial audit has ONE remaining high advisory:

- `GHSA-ggr8-5vv4-36mx`: deepmerge-ts7.1.5 stack exhaustion on recursive object graphs. Dependency path: development Prisma CLI6.19.3 → @prisma/config6.19.3 → deepmerge-ts7.1.5. Upstream pins it; the patched8.x is a major override, not applied silently.
- Source inspection: `@prisma/config/dist/index.js`, `loadConfigTsOrJs`, imports deepmerge as the c12 local configuration merger. Remote/extended/package.json configuration loading is disabled there. This repo has no Prisma JS/TS config file and exposes no request-controlled objects to that merger. The application uses generated Prisma Client, not this CLI configuration path.
- Disposition: narrowly ignored by `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml`, used by `pnpm run audit`/CI. This is NOT patched or a clean raw audit. Direct `pnpm audit` also reads that exception; to inspect an unfiltered audit, remove only that configuration in a disposable copy and run `pnpm audit --audit-level=high` there. Review when Prisma6 releases a compatible fix, before introducing executable Prisma config, and before deployment. Do not expand the exception to unrelated advisories.
- Other initial findings were addressed with compatible Prisma6.19.3 and Vitest4.1.11 patch upgrades and re-verification. During pnpm migration, the audit exposed `GHSA-g2v6-rqmx-r4w6` in `@vue/server-renderer`; Vue and workspace peer minimums were patched to 3.5.42 rather than adding another suppression.

No broad audit disablement, forced major override or Prisma7 upgrade is used. Prisma7 lacks the selected MongoDB support. A passing exception-aware audit is not proof of production security.

## Install-time code execution

`pnpm-workspace.yaml` sets `ignoreScripts: true` and `sideEffectsCache: false`. Root and dependency install hooks do not execute, and prebuilt side-effect caches are not reused. Generate Prisma explicitly with `pnpm run db:generate`; MongoDB test binaries are obtained by the explicit disposable-test runtime. No broad lifecycle allowlist or public hoisting is enabled. The Vercel API build separately obtains exactly `bun@1.4.2` using `pnpm dlx --allow-build=bun`; that explicit, isolated runtime bootstrap permits only the Bun installer. It does not relax workspace install policy. See [package-manager policy](package-manager.md).

## Platform administration

Role/request/grant mutations recheck the administrator inside a fenced transaction, compare expected versions and write audit events atomically. Self-role changes and duplicate grants are refused. Demotion revokes merchant grants and invalidates stale pending requests. The UI is not the authorization boundary.

Audit history has no API update/delete operations, but is not tamper-proof against direct database access. The shared permission fence prioritizes correctness and may become a contention point under load; no throughput claim is made. No account deletion, initial admin provisioning or live schema application is included. See [platform-admin contracts and handoffs](platform-admin.md).

## Before production

Choose and test email verification/reset delivery, moderator authorization, abuse limits, upload policy, TLS/cookie/origin settings, deployment bind address, real DB credentials/backups and source/provider terms. The API defaults to loopback; do not simply expose the unauthenticated local MongoDB helper. Never deploy test fixtures or a fake currentUser.
