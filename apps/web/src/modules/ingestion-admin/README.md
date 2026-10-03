# Ingestion admin

Owner: Noah. Route: `/admin/ingestion`, assembled by `IngestionAdminPage.vue`.

## Implemented UI

- Better Auth sign-in and server-verified ADMIN access, with distinct anonymous, forbidden, unavailable and recoverable-error states.
- Source opt-in status, review counts, bounded manual import triggering and bounded recent-run history.
- Paginated pending drafts with plain-text source evidence, validity/readiness status and versioned approve/reject actions with mandatory notes.
- Conflicts are tracked per draft ID, independent of selection; switching drafts or loading unrelated pages cannot unlock stale reviews. Only fetched evidence for that ID clears its conflict. Reload replaces cached pages, clears a missing selection and its note, and requires deliberately selecting any replacement/later-page evidence. Refreshed conflicted evidence requires a new note, even if its content version is unchanged.
- Read-only OneMap address candidates with attribution and read-only administrator account listing.

All data comes through the typed same-origin ingestion API. The UI never renders imported content as HTML, decides permissions from a client role, fabricates deals or associates lookup candidates with outlets automatically. Approval readiness is enforced again by the server.

## Boundaries

No role changes, account deletion, draft editing, location attachment, scheduler or public browse workflow is implemented here. Publisher ingestion stays disabled until reuse approval, API opt-in and source enablement are supplied. Live provider checks and production provisioning remain separate from the synthetic UI tests.

See [ingestion setup](../../../../../docs/ingestion.md) for API contracts, activation and verification.
