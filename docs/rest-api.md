# Express REST API and Axios client

The API uses explicit Express routes with ordinary HTTP methods and JSON bodies. The browser calls named Axios functions; this is a REST API, not a generic RPC dispatcher. Better Auth and UploadThing retain their native endpoints.

## Ownership and layout

```text
apps/api/src/
  rest/
    root.ts                     Mounts the domain route assemblies
    routers/
      infrastructure/index.ts  Assembles health, ready and me handlers
      infrastructure/handlers/ One named probe handler per file
      ingestion/index.ts        Assembles ingestion handlers
      ingestion/handlers/       One named handler per file
      platform-admin/index.ts   Assembles platform-admin handlers
      platform-admin/*.ts       One named handler per file
  modules/                       Domain services, policies and persistence
  app.ts                         Common Express app and middleware
packages/contracts/              Browser-safe Zod request/response schemas
packages/api-client/             Public typed Axios factory and client errors
apps/web/src/lib/api-client.ts    Same-origin web wiring and public re-exports
```

Each domain has an `index.ts` that assembles named route handlers. Keep one named handler per file. The central API root mounts domain routers through the common Express boundary; do not add a separate Express app or mount for each operation. Handlers own HTTP input parsing, authentication/authorization and response projection. Reuse existing domain services for business rules, transactions, version checks and concurrency fences.

## Routes and methods

Use resource paths and HTTP methods that describe the operation. GET performs reads only. POST, PUT, PATCH and DELETE are writes and must retain the exact trusted-Origin check on every request. A path must not make an unsupported method act as another method: return 405 with an `Allow` header. In particular, GET and implicit HEAD must never execute writes. Keep `/api/health`, `/api/ready` and `/api/me` compatible. The retired `/api/trpc` path returns 404 and never performs writes.

Better Auth remains mounted at `/api/auth/*`; UploadThing remains mounted at `/api/uploadthing` using its SDK adapter. Do not wrap either provider protocol in application routes or force Axios into their native transports. External-provider transports such as WordPress also keep their own HTTP clients.

## Validation and public contracts

Define browser-safe Zod request and response schemas in `packages/contracts` when both the API and browser need the contract. Infer TypeScript types from those schemas. Validate incoming path, query and body data at runtime, then validate public output where the existing contract requires it. Bound arrays, strings, pagination and query complexity. The request JSON limit is 100kb, including inflated compressed bodies; it is not a limit on valid list responses. Shared pagination schemas accept numeric client inputs and bounded decimal integer query strings with the existing defaults. They deliberately reject booleans, blank strings, scientific notation, fractional representations, duplicate scalar query parameters and arrays for scalar fields rather than using unrestricted number coercion. Ingestion keeps its existing bounded digit-string handling, including leading zeroes; platform-admin query integers use canonical decimal strings. Current filters are scalar: repeated scalar fields and Axios-style array query encodings must not silently become valid single values. Reject malformed JSON, including invalid compressed JSON, and invalid inputs with HTTP 400. Unsupported JSON charset or compression uses a safe 415 error, and oversized input uses 413.

Return explicit public fields. Do not return Prisma records, Better Auth Account/Session data, credentials or provider internals. Keep JSON timestamps as ISO strings. Unknown query and schema keys should follow the established contract rather than silently dropping or widening input.

## Authentication, origin and errors

Resolve the Better Auth session from the current request and its cookies. Do not cache identity at module scope. Recheck current database-backed ADMIN access at the same points as before; preserve transaction fences, authorization checks, optimistic versions and conflict behavior. Keep origin enforcement exact and apply it to every write.

Expected domain-route failures use one JSON error shape with a stable code and safe message. Preserve status and message mapping, including 400 for invalid input, 401 for unauthenticated requests, 403 for forbidden actions, 404 for missing resources, and 409 for conflicts. Keep existing explicit domain messages and code-only default messages. Ingestion's ADMIN denial remains `Administrator required`; platform-admin's denial remains `FORBIDDEN`. The existing probe contracts are retained: `/api/me` returns `{"error":"Unauthorized"}` on an anonymous 401, and the Axios infrastructure function maps that exact, schema-validated probe response to the same safe typed client error. This probe compatibility is not a legacy RPC dispatcher. Nonempty REST request bodies must use `application/json`; unsupported media, charset or compression returns 415. Reject oversized declared or inflated bodies with 413. Better Auth and UploadThing keep their SDK-owned body handling and limits. Map upstream failures to an appropriate safe status. Unexpected failures return a sanitized 500 response without a stack, raw error, Axios configuration, request, headers or cookies. Browser code maps these responses into a non-sensitive `ApiClientError`; do not make UI authorization decisions from client role state or error-message text.

## Browser client

The web app wires its same-origin instance from `@broke-oclock/api-client`. That browser-safe package owns the existing typed Axios factory, named domain functions, runtime validation and public client errors. API integration tests consume the same factory through its declared dev-only dependency, not a web implementation import or a duplicate HTTP client. Credentials, bounded timeout and no automatic mutation retries remain unchanged. Do not build `.query()`/`.mutate()` proxies or a generic RPC dispatcher.

Keep API implementation and Prisma code out of browser imports. The web app does not depend on `apps/api` for router inference. Both sides consume the public browser-safe contract exports from `@broke-oclock/contracts/api`, `/ingestion` and `/platform-admin`. Private contract helpers, including the numeric query parser, are tested inside their owning package. Public aliases must not resolve unexported package subpaths.

Reject queries with more than 1000 raw segments, including empty segments, before Express's simple parser can truncate later fields. The no-input ingestion dashboard accepts only an empty query object. Malformed supported gzip, deflate or Brotli JSON and malformed route parameter encodings return safe 400 responses; unrelated errors remain sanitized 500s. Default application composition derives the ingestion runtime from validated configuration, while explicit injected runtimes remain available for tests.

## Testing and verification

Exercise handlers through real Express HTTP integration tests with disposable MongoDB replicas for authentication, authorization, transaction and persistence behavior. Test the browser Axios client against the actual Express app using Axios's HTTP adapter for representative read, write, error and request-identity cases. Browser component tests and Playwright interceptions remain synthetic fixtures and must be labeled as such; preserve their interaction, error and concurrency assertions. Test malformed input, method allowlists, origin checks, limits, legacy `/api/trpc` 404 behavior and sanitized errors. Production artifacts must run under plain Node without tsx and keep server modules out of browser bundles.
