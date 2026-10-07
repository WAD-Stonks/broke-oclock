# Package manager and Node runtime

## Version and ownership

Use **pnpm 10.34.6**, pinned by root `packageManager`, and **Node 22.18+**. CI pins Node **22.23.1**. The user explicitly superseded the original Bun requirement for both dependency management and runtime/build tooling. No product logic is ported.

- `pnpm-lock.yaml` is the sole lockfile. Use `pnpm add`, `pnpm remove`, `pnpm update`, `pnpm --filter <workspace> ...`, `pnpm exec` and `pnpm run`.
- `pnpm-workspace.yaml` owns workspace membership, `effect: 3.21.0`, the lifecycle policy and the single audit exception.
- Keep `nodeLinker: isolated` and `hoist: false`. Declare libraries in the workspace that imports them; do not mask missing dependencies with hoisting.
- Keep `ignoreScripts: true` and `sideEffectsCache: false`. No install-hook allowlist, runtime bootstrap or command-local lifecycle exception is needed.
- `pnpm run audit` keeps the high/critical threshold and only `GHSA-ggr8-5vv4-36mx`. See [the risk rationale](security.md); this is not an unfiltered clean audit.

## Install and migration

Install pnpm 10.34.6 and Node 22.18+ (CI uses 22.23.1). Node 22 Corepack users can enable its shim with `corepack enable pnpm`; `pnpm --version` inside this checkout selects the exact manifest pin.

When migrating an existing checkout, remove **only** root `node_modules` and workspace `apps/*/node_modules` / `packages/*/node_modules`, then reinstall. Preserve `.env`, `.local/mongodb`, source and teammate changes.

```sh
pnpm --version
pnpm install --frozen-lockfile --ignore-scripts
pnpm run setup
pnpm exec playwright install chromium
```

`setup` explicitly generates Prisma after preserving or creating the ignored local `.env`. Generation downloads configured native and Linux engines when needed, but does not push a schema. MongoDB binaries are downloaded only by the explicit local/test database runtime.

## Node execution and builds

- Root scripts run with `node --import tsx`. Root and API pin **tsx 4.23.15**, supporting extensionless aliases and public workspace TypeScript exports. TypeScript checks remain a separate required gate; tsx does not typecheck.
- API development uses `tsx watch --clear-screen=false src/server.ts`. The Node child-process launchers preserve cwd/arguments/environment, propagate exit statuses, forward SIGINT/SIGTERM to owned POSIX process groups and force-stop unresponsive descendants after three seconds. macOS/Linux are the supported orchestration hosts; Windows has only direct-child signal fallback.
- Root **esbuild 0.28.2** bundles the local API and Vercel function for Node ESM, resolving aliases/public workspace sources. ESM preserves UploadThing's `import.meta` and the Node entry-point guard. A `createRequire`/filename/directory bridge supports bundled CommonJS dependencies and native Prisma loading.
- `pnpm run build` writes the standalone local API under `apps/api/dist`. Run `pnpm --dir apps/api run start` with the required server environment, or `node apps/api/dist/server.js`. The output includes its own ESM package marker and Prisma schema/native engines; it needs no workspace sources, dependency tree or TypeScript runtime.
- `pnpm run build:vercel:api` explicitly generates Prisma and builds `apps/api/.vercel/output`. No global bundler/runtime executable, dlx bootstrap or automatic install hook is used.
- esbuild's platform binary comes from its pinned optional dependency. Keep optional dependencies enabled. Clean-store tests verify its API executes with install scripts disabled, so no lifecycle activation is required. Do not set `ESBUILD_BINARY_PATH` to an unverified/global executable.
- Checked-in hosting commands keep automatic deployments disabled. Live provider overrides were not changed and must be reconciled separately before any authorized deployment.

## Verification

```sh
pnpm run test:tooling
pnpm run db:generate
pnpm run check:all
pnpm run audit
git diff --check
```

In a fresh validation-only checkout, use `DATABASE_URL=mongodb://127.0.0.1:1/platform_admin_validation_only` for generation/schema checks. Integration suites supply their own disposable replica-set URLs. Both local production and Vercel artifacts are copied outside the repository and executed with plain Node and real auth/Prisma, without workspace dependencies. These tests never authorize deployment or production writes.

## Official references

- [pnpm settings](https://pnpm.io/10.x/settings) and [audit](https://pnpm.io/10.x/cli/audit).
- [Node child processes](https://nodejs.org/docs/latest-v22.x/api/child_process.html), [ESM/main](https://nodejs.org/docs/latest-v22.x/api/esm.html) and [createRequire](https://nodejs.org/docs/latest-v22.x/api/module.html#modulecreaterequirefilename).
- [tsx Node CLI documentation source](https://github.com/privatenumber/tsx/blob/master/docs/dev-api/node-cli.md), [TypeScript](https://github.com/privatenumber/tsx/blob/master/docs/typescript.md) and [watch mode](https://github.com/privatenumber/tsx/blob/master/docs/watch-mode.md).
- [esbuild API](https://esbuild.github.io/api/) and [installation with disabled scripts](https://esbuild.github.io/getting-started/#additional-npm-flags).
- Registry metadata reads used for the exact pins: `pnpm view tsx version engines dependencies --json` and `pnpm view esbuild version engines --json`.
