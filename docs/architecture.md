# Architecture and folder ownership

This is a modular monorepo, not microservices. One Vue SPA, one Express API and one MongoDB database. pnpm workspaces share a single lockfile. Package manifests are private to prevent accidental registry publication; GitHub visibility is public.

```text
broke-oclock/
├── apps/
│   ├── web/                  Vue SPA; browser-safe code only
│   │   └── src/
│   │       ├── pages/        Route-level screens and developer starter pages
│   │       ├── router/       Navigation and UX-only route guards
│   │       ├── components/   Shared presentational components
│   │       ├── modules/      The six team workstreams (see below)
│   │       ├── lib/          Auth client and HTTP helpers
│   │       └── assets/       Global Bootstrap/custom styles and local media
│   └── api/                  Express + Better Auth; server-only configuration
│       └── src/
│           ├── rest/         Common REST root and named domain handlers
│           ├── modules/      Feature validation, services and repositories
│           └── ...           Generic app/config/auth lifecycle (see actual files)
├── packages/
│   ├── auth/                 Shared Better Auth server/client/types and Node adapter
│   ├── contracts/            Browser-safe API, ingestion and platform-admin schemas
│   ├── api-client/           Browser-safe typed Axios factory shared with HTTP tests
│   ├── db/                   Prisma schema, generation and shared DB client
│   ├── email/                Resend transport/templates; server only, opt-in
│   ├── integrations/         Read-only external-provider transports; server only
│   ├── storage/              UploadThing server/client entry points and shared types
│   └── ui/                   Shared presentational Vue components
├── e2e/                      Playwright user-journey tests
├── scripts/                  Local setup/development/test orchestration
├── docs/                     Team rules, contracts, testing and sources
├── .github/                  CI and pull-request template
├── .env.example              Safe local configuration template
├── biome.json                The sole JS/TS/Vue lint/format configuration
├── pnpm-workspace.yaml       Workspace, resolution and lifecycle policy
└── pnpm-lock.yaml            The sole dependency lockfile
```

## Agent entry point and imports

