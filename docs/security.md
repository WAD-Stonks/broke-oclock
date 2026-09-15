# Security baseline and known limitation

## Threat boundaries

Browser → API: input validation, exact CORS/trusted origins, real session verification, response field allowlists and security headers. Feature record ownership/moderation is not implemented yet and must be enforced server-side.

API → MongoDB: typed Prisma queries and server-only database configuration. Public source HTML/photos → application: imported text is untrusted and content-reuse permissions are separate from technical accessibility. No importer or uploader is enabled by the starter.

Local secrets are generated into mode0600 ignored `.env`; tests use disposable random credentials/databases. Public repository code contains no real accounts. Better Auth explicitly retains origin/CSRF checking in tests as well as normal runtime, rather than relying on its NODE_ENV=test defaults.

## Dependency audit exception

The unfiltered initial audit has ONE remaining high advisory:

- `GHSA-ggr8-5vv4-36mx`: deepmerge-ts7.1.5 stack exhaustion on recursive object graphs. Dependency path: development Prisma CLI6.19.3 → @prisma/config6.19.3 → deepmerge-ts7.1.5. Upstream pins it; the patched8.x is a major override, not applied silently.
- Source inspection: `@prisma/config/dist/index.js`, `loadConfigTsOrJs`, imports deepmerge as the c12 local configuration merger. Remote/extended/package.json configuration loading is disabled there. This repo has no Prisma JS/TS config file and exposes no request-controlled objects to that merger. The application uses generated Prisma Client, not this CLI configuration path.
- Disposition: narrowly ignored in `bun run audit`/CI, NOT described as patched or a clean raw audit. `bun audit` still reports it. Review when Prisma6 releases a compatible fix, before introducing executable Prisma config, and before deployment. Do not expand the exception to unrelated advisories.
- Other initial findings were addressed with compatible Prisma6.19.3 and Vitest4.1.11 patch upgrades and re-verification.

No broad audit disablement, forced major override or Prisma7 upgrade is used. Prisma7 lacks the selected MongoDB support. A passing exception-aware audit is not proof of production security.

## Before production

Choose and test email verification/reset delivery, moderator authorization, abuse limits, upload policy, TLS/cookie/origin settings, deployment bind address, real DB credentials/backups and source/provider terms. The API defaults to loopback; do not simply expose the unauthenticated local MongoDB helper. Never deploy test fixtures or a fake currentUser.
