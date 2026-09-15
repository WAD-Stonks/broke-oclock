# API workspace

From repo root use `bun run dev:api`, `bun run test:integration` or `bun run check`. Root scripts explicitly load root `.env` before changing workspace directories. Do not create a separate lockfile or `.env` here.

- `src/config.ts`: startup configuration validation, never prints secret values.
- `src/auth.ts`: Better Auth + Prisma/MongoDB, email/password and real cookie sessions; explicit origin/CSRF enforcement in every environment.
- `src/app.ts`: Express app, security headers, credentialed CORS, Better Auth handler before JSON parser, minimal health/session examples and generic errors.
- `src/server.ts`: loopback listener and graceful shutdown. `src/modules/`: student workstream boundaries.
- `tests/unit/`: fast config boundary checks. `tests/integration/`: real disposable replica-set auth lifecycle.

Existing endpoints: GET `/api/health` (liveness only, `{ok:true}`), GET `/api/ready` (database readiness,503 if unavailable), GET `/api/me` (401 without session; minimal authenticated user fields), and Better Auth `/api/auth/*` including `/api/auth/ok`. No deal/product endpoint exists yet.

Build produces `dist/server.js` for Bun; run using `bun run scripts/workspace.ts apps/api start` from root. Workspace DB sources/generated client and installed dependencies must remain available. It is not a standalone single-file deployment bundle. See root security.md guide under docs/ for production limitations.