Start with root [AGENTS.md](../AGENTS.md) for agent workflow, ownership, verification and assessment boundaries. The [import conventions](coding-standards.md#imports-and-aliases) define `@api`, `@web`, `@auth`, `@db`, `@storage`, `@contracts`, `@integrations`, `@email`, `@ui` and `@scripts` source aliases. Root `tsconfig.json` owns their paths. Use public `@broke-oclock/*` exports across workspaces, not relative imports or another package's private alias. Vue and asset imports retain their real extensions; TypeScript source imports omit `.js` and `.ts`.

## Dependency boundaries

- Browser runtime never imports the API implementation, packages/db, server environment, Prisma or secrets. The web app consumes browser-safe schemas and inferred JSON types from `@broke-oclock/contracts/api`, `/ingestion` and `/platform-admin`; it has no runtime or type dependency on the API workspace.
- Express route handlers validate HTTP input and enforce authorization. Simple handlers may use the shared typed database client directly; extract services/repositories as business complexity or reuse requires, without mandatory pass-through layers.
- A feature module can start with a route and service; add repository/DTO files when useful, not empty layers for ceremony.
- Do not import internals across feature modules. Agree public interfaces and shared contracts first. Use `packages/contracts` for real browser-safe DTO/schema sharing; never export Prisma models to browsers as API contracts.
- `packages/auth` owns Better Auth setup, its Prisma adapter, Vue client and inferred session/user types. It depends on `packages/db`, never an app. The API injects validated configuration and mounts its Node handler; feature authorization belongs in REST handlers and app-owned domain services. Consume `/client`, `/server`, `/node` and type-only `/types` public entry points.
- `packages/storage` owns UploadThing SDK setup, upload policy, the browser helper and shared types. Apps share its implementation through this package. Use `/client` in browser code and `/server` only in the API; `/types` is type-only. The API loads credentials and supplies already-authenticated request identity. The package does not import app code or read environment variables.
- `packages/db` owns the one Prisma schema. The schema owner reviews changes but is not the only person allowed to contribute. See [the implemented persistence foundation](database-schema.md); product workflows are not implemented by schema relations.
- Use the native MongoDB provider through Prisma 6.19. No raw SQL, `$runCommandRaw`, `$queryRaw`, `$aggregateRaw` or direct-driver shortcuts in application code. Discuss unsupported geo/index operations before choosing a workaround.
- Better Auth owns password hashing, account/session records and session cookies. Feature ownership and moderator permission checks remain server-side application responsibilities.

## Shared packages

- `auth`: Better Auth server, Vue client, Node adapters and type-only contracts.
- `db`: canonical Prisma schema and typed database client.
- `storage`: UploadThing server/client integration.
- `contracts`: browser-safe Zod request/response schemas and inferred types shared across API and web boundaries. No Prisma exports or invented deal schemas.
- `api-client`: the existing explicit Axios factory and safe client errors, consumed by web wiring and API integration tests through its public export. It imports only browser-safe contracts and Axios, never app implementations or server modules. The API dependency is dev-only for actual-client HTTP coverage.
- `integrations`: server-only, read-only WordPress.com transport with validated public-post responses. Returned HTML remains untrusted. No deal parsing, persistence, scheduling, Telegram scraping or geocoder implementation.
- `email`: server-only Resend transport and templates, disabled without configured credentials. No auth email flow or sending endpoint is enabled.
- `ui`: BootstrapVueNext provider/components/styles and the existing AppShell. Product navigation/screens remain app-local; their existing buttons consume BButton.

Root TypeScript/Biome configuration is shared; no additional global lint configuration or generic utils package is needed. Create future packages around real boundaries, not placeholders. The transport migration extracts the existing client for actual browser and HTTP-test consumers without weakening app-to-app boundaries. Shared infrastructure does not mean the corresponding assessed product features are implemented.

## Six workstreams

1. `browse-map`: Leaflet + OSM map, filters, clustering and shared DealCard coordination.
2. `add-deal`: submission form, OneMap address selection, optional image storage and owner editing.
3. `community`: outlet/deal verification, freshness, comments and abuse reports.
4. `account`: Better Auth UI, profile and saved-deals views; share session access, not a second auth system.
5. `ingestion-admin`: admin status/review UI. Server `ingestion` owns WordPress/Telegram fetching, parsing, dedupe and scheduling.
6. `venues-feed`: venue history, search and the non-map feed.

Noah's additional `platform-admin` workstream owns `/admin/accounts`, role changes, merchant-request reviews, stall grants and audit history. Kang En retains user-facing merchant requests and Isaac retains merchant promotion management. See [the handoff and authorization contract](platform-admin.md).

Server module names can follow domain ownership (`deals`, `venues`, `community`, `account`, `ingestion`) rather than duplicating every screen. `deals` serves browse and submit. Coordinate shared routes rather than creating duplicate Deal models.

## Source-document reconciliation

The supplied team plan is the starting point, not an already frozen contract. Its JWT/Supabase/Firebase auth suggestions are superseded by the team's explicit Better Auth choice. Leaflet/OSM replaces earlier Google Maps rendering suggestions. OneMap remains a suggestion in the source plan, not a selected geocoder. UploadThing is selected for storage and Vercel for hosting; the approved User roles and multi-outlet schema are documented in [database-schema.md](database-schema.md). Thresholds, geocoding-provider choice and deployment wiring remain separate decisions.

Do not ship a fake `currentUser` in production. Development fixtures must be explicit, isolated and never bypass real API authorization. The starter supplies a real auth integration boundary instead.

## API-owned REST

The API exposes conventional JSON resources through a common Express mount. Domain `index.ts` files assemble named handlers, with one handler per file; handlers parse and validate request data, resolve request-scoped identity, enforce authorization, and call the existing app-local domain logic. See [the REST API guide](rest-api.md) for route, error and testing conventions. The browser uses explicit Axios functions grouped by domain and shared contracts from `packages/contracts`; there is no generic RPC dispatcher or inferred router dependency. Better Auth and UploadThing retain their native endpoints, and external-provider transports retain their own clients.
