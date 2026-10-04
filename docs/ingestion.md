# Ingestion and admin workstream

Owner: Noah. API work belongs under `apps/api/src/modules/ingestion` and `apps/api/src/trpc/routers/ingestion`; the web workstream is `apps/web/src/modules/ingestion-admin` with the route `/admin/ingestion`.

## Scope of this slice

- A bounded MoneyDigest WordPress import into the existing `ImportSource`, `ImportedPost`, `IngestionRun`, `Deal` and `DealSource` models.
- Plain-text extraction and conservative food-promotion parsing. Incomplete validity stays incomplete and needs review; no missing year or outlet is invented.
- Source-ID/content-hash idempotency, source leases, per-post failure isolation, safe run counters and a review queue.
- ADMIN-only import monitoring, manual runs, review and account listing, with the existing trusted-origin protection on mutations.
- OneMap address lookup using backend-only authentication, token renewal and bounded query caching.
- A Vue admin screen with real API wiring, loading, error, empty and forbidden states.

No public browse/map, community voting, account deletion, role-management workflow, cross-publisher automatic merge or deployment schedule is supplied by this slice. Role management and merchant access now live in the separate [platform-admin module](platform-admin.md). Other excluded features remain separate work. Address lookup results are candidates, not proof a particular merchant participates in a promotion.

## Source activation

The MoneyDigest transport uses a fixed endpoint on `https://www.moneydigest.sg`. It does not accept arbitrary submitted URLs. The ingestion API is disabled by default and needs both:

```dotenv
INGESTION_ENABLED=true
MONEYDIGEST_REUSE_APPROVED=true
```

Set these only after the team has confirmed permitted publisher reuse. A working public API does not itself establish reuse rights. Until then, use synthetic test fixtures, not a publicly copied seed archive. The flags do not configure deployment, create a cron job, promote a user or contact the publisher.

Scoobify is not the promised live feed. The earlier source audit found a newest API publication from 3 July 2025. The legacy `SCOOBIFY_POSTS_URL` is retained as a reference, not consumed by the new importer. `TELEGRAM_PREVIEW_URL` is also a legacy reference; there is no Telegram scraping implementation.

One run processes a bounded page. Run records expose fetched/created/updated/failed counts and a safe error code; they are aggregate observations, not a complete immutable per-post attempt history. Never paste provider error bodies, article HTML, tokens or passwords into logs.

## Identity and access

Use the existing Better Auth session and the current server-side database role. ADMIN is required for import administration and account listing; a frontend route or a client-supplied role is not authorization. Existing USER and MODERATOR responsibilities are unchanged.

No existing account is automatically promoted. Initial admin provisioning remains an explicitly approved development/production operation. Integration tests create isolated test users and set test roles only inside their disposable database.

Account listing returns an allowlisted projection, not password hashes, identity-provider tokens, sessions or the complete Prisma User model. Account deletion is intentionally outside this slice because retained contributions and audit relationships need a reviewed anonymisation/deletion policy.

## Source revisions and review

- Source identity is `(sourceId, externalId)`. Re-fetching the same source content must not duplicate a deal.
- Source hashes and processing state distinguish unchanged content from edited content.
- Every imported deal is pending review and retains source attribution. Source refresh must not rewrite a previously approved deal or its pinned `DealSource` snapshot silently.
- Review mutations include the content version the admin actually saw. A stale approval is a conflict, not permission to approve changed content.
- Approval and commercial validity remain separate. A date-only promotion end is stored as an exclusive UTC instant based on Singapore time. Unknown, invalid or expired validity cannot become a currently valid promotion by approval alone.
- No fixed location means no marker. A geocoder's first result, area hashtag or similar merchant name does not create a confirmed outlet association.

The existing schema and [database invariants](database-schema.md) remain canonical. Do not add raw MongoDB commands or duplicate the auth identity system.

## OneMap configuration

Credentials are optional until lookup is enabled and remain API-side:

```dotenv
ONEMAP_EMAIL=your-registered-onemap-account
ONEMAP_EMAIL_PASSWORD=your-onemap-account-password
```

Do not put either value in `VITE_*`, source files, test snapshots or browser storage. The adapter uses OneMap's official fixed host; the legacy `ONEMAP_BASE_URL` does not enable an arbitrary host override.

Search uses the raw access token in the `Authorization` header. Tokens are cached and renewed rather than stored as a manually maintained permanent secret. OneMap can return HTTP 200 and nonempty address results alongside a JSON authentication error, so both status and payload must be checked. The missing-token probe establishes this error behaviour, not successful authenticated access.

Include conspicuous OneMap data-source acknowledgement and the current Singapore Open Data Licence link in the eventual consuming UI. If OneMap basemap tiles are selected later, its separate basemap logo/attribution rules also apply. The existing OSM map renderer has its own attribution requirement.

## Local verification

Use a disposable MongoDB replica set, never the configured Atlas database. External WordPress and OneMap calls in automated tests use explicit synthetic provider fixtures. Real provider access and production activation remain separate checks.

From the repository root:

```sh
bun run db:generate
bun run format
bun run check:all
bun run audit
git diff --check
```

The focused API suite exercises authentication, current-role enforcement, origin rejection, import idempotency, safe failure reporting and review transitions. The provider suites cover malformed responses, timeout/error handling and token renewal. Frontend and Playwright tests exercise the UI with explicitly synthetic network fixtures; those fixtures are not claims of live imported deals.

## Integration points for teammates

- Isaac can reuse the authenticated OneMap transport on the API side for the submission location picker. It must retain an explicit user-selected outlet and a separate fallback when lookup is unavailable.
- Allison and Ashley should only show eligible published deals, with approved matching content/review versions, source attribution and the correct outlet/no-fixed-location representation.
- Kang En retains the user-facing account lifecycle and merchant-request screens. The ingestion screen keeps its read-only list; Noah's separate [platform administration](platform-admin.md) supplies role changes, request review, stall access and audit history.
- Scheduled import triggering, real publisher activation, production schema application and initial administrator provisioning require their own approval. A PR is not a production rollout.

## Reference material

- [WordPress posts API](https://developer.wordpress.org/rest-api/reference/posts/)
- [OneMap search](https://www.onemap.gov.sg/apidocs/search)
- [OneMap search-token verification](https://www.onemap.gov.sg/apidocs/docs/verifyingsearchapitoken)
- [OneMap authentication](https://www.onemap.gov.sg/apidocs/authentication)
- [Singapore Open Data Licence](https://www.onemap.gov.sg/legal/opendatalicence.html)
- The dated source-finalisation pack is retained at `project/content/data-source-finalisation-2026-10-02.md` in the local coursework project folder, outside this code repository; it is not a GitHub-hosted document.
