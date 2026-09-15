# Express + Vue tRPC

This follows create-t3-app's server-owned router pattern, adapted to Express and Vue rather than Next.js/React. There is no shared RPC workspace.

```text
apps/api/src/
  trpc/context.ts                 Request context: db, real Better Auth session, trusted-origin flag
  trpc/init.ts                    createTRPCRouter, publicProcedure, protectedProcedure
  trpc/root.ts                    Root appRouter and its inferred AppRouter type
  trpc/routers/infrastructure.ts  Existing health/me procedures
  rpc.ts                         Official Express adapter and request/body/batch limits
  auth.ts                        Auth config mapping and allowlisted session JSON projection
apps/web/src/lib/api-client.ts    Typed client and inferred RouterInputs/RouterOutputs
```

## Ownership and inference

The API owns its context, procedures, HTTP adapter and future domain implementation. Context is created afresh for each request and contains the shared database client plus a verified session. Register student-authored domain subrouters in root.ts; keep validation and authorization at the procedure boundary. Extract app-local services/repositories when complexity or reuse warrants them, not as mandatory empty layers.

The web app has a deliberate **type-only** development dependency on `@broke-oclock/api/types`. The API package export has only a `types` condition, with no runtime target. Always use:

```ts
import type { AppRouter } from '@broke-oclock/api/types'
```

Do not import API implementation through private @api aliases from the web app or add an API runtime barrel. TypeScript reads the server type graph for inference; the browser does not execute it. The web app owns createTRPCClient/httpBatchLink setup and exports `RouterInputs`/`RouterOutputs`, not manually duplicated procedure types.

```ts
import { api } from '@web/lib/api-client'
const health = await api.health.query()
const currentUser = await api.me.query()
```

The existing top-level health/me paths remain unchanged. packages/contracts remains because REST/RPC share response schemas and the web/API share a batch limit; don't create one parallel DTO for every inferred procedure. New feature inputs can be defined alongside their procedure, with a shared schema only when another consumer needs it.

## Preserved behaviour

- Express mounts `/api/trpc`; Better Auth, UploadThing and REST infrastructure routes are unchanged.
- Protected procedures require an actual session. Mutations also require the exact configured origin; record/role authorization remains feature-specific work.
- Inputs/outputs remain Zod-validated. JSON timestamps remain ISO strings: this refactor does not add SuperJSON or change the wire contract.
- Batches and bodies remain bounded; unexpected internal errors stay generic and omit stacks.
- No React hooks/providers, Next.js handler, RSC hydration or artificial development delay was copied.

## Verification

API policy tests and real HTTP/Better Auth/disposable-Mongo tests retain their coverage, including logout and concurrent identities. Web tests verify inferred output types and browser same-origin transport (the browser fixture is explicitly synthetic). Verify actual built client input graphs exclude API/auth/database server modules and runtime imports of the type-only API export fail. Root `bun run check:all` remains the main gate.

Source inspected: [create-t3-app Better Auth/database template](https://github.com/t3-oss/create-t3-app/blob/4709861f7e67a15564c0460c13e7b4b6cfcae40d/cli/template/extras/src/server/api/trpc-app/with-better-auth-db.ts), [root router](https://github.com/t3-oss/create-t3-app/blob/4709861f7e67a15564c0460c13e7b4b6cfcae40d/cli/template/extras/src/server/api/root.ts), [typed client](https://github.com/t3-oss/create-t3-app/blob/4709861f7e67a15564c0460c13e7b4b6cfcae40d/cli/template/extras/src/trpc/react.tsx).
