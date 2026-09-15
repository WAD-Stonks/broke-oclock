# Environment-variable inventory

Audited against the [team's six-workstream plan](https://docs.google.com/document/d/1Tj4s3xBzRgj3255Rf8mGqqgy_3idha1lteUk-BQzPFw/edit) and the actual runtime consumers. This document separates **working runtime configuration**, **planned deployment configuration**, and **reserved future feature configuration**. Adding a variable does not implement the feature or connect GitHub to Vercel.

## Where values belong

- Local: ignored root `.env`, using `.env.example` as the template. `bun run setup` creates a new file but deliberately does not overwrite an existing `.env`.
- Production runtime: **Vercel → broke-oclock-api → Settings → Environment Variables → Production**. Enter credentials directly there; keep them server-only. The web currently needs no environment variables.
- `.env.example` is public documentation, not a place to paste credentials. Its localhost/development values intentionally differ from production values.
- Existing GitHub `production` secrets/variables are retained, including previously entered DATABASE_URL, BETTER_AUTH_SECRET and VERCEL_TOKEN. They are not automatically copied to Vercel, and GitHub-to-Vercel secret synchronization is not planned.
- Tables below that still name GitHub describe retained deployment/future-feature inventory, not active Vercel runtime configuration. Never forward every secret to both projects or put credentials in `VITE_*`. Both projects are Git-connected with automatic deployments disabled; environment entry does not authorize deployment. See [Vercel setup](vercel-setup.md).

## Current API/database runtime

| Name | Vercel API placement | Production value / purpose |
| --- | --- | --- |
| NODE_ENV | Variable | `production` |
| DATABASE_URL | Secret | Atlas connection string with an explicit database name; never a local helper URL |
| BETTER_AUTH_SECRET | Secret | Random high-entropy secret of at least 32 characters; retain across redeployments |
| WEB_ORIGIN | Variable | Exact HTTPS frontend origin, no path or wildcard |
| BETTER_AUTH_URL | Variable | Public auth origin; with the checked-in frontend `/api` rewrite, use the frontend HTTPS origin, without `/api/auth` |
| PORT | Local only | Local API listener defaults to 3000; not added to the Vercel production environment |

Consumers: `apps/api/src/config.ts`, `apps/api/src/auth.ts`, `packages/db/prisma/schema.prisma` and the server-only Prisma client. The origin/proxy assumptions must be verified on the eventual deployed domains.

## Retained deployment-job inventory — inactive

| Name | GitHub placement | Purpose |
| --- | --- | --- |
| VERCEL_TOKEN | Secret | CLI/API deployment credential; deployment job only, not app runtime |
| VERCEL_ORG_ID | Variable | Account/team ID owning both projects |
| VERCEL_API_PROJECT_ID | Variable | API project's ID |
| VERCEL_WEB_PROJECT_ID | Variable | Frontend project's ID |
| API_ORIGIN | Variable | Reserved API origin; the current frontend rewrite uses the URL in `apps/web/vercel.json`, not this variable |

These retained names are not required for manual Vercel runtime environment entry. No deployment workflow or GitHub secret-sync job exists or is being added. Current `quality` CI tests/builds the app with disposable local configuration; it does not deploy, sync environment values or consume production secrets. API packaging and web rewrite/SPA fallback are prepared; see [Vercel setup](vercel-setup.md). Verify production credentials and resolve access protection before any separately approved deployment.

## Planned OneMap integration — Add Deal and ingestion

| Name | GitHub placement | Purpose |
| --- | --- | --- |
| ONEMAP_EMAIL | Secret | Registered OneMap account email |
| ONEMAP_EMAIL_PASSWORD | Secret | That OneMap account's password, not an unrelated email mailbox credential |
| ONEMAP_BASE_URL | Variable | `https://www.onemap.gov.sg` |

[Official authentication docs](https://www.onemap.gov.sg/apidocs/authentication) use email/password to obtain an expiring access token. A future server-side integration must acquire/cache/renew tokens; do not make a short-lived ONEMAP_TOKEN a manually maintained permanent production secret. No OneMap request is made by this starter. These are intended future server-side consumers, not frontend build variables.

## Planned channel ingestion

| Name | GitHub placement | Purpose |
| --- | --- | --- |
| SCOOBIFY_POSTS_URL | Variable | Verified WordPress.com posts endpoint, not an assumed self-hosted `/wp-json/` endpoint |
| TELEGRAM_PREVIEW_URL | Variable | Public ThisCounted HTML preview source |
| INGESTION_ENABLED | Variable | `false` until importer, permissions, idempotency and error handling are ready |
| CRON_SECRET | Secret | Reserved credential for a future authenticated scheduled-job endpoint |

The sources in `.env.example` need no WordPress username/password, Telegram bot token, Telegram API ID or private-account session. Public content still needs attribution/reuse review. The latest verified Scoobify post was from 2025: assess freshness before relying on it for current offers.

No cron job or handler is currently configured. On Vercel, the schedule belongs in deployment configuration (`vercel.json`), not a magical INGESTION_CRON env var; verify the selected plan's scheduling limits before promising 15–30-minute updates. A future trigger must reject missing/placeholder CRON_SECRET, not accept a shared sample value.

## Reserved trust/moderation settings — Community

All are GitHub **variables** initially set to `UNCONFIGURED`:

- DEAL_CONFIRM_THRESHOLD — confirmation count required for the agreed evidence scope.
- DEAL_DEAD_REPORT_THRESHOLD — dead-report count required to flag that scope.
- CONTENT_REPORT_THRESHOLD — inappropriate-content review/hiding threshold, after the team chooses that policy.

The team plan specifies configurable N/M values but does not choose them. No numeric defaults were invented. The feature implementation must decide scope, storage (env-backed defaults vs database-managed config), concurrency and strict validation before using these reserved names. No existing business logic reads them.

## Photo storage — UploadThing adapter and client helper

| Name | Vercel API placement | Purpose |
| --- | --- | --- |
| PHOTO_STORAGE_PROVIDER | Variable | `uploadthing`, recording the selected provider |
| UPLOADTHING_TOKEN | Secret | Server-only SDK token from the UploadThing app dashboard; enter directly when enabling uploads, otherwise leave unset |

Use the [official Express adapter](https://docs.uploadthing.com/backend-adapters/express) and its linked Vue client example. The server authorizes uploads with Better Auth; the browser uploads using the provider-issued URLs. Keep UPLOADTHING_TOKEN out of VITE_* and frontend bundles. MongoDB stores file keys/URLs. No Cloudinary, Supabase or S3 credentials are needed.

The API config loader consumes these settings. A missing/placeholder token disables `/api/uploadthing` with HTTP 503 without breaking auth or health checks. Configured uploads require an authenticated same-origin request and allow one JPEG/PNG/WebP up to 4 MB. The SDK verifies completion callbacks. The browser helper is exported from `@broke-oclock/storage/client`; `apps/web/src/lib/photo-upload.ts` is a thin compatibility re-export. Account/token setup, live-provider verification, deal attachment, persisted ownership and cleanup remain pending; see [photo upload setup](photo-storage.md).

## Pending choices / things not to add yet
- **Email verification/password-reset flows:** Resend transport and templates exist, but automatic Better Auth hooks and verified sender-domain setup remain unimplemented. Basic sessions work without email; see the Resend section below.
- **Web map:** Leaflet/public OSM tiles and browser geolocation do not need a Google Maps API key. Tile URL/attribution may stay in reviewed frontend configuration. Do not duplicate private OneMap credentials into VITE_* variables.
- **Venue/feed/search, comments, bookmarks:** reuse the database/auth boundary; they do not each need another external-service key.

## Completeness and safety checks

The inventory in `.env.example` includes current runtime, planned deployment and reserved feature keys. GitHub production contains those names except local-only PORT. Empty/UNSET secret examples and UNCONFIGURED decision markers are intentionally invalid, not working defaults. Do not enable planned features until their consumers validate real configuration.

The frontend currently requires **no VITE_* variable** and uses same-origin `/api/auth`, `/api/uploadthing` and `/api/trpc` clients. Vercel's ordinary Git integration cannot read GitHub Actions secrets automatically. Enter current server credentials directly in the Vercel API project's Production environment; do not copy deployment credentials into either application. GitHub-to-Vercel synchronization is not a remaining setup step.

## Resend email package

- `RESEND_API_KEY`: server-only secret; placeholder `UNSET` in GitHub `production` and `.env.example`.
- `EMAIL_FROM`: sender address on a verified Resend domain; placeholder `UNCONFIGURED` in GitHub `production` variables and `.env.example`.

The email package takes explicit configuration rather than reading process.env. Missing/placeholder credentials disable provider requests. No Better Auth email-verification or password-reset hooks, email endpoint or background sender are enabled; adding credentials alone does not turn those flows on. An API-side consumer must pass the validated configuration when email sending is intentionally integrated. No real email is sent during checks. Resend configuration can remain unset in Vercel until that integration is intentionally enabled; no secret synchronization is planned.
