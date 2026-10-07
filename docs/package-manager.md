# Package manager and retained runtime

## Version and ownership

Use **pnpm 10.34.6**, as pinned by root `packageManager`. This is an intentional pnpm 10 release, not a claim to use the newest major. The npm registry was checked on 7 October 2026: `latest-10` was 10.34.6, while `latest` was 12.9.1. pnpm 10 supports the existing Node 22 toolchain and the settings below without introducing a separate major-version migration. CI separately pins Node 22.23.1 and Bun 1.4.2.

- `pnpm-workspace.yaml` owns workspace membership, the existing `effect: 3.21.0` override, lifecycle policy and the single audit exception.
- `pnpm-lock.yaml` is the only dependency lockfile. Do not create Bun, npm or Yarn locks.
- `nodeLinker: isolated` and `hoist: false` deliberately expose undeclared dependencies. Add a dependency to its actual importing workspace, not a broad hoisting workaround. Shared root executables remain available to workspace scripts through pnpm.
- Use `pnpm add`, `pnpm remove`, `pnpm update`, `pnpm --filter <workspace> ...`, `pnpm exec` and `pnpm run`. Do not use Bun to install, audit or manage dependencies.
- `pnpm run audit` keeps the high/critical threshold and only `GHSA-ggr8-5vv4-36mx`. See [the risk rationale](security.md). It is not an unfiltered clean audit.

The user explicitly superseded the original Bun-only package-manager policy. This is tooling assistance under [AI-use disclosure](ai-use.md), not a port of product logic.

## Install and migration

Install pnpm 10.34.6, Bun 1.4.2 and Node 22.18+ (CI uses 22.23.1). Node 22 Corepack users can enable the shim with `corepack enable pnpm`; `pnpm --version` inside the checkout selects the manifest pin. Existing installations of pnpm must honor that exact version.

For an existing Bun checkout, remove **only** root `node_modules` and workspace `apps/*/node_modules` / `packages/*/node_modules` before installing. Do not remove `.env`, `.local/mongodb`, source, or teammate changes. Do not mistake an old Bun dependency tree for pnpm verification.

```sh
pnpm --version
pnpm install --frozen-lockfile --ignore-scripts
pnpm run setup
pnpm exec playwright install chromium
```

`ignoreScripts: true` disables automatic project and dependency install hooks; `sideEffectsCache: false` prevents using previously built lifecycle output. No workspace build-script allowlist is enabled. `setup` explicitly generates Prisma after preserving or creating the ignored local `.env`. Generation downloads the configured native and Linux engines when needed, but does not push a schema. MongoDB binaries are downloaded only by the explicit local/test database runtime.

## Intentional Bun remnants

Bun **1.4.2** is a runtime/bundler, not a second package manager:

- Root scripts execute `scripts/setup.ts`, `scripts/environment.ts`, `scripts/mongo.ts`, `scripts/workspace.ts` and `scripts/dev.ts` using Bun's TypeScript/alias support. The workspace/dev launchers use `Bun.spawn` but launch **pnpm** scripts.
- API development/start uses Bun, and its local build uses `bun build --target=bun`. This local artifact needs its workspace sources, generated Prisma client and installed dependencies.
- `scripts/build-vercel-api.ts` uses `Bun.build` and `Bun.write` to create a self-contained **Node 22** function. It copies generated Prisma schema/engines, not hardcoded paths into a flat `node_modules` tree.
- CI's separate `oven-sh/setup-bun` step pins 1.4.2. Root `engines.bun`, `@types/bun` and TypeScript's Bun types remain intentional.
- The Vercel API build uses `pnpm --config.ignore-scripts=false --package=bun@1.4.2 dlx --allow-build=bun bun ...` to obtain that exact runtime even when the host only provides Node/pnpm. The command-local `ignore-scripts=false` overrides the workspace policy inherited through `pnpm run`, while `--allow-build=bun` limits the isolated bootstrap's lifecycle permission to the **Bun installer**. An allowlist alone does not override `ignoreScripts: true`: a warm dlx cache can conceal the missing postinstall until clean CI. Never move this override onto workspace installs, Prisma generation, or an outer `pnpm run`. Normal project/dependency hooks stay disabled. The bootstrap accesses the registry on a cold cache.
- References warning against Bun's native test runner remain intentional. Use `pnpm run test` for Vitest.

The web build needs no Bun runtime. Checked-in Vercel commands use pnpm and keep automatic deployments disabled. Live project overrides were not changed; reconcile those settings separately before any authorized deployment.

## Verification

```sh
pnpm run test:tooling
pnpm run db:generate
pnpm run check:all
pnpm run audit
git diff --check
```

In a fresh validation-only checkout, set `DATABASE_URL=mongodb://127.0.0.1:1/platform_admin_validation_only` for generation/schema checks. Integration suites replace it with their own disposable replica-set URLs. They include the Vercel artifact copied outside the repository and executed by Node with no workspace dependencies. Neither local builds nor these tests authorize deployment or production database writes.

## Official references

- pnpm 10 settings: https://pnpm.io/10.x/settings
- pnpm audit and `auditConfig.ignoreGhsas`: https://pnpm.io/10.x/cli/audit
- Exact-version `pnpm dlx` and `--allow-build`: https://pnpm.io/10.x/cli/dlx
- Registry version check: `npm view pnpm dist-tags --json` and `npm view pnpm@10.34.6 version engines --json`. These are registry metadata reads, not npm dependency management.
