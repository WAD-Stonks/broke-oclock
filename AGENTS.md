# Broke O'Clock — agent guide

This file applies to the whole repository. Read it before editing. This is a public WAD2 coursework monorepo, not a finished deal platform. Preserve unrelated teammate changes and existing lecturer/course requirements.

## Read first

- [Architecture and ownership](docs/architecture.md)
- [Coding standards and import aliases](docs/coding-standards.md#imports-and-aliases)
- [AI-use and assessment boundaries](docs/ai-use.md)
- [Environment inventory](docs/environment-variables.md)
- [Testing](docs/testing.md) and [security](docs/security.md)

## Folder map

```text
apps/web/                  Vue SPA + Bootstrap, browser code only
  src/pages/               Route-level screens
  src/router/              Routes and UX-only navigation guards
  src/components/          Genuinely shared presentation components
  src/lib/                 App-local client wiring
  src/modules/             Six student-owned workstreams
  src/assets/              Styles and local assets
  tests/                   Frontend Vitest tests
apps/api/                  Express HTTP boundary + Better Auth
  src/app.ts               Testable Express app composition
  src/server.ts            Local Bun server lifecycle
  src/config.ts            Server environment parsing
  src/auth.ts              Maps validated env config into the shared auth factory
  src/uploads.ts           Upload auth/origin checks and route mounting
  src/modules/             Domain routes, services and repositories
  tests/unit/              Pure configuration/unit tests
  tests/integration/       Real HTTP + disposable MongoDB tests
packages/db/               Prisma schema, generated client and shared DB access
  prisma/schema.prisma     Canonical database schema
  src/generated/           Generated output; never edit or commit it
packages/auth/             Shared Better Auth integration (depends on db)
  src/server.ts            Auth factory and Prisma adapter; server only
  src/node.ts              HTTP handler/header adapters; server only
  src/client.ts            Same-origin Vue auth client
  src/types.ts             Type-only Auth/Session/User contracts
packages/storage/          Shared UploadThing infrastructure
  src/server.ts            SDK adapter and file policy; server only
  src/client.ts            Typed browser upload helper
  src/types.ts             Type-only public contracts
scripts/                   Bun setup/dev/env/database orchestration
e2e/                      Playwright browser journeys
docs/                     Decisions, scope, setup and team conventions
.github/                   PR template and PR-only quality CI
```

The web workstreams are `browse-map`, `add-deal`, `community`, `account`, `ingestion-admin` and `venues-feed`. API domains are `deals`, `venues`, `community`, `account` and `ingestion`; they need not mirror screens one-for-one. Read the owning module README before editing. Route handlers own transport validation and authorization, services own business rules, and repositories own typed Prisma access. Do not create empty abstraction layers.

## Imports and package boundaries

- Use extensionless source aliases: `@api/*`, `@web/*`, `@auth/*`, `@db/*`, `@storage/*`, `@scripts/*`. Their canonical paths are in root `tsconfig.json`.
- Example inside storage: `export type { PhotoFileRouter, PhotoStorageOptions } from '@storage/server'`. Do not use `./server.js`, `./server` or `../` source imports.
- Keep genuine `.vue`, `.css` and asset extensions. Keep third-party and `node:` package names unchanged.
- Across workspaces, use public `@broke-oclock/db`, `@broke-oclock/auth/{client,server,node,types}` or `@broke-oclock/storage/{client,server,types}` exports. Never reach into another workspace with its private source alias. Apps must not depend on each other, and packages must not import apps.
- Browser code uses auth/storage `/client` and type-only contracts, never `/server`, the database, auth-server code or secrets. Do not make a mixed client/server barrel.
- The API owns env loading, HTTP mounting and feature authorization; auth owns reusable session/auth machinery, and storage receives already-verified request-scoped identity. Neither package imports an app.
- TypeScript, Bun, Vite and Vitest must all resolve aliases. Run real tests/builds after changing resolution; a typecheck alone is insufficient. Native Node needs bundling/resolution support.
- Relative filesystem URLs, package export paths and generated code are not authored module-import style. Do not rename build output or edit generated Prisma files to satisfy this convention.

## Tooling and verification

- Use Bun, strict TypeScript and Biome. No npm/pnpm/yarn lockfiles, ESLint, Oxlint or Prettier.
- Install with `bun install --frozen-lockfile --ignore-scripts`; run `bun run setup` for initial local setup and Prisma generation. Preserve existing `.env` values.
- Use Prisma's MongoDB provider and typed client. MongoDB needs a replica set; tests use disposable replicas. Never run tests or schema changes against production. Do not use raw-query shortcuts.
- Run `bun run format`, `bun run check:all`, `bun run audit` and `git diff --check` before pushing. `check:all` includes lint, schema validation, all workspace/tool typechecks, unit/integration tests, builds and Playwright.
- Use `bun run test`, not `bun test`; Vitest and Bun's native runner are different. Keep regression tests and do not weaken assertions or delete failing coverage to get green CI.
- Keep provider mocks explicit. Synthetic UploadThing responses are not proof of a live hosted upload. The existing narrow Prisma CLI audit exception is documented; do not add suppressions casually.
- Inspect the actual browser import graph after moving shared code. Keep server secrets and modules out of browser bundles.

## Workflow, security and coursework

- No direct pushes to `main`. Use a descriptive school branch without `codex/`; reuse the current PR branch/worktree for follow-ups.
- Review the full diff and commit only authorized changes. Never reset, force-push or discard unrelated work.
- Open/update a PR with scope and actual test results. Wait for the latest commit's `quality` check. Never merge or enable auto-merge without Noah's explicit authorization for that PR; review bypass and green CI are not merge permission.
- Never commit `.env`, credentials, generated clients, build output, test reports or dependency directories. No secrets in `VITE_*`, logs or chat.
- GitHub `production` holds intended deployment settings, but Vercel sync/packaging is not implemented. Do not imply that env placeholders constitute a deployment.
- Respect the project AI policy: infrastructure, explanations, debugging and tests are permitted assistance; assessed deal business logic, feature endpoints, critical interactivity and major problem-solving remain student-owned. Read and maintain `docs/ai-use.md`; seek instructor clarification for borderline work.
- Do not silently implement deal CRUD, voting, ingestion, moderation, venue/geospatial rules or photo-ownership persistence as part of infrastructure work.
- Update the owning docs when changing folders, import conventions, configuration or public contracts. Report verified results separately from remaining limitations.
