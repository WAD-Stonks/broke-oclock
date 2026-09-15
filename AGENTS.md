# Broke O'Clock — agent guide

This file applies to the whole repository. Read it before editing. This is a public WAD2 coursework monorepo, not a finished deal platform. Preserve unrelated teammate changes and existing lecturer/course requirements.

## Read first

- [How to code here: routers, procedures, index.ts and frontend](docs/development-guide.md)
- [Architecture and ownership](docs/architecture.md)
- [Database schema, roles and invariants](docs/database-schema.md)
- [Coding standards and import aliases](docs/coding-standards.md#imports-and-aliases)
- [AI-use and assessment boundaries](docs/ai-use.md)
- [Environment inventory](docs/environment-variables.md)
- [Vercel setup and no-deployment boundary](docs/vercel-setup.md)
- [Testing](docs/testing.md) and [security](docs/security.md)

## Folder map

```text
apps/web/                  Vue SPA + BootstrapVueNext/Bootstrap, browser code only
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
  src/trpc/                API-owned context, procedure helpers, root and feature routers
  src/rpc.ts               Official Express middleware and request limits
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
packages/contracts/        Zod schemas/inferred JSON types for current infrastructure endpoints
packages/integrations/     Read-only external-provider transports; no ingestion logic
packages/email/            Opt-in Resend transport/templates; no active auth email hooks
packages/ui/               BootstrapVueNext provider/components and shared AppShell
scripts/                   Bun setup/dev/env/database orchestration
e2e/                      Playwright browser journeys
docs/                     Decisions, scope, setup and team conventions
.github/                   PR template and PR-only quality CI
```

The web workstreams are `browse-map`, `add-deal`, `community`, `account`, `ingestion-admin` and `venues-feed`. API domains are `deals`, `venues`, `community`, `account` and `ingestion`; they need not mirror screens one-for-one. Read the owning module README before editing. Route handlers/procedures own validation and authorization. They may use ctx.db directly for simple typed queries; extract app-local services/repositories for real complexity or reuse. Do not create empty abstraction layers. See docs/trpc.md for the T3-style layout.

## New API domain convention

- Follow docs/development-guide.md: `src/trpc/routers/<domain>/index.ts` assembles named procedures from `procedures/<operation>.ts`; register that router under a namespace in `src/trpc/root.ts`.
- One named procedure per file. Use `createTRPCRouter`, `publicProcedure` and `protectedProcedure` from `@api/trpc/init`; do not create another tRPC instance or Express mount per feature.
- Procedure files must not import their parent index or root. Keep index/root focused on assembly; extract substantive app-local logic only when needed.
- The current small `routers/infrastructure.ts` and top-level health/me paths are intentionally unchanged. The guide's example router is illustrative, not a deployed endpoint; do not rename existing API paths just to match the new-domain convention.

## Imports and package boundaries

- Use extensionless source aliases: `@api/*`, `@web/*`, `@auth/*`, `@db/*`, `@storage/*`, `@contracts/*`, `@integrations/*`, `@email/*`, `@ui/*`, `@scripts/*`. Their canonical paths are in root `tsconfig.json`.
- Example inside storage: `export type { PhotoFileRouter, PhotoStorageOptions } from '@storage/server'`. Do not use `./server.js`, `./server` or `../` source imports.
- Keep genuine `.vue`, `.css` and asset extensions. Keep third-party and `node:` package names unchanged.
- Across workspaces, use public `@broke-oclock/db`, `@broke-oclock/auth/{client,server,node,types}` or `@broke-oclock/storage/{client,server,types}` exports. Other public entry points are `@broke-oclock/contracts/api`, `@broke-oclock/integrations/server`, `@broke-oclock/email/server` and `@broke-oclock/ui`, `@broke-oclock/ui/styles.css`, `@broke-oclock/contracts/rpc`, and the type-only `@broke-oclock/api/types` export. Never reach into another workspace with its private source alias. The sole app-to-app exception is the web devDependency on the API for `import type { AppRouter }` from `@broke-oclock/api/types`; it has no runtime target. All other app-to-app implementation imports are forbidden, and packages must not import apps.
- Browser code uses auth/storage `/client` and its own tRPC client, type-only router definitions and browser-safe contract schemas, never `/server`, the database, auth-server code, email/integration server modules or secrets. Do not make a mixed client/server barrel.
- The API owns env loading, HTTP mounting and feature authorization; auth owns reusable session/auth machinery, and storage receives already-verified request-scoped identity. Neither package imports an app.
- TypeScript, Bun, Vite and Vitest must all resolve aliases. Run real tests/builds after changing resolution; a typecheck alone is insufficient. Native Node needs bundling/resolution support.
- Relative filesystem URLs, package export paths and generated code are not authored module-import style. Do not rename build output or edit generated Prisma files to satisfy this convention.

## Tooling and verification

- Use Bun, strict TypeScript and Biome. No npm/pnpm/yarn lockfiles, ESLint, Oxlint or Prettier.
- Install with `bun install --frozen-lockfile --ignore-scripts`; run `bun run setup` for initial local setup and Prisma generation. Preserve existing `.env` values.
- Use Prisma's MongoDB provider and typed client. MongoDB needs a replica set; tests use disposable replicas. Never run tests or schema changes against production. Do not use raw-query shortcuts.
- Run `bun run format`, `bun run check:all`, `bun run audit` and `git diff --check` before pushing. `check:all` includes lint, schema validation, all workspace/tool typechecks, unit/integration tests, builds and Playwright.
- Use `bun run test`, not `bun test`; Vitest and Bun's native runner are different. `bun run test:packages` runs email/integration transport tests; RPC policy tests live in the API unit suite. Both are included in the unit-test gate. Keep regression tests and do not weaken assertions or delete failing coverage to get green CI.
- Keep provider mocks explicit. Synthetic UploadThing responses are not proof of a live hosted upload. The existing narrow Prisma CLI audit exception is documented; do not add suppressions casually.
- Inspect the actual browser import graph after moving shared code. Keep server secrets and modules out of browser bundles.

## Workflow, security and coursework

- No direct pushes to `main`. Use a descriptive school branch without `codex/`; reuse the current PR branch/worktree for follow-ups.
- Review the full diff and commit only authorized changes. Never reset, force-push or discard unrelated work.
- Open/update a PR with scope and actual test results. Wait for the latest commit's `quality` check. Never merge or enable auto-merge without Noah's explicit authorization for that PR; review bypass and green CI are not merge permission.
- Never commit `.env`, credentials, generated clients, build output, test reports or dependency directories. No secrets in `VITE_*`, logs or chat.
- Both Vercel projects are connected to `WAD-Stonks/broke-oclock`, with project-level `gitProviderOptions.createDeployments: "disabled"` and checked-in `git.deploymentEnabled: false`. Manage production API credentials directly in Vercel; GitHub-to-Vercel secret sync is not planned. Existing GitHub `production` settings are retained, not runtime configuration. Do not enable automatic deployments, deploy, change protection or apply the Atlas schema without explicit approval. See docs/vercel-setup.md.
- Respect the project AI policy: infrastructure, explanations, debugging and tests are permitted assistance; assessed deal business logic, feature endpoints, critical interactivity and major problem-solving remain student-owned. Read and maintain `docs/ai-use.md`; seek instructor clarification for borderline work.
- The explicitly approved database schema includes domain records and upload-ownership fields, not working product workflows. Do not silently implement deal CRUD, voting, ingestion, moderation, geospatial rules or upload attachment/callback persistence. Follow docs/database-schema.md for conditional invariants and staff-owned fields.
- Update the owning docs when changing folders, import conventions, configuration or public contracts. Report verified results separately from remaining limitations.
