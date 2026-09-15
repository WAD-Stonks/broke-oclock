# Broke O'Clock

A WAD2 team project for discovering Singapore student deals, with maps, community evidence and attributed imports.

**Status: project starter, not a finished deals application.** The repository provides development tooling, generic auth/database integration, a Vue starter and test infrastructure. The six product workstreams remain student-owned implementation work.

## Stack

- Vue 3 + TypeScript + Vite; Bootstrap CSS; Vue Router
- Express + Better Auth (email/password, session cookies)
- Prisma 6.19 + MongoDB replica set — Prisma7 currently does not support MongoDB
- Bun workspaces and one lockfile; Biome only (no ESLint/Prettier/Oxlint)
- Vitest for unit/integration tests; Playwright for browser E2E

## First-time setup

Install Bun 1.4.2 and Node 22.18+ (Node is also used by development/test tools). Then:

```sh
git clone https://github.com/WAD-Stonks/broke-oclock.git
cd broke-oclock
bun install --frozen-lockfile
bun run setup
```

`setup` creates an ignored root `.env` with a random local auth secret, preserves an existing `.env`, and generates Prisma Client. It does not provision Atlas, send email, scrape channels or seed public deals.

### Start the database

For a Docker-free local replica set, in terminal 1:

```sh
bun run db:local
```

This downloads a MongoDB binary on first use and starts a **local-only, unauthenticated** single-node replica set. Development data is kept in ignored `.local/mongodb/`; Ctrl+C stops the server without deleting it. Do not expose this helper on the internet. If port 27017 is in use, it stops rather than replacing another process.

Alternatively use your own MongoDB replica set/Atlas development database and update root `DATABASE_URL`. Keep its credentials out of Git. A standalone MongoDB server is insufficient for Prisma transaction-dependent auth flows.

### Apply schema and start apps

In terminal 2, with the database ready:

```sh
bun run db:push
bun run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3000
- Better Auth base path: `/api/auth`
- The Vite development proxy forwards `/api` to Express. No frontend secret is needed.

`db:push` changes the database configured in `.env`: check the target first. Do not use it blindly against production. MongoDB uses schema push, not Prisma Migrate migration files. Regenerate Prisma Client after schema changes.

## Environment variables

See [the complete environment inventory](docs/environment-variables.md) and `.env.example`. They distinguish current API settings, planned Vercel deployment settings and reserved OneMap/ingestion/moderation settings. Production values belong in the repository’s GitHub `production` environment; UploadThing is selected for photos, with its server token still to configure; the mail provider remains pending. Existing `.env` files are preserved by setup.

## Commands

```sh
bun run dev:web          # frontend only
bun run dev:api          # backend only
bun run db:generate      # generate ignored Prisma Client
bun run db:validate      # validate Prisma schema
bun run format           # Biome format/import fixes
bun run check            # lint + schema + types + unit tests + builds
bun run test:integration # isolated real MongoDB/auth HTTP tests
bunx playwright install chromium
bun run test:e2e         # browser starter tests
bun run check:all        # full local verification
```

Use `bun run test`, not `bun test`, for this project's Vitest tests.

## Folder structure and coding standards

Start here before writing feature code:

1. [Architecture and folder ownership](docs/architecture.md)
2. [Coding standards](docs/coding-standards.md)
3. [Six workstreams and acceptance journeys](docs/feature-plan.md)
4. [Draft schema/API decisions — team approval needed](docs/contracts.md)
5. [Testing instructions](docs/testing.md)
6. [Integration caveats and official docs](docs/integrations.md)
7. [Contribution and PR workflow](CONTRIBUTING.md)
8. [AI-use disclosure and course boundaries](docs/ai-use.md)

`apps/web` owns Vue, `apps/api` owns HTTP/auth/server logic, `packages/db` owns Prisma, and `e2e` owns browser journeys. Feature-specific code goes in module folders, not a giant App.vue or server.ts. Do not import database/server code into the browser.

## Verified starter checks

- `bun run check:all` covers unit tests, real-HTTP auth/database/upload integration tests and Chromium checks, plus schema validation, typechecks and both builds. UploadThing provider responses in tests are explicitly synthetic; a live upload requires a configured account/token.
- The compiled API was also started with Bun and exercised through real signup, session lookup and logout; disposable probe records were removed.
- The actual Vue Better Auth client successfully reached `/api/auth/get-session` through the Vite proxy in a browser.
- Fresh-clone and GitHub CI results are recorded by the CI run, not inferred from local tests. These are starter checks, not coverage of unimplemented product features.

## Planned product work

1. Browse & Map — Leaflet/OSM, filters and DealCard.
2. Add Deal — submission, OneMap location and approved image storage.
3. Verify & Comments — scoped votes, freshness, comments and reports.
4. Accounts & Saved — auth UI, profile and bookmarks.
5. Channel Ingestion — WordPress/Telegram parsing, provenance and admin review.
6. Venue Pages & Feed — history, search and list browsing.

No map, live deal CRUD, parser, votes, bookmarks, deal-photo submission flow or venue history is claimed implemented by this starter. Generic [UploadThing infrastructure](docs/photo-storage.md) is available for the team to integrate. UploadThing is selected for photo storage and Vercel for deployment; integration work and domain-contract decisions remain pending. The team's source plan is reflected in `docs/feature-plan.md`; explicit stack decisions override its alternative auth suggestions.

## Security and assessment notes

One Prisma CLI-only dependency advisory remains with a narrow, documented audit exception; see [security notes](docs/security.md). Run `bun audit` for the unfiltered result or `bun run audit` for the CI policy. This is not a claim of a clean raw audit.


This repo is public. Never commit `.env`, credentials, user data, session-state files or unlicensed channel fixtures. `private: true` in package manifests prevents accidental npm publication; it does not make the GitHub repository private.

Auth boilerplate is not a production readiness guarantee: review email verification/reset delivery, moderator authorization, deployment cookies/HTTPS, abuse controls and provider policies before launch. No cloud deployment is created here.

AI-assisted portions: initial scaffolding, generic framework/auth boilerplate, tests, CI and documentation. Core assessed application logic remains student-owned. See [the full disclosure](docs/ai-use.md). The final course submission requires setup/run/test instructions and disclosure in `README.txt`; the included README.txt points to these maintained guides and is not a claim of final-submission readiness.
