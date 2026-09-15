# @broke-oclock/contracts

Browser-safe Zod schemas and inferred JSON types for existing infrastructure responses: health, readiness, current user and generic REST errors. Public entry: `@broke-oclock/contracts/api`.

Schemas are the source of truth; types are inferred with z.infer. tRPC validates response objects with these schemas and infers frontend call types. The legacy REST infrastructure endpoints use the same JSON shapes; the user projection is shared with tRPC. expiresAt is an ISO timestamp, not a browser Date object.

There are no database/auth-server imports or Prisma models here. Use type-only imports when no runtime parser is needed. New feature input/output schemas must be defined alongside the actual student-authored feature contract; this package does not invent deal-domain schemas.

Root `bun run check:all` includes typechecking and the consuming HTTP/tRPC tests. Internal imports use `@contracts/*`.
