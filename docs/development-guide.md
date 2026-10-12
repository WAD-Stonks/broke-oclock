# How to code in this repository

Start with [setup](../README.md#first-time-setup), [architecture](architecture.md), [import rules](coding-standards.md#imports-and-aliases) and the owning workstream README. This guide explains where code belongs and how the pieces connect. Domain implementations remain student-owned under the [course AI policy](ai-use.md).

## API convention: Express REST routes

Use explicit HTTP resources and methods. The API has one common Express app and mount; each domain has an `index.ts` to assemble named handlers, with one named handler per file:

```text
apps/api/src/
  rest/
    root.ts                     Mounts domain route assemblies
    routers/infrastructure/     Named health, ready and me handlers
    routers/ingestion/          Index plus handlers directory
    routers/platform-admin/     Index plus one named handler per file
  modules/
    <domain>/                   Existing app-local services, policies and repositories
```

Names above illustrate responsibilities. Follow the existing API folder names when editing the implementation. Create files for implemented work, not empty folders for the backlog. Keep route assembly focused; handlers parse and validate HTTP input, resolve request-scoped identity, authorize, call existing domain logic and project a public response. Put substantive reusable business logic in the owning module rather than a generic transport layer.

The API root assembles domain routers only. Mount them from the common Express app rather than creating another Express app or independent mount for every operation. Better Auth and UploadThing retain their native handlers.

## Define and assemble an operation

An operation is an ordinary route with a resource path and method. For example, a read might use `GET /api/ingestion/dashboard`; a state-changing action might use `POST /api/ingestion/runs`. The route registration points to a named handler imported from its own file. Do not expose a generic method-dispatch endpoint.

GET routes only read. POST, PUT, PATCH and DELETE routes perform writes and enforce the exact trusted-Origin policy. Unsupported methods return 405 with an `Allow` header. GET and implicit HEAD must never run write logic. Keep `/api/health`, `/api/ready` and `/api/me` compatible. The retired `/api/trpc` path returns 404 and never performs writes.

Use `packages/contracts` for browser-safe Zod input and output schemas shared across the API and web app. Infer TypeScript types from schemas instead of duplicating interfaces. Parse path, query and body values at the route boundary. Shared query parsers define number coercion, defaults, pagination caps and array limits explicitly. Validate output projections where the previous public contract requires runtime validation. Preserve existing response fields and JSON timestamp formats.

## Browser client

The browser imports explicit Axios functions grouped by domain from `apps/web/src/lib/api-client.ts` and feature modules. The web module wires the shared browser-safe factory from `@broke-oclock/api-client`; real HTTP tests consume that same public factory without importing a web implementation. Functions name the operation directly, for example `infrastructure.health()` or `ingestion.reviewDraft(dealId, input)`. Do not add `.query()`/`.mutate()` proxies or a generic RPC dispatcher.

Configure Axios for same-origin requests, credentials, a bounded timeout and no automatic mutation retries. Validate public responses with the shared schemas where required. Map consistent REST error responses to a non-sensitive `ApiClientError` while preserving UI handling for conflict, forbidden and unauthenticated cases. The client must not expose raw Axios request/config/header/cookie details or arbitrary server errors. Better Auth continues to use its own client; UploadThing continues to use its SDK helper.

The web app consumes browser-safe contracts from `@broke-oclock/contracts/api`, `/ingestion` and `/platform-admin`. It does not import API implementation or depend on the API workspace for router inference. Never import `/server`, Prisma, secrets or auth-server modules into browser code.

## Validation, authorization and errors

- Derive the acting identity from the verified request's Better Auth cookie session. Never keep the current user in module-level state or trust IDs and roles supplied by the browser.
- Recheck current database-backed ADMIN access at the same points as before. Preserve ownership rules, exact origin validation, transaction fences, version checks and known race behavior.
- Bound strings, arrays, query values, pagination, body size and response serialization. The REST request limit is 100 KiB, including inflated JSON. Reject malformed JSON and invalid input with 400, oversized bodies with 413, and unsupported media, charset or compression with 415. Keep native SDK body handling unchanged.
- Return only explicit public fields, never full Prisma or Better Auth Account/Session records.
- Use the application REST JSON error shape with stable codes and safe messages. Preserve 401 unauthenticated, 403 forbidden, 404 missing resource and 409 conflict behavior. The compatible anonymous `/api/me` probe is the deliberate exception: its exact body remains `{"error":"Unauthorized"}`, and only that endpoint's 401 body is normalized by the typed client. Keep explicit and code-only domain messages unchanged. Map expected validation and upstream errors deliberately. Redact unexpected failures as a generic 500 without stacks or debug details.
- A browser role or error-message string never grants permission. UI recovery must recheck access through the server.

## Existing domain logic and coursework boundary

Transport changes must call existing services and policies without rewriting their business rules. Do not introduce deal CRUD, voting, ingestion, moderation, geospatial rules or upload attachment/callback persistence unless that feature is separately authorized by the project policy. Read the owning module README and [AI-use policy](ai-use.md) before changing domain behavior.

Keep Better Auth at `/api/auth/*` and UploadThing at `/api/uploadthing` using their official handlers. Do not wrap their protocols in application routes. External-provider transports keep their own clients.

## Vue feature modules

Keep endpoint calls near their owning feature, with shared request/response contracts in `packages/contracts` only where there is a real cross-boundary consumer. Use Vue `<script setup lang="ts">`, typed props/emits, `ref` for state and `computed` for derivation. Handle loading, errors and empty states; prevent duplicate submissions and restore pending state in `finally`. After a successful write, deliberately refresh affected reads or update local state; the plain Axios client does not provide automatic query caching or invalidation.

See [REST API guide](rest-api.md) for complete transport, error, client and test conventions.
