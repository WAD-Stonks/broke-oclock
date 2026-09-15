# @broke-oclock/rpc

End-to-end typed tRPC on the existing Express API; Vue uses the framework-independent client.

## Public entry points

- `/server`: router, public/protected procedure foundations and the canonical current-user JSON projection. Server only.
- `/express`: the official Express adapter. Server only.
- `/client`: createRpcClient({ url?, fetch? }); defaults to same-origin /api/trpc, includes cookies and bounds batches.
- `/types`: type-only AppRouter/RpcContext contracts.

The API mounts /api/trpc and creates a fresh context from actual Better Auth request headers. No global current-user state. Protected procedures require a session; mutations also require the exact configured WEB_ORIGIN. RPC errors omit development stacks. Client/server batch limits share one constant; API payloads are bounded.

Current procedures are infrastructure only: `health.query()` and authenticated `me.query()`. Both reject unexpected input and validate outputs using packages/contracts schemas. Existing REST health/readiness/me routes remain compatible; Better Auth and UploadThing retain their official handlers. This is not a deal API.

```ts
// Inside apps/web
import { api } from '@web/lib/api-client'
const health = await api.health.query()
const currentUser = await api.me.query()
// Both results and arguments are inferred; no response casts or generated SDK.
```

Router definitions live in this package, never import an app, and expose only types to the client. Future student-authored procedures should validate input/output and can receive app-owned services through typed context injection. Record/role authorization is still required beyond authentication. Do not implement assessed domain logic as part of infrastructure scaffolding.

Use `@rpc/*` internally and public exports across workspaces. Root typechecks and package policy tests cover compile-time inference and guard behaviour. API integration tests use actual HTTP, the typed client, Better Auth and disposable MongoDB. Browser transport tests use an explicitly synthetic response; they do not claim a live login.
