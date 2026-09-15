# Integration decisions and official sources

Domain integrations remain planned. UploadThing has an authenticated adapter/browser helper, WordPress.com has a typed read-only transport, and Resend has fail-closed email infrastructure/templates; the starter does not scrape channels, schedule jobs, implement deal submission or provision external accounts.

## Maps and location

- [Leaflet](https://leafletjs.com/reference.html): map UI. [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/): visible attribution, correct HTTPS tile URL, referer/caching requirements, no bulk download. OSM's public tile service is best-effort, not unlimited hosting.
- [OneMap API docs](https://www.onemap.gov.sg/apidocs/): Singapore address search/geocoding. Register and confirm the required credentials/access policy before implementation. Keep provider credentials server-side and debounce/cache requests. Do not assume unauthenticated unlimited access.
- A meaningful OneMap/WordPress API integration should satisfy the course's external-API requirement; a public HTML scraper alone does not. Check the final use with the instructor.

## Ingestion corrections to the team draft

- WordPress varies by host. The verified Scoobify endpoint is `https://public-api.wordpress.com/wp/v2/sites/scoobifydaily.com/posts`, not an assumed `/wp-json/wp/v2/posts` path on every site. On the setup check, the newest returned post was dated 2025-07-03. This is NOT proof of a fresh current-deal supply. Re-evaluate source suitability before depending on it.
- Public Telegram previews such as `https://t.me/s/thiscounted` are HTML, not a Telegram Bot API history endpoint. Fetch server-side with permission-aware reuse, attribution, stable channel/message IDs, bounded rate/backoff and edited-message handling.
- Emoji structure is helpful but not a guaranteed schema. Keep raw text, parsing errors and review state. Source dedupe and promotion dedupe are different; merchant/date overlap is a candidate match, not sufficient proof of equivalence.
- Public availability is not permission to copy photos/full text into this public repository. Keep fixtures minimal, attributed and authorized; synthetic edge fixtures should be labelled synthetic. Never publish Telegram credentials or private-channel data.
- Do not enable a cron job until the parser, source-policy review, idempotency and failure handling are tested. Team-proposed polling intervals are design choices, not published rate limits.

## Storage and deployment

Photo storage uses **UploadThing**, wired through a generic authenticated SDK adapter and browser helper. Use its [Express adapter](https://docs.uploadthing.com/backend-adapters/express) with the linked Vue client example. The API owns the server-only `UPLOADTHING_TOKEN`; `PHOTO_STORAGE_PROVIDER=uploadthing` records the provider decision. Auth remains Better Auth: validate the session before issuing upload permission, enforce image types/size/count and verify ownership when attaching or deleting a file. Store the resulting file key/URL in MongoDB, not the image binary. Client-side compression and orphan-file cleanup remain implementation work.

The [free plan](https://uploadthing.com/pricing) currently includes 2 GB shared across apps; private files and region selection are paid features. Treat free-tier deal images as public, not suitable for sensitive documents. No UploadThing account is provisioned by this change. The SDK endpoint and client helper are implemented; a real token and live-provider verification are still required. See [photo upload setup](photo-storage.md). Cloudinary/Supabase/S3 credentials are not needed.

Deployment should preferably serve the SPA and `/api` under one site, with HTTPS and reverse proxy rules. Otherwise configure explicit origin/cookie policy and test it in the actual browser. Vite's dev proxy is not production infrastructure. Database/user secrets belong in the hosting platform, never in `VITE_*`.

## Stack references

- [Vue quick start](https://vuejs.org/guide/quick-start.html) · [Vue + TypeScript](https://vuejs.org/guide/typescript/composition-api.html) · [Vue Router](https://router.vuejs.org/guide/)
- [tRPC Express adapter](https://trpc.io/docs/server/adapters/express) · [framework-independent typed client](https://trpc.io/docs/client/vanilla/setup) · [Zod](https://zod.dev/)
- [BootstrapVueNext setup](https://bootstrap-vue-next.github.io/bootstrap-vue-next/docs) · [Resend send API](https://resend.com/docs/api-reference/emails/send-email)
- [TypeScript handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Vite](https://vite.dev/guide/) · [Vite environment variables](https://vite.dev/guide/env-and-mode) · [Bootstrap + Vite](https://getbootstrap.com/docs/5.3/getting-started/vite/)
- [Express routing](https://expressjs.com/en/guide/routing/) · [middleware](https://expressjs.com/en/guide/using-middleware/) · [CORS](https://expressjs.com/en/resources/middleware/cors/)
- [Prisma MongoDB compatibility](https://prisma.io/docs/orm/v7/core-concepts/supported-databases/mongodb): use compatible Prisma 6.19, not Prisma7 PostgreSQL examples. MongoDB uses `db push`, not Prisma Migrate; replica sets are required for transactions.
- [Better Auth installation](https://better-auth.com/docs/installation) · [Express](https://better-auth.com/docs/integrations/express) · [Prisma adapter](https://better-auth.com/docs/adapters/prisma) · [Vue client](https://better-auth.com/docs/concepts/client) · [email/password](https://better-auth.com/docs/authentication/email-password) · [security](https://better-auth.com/docs/reference/security)
- [Playwright](https://playwright.dev/docs/intro) · [test practices](https://playwright.dev/docs/best-practices) · [auth testing](https://playwright.dev/docs/auth)
- [Vitest](https://vitest.dev/guide/) · [Vue Test Utils](https://test-utils.vuejs.org/guide/)
- [Bun](https://bun.sh/docs) · [Biome](https://biomejs.dev/guides/getting-started/)
- [Local MongoDB test helper](https://typegoose.github.io/mongodb-memory-server/docs/guides/quick-start-guide/)
