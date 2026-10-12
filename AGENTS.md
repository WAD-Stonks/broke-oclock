# Broke O'Clock — agent guide

This file applies to the whole repository. Read it before editing. This is a public WAD2 coursework monorepo, not a finished deal platform. Preserve unrelated teammate changes and existing lecturer/course requirements.

## Read first

- [How to code here: REST routers, handlers, index.ts and frontend](docs/development-guide.md)
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
  src/server.ts            Local Node.js server lifecycle
  src/config.ts            Server environment parsing
  src/auth.ts              Maps validated env config into the shared auth factory
  src/rest/                Request-local context, policy, root and domain REST assemblies
  src/errors.ts            Common HTTP error mapping and safe JSON errors
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
packages/contracts/        Browser-safe Zod request/response schemas and inferred JSON types
packages/api-client/       Browser-safe typed Axios factory and public client errors
packages/integrations/     Read-only external-provider transports; no ingestion logic
packages/email/            Opt-in Resend transport/templates; no active auth email hooks
packages/ui/               BootstrapVueNext provider/components and shared AppShell
scripts/                   Node.js setup/dev/env/database orchestration
e2e/                      Playwright browser journeys
docs/                     Decisions, scope, setup and team conventions
.github/                   PR template and PR-only quality CI
```

The web workstreams are `browse-map`, `add-deal`, `community`, `account`, `ingestion-admin` and `venues-feed`. API domains are `deals`, `venues`, `community`, `account` and `ingestion`; they need not mirror screens one-for-one. Read the owning module README before editing. Route handlers own validation and authorization. They may use ctx.db directly for simple typed queries; extract app-local services/repositories for real complexity or reuse. Do not create empty abstraction layers. See docs/rest-api.md for the REST layout.

## New API domain convention

- Follow docs/development-guide.md: `src/rest/routers/<domain>/index.ts` assembles named HTTP handlers, one handler per file. Register domain routers in `src/rest/root.ts`; mount the common REST root once in `src/app.ts`.
- Use explicit conventional HTTP methods, shared browser-safe Zod contracts and request-local cookie identity. Keep existing services responsible for business rules, transactions, authorization fences and version races; do not create a generic RPC dispatcher or separate Express mount per feature.
- Handler files must not import their parent index or root. Keep index/root focused on assembly; extract substantive app-local logic only when needed.
- Infrastructure follows its domain index plus one handler per file. Keep `/api/health`, `/api/ready` and `/api/me` compatible and use explicit Axios infrastructure functions. The guide's example router remains illustrative, not a deployed endpoint.

## Imports and package boundaries

- Use extensionless source aliases: `@api/*`, `@web/*`, `@auth/*`, `@db/*`, `@storage/*`, `@contracts/*`, `@integrations/*`, `@email/*`, `@ui/*`, `@scripts/*`. Their canonical paths are in root `tsconfig.json`.
- Example inside storage: `export type { PhotoFileRouter, PhotoStorageOptions } from '@storage/server'`. Do not use `./server.js`, `./server` or `../` source imports.
- Keep genuine `.vue`, `.css` and asset extensions. Keep third-party and `node:` package names unchanged.
- Across workspaces, use public `@broke-oclock/db`, `@broke-oclock/auth/{client,server,node,types}` or `@broke-oclock/storage/{client,server,types}` exports. Other public entry points are `@broke-oclock/api-client`, `@broke-oclock/contracts/api`, `@broke-oclock/contracts/ingestion`, `@broke-oclock/contracts/platform-admin`, `@broke-oclock/integrations/server`, `@broke-oclock/email/server` and `@broke-oclock/ui`, `@broke-oclock/ui/styles.css`. Never reach into another workspace with its private source alias. App-to-app implementation imports are forbidden, and packages must not import apps.
- Browser code uses auth/storage `/client`, explicit same-origin Axios functions and browser-safe contract schemas, never API/server implementations, the database, auth-server code, email/integration server modules or secrets. Do not make a mixed client/server barrel.
- The API owns env loading, HTTP mounting and feature authorization; auth owns reusable session/auth machinery, and storage receives already-verified request-scoped identity. Neither package imports an app.
- TypeScript, tsx, esbuild, Vite and Vitest must all resolve aliases. Run real tests/builds after changing resolution; a typecheck alone is insufficient. Plain Node production artifacts must bundle workspace code and aliases without requiring tsx at runtime.
- Relative filesystem URLs, package export paths and generated code are not authored module-import style. Do not rename build output or edit generated Prisma files to satisfy this convention.

## Tooling and verification

- Use pnpm 10.34.6 for package management, Node.js 22.18 or newer for runtime, strict TypeScript and Biome. Keep `pnpm-lock.yaml` as the sole lockfile. No npm/Bun/yarn lockfiles, ESLint, Oxlint or Prettier. Use pinned tsx for TypeScript development/tooling and esbuild for standalone Node.js API artifacts. Do not use Bun as a runtime, bundler or package manager. See [package-manager guidance](docs/package-manager.md).
- Install with `pnpm install --frozen-lockfile --ignore-scripts`; run `pnpm run setup` for initial local setup and Prisma generation. Preserve existing `.env` values. Keep isolated workspace linking and install hooks disabled.
- Use Prisma's MongoDB provider and typed client. MongoDB needs a replica set; tests use disposable replicas. Never run tests or schema changes against production. Do not use raw-query shortcuts.
- Run `pnpm run format`, `pnpm run check:all`, `pnpm run audit` and `git diff --check` before pushing. `check:all` includes lint, schema validation, all workspace/tool typechecks, unit/integration tests, builds and Playwright.
- Use `pnpm run test` for Vitest suites; `pnpm run test:tooling` runs Node.js tooling regressions. `pnpm run test:packages` runs email/integration transport tests; REST policy tests live in the API unit suite. Both are included in the unit-test gate. Keep regression tests and do not weaken assertions or delete failing coverage to get green CI.
- Keep real HTTP regressions for trusted-Origin writes, independent concurrent cookie identities, method/Allow behavior, bounded query and JSON/body parsing, sanitized errors and legacy `/api/trpc` 404/no-write retirement. Browser interceptions remain explicitly synthetic; execute standalone and Vercel artifacts with plain Node and disposable replicas.
- Keep provider mocks explicit. Synthetic UploadThing responses are not proof of a live hosted upload. The existing narrow Prisma CLI audit exception is documented; do not add suppressions casually.
- Inspect the actual browser import graph after moving shared code. Keep server secrets and modules out of browser bundles.

## Branching and worktrees

- No direct pushes to `main`. Keep each branch and PR focused on one task. Use a descriptive name, for example `feat/<short-description>`, `fix/<short-description>`, `docs/<short-description>`, `chore/<short-description>`, `refactor/<short-description>` or `test/<short-description>`.
- Before starting, inspect `git status --short` and `git worktree list`, then run `git fetch origin`. Start new independent work from freshly fetched `origin/main`, not a stale local `main` or an old feature branch. Use another base only when that dependency is explicitly agreed.
- For follow-up fixes to an open PR, reuse its branch and owning worktree. After a PR is merged, fetch again and create a new branch from `origin/main` for the next independent task.
- If the checkout contains unrelated changes, or a branch is already checked out elsewhere, preserve that checkout and create a separate worktree at a new path. Do not switch, reset, stash or remove another person's work to make room.
- A clean checkout can start a new branch with `git switch -c feat/short-description origin/main`. Alternatively, create a separate checkout with `git worktree add -b feat/short-description /path/to/new-worktree origin/main`. Replace the example name and path; choose one approach, not both for the same branch.
- Review against the live PR's exact base and head commits, corroborated by fetched remote refs. An unrelated local `main` may be stale; do not use it to widen the review diff or reset it without checking its owner and changes.
- If the PR base advances, integrate those changes into the owned branch and rerun checks before merging. Do not rewrite shared branch history or force-push without explicit approval. Remove a branch/worktree only after confirming its PR is merged and it contains no uncommitted work or unmerged commits.

## Workflow, security and coursework

- Review the full diff and commit only authorized changes. Never reset, force-push or discard unrelated work.
- Open/update a PR with scope and actual test results. Wait for the latest commit's `quality` check. Never merge or enable auto-merge without Noah's explicit authorization for that PR; review bypass and green CI are not merge permission.
- Never commit `.env`, credentials, generated clients, build output, test reports or dependency directories. No secrets in `VITE_*`, logs or chat.
- Both Vercel projects are connected to `WAD-Stonks/broke-oclock`, with project-level `gitProviderOptions.createDeployments: "disabled"` and checked-in `git.deploymentEnabled: false`. Manage production API credentials directly in Vercel; GitHub-to-Vercel secret sync is not planned. Existing GitHub `production` settings are retained, not runtime configuration. Do not enable automatic deployments, deploy, change protection or apply the Atlas schema without explicit approval. See docs/vercel-setup.md.
- Respect the project AI policy: infrastructure, explanations, debugging and tests are permitted assistance; assessed deal business logic, feature endpoints, critical interactivity and major problem-solving remain student-owned. Read and maintain `docs/ai-use.md`; seek instructor clarification for borderline work.
- The explicitly approved database schema includes domain records and upload-ownership fields, not working product workflows. Do not silently implement deal CRUD, voting, ingestion, moderation, geospatial rules or upload attachment/callback persistence. Follow docs/database-schema.md for conditional invariants and staff-owned fields.
- Update the owning docs when changing folders, import conventions, configuration or public contracts. Report verified results separately from remaining limitations.
