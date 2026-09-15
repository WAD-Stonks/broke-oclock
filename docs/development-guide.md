# How to code in this repository

Start with [setup](../README.md#first-time-setup), [architecture](architecture.md), [import rules](coding-standards.md#imports-and-aliases) and the owning workstream README. This guide explains where to put code and how the pieces connect. Domain implementations remain student-owned under the [course AI policy](ai-use.md).

## 1. API convention: one router folder per domain

Use the existing plural `routers/` directory. For each new domain, use this structure:

```text
apps/api/src/trpc/
  context.ts                   Builds request context: db, session, trusted origin
  init.ts                      Shared router and public/protected procedure helpers
  root.ts                      Registers the application's router namespaces
  routers/
    <domain>/
      index.ts                 Assembles and exports this domain's router
      procedures/
        <operation>.ts         One named tRPC procedure per file
```

`<domain>` and `<operation>` are naming placeholders, not literal folders. Use kebab-case filenames, camelCase exports, and an operation name that describes the action. Create files for implemented work, not empty folders for the whole backlog.

**Current code versus this convention:** the starter currently keeps its two infrastructure procedures in `routers/infrastructure.ts`. They are spread into the root to preserve `api.health` and `api.me`. New domain routers should use the folder convention above. The `example/` walkthrough below is documentation only; it is not a registered API or a shipped feature.

### What each file does

- **`procedures/<operation>.ts`** defines input validation, authentication/authorization, the query or mutation, and its response. Export a named procedure such as `healthProcedure`.
- **The domain's `index.ts`** imports its procedure files and calls `createTRPCRouter`. This is the domain's assembly point, not a place for large handlers, database work at import time, or a catch-all export of internal helpers.
- **`root.ts`** imports each domain router through its `index.ts` and assigns its public namespace. It exports `AppRouter` for frontend inference. It should not contain feature implementation.
- **`init.ts`** defines reusable policy: `createTRPCRouter`, `publicProcedure`, `protectedProcedure`, origin protection and safe errors. Reuse it; do not initialize a separate tRPC instance for each domain.
- **`context.ts`** constructs request-scoped identity and provides the shared Prisma client. Use `ctx.session` and `ctx.db`; never keep a current user in module-level state.
- **`apps/api/src/rpc.ts`** mounts the root through the official Express adapter and applies transport limits. Register a domain in `root.ts`, not with another Express mount.

## 2. Walkthrough: procedure → domain index → root → frontend

This deliberately uses the existing health behaviour rather than implementing an assessed product feature. To try it, all three server snippets belong together; adding only a procedure file does not expose an endpoint.

### A. Define a procedure

Illustrative file: `apps/api/src/trpc/routers/example/procedures/health.ts`:

```ts
import { publicProcedure } from '@api/trpc/init'
import { healthResponseSchema } from '@broke-oclock/contracts/api'
import { z } from 'zod'

export const healthProcedure = publicProcedure
  .input(z.void())
  .output(healthResponseSchema)
  .query(() => ({ ok: true }))
```

- `.input(...)` validates incoming data at runtime. `z.void()` rejects unexpected input here. For a real operation, define its actual bounded schema beside the procedure.
- `.output(...)` validates the public response. TypeScript still infers the client result; do not handwrite a duplicate return type.
- `.query(...)` is for reads. `.mutation(...)` is for state changes. Never hide a write in a query, because queries do not pass through the mutation-origin guard.
- Use `protectedProcedure` instead of `publicProcedure` when login is required.

### B. Assemble the domain router in `index.ts`

Illustrative file: `apps/api/src/trpc/routers/example/index.ts`:

```ts
import { createTRPCRouter } from '@api/trpc/init'
import { healthProcedure } from '@api/trpc/routers/example/procedures/health'

export const exampleRouter = createTRPCRouter({
  health: healthProcedure,
})
```

The key `health` becomes the public procedure name. The variable name `healthProcedure` is internal. `index.ts` is the folder's import entry: `@api/trpc/routers/example` resolves to that file. Use explicit named exports; no default export or broad `export *` barrel is needed.

**Avoid circular imports:** procedure files import `init.ts`, schemas and relevant app-local helpers. They must not import their parent `index.ts` or `root.ts`, which already depend on them.

### C. Register the domain in the root

Illustrative replacement for `apps/api/src/trpc/root.ts` after adding the example files:

```ts
import { createTRPCRouter } from '@api/trpc/init'
import { exampleRouter } from '@api/trpc/routers/example'
import { infrastructureProcedures } from '@api/trpc/routers/infrastructure'

export const appRouter = createTRPCRouter({
  ...infrastructureProcedures,
  example: exampleRouter,
})

export type AppRouter = typeof appRouter
```

The root key `example` sets the namespace: `api.example.health`, served through `/api/trpc/example.health`. Merely naming a folder `example` does not register it. Keep the existing infrastructure spread so current `api.health` and `api.me` callers do not break. Do not spread new domain procedures into the root; namespace them to avoid collisions.

### D. Call it from the web app

After the example is registered, frontend code can use:

```ts
import { api } from '@web/lib/api-client'

const result = await api.example.health.query()
// result.ok is inferred as true
```

This call does not exist in the current starter until the illustrative files/root registration are added. The currently available calls are `api.health.query()` and authenticated `api.me.query()`.

Use `.query(input)` for queries and `.mutate(input)` for mutations. These return promises: they are not React hooks. Our client is the framework-independent tRPC client, not `createTRPCReact` or an installed Vue Query integration.

The web client imports only the API's type:

```ts
import type { AppRouter } from '@broke-oclock/api/types'
```

This is the deliberate type-only app dependency. The export has no runtime target. Never replace it with an API runtime import or reach into `@api/*` from web code. Router changes flow into client types without generating an SDK.

## 3. Validation, authentication and errors

- Choose public versus protected deliberately. `protectedProcedure` verifies login; it does **not** prove record ownership or moderator permission.
- Derive the acting user from `ctx.session.user.id`. Treat user/owner IDs supplied by the browser as untrusted input, not authorization.
- Keep mutations behind the existing exact-origin guard. Do not weaken it to fix local requests; check same-origin proxy/cookie setup instead.
- Bound strings, pagination and arrays. Infer input types from the schema instead of maintaining a second interface.
- Return explicit public fields, not complete Prisma records, credentials or session tokens. Existing JSON timestamps are ISO strings; do not silently switch serialization.
- For expected failures, throw a deliberate `TRPCError` with a suitable code, such as `NOT_FOUND`, `FORBIDDEN` or `CONFLICT`, and a safe message. Unexpected internal errors are redacted by the shared formatter.
- Keep Better Auth and UploadThing on their existing official handlers. Do not reimplement or wrap their entire APIs in domain tRPC routers.

## 4. Where business logic and shared code belong

- A small procedure can use `ctx.db` directly with typed Prisma operations. Extract meaningful reusable/complex logic to `apps/api/src/modules/<domain>/` services or repositories when needed; do not add pass-through layers for every operation.
- Procedure-specific schemas stay beside their procedure. Extract a domain-local schema file when multiple operations reuse it. Use `packages/contracts` when there is a real cross-boundary consumer, such as a form, or existing REST/RPC response sharing—not for every inferred API type.
- Use existing package entry points for auth, database, storage, email and external transports. Their providers do not decide deal ownership, moderation or ingestion rules; those belong to the API domain.
- Never import apps from a shared package. Keep server/client entry points separate and private source aliases local to their workspace.
- New Prisma schema changes require team coordination and regeneration. Use only a confirmed development database for schema push. Never edit generated client code or use raw-query shortcuts.

## 5. Frontend organisation

- `apps/web/src/pages/`: route-level screens and page composition.
- `apps/web/src/modules/<workstream>/`: workstream-specific components, state and helpers; follow that folder's README rather than creating an unrelated global helper.
- `apps/web/src/components/`: presentation reused across web features.
- `packages/ui`: shared BootstrapVueNext exports/styles and cross-app presentation. No API calls or feature ownership logic here.
- `apps/web/src/lib/api-client.ts`: client configuration only. Call it from feature code; don't put every feature operation inside this file.

Use Vue `<script setup lang="ts">`, typed props/emits, `ref` for state and `computed` for derivation. Handle loading, errors and empty states; prevent duplicate submits and restore pending state in `finally`. After a successful mutation, deliberately refresh affected reads or update local state—the plain client does not provide an automatic query cache/invalidation system.

Reuse inferred types when needed:

```ts
import type { RouterOutputs } from '@web/lib/api-client'

type CurrentUserResponse = RouterOutputs['me']
```

Use BootstrapVueNext through the UI package, semantic labelled controls and accessible error feedback. Frontend guards improve UX but never replace server authorization. Keep API runtime, secrets and database code out of Vue imports.

## 6. Working checklist

1. Read the workstream's scope and agree input, output, permissions and public procedure names with its consumers.
2. Create only the required domain/procedure files. Wire the domain `index.ts` into `root.ts`.
3. Add tests for the procedure's valid/invalid input, anonymous access, ownership/roles where relevant, and observable success/failure. Keep shared auth security settings enabled.
4. Add the consuming UI with inferred types and visible loading/error/success behaviour. Update the relevant browser journey.
5. Run the checks below from the repository root. Integration tests supply their own disposable MongoDB; external-provider mocks must be explicit and must not pretend to prove live delivery.
6. Review the whole diff, update relevant docs/AI disclosure, and update the topic PR. Do not push directly to main, force-push, merge or enable auto-merge without authorization.

```sh
bun run format
bun run check:all
bun run audit
git diff --check
```

For a faster development loop, `bun run test:unit`, `bun run test:integration` and `bun run test:e2e` are available separately. The full gate still runs before publication. See [testing details](testing.md) and the [contribution workflow](../CONTRIBUTING.md).
