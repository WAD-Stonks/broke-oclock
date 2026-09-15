# @broke-oclock/auth

Shared Better Auth infrastructure. Apps depend on the package, not each other.

## Entry points

- `@broke-oclock/auth/server`: `createAuth({ baseURL, secret, trustedOrigin })`. Uses the shared Prisma/MongoDB client from `@broke-oclock/db`; accepts already-validated server configuration rather than importing an app or loading env values.
- `@broke-oclock/auth/node`: Better Auth's `toNodeHandler` and `fromNodeHeaders` adapters for the API's HTTP boundary.
- `@broke-oclock/auth/client`: same-origin Vue `authClient`, targeting `/api/auth`. The web app supplies the optional Vue peer dependency.
- `@broke-oclock/auth/types`: type-only `AuthConfig`, `Auth`, `Session` and `User` contracts inferred from the server factory.

Server and Node entry points reject browser resolution. There is no mixed runtime barrel. Use `@auth/*` only inside this package; other workspaces must consume public exports.

## Ownership and unchanged behaviour

The package owns Better Auth and its Prisma adapter. `apps/api/src/auth.ts` maps validated app configuration into the factory; `apps/api/src/app.ts` mounts the HTTP handler before JSON body parsing. API routes still own feature authorization. `apps/web/src/lib/auth-client.ts` re-exports the shared client for app-local callers.

This extraction preserves the endpoint, exact trusted origin, email/password flow, session behavior, existing rate limits, enabled CSRF/origin checks, MongoDB transactions and Prisma ObjectID generation. Environment names are unchanged. The later schema expansion adds User.role with USER/MODERATOR/ADMIN; see [database-schema.md](../../docs/database-schema.md). No OAuth, email verification, reset-password delivery or account UI has been added.

The role is a server-owned Better Auth additional field (`input: false`, default USER), not the admin plugin. The Vue client infers its response type without importing server code at runtime. Session cookie caching is explicitly disabled so DB-side role changes appear on the next session read. There are no public role-management endpoints or assigned real-user staff roles. Future moderator/admin feature procedures must implement server authorization.

Run root `bun run check:all`. The API integration suite exercises real signup, login, session persistence/revocation and hostile-origin rejection against disposable MongoDB. Upload integration also uses real auth. The browser auth-client test verifies actual client transport with a synthetic null-session response, not a live backend login. Include this TypeScript workspace and its dependency graph when implementing deployment packaging.
