# Database workspace

Prisma and @prisma/client are pinned together to6.19.3 for MongoDB support. The schema contains Better Auth records plus the approved deal-platform persistence foundation. See [database schema and invariants](../../docs/database-schema.md) for roles, outlet applicability, review, community records, uploads, provenance and rollout. The schema does not implement feature endpoints or business rules.

From repo root: `bun run db:generate`, `bun run db:validate`, `bun run db:push`.

The generated client under `src/generated/prisma/` is ignored. Never hand-edit generated files. MongoDB uses `db push`, not Prisma Migrate. Check DATABASE_URL before any push; tests always construct their own disposable replica set and do not consume the local target.

`src/client.ts` owns the reused server-only Prisma client. Browser code must never import this package. Use typed Prisma operations; raw query escape hatches are prohibited unless explicitly revisited with the team.
