# @broke-oclock/api-client

Browser-safe typed Axios factory and non-sensitive `ApiClientError`, exposed through `@broke-oclock/api-client`. The web app wires its same-origin `api` instance and re-exports the public helpers from `apps/web/src/lib/api-client.ts`. API integration tests consume this same factory through a dev-only workspace dependency, avoiding app-to-app implementation imports and duplicate test clients.

The package keeps explicit infrastructure, ingestion and platform-admin functions, inferred request/response types, runtime schema validation, credentials, bounded timeouts and no automatic mutation retries. Request bodies retain their 100 KiB bound; valid responses are not restricted to that request-body limit. Shared schemas come only from the approved public `@broke-oclock/contracts` exports.

No app, Prisma, auth-server, environment or provider implementation is imported here. Better Auth and UploadThing keep their native clients. The package does not add student-owned domain behavior or a generic RPC dispatcher.

Root `pnpm run check:all` typechecks this package and exercises the existing web client unit suite, actual Axios HTTP integration and browser interactions. See [REST API conventions](../../docs/rest-api.md) and [package boundaries](../../docs/architecture.md#dependency-boundaries).
