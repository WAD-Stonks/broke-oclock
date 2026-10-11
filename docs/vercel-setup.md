# Vercel setup - not deployed

## Projects and safety boundary

Both projects exist in `noahmhs-projects` (`team_FRUcWuiMYuhmD9AYY8BStn20`) and are connected to `WAD-Stonks/broke-oclock`. Automatic Git deployment creation is disabled in each project's settings (`gitProviderOptions.createDeployments: "disabled"`); both checked-in Vercel configs also set `git.deploymentEnabled: false` as an additional guard. Neither project has a deployment, and no cron or deployment workflow is configured. Git connection and local builds are not deployments. Do not enable automatic deployments, run bare `vercel` or `vercel deploy`, change protection, or apply the Atlas schema without explicit approval.

- Web: [broke-oclock-web](https://vercel.com/noahmhs-projects/broke-oclock-web), ID `prj_6U8UcFhnd4LDw97qaROzzuMRhkWq`, root `apps/web`, framework Vite, output `dist`.
- API: [broke-oclock-api](https://vercel.com/noahmhs-projects/broke-oclock-api), ID `prj_lPCumjeKv8KG8TOS1ATPyA9vDbyk`, root `apps/api`, custom Build Output API (framework setting Other).
- Assigned domains: `broke-oclock-web.vercel.app` and `broke-oclock-api.vercel.app`. They are reserved project domains, not live application verification.
- Checked-in install command for both projects: `cd ../.. && pnpm install --frozen-lockfile --ignore-scripts`. Root `packageManager` pins pnpm 10.34.6. Node remains `22.x`; source outside each project root must be included.
- Checked-in web build: `pnpm run build`.
- Checked-in API build: `cd ../.. && pnpm run build:vercel:api`. This explicitly generates Prisma and runs pinned esbuild through Node/tsx. All install hooks remain disabled; no runtime bootstrap, global executable or lifecycle exception is needed.
- On 11 October 2026, Noah authorized updating the live setup. Both projects' install/build overrides were changed from Bun to the commands above and independently read back. Node `22.x`, roots/frameworks, shared-source inclusion, disabled Git deployments and deployment protection were also verified. Both deployment lists were empty; no Vercel build or deployment was performed.

## Why a custom API build

The native Express build succeeded but its generated Node handler still imported `@api/auth`; loading that artifact failed with ERR_MODULE_NOT_FOUND. It also selected the app factory rather than a ready default-exported HTTP app. A successful build alone was not a usable function.

`apps/api/src/vercel.ts` default-exports the existing Express factory result, without a listener or shutdown handlers. Local `src/server.ts` remains unchanged. The build script bundles TypeScript aliases and workspace dependencies into one ESM Node function. ESM preserves UploadThing's `import.meta`; a Node `createRequire`/filename/directory bridge supports bundled CommonJS dependencies and Prisma native loading. Local production uses the same bundling/engine-copy path.

The output is `apps/api/.vercel/output`, with an `api.func` handler and catch-all routing that retains the original request path for the Express `/api/*` routes. Vercel CLI collects this into its selected output directory. This is packaging, not new product endpoints.

Prisma generation includes `native` and `rhel-openssl-3.0.x`; the function explicitly targets Linux x86_64/Node22. The script copies schema and native-engine files beside the bundled client. No credentials are embedded. Never deploy a macOS-generated artifact to another architecture without checking its target engine; prefer a Linux build for the first approved release. Neither this script nor Vercel builds run `db push`.

## Routing

`apps/web/vercel.json` forwards `/api/:path*` to the API project first, then uses `/index.html` for SPA history-mode routes. Browser clients remain same-origin. This production upstream is not a preview-isolation strategy: do not enable previews until separate database/auth origins and a matching API upstream are designed. Git deployments are disabled meanwhile.

## Environment readiness

The API project's production configuration was verified on 11 October 2026:

- `WEB_ORIGIN=https://broke-oclock-web.vercel.app`
- `BETTER_AUTH_URL=https://broke-oclock-web.vercel.app`
- `PHOTO_STORAGE_PROVIDER=uploadthing`
- `NODE_ENV=production`
- `INGESTION_ENABLED=false`
- `MONEYDIGEST_REUSE_APPROVED=false`

The two origins and storage-provider value matched the intended settings. The final three values were added during the authorized setup update and read back. `DATABASE_URL` and `BETTER_AUTH_SECRET` were absent, with no hidden production variables reported. Google, Resend, OneMap and UploadThing credential variables were also absent. This is a dated setup snapshot, not database or live-provider acceptance.

Manage runtime values directly in **broke-oclock-api → Settings → Environment Variables → Production**. The web currently needs no environment variables. GitHub Environment secrets cannot be read back via GitHub CLI and are not automatically transferred by Vercel Git integration. GitHub-to-Vercel secret synchronization is not planned; existing GitHub settings are retained but are not the Vercel runtime source.

Before deployment, securely populate `DATABASE_URL` with the intended Atlas database and the existing intended `BETTER_AUTH_SECRET` in the API project's Production environment. Do not replace a previously used auth secret casually. Native Google and email-OTP sign-in/recovery are implemented but unavailable without their configured provider pairs. Google needs `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and the exact frontend-origin callback `/api/auth/callback/google`; email needs `RESEND_API_KEY`/`EMAIL_FROM` with a verified sender. OneMap lookup needs `ONEMAP_EMAIL`/`ONEMAP_EMAIL_PASSWORD`. Add `UPLOADTHING_TOKEN` only when live uploads are intended; without it uploads return 503. See [the environment inventory](environment-variables.md) for consumers and acceptance boundaries. Do not add VERCEL_TOKEN or unused legacy settings to app runtime. Environment entry does not authorize deployment, database schema application or administrator provisioning.

Vercel's default SSO protection is preserved (`all_except_custom_domains`). That protection can block unauthenticated requests to the assigned vercel.app domains, including the cross-project proxy. Decide approved public-production access/custom domains or a supported server-side bypass before deployment. Do not put a bypass token in frontend code or silently turn protection off.

## Build-only verification

Run each project block from the root of a separate clean checkout/build workspace. Do not share the same `.vercel` environment cache between API and web: this CLI preserves keys absent from the next project, which could carry API secrets into a web build. Pull changes `.vercel/project.json` and its cached environment. Keep `.vercel/` and `.env.local` ignored. `vercel link` may create `.env.local` containing a private OIDC token-never commit or print it.

```sh
# Web: settings and environment cache only, then local production-format build.
VERCEL_PROJECT_ID=prj_6U8UcFhnd4LDw97qaROzzuMRhkWq VERCEL_ORG_ID=team_FRUcWuiMYuhmD9AYY8BStn20 vercel pull --yes --environment production --scope noahmhs-projects
VERCEL_PROJECT_ID=prj_6U8UcFhnd4LDw97qaROzzuMRhkWq VERCEL_ORG_ID=team_FRUcWuiMYuhmD9AYY8BStn20 vercel build --prod --yes --scope noahmhs-projects

# API: same build-only commands, explicitly select the API project.
VERCEL_PROJECT_ID=prj_lPCumjeKv8KG8TOS1ATPyA9vDbyk VERCEL_ORG_ID=team_FRUcWuiMYuhmD9AYY8BStn20 vercel pull --yes --environment production --scope noahmhs-projects
VERCEL_PROJECT_ID=prj_lPCumjeKv8KG8TOS1ATPyA9vDbyk VERCEL_ORG_ID=team_FRUcWuiMYuhmD9AYY8BStn20 vercel build --prod --yes --scope noahmhs-projects
```

For setup validation, supply a disposable/non-connecting DATABASE_URL to generation rather than borrowing production credentials. The API integration suite builds the function, copies it outside the repository with no node_modules, and executes it under Node against a fresh MongoDB replica. It verifies health, DB readiness, real signup/session default role, hostile-origin rejection and disabled uploads. This runs the local native engine, not the Linux binary; cloud launcher/network/proxy/UploadThing validation still requires an explicitly approved deployment.

Run `pnpm run check:all`, `pnpm run audit`, and inspect both local Vercel outputs. Read back both projects' deployment lists to confirm setup did not deploy. The project IDs above are public configuration identifiers, not credentials.
