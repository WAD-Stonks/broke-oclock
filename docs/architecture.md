# Architecture and folder ownership

This is a modular monorepo, not microservices. One Vue SPA, one Express API and one MongoDB database. Bun workspaces share a single lockfile. Package manifests are private to prevent accidental registry publication; GitHub visibility is public.

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
│           ├── modules/      Feature routes, validation, services, repositories
│           └── ...           Generic app/config/auth lifecycle (see actual files)
├── packages/
│   ├── db/                   Prisma schema, generation and shared DB client
│   └── storage/              UploadThing server/client entry points and shared types
├── e2e/                      Playwright user-journey tests
├── scripts/                  Local setup/development/test orchestration
├── docs/                     Team rules, contracts, testing and sources
├── .github/                  CI and pull-request template
├── .env.example              Safe local configuration template
├── biome.json                The sole JS/TS/Vue lint/format configuration
└── bun.lock                  The sole dependency lockfile
```

## Agent entry point and imports

Start with root [AGENTS.md](../AGENTS.md) for agent workflow, ownership, verification and assessment boundaries. The [import conventions](coding-standards.md#imports-and-aliases) define `@api`, `@web`, `@db`, `@storage` and `@scripts` source aliases. Root `tsconfig.json` owns their paths. Use public `@broke-oclock/*` exports across workspaces, not relative imports or another package's private alias. Vue and asset imports retain their real extensions; TypeScript source imports omit `.js` and `.ts`.

## Dependency boundaries

- Browser code never imports `apps/api`, `packages/db`, server environment, Prisma or secrets.
- Routes validate transport input and enforce authentication/authorization, then call a feature service. Services own student-authored business rules. Repositories own typed Prisma operations. Do not put every query directly in route handlers.
- A feature module can start with a route and service; add repository/DTO files when useful, not empty layers for ceremony.
- Do not import internals across feature modules. Agree public interfaces and shared contracts first. Add `packages/contracts` only when real browser-safe DTO/schema sharing is needed; never export Prisma models to browsers as API contracts.
- `packages/storage` owns UploadThing SDK setup, upload policy, the browser helper and shared types. Apps depend on this package, never on each other. Use `/client` in browser code and `/server` only in the API; `/types` is type-only. The API loads credentials and supplies already-authenticated request identity. The package does not import app code or read environment variables.
- `packages/db` owns the one Prisma schema. The schema owner reviews changes but is not the only person allowed to contribute.
- Use the native MongoDB provider through Prisma 6.19. No raw SQL, `$runCommandRaw`, `$queryRaw`, `$aggregateRaw` or direct-driver shortcuts in application code. Discuss unsupported geo/index operations before choosing a workaround.
- Better Auth owns password hashing, account/session records and session cookies. Feature ownership and moderator permission checks remain server-side application responsibilities.

## Six workstreams

1. `browse-map`: Leaflet + OSM map, filters, clustering and shared DealCard coordination.
2. `add-deal`: submission form, OneMap address selection, optional image storage and owner editing.
3. `community`: outlet/deal verification, freshness, comments and abuse reports.
4. `account`: Better Auth UI, profile and saved-deals views; share session access, not a second auth system.
5. `ingestion-admin`: admin status/review UI. Server `ingestion` owns WordPress/Telegram fetching, parsing, dedupe and scheduling.
6. `venues-feed`: venue history, search and the non-map feed.

Server module names can follow domain ownership (`deals`, `venues`, `community`, `account`, `ingestion`) rather than duplicating every screen. `deals` serves browse and submit. Coordinate shared routes rather than creating duplicate Deal models.

## Source-document reconciliation

The supplied team plan is the starting point, not an already frozen contract. Its JWT/Supabase/Firebase auth suggestions are superseded by the team's explicit Better Auth choice. Leaflet/OSM + OneMap replace earlier Google Maps suggestions. UploadThing is selected for storage and Vercel for hosting; moderator roles, thresholds, multi-outlet scope and deployment wiring remain team decisions.

Do not ship a fake `currentUser` in production. Development fixtures must be explicit, isolated and never bypass real API authorization. The starter supplies a real auth integration boundary instead.
