# Team implementation plan

Everything below is a planned student-owned feature, not a claim that the starter implements it.

## 1. Browse and map

Leaflet centred on Singapore, OSM attribution, markers/clustering, DealCard, geolocation with denial fallback, category/status/valid-now filters and expiring-soon sort. Deals without fixed outlets belong in a separate list/banner, not invented coordinates.

Acceptance journey: load seeded map → apply filter → open matching deal. Check narrow viewport, no results and geolocation refusal.

## 2. Add deal

Title/description/category/type/validity form, OneMap autocomplete, drop-pin fallback, optional compressed image upload, validation, initial unverified state and owner-only edit/delete.

Acceptance journey: login → submit valid deal/photo → see unverified entry. Assert malformed dates and another user's edit/delete are rejected. Choose upload provider and limits before implementing uploads.

## 3. Verify and comments

One current vote per user/scope, vote changes, configurable confirmation/dead-report thresholds, freshness, comment create/delete-own and inappropriate-content reports.

Acceptance journey: vote → evidence changes → add/delete own comment. Verify duplicate votes, ownership and abuse handling. Decide outlet-specific vs deal-wide scope and distinguish auto-flagging from moderator removal.

## 4. Accounts and saved

Use the provided Better Auth integration for registration/login/logout; students own the actual UI, profile, submissions and bookmark features. Never add JWT/Supabase/Firebase as a second identity system without an explicit decision.

Acceptance journey: register → login → save deal → saved list → logout. Add unauthorized save checks and navigation redirects. Production email verification/reset requires a mail provider; it is not complete just because email/password login works.

## 5. Channel ingestion

WordPress REST + public Telegram preview import, original source IDs/URLs, emoji/date parsing, ambiguous raw text, OneMap caching, deduplication, bounded retries, review/admin status and non-overlapping scheduled runs.

Acceptance evidence: parser unit fixtures, edited/duplicate/malformed posts, bounded external calls and a failed import that does not discard the rest of the batch. Permission/licensing and source freshness must be checked before copying real post content into this public repo. Never guess a missing year, outlet or eligibility condition.

## 6. Venue pages and feed

Venue identity review, current/past deal views, newest/ending-soon/most-confirmed feed, merchant/area/category search and links both directions. Frequency statements require sufficient dated evidence; don't infer monthly promotion cadence from one post.

Acceptance journey: search merchant → open venue → see correctly scoped history, plus 'Everywhere' and empty states.

## Before feature coding

- Appoint schema/contract and deploy/README reviewers (no names assumed).
- Review [draft contracts](contracts.md), freeze an agreed first version, then implement vertical slices.
- Confirm storage provider, OneMap access, content-reuse permission, moderator roles and threshold policy.
- Decide a reliable way to support Prisma-only geospatial requirements before implementing radius queries.
- Build an attributed, permission-safe development seed dataset; the plan's '20 real deals' is a target, not fabricated work. Do not use old source posts as currently valid deals.
- Integrate into a deployed development environment at least every two weeks; deployment is not provisioned by this starter.
