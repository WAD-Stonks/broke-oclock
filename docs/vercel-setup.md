# Vercel setup — not deployed

## Projects and safety boundary

Both projects exist in `noahmhs-projects` (`team_FRUcWuiMYuhmD9AYY8BStn20`). Neither has a Git integration link, deployment, cron or deployment workflow. Both checked-in Vercel configs set `git.deploymentEnabled: false` as an additional guard. Local builds are not deployments. Do not run bare `vercel`, `vercel deploy`, connect Git, change protection, or apply the Atlas schema without explicit approval.

- Web: [broke-oclock-web](https://vercel.com/noahmhs-projects/broke-oclock-web), ID `prj_6U8UcFhnd4LDw97qaROzzuMRhkWq`, root `apps/web`, framework Vite, output `dist`.
- API: [broke-oclock-api](https://vercel.com/noahmhs-projects/broke-oclock-api), ID `prj_lPCumjeKv8KG8TOS1ATPyA9vDbyk`, root `apps/api`, custom Build Output API (framework setting Other).
- Assigned domains: `broke-oclock-web.vercel.app` and `broke-oclock-api.vercel.app`. They are reserved project domains, not live application verification.
- Both projects: Node `22.x`, include source files outside the root directory, install command `cd ../.. && bun install --frozen-lockfile --ignore-scripts`. The root packageManager pins Bun.
- Web build: `bun run build`.
- API build: `cd ../.. && bun run db:generate && bun run scripts/build-vercel-api.ts`.

## Why a custom API build

The native Express build succeeded but its generated Node handler still imported `@api/auth`; loading that artifact failed with ERR_MODULE_NOT_FOUND. It also selected the app factory rather than a ready default-exported HTTP app. A successful build alone was not a usable function.

`apps/api/src/vercel.ts` default-exports the existing Express factory result, without a listener or shutdown handlers. Local `src/server.ts` remains unchanged. The build script bundles TypeScript aliases and workspace dependencies into one ESM Node function. ESM is necessary because UploadThing contains `import.meta` and cannot safely be emitted as CommonJS by this Bun version.

The output is `apps/api/.vercel/output`, with an `api.func` handler and catch-all routing that retains the original request path for the Express `/api/*` routes. Vercel CLI collects this into its selected output directory. This is packaging, not new product endpoints.

Prisma generation includes `native` and `rhel-openssl-3.0.x`; the function explicitly targets Linux x86_64/Node22. The script copies schema and native-engine files beside the bundled client. No credentials are embedded. Never deploy a macOS-generated artifact to another architecture without checking its target engine; prefer a Linux build for the first approved release. Neither this script nor Vercel builds run `db push`.

## Routing

`apps/web/vercel.json` forwards `/api/:path*` to the API project first, then uses `/index.html` for SPA history-mode routes. Browser clients remain same-origin. This production upstream is not a preview-isolation strategy: do not enable previews until separate database/auth origins and a matching API upstream are designed. Git deployments are disabled meanwhile.

## Environment readiness

The API project's production configuration contains:

- `WEB_ORIGIN=https://broke-oclock-web.vercel.app`
- `BETTER_AUTH_URL=https://broke-oclock-web.vercel.app`
- `PHOTO_STORAGE_PROVIDER=uploadthing`

The web needs no private environment variables. Nothing has been copied from local `.env` or from GitHub secrets. GitHub Environment secrets cannot be read back via GitHub CLI and are not automatically transferred by Vercel Git integration.

Before deployment, securely populate `DATABASE_URL` and the existing intended `BETTER_AUTH_SECRET` in the API project. Do not replace a previously used auth secret casually. Add `UPLOADTHING_TOKEN` only when live uploads are intended; without it uploads return 503. Resend flows remain disabled/unimplemented. Do not populate the API with VERCEL_TOKEN, reserved OneMap settings, or other unused credentials.

Vercel's default SSO protection is preserved (`all_except_custom_domains`). That protection can block unauthenticated requests to the assigned vercel.app domains, including the cross-project proxy. Decide approved public-production access/custom domains or a supported server-side bypass before deployment. Do not put a bypass token in frontend code or silently turn protection off.

## Build-only verification

Run each project block from the root of a separate clean checkout/build workspace. Do not share the same `.vercel` environment cache between API and web: this CLI preserves keys absent from the next project, which could carry API secrets into a web build. Pull changes `.vercel/project.json` and its cached environment. Keep `.vercel/` and `.env.local` ignored. `vercel link` may create `.env.local` containing a private OIDC token—never commit or print it.

```sh
# Web: settings and environment cache only, then local production-format build.
VERCEL_PROJECT_ID=prj_6U8UcFhnd4LDw97qaROzzuMRhkWq VERCEL_ORG_ID=team_FRUcWuiMYuhmD9AYY8BStn20 vercel pull --yes --environment production --scope noahmhs-projects
VERCEL_PROJECT_ID=prj_6U8UcFhnd4LDw97qaROzzuMRhkWq VERCEL_ORG_ID=team_FRUcWuiMYuhmD9AYY8BStn20 vercel build --prod --yes --scope noahmhs-projects

# API: same build-only commands, explicitly select the API project.
VERCEL_PROJECT_ID=prj_lPCumjeKv8KG8TOS1ATPyA9vDbyk VERCEL_ORG_ID=team_FRUcWuiMYuhmD9AYY8BStn20 vercel pull --yes --environment production --scope noahmhs-projects
VERCEL_PROJECT_ID=prj_lPCumjeKv8KG8TOS1ATPyA9vDbyk VERCEL_ORG_ID=team_FRUcWuiMYuhmD9AYY8BStn20 vercel build --prod --yes --scope noahmhs-projects
```

For setup validation, supply a disposable/non-connecting DATABASE_URL to generation rather than borrowing production credentials. The API integration suite builds the function, copies it outside the repository with no node_modules, and executes it under Node against a fresh MongoDB replica. It verifies health, DB readiness, real signup/session default role, hostile-origin rejection and disabled uploads. This runs the local native engine, not the Linux binary; cloud launcher/network/proxy/UploadThing validation still requires an explicitly approved deployment.

Run `bun run check:all`, `bun run audit`, and inspect both local Vercel outputs. Read back both projects' deployment lists to confirm setup did not deploy. The project IDs above are public configuration identifiers, not credentials.
