# Draft domain/API contract — team review required

The initial domain Prisma schema is now implemented; [database-schema.md](database-schema.md) is authoritative for the approved persistence decisions. This document remains a checklist for student-owned feature API contracts; no feature endpoints are implemented.

## Persistence decisions and remaining API work

- **Deal:** title, description, category, offer type, display terms, validity start/end (nullable), original validity text, original source identity/links, image reference, creator and timestamps.
- **Venue:** stable ID, merchant/outlet identity, normalized address and agreed coordinates. 'Same name + close coordinates' is a candidate match, not safe automatic identity proof.
- **Deal applicability:** approved modes are SELECTED_OUTLETS, ALL_MERCHANT_OUTLETS, ONLINE and NO_FIXED_LOCATION. DealVenue associates selected outlets. Do not represent everywhere as coordinates `(0,0)`.
- **Evidence:** vote/report type, author, timestamp and deal-wide scope. Use a unique constraint for each user's current vote in that scope. Thresholds remain explicit configuration decisions.
- **Moderation:** keep visibility/review state distinct from commercial validity and community evidence. 'Unverified', 'expired' and 'hidden' answer different questions.
- **Comment/Bookmark:** deal reference, author, timestamps; owner-only deletion; unique bookmark per user/deal.
- **Imported post:** source channel/site, stable external ID, original URL/text, fetch/edit time, parse state/errors and linked reviewed deal. Retain multiple sources rather than overwriting provenance.

## Proposed API namespace

The team plan uses `/deals`; use `/api/deals` consistently behind the app's API namespace when implementing it. The following are proposed, not existing routes:

- GET `/api/deals` — bounded pagination and approved bbox/radius/category/status/validity/sort filters.
- GET `/api/deals/:id`; POST `/api/deals`; PATCH/DELETE `/api/deals/:id` — owner/moderator policies explicit.
- PUT/DELETE `/api/deals/:id/vote` — current vote; votes are deal-wide; agree the input/output DTO before implementation.
- GET/POST `/api/deals/:id/comments`; DELETE `/api/comments/:id`.
- PUT/DELETE `/api/deals/:id/bookmark`; GET `/api/me/bookmarks`.
- GET `/api/venues/:id` and `/api/venues/:id/deals`.
- Admin-only import/review endpoints: design separately after moderator-role decision.

Agree request/response DTOs, validation schemas, ID encoding, timestamps, pagination and error shapes before connecting independently developed screens. Never expose complete User/Account/Session DB models. Return only fields the consumer needs.

## Geospatial constraint

Prisma MongoDB does not expose every native MongoDB geospatial operation through its typed client. This repository forbids raw queries by default. Bbox filtering on agreed numeric latitude/longitude fields can be a typed starting point, but exact radius/clustering scale and spatial indexes require an explicit design decision. Do not silently add raw MongoDB commands or fetch an unbounded collection and claim scalable search.
