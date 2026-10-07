# API workspace

From repo root use `pnpm run dev:api`, `pnpm run test:integration` or `pnpm run check`. Root scripts explicitly load root `.env` before changing workspace directories. Do not create a separate lockfile or `.env` here.

- `src/config.ts`: startup configuration validation, never prints secret values.
- `src/auth.ts`: Better Auth + Prisma/MongoDB, email/password and real cookie sessions; explicit origin/CSRF enforcement in every environment.
- `src/app.ts`: Express app, security headers, credentialed CORS, Better Auth handler before JSON parser, minimal health/session examples and generic errors.
- `src/server.ts`: loopback listener and graceful shutdown. `src/modules/`: student workstream boundaries.
- `tests/unit/`: fast config boundary checks. `tests/integration/`: real disposable replica-set auth lifecycle.

Existing endpoints: GET `/api/health` (liveness only, `{ok:true}`), GET `/api/ready` (database readiness,503 if unavailable), GET `/api/me` (401 without session; minimal authenticated user fields), and Better Auth `/api/auth/*` including `/api/auth/ok`. No deal/product endpoint exists yet.

Build uses pinned esbuild to produce standalone Node ESM `dist/server.js`, its own ESM package marker and adjacent Prisma schema/native engines. Run `pnpm --dir apps/api run start` or `node apps/api/dist/server.js` from root with the required server environment. No TypeScript runtime, workspace source or installed dependencies are needed by the artifact. Development uses pinned tsx watch mode for extensionless aliases and public workspace TypeScript exports. See root security.md guide under docs/ for production limitations.
