# @broke-oclock/integrations

Server-only, read-only external API transports. Public entry: `@broke-oclock/integrations/server`.

`createWordPressClient({ site?, fetch?, timeoutMs? }).listPosts({ page?, perPage?, order?, orderBy?, after?, before? })` calls the fixed WordPress.com public API host, defaulting to scoobifydaily.com. Site identifiers and pagination are bounded, redirects are rejected, responses are runtime-validated and projected to selected public fields. Post links must be HTTP(S); rendered HTML is explicitly typed as UntrustedHtml and is NOT sanitized or safe for v-html. Date strings retain upstream semantics.

The client accepts explicit options and does not read environment variables. The existing SCOOBIFY_POSTS_URL setting remains a planned ingestion inventory value, not an arbitrary URL accepted by this client. Tests inject fetch; do not use live network as a unit-test dependency.

No posts are parsed into deals, deduplicated, saved, moderated, rendered or scheduled. No Telegram or geocoder client was added. Those separate workstreams remain student-owned. Use API domain services for business rules rather than expanding this transport package into an importer.

Run `bun run test:packages` or full `bun run check:all`. Internal imports use `@integrations/*`.
