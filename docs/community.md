# Community verification, comments and reports

Owner: Damien. Deal-edit integration reviewer: Isaac. This implementation is AI-assisted; see [AI disclosure](ai-use.md).

## Local demo

Run the local MongoDB replica set and apps, apply the Prisma schema to the verified **local** database, then seed the synthetic deal if needed:

```sh
pnpm --dir packages/db run push
pnpm run seed:community-demo
```

Open `/community-demo` in development. The seed creates deal `da0000000000000000000001` and a two-outlet deal `da0000000000000000000002` only when absent; it never resets existing votes, dates or deal data. Both were submitted by `tester1`, so `tester1` can comment and report but cannot verify them. `tester2` can vote. Select **Load synthetic two-outlet deal** to try outlet controls. Every fixture is labelled synthetic and represents no real promotion. The demo route is excluded from production builds. `/admin/community` is the staff report queue and relies on server-side role checks.

## Public and authenticated API

All writes require an existing Better Auth session and trusted Origin. The server derives the actor from the session. Responses containing personalised state use `private, no-store`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/deals/:dealId/community` | Whole-deal status, outlet summaries, revision, current evidence and eligibility. |
| GET | `/api/community/summaries?ids=id1,id2` | Bounded card summaries for 1–20 deal IDs; hidden IDs are omitted. |
| PUT | `/api/deals/:dealId/vote` | Whole-deal evidence. Body: `{ value, expectedVersion, reconfirm? }`. |
| PUT | `/api/deals/:dealId/outlets/:venueId/evidence` | Evidence for one applicable outlet; same body. |
| GET | `/api/deals/:dealId/comments?limit=20&cursor=...` | Public, newest-first comments. |
| POST | `/api/deals/:dealId/comments` | Comment with trimmed `body`, optional `venueId`, and client UUID `requestKey`. |
| DELETE | `/api/deals/:dealId/comments/:commentId` | Author-only soft deletion. |
| POST | `/api/deals/:dealId/reports` | Report deal content. |
| POST | `/api/deals/:dealId/comments/:commentId/reports` | Report a visible comment. |
| GET | `/api/admin/community/reports` | Staff-only open report queue. |
| POST | `/api/admin/community/reports/:kind/:reportId/review` | Staff-only resolve/dismiss, with optional explicit hide. |

Shared schemas and types are exported from `@broke-oclock/contracts/community`; browser requests use `api.community.*` in `@broke-oclock/api-client`. No frontend request may select its own author or reporter ID.

`aliveCount` and `deadCount` in a community summary are **qualifying evidence** for the current revision, current scope and freshness window from independent users. `recordedAliveCount` and `recordedDeadCount` are all persisted whole-deal votes, including old revisions; they are diagnostics and must not be used for badges or sorting. `status` is one of `UNVERIFIED`, `CONFIRMED`, `REPORTED_ENDED` or `DISPUTED`. Scheduled validity is a separate field. Outlet statuses do not change the whole-deal status.

Default policy values are 72 hours, 3 independent ALIVE confirmations, 2 independent DEAD reports, 24 hours before explicit same-value reconfirmation, and 3 distinct open content reports for queue priority. The API config reads `COMMUNITY_EVIDENCE_WINDOW_HOURS`, `DEAL_CONFIRM_THRESHOLD`, `DEAL_DEAD_REPORT_THRESHOLD`, `COMMUNITY_RECONFIRM_HOURS` and `CONTENT_REPORT_THRESHOLD`. Every value must be a positive integer up to 1000. `UNCONFIGURED` uses the documented default. Report priority never automatically hides content.

Evidence stores the server's `observedAt` and the reviewed deal's `contentVersion`. Legacy votes with no proven revision/observation do not qualify. Same-value repeats leave the timestamp unchanged; an explicit reconfirmation before the configured interval returns 409. Changed values and new revisions update one current record per user/scope. A stale `expectedVersion` returns 409. The deal row is written in the evidence transaction so a concurrent editor writing that row conflicts; future deal-edit endpoints must increment `contentVersion`, invalidate approval and write the deal row in their own transaction.

The submitter cannot contribute to any scope. Active `StallGrant` holders cannot contribute to their managed outlet, or to the whole promotion if they manage any participating outlet. For a merchant-linked `ONLINE` or `NO_FIXED_LOCATION` deal, an active grant on any of that merchant's current outlets also excludes the manager from the whole-promotion threshold, even though the deal has no outlet evidence. A `MERCHANT` role without a relevant active grant is insufficient for exclusion. The threshold calculation rechecks grants, so an existing vote ceases to qualify if its author becomes a manager. Owners and managers can still comment.

Outlet evidence is valid only for current participating outlets: `DealVenue` for `SELECTED_OUTLETS`, or current merchant venues for `ALL_MERCHANT_OUTLETS`. `ONLINE` and `NO_FIXED_LOCATION` deals have no outlet evidence. Deal reports address content quality; availability feedback uses evidence endpoints.

Comments are flat text, 1–1000 trimmed characters, with optional outlet context. The browser renders text without HTML. Soft-deleted or hidden comments disappear from public lists. A `requestKey` makes repeated creation requests return the same comment; a key reused with different content returns 409. Each account can report a deal or comment once. Duplicate reports return the existing record without reopening closed cases. Report details and reporter IDs are visible only in staff routes. Moderation requires a fresh `MODERATOR` or `ADMIN` role, records an audit row, and hides content only when the staff member explicitly selects hide.

## Teammate integration

The reusable Vue components are `VoteControls`, `OutletEvidence`, `CommentSection`, `ReportForm` and `ModerationQueue` under `apps/web/src/modules/community`. Auth screens remain Kang En's. Deal editing remains Isaac's and must follow the revision write rule above. Feed/map owners can request up to 20 card summaries per call and use the returned status and qualifying counts. The batch endpoint bounds client requests, though its current server implementation reads each deal separately; profile it before using it on large feeds.

The first local seed has no real merchant or outlet. Do not present it as a live deal. Production schema changes and deployment still need separate team review; the disposable integration suite is the proof used here.
