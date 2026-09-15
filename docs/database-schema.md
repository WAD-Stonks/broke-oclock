# Database schema: approved foundation

## Scope and decisions

This change implements persistence structure, not the assessed product workflows. Source: [team plan](https://docs.google.com/document/d/1Tj4s3xBzRgj3255Rf8mGqqgy_3idha1lteUk-BQzPFw/edit), plus Noah's confirmed decisions in this discussion:

- Keep Prisma 6.19.3, MongoDB and Better Auth 1.7.5; no dependency upgrade or provider change.
- One `User.role`: `USER`, `MODERATOR`, `ADMIN`; default `USER`. No MEMBER or role array. Store it on Better Auth's existing User model, register it as a server-owned additional field, and forbid client input on signup/profile updates.
- USER submissions require review before public publication. Staff policy: MODERATOR reviews submissions/reports; ADMIN also manages roles/import administration. The role hierarchy is a future endpoint policy, not enforcement supplied by the database.
- Promotions support selected outlets, all outlets of a merchant, online, or other no-fixed-location use. Votes remain deal-wide, as in the team plan.
- No feature endpoints, permission-management endpoint, voting thresholds, parser, scheduler, seed data, provider calls or production database writes.

## Implementation plan and acceptance

1. Add auth role mapping and its real HTTP regression tests. Prove signup and profile updates cannot escalate privileges; legitimate profile changes still work.
2. Add the domain schema and regenerate the existing Prisma client. Exercise typed relations, defaults, uniqueness and transactions against a fresh disposable MongoDB replica set.
3. Update schema/ownership/AI-disclosure documentation. Run `bun run format`, `bun run db:generate`, `bun run check:all`, `bun run audit` and `git diff --check`; inspect the full diff before publication.

The canonical schema stays at `packages/db/prisma/schema.prisma`. Auth mapping is in `packages/auth/src/server.ts`; browser inference is in `packages/auth/src/client.ts`. Tests live under `apps/api/tests/integration/` and are permanent regression coverage for this repository. Use named arrow functions, extensionless aliases and public workspace exports, as documented in AGENTS.md.

## Model map

- **User / Session / Account / Verification:** existing Better Auth records; User gains a single defaulted role and domain back-relations. Account/session identifiers, password handling and cookie behaviour remain Better Auth-owned.
- **Merchant:** brand/business identity. Names are searchable, not unique identity proofs.
- **Venue:** a physical merchant outlet, address, area, latitude and longitude. Only resolved physical locations belong here; ambiguous imported addresses stay in ImportedPost. Coordinates are not deduplication keys.
- **Deal:** promotion text, category, offer type, terms, optional exact price in minor units/discount percentage, validity timestamps plus original wording, merchant/submitter, applicability, review metadata, publication time and soft deletion.
- **DealVenue:** explicit many-to-many outlet association, unique per deal/venue. Stores no votes: evidence is deal-wide.
- **DealVote:** one current ALIVE/DEAD vote per user/deal; update that record to change a vote. Timestamps allow freshness calculation. No cached vote totals or hardcoded thresholds.
- **Comment / Bookmark:** deal comments with soft deletion and unique user/deal bookmarks.
- **DealReport / CommentReport:** separate typed report targets with one report per reporter/target. Resolution metadata is independent of deal expiry or public visibility. Separate models avoid nullable polymorphic unique-index traps in MongoDB.
- **UploadedFile:** unique UploadThing file key, URL, MIME type, size, uploader and optional attached deal. Unattached uploads can be tracked without a fake deal; provider callbacks/ownership checks and cleanup are not implemented by this schema.
- **ImportSource:** unique provider/external source identity, original URL, disabled-by-default setting, optional cursor and lease metadata for a future scheduler.
- **ImportedPost:** unique source/external post ID, original URL/title/raw content, provider timestamps, fetch time, parse/review state and safe error classification. A source post may contain several deals. Store a content hash and the last successfully processed hash/time to distinguish changed content from completed processing; reset processing state when content changes.
- **DealSource:** unique deal/imported-post association. One deal can retain several source posts, and one source post can describe several deals. Each association pins the source content hash, raw-content snapshot and original URL used for that deal. Reimports update ImportedPost but must not silently overwrite these citations or moderator-approved deal content. Snapshot text is untrusted and subject to the same size/reuse limits as ImportedPost.
- **IngestionRun:** source, lifecycle timestamps/state, counters and safe error code. Lease fields and a run record do not themselves implement exclusivity, retries or idempotency.

## Distinct states

- `Deal.reviewStatus`: PENDING, APPROVED, REJECTED, HIDDEN. New records default PENDING. `publishedAt` is unset until publication. `contentVersion` starts at 1; `reviewedVersion` is unset until approval. A future browse query must require APPROVED, matching content/review versions, a publication timestamp and a non-deleted record. Owner changes to text, price, terms, dates, merchant, applicability or images must atomically increment contentVersion, reset to PENDING and clear reviewer/reviewedVersion/reviewedAt/publishedAt. Approval must compare-and-set the version that staff actually reviewed; a stale review must fail. These transitions still need student-authored API implementation.
- Commercial validity comes from `validFrom`/`validUntil`, not review status. Unknown dates remain unknown; preserve `rawValidityText`. Define dates as UTC instants with an exclusive `validUntil`; future parsing must interpret Singapore date-only terms deliberately, not invent years.
- Community verification is derived from DealVote plus explicit configurable policy. Approval is not proof that a promotion is still redeemable. No combined "verified/expired/hidden" status field.
- Report resolution is OPEN, RESOLVED or DISMISSED; filing a report does not automatically hide content.

## Invariants the schema cannot enforce

MongoDB has no foreign keys/check constraints here. Prisma relation metadata is not an authorization system and does not guarantee existence when raw IDs are assigned. Future API mutations must validate and use checked connects/transactions where needed:

- SELECTED_OUTLETS requires at least one DealVenue, all belonging to the deal's merchant. ALL_MERCHANT_OUTLETS requires a merchant and no selected-outlet rows. ONLINE/NO_FIXED_LOCATION have no outlet rows and must not create `(0,0)` markers. Model all-outlet promotions dynamically against that merchant's venues; explain that new venues will also match.
- Coordinates must be real and within latitude/longitude ranges. Venue matching needs review, not a unique name/proximity heuristic.
- USER_SUBMITTED deals require a real submitter; imported deals retain DealSource provenance. Staff sets review status/reviewer/publication fields, never client payloads.
- Validate date order, category vocabulary, numeric bounds and offer-type/amount consistency. Prices use integer minor units (default currency SGD); MongoDB's Prisma connector does not support Decimal. Percentage discounts are integers; display terms remain available for nonstandard offers.
- Attach only confirmed uploads owned by the acting user. Derive uploader identity and provider metadata server-side, not from a submitted URL. The existing uploader still permits one photo per upload request; this schema does not change that policy or persist callbacks automatically.
- Only authors delete their own comments/submissions; staff actions require server-side checks using the current database-backed session role. Never authorize using browser state or user-provided role values. Role changes require a separately reviewed admin workflow and auditing.
- Report targets, reviewer IDs and role eligibility must be checked at write time. Do not treat index uniqueness as permission to mutate someone else's record.
- Import leases require atomic acquisition, ownership-token comparison, bounded expiry and matching release. Cursors advance only under an agreed successful-processing policy; no scheduler is wired here. Per-post status and processedContentHash support resuming the latest snapshot. Historical per-run/post attempt logs and a complete immutable revision archive are deferred; aggregate run counters must not be presented as full replay/audit evidence.

## Deletion and privacy

Domain relations use explicit NoAction on delete/update to avoid cyclic/multiple-path cascades and accidental destruction of submitted content/evidence. This does **not** block dangling references at the database level. Use the supplied soft-delete fields for deals/comments/venues/merchants. Before enabling user deletion or physical purges, implement a reviewed transaction that deletes private bookmarks/uploads as appropriate and anonymizes retained contributions/review history; simply calling `user.delete` is not a safe account-deletion workflow. Existing Better Auth Session/Account cascade behaviour is preserved.

Raw imported text may contain HTML: treat it as untrusted, apply size limits and reuse permissions before storing, and never render it directly. Source URLs are attribution, not permission to fetch arbitrary hosts. Store safe error codes, not provider bodies, tokens or stack traces. Prisma models remain server-only; API DTOs must explicitly project allowed fields.

## Index and query strategy

Unique indexes enforce current user/deal votes and bookmarks, report target uniqueness, outlet associations, upload keys, source identities, imported external IDs and source/deal links. Supporting indexes cover public feed/review queues, owner submissions, merchant history, venue lookup, comment chronology, vote freshness and import review/run status. These are an initial query-oriented design, not a benchmark claim.

Geocoding reuse initially means finding an already-reviewed canonical Venue. There is no request-level geocoding cache, negative-cache policy or selected geocoding-provider adapter yet. The older plan mentions OneMap, but OSM/Leaflet is the confirmed map renderer, not a geocoder selection. Settle provider/retention/expiry rules before adding a cache.

Numeric latitude/longitude fields support bounded typed bbox filtering. They are **not** a MongoDB `2dsphere` index and do not provide scalable exact-radius search. Case-insensitive substring name search and vote-count sorting can still be expensive; measure and design a bounded query before shipping. No raw commands, direct-driver shortcuts or pretend geospatial support are introduced.

## Rollout

- Generate/validate locally without applying the configured application database. Integration tests push only to their own disposable replica set, never the existing DATABASE_URL.
- MongoDB uses `prisma db push`, not Prisma Migrate. No migrations directory or destructive push flags.
- `role @default(USER)` is additive. Prisma supplies the default when reading a missing field, but `db push` does not backfill old documents; filters can distinguish missing/null fields. Before a real deployment, inventory existing User documents with typed Prisma, confirm missing-role behaviour and explicitly approve any required backfill. Never overwrite an existing MODERATOR/ADMIN role. Explicit null/invalid stored roles require remediation rather than silent promotion.
- No existing user is promoted. Initial admin provisioning, role-management endpoints, deployment and application of this schema to Atlas remain separate approved operations.

## Sources and skill selection

Reviewed Prisma database-setup (MongoDB reference), Prisma Client API/CLI, Better Auth, repository-architecture and security guidance. Postgres/Supabase-specific schema advice does not apply to this MongoDB project. Intent discovery found package-owned tRPC guidance, but no Prisma/Better Auth package skill in the installed project; the installed Hermes skills and official docs supply the database guidance.

- [Prisma MongoDB connector and limitations](https://www.prisma.io/docs/orm/overview/databases/mongodb)
- [Better Auth additional fields and input ownership](https://better-auth.com/docs/concepts/database#extending-core-schema)
- [Better Auth Prisma adapter](https://better-auth.com/docs/adapters/prisma)

See [AI-use disclosure](ai-use.md): the schema and tests are AI-assisted and require team understanding/review; they are not claimed as student-authored feature implementations.
