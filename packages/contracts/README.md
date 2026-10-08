# @broke-oclock/contracts

Browser-safe Zod schemas and inferred JSON types for API request and response contracts. Public entries are `@broke-oclock/contracts/api`, `/ingestion` and `/platform-admin`; the schemas cover infrastructure responses, structured REST errors and the current admin resource contracts.

Schemas are the source of truth; types are inferred with `z.infer`. The Express API validates incoming and outgoing data with shared schemas where required, and the Axios client validates public responses. Health, readiness and current-user endpoints return their documented JSON shapes. `expiresAt` is an ISO timestamp, not a browser Date object.

There are no database/auth-server imports or Prisma models here. Use type-only imports when no runtime parser is needed. New feature input/output schemas must be defined alongside the actual student-authored feature contract; this package does not invent deal-domain schemas.

Root `pnpm run check:all` includes typechecking and HTTP/contract tests. Internal imports use `@contracts/*` only inside this owning package. Private numeric-query helpers are tested in `tests/query.test.ts`; their private subpaths are not public package exports. Node and TypeScript resolution regressions cover both API and root browser-test consumers.

Keep shared schemas browser-safe and limited to contracts actually consumed across the API/web boundary. REST route implementations and domain behavior stay in `apps/api`; the web client exposes named functions grouped by domain and imports inferred request/response types from this package.
