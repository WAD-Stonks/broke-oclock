# LoBangers

**IS216 Web Application Development II | G9 | Team Stonkers - LoBangers**

LoBangers is a Singapore food-deal discovery project built around one question: **what discounted food is near me right now?** It brings scattered promotions into a searchable map and feed, combines community submissions with availability reports, and gives stall owners a separate dashboard for their authorised promotions.

The GitHub repository and workspace retain the technical name `broke-oclock`.

## Proposal and project scope

This README follows the [shared project proposal](https://docs.google.com/document/d/1asblldD4jfM9ypkjNeQ-47ydnXJ5j_z3MA2ysA-ehjs/edit), including its 4 October 2026 update and Week 8 plan. The proposal defines intended product scope; the implementation status below records what is present in this repository.

### Planned user experience

- **Discover food deals:** clustered map markers and a non-map feed, with shared category, cuisine, promotional-price range in SGD, distance and validity filters. Deal details include conditions and source attribution. Deals without a fixed outlet stay in the list rather than receiving invented map pins.
- **Contribute deals:** authenticated submission with title, category, cuisine, promotional price, validity dates, photo and OneMap address selection or a dropped pin. Users manage their own submissions; new submissions begin unverified.
- **Keep information current:** one changeable availability vote per user/deal, comments, reports and freshness indicators. Scheduled expiry remains separate from community reports; outlet-specific reports must not end a chain-wide promotion everywhere.
- **Manage personal activity:** registration/login/logout, profiles, bookmarks, saved deals and a user's own submissions.
- **Manage merchant promotions:** request merchant access, receive admin approval for named stalls, then create, view, edit, delete or end promotions for those stalls only.
- **Administer the platform:** a separate dashboard for account/role management, merchant approvals, stall links, ingestion monitoring and action history. Account deletion requires an agreed retention/anonymisation policy.
- **Aggregate external deals:** import permitted public-source records, parse and deduplicate them, preserve attribution and expose import results/failures.

**Stretch scope:** venue deal history and promotion-frequency insights. The core discovery, contribution and merchant flows take priority.

## Team ownership and cross-review

1. **Ashley Tan Min Yee, Venue Pages and Feed.** List/feed, search, venue summaries, cuisine and price filters; venue-history analytics are stretch work. **Reviewer: Allison Margaret Loo Li Houng.**
2. **Damien Law Yong Chung, Verification and Comments.** Availability votes, comments, reports, freshness indicators and agreed thresholds. **Reviewer: Leong Zhi Xin Isaac.**
3. **Lwin Moe Htet (Noah), Ingestion and Platform Administration.** Permitted-source integration, parsing, geocoding, deduplication, import monitoring, account/role management, merchant approval, authorised stall links and audit history. Account deletion follows the team's agreed policy. **Reviewer: Wong Kang En.**
4. **Leong Zhi Xin Isaac, Deal Submission and Merchant Dashboard.** Community form, cuisine/price/date inputs, photos, location selection and merchant promotion CRUD/end actions with ownership checks. **Reviewer: Damien Law Yong Chung.**
5. **Allison Margaret Loo Li Houng, Browse and Map.** Map, markers/clustering, deal popup and location/category/cuisine/price/validity filters, consistent with the feed. **Reviewer: Ashley Tan Min Yee.**
6. **Wong Kang En, Accounts, Saved Deals and Access Control.** Authentication, sessions, profiles, bookmarks, own submissions, merchant request/status flow and planned verification/reset emails. **Reviewer: Lwin Moe Htet (Noah).**

### Role and ownership boundaries

The proposal distinguishes regular users, merchants and platform admins. The current database retains the additional `MODERATOR` role alongside `USER`, `MERCHANT` and `ADMIN`.

- Kang En owns user-facing authentication and merchant requests.
- Noah owns approval, role changes, account-to-stall grants and platform administration.
- Isaac owns the merchant promotion dashboard and enforces stall ownership in its endpoints.
- A MERCHANT role alone does not grant stall access. An explicit active grant is required, and a merchant must not gain access to other stalls or platform-admin actions.

See [platform-admin contracts and teammate handoffs](docs/platform-admin.md) and [database invariants](docs/database-schema.md).

## Current implementation status

### Implemented

- pnpm monorepo, Vue/Express setup, Better Auth email/password sessions, Prisma/MongoDB integration and automated quality checks.
- **Ingestion administration at `/admin/ingestion`:** bounded manual MoneyDigest imports, conservative parsing, source attribution, deduplication, run/failure monitoring and version-safe draft review. Imports are **disabled by default** pending permitted reuse and source configuration.
- **Platform administration at `/admin/accounts`:** account search/details, role changes, merchant-request approval/rejection, stall grants/revocation and atomic action history. Mutations use current server-side permissions, expected versions and transaction safeguards.
- Server-side OneMap authentication/search adapter, UploadThing integration infrastructure and an opt-in Resend transport package.
- **Community:** revision-aware verification, outlet evidence, comments, content reports and staff moderation through Axios/REST, with a development-only `/community-demo` page. See [local fixture and testing](docs/community.md).

### Still to connect or complete

- Public map/feed, shared cuisine/price discovery queries, community deal submission and merchant promotion management.
- Comments/reports, agreed verification thresholds and outlet-scoped evidence; profiles, bookmarks, own-submission pages and user-facing merchant request/status screens.
- Verification/password-reset email flows, live provider acceptance, scheduled ingestion and confirmed imported-deal outlet association.
- Account deletion after the retention/anonymisation decision, connected end-to-end demo journeys and separately approved deployment.

Schema models and shared packages do not make these remaining workflows complete. The home and getting-started routes are development pages, not a finished public discovery experience.

### Data-source alignment

The proposal still names Scoobify/WordPress.com and `@ThisCounted`, while its Week 8 plan calls for **one permitted public deal API**. The current importer uses **MoneyDigest's WordPress endpoint**, not a Telegram scraper or an active Scoobify feed. No periodic scheduler is configured. The team must reconcile the final source choice and reuse permission before activation; this README does not silently treat those proposal candidates as working integrations.

OneMap currently supports server-side search; connecting Isaac's location picker and verifying live authenticated access remain separate tasks. UploadThing infrastructure does not yet constitute the deal-photo attachment flow, and the Resend package does not automatically send verification/reset emails. See [ingestion](docs/ingestion.md), [photo storage](docs/photo-storage.md) and [environment readiness](docs/environment-variables.md).

## Technology and data

- **Frontend:** Vue 3, TypeScript, Vue Router, Vite, Bootstrap 5, BootstrapVueNext and a typed Axios REST client.
- **Backend:** Express 5, TypeScript and Zod JSON REST resources; Better Auth sessions with Helmet, CORS and origin/CSRF checks.
- **Database:** MongoDB/Atlas through Prisma 6.19. A replica set is required for transactions. MongoDB stores identities/sessions, roles, merchant/outlet records, access requests/grants, deal and community records, source/review metadata and audit history; not every model has a completed feature flow.
- **Images:** UploadThing stores files; MongoDB has fields for file keys/URLs, type, size, uploader and optional deal association.
- **Local database:** `mongodb-memory-server` supports a local replica-set helper and isolated test replicas. Development data persists under ignored `.local/mongodb/`; test databases are disposable.
- **Package manager and runtime:** pnpm 10.34.6 workspaces and the sole `pnpm-lock.yaml`; Node 22 runs the API, pnpm, Vitest, Prisma, Vite and tooling. Pinned tsx 4.23.15 resolves TypeScript/aliases during development; esbuild 0.28.2 produces standalone Node ESM API artifacts. GitHub Actions, Biome and Playwright provide the quality gates.
- **Hosting target:** separate Vercel frontend/API projects. Git-connected setup is not deployment; automatic deployments remain disabled under the documented project configuration.

### APIs and integration boundaries

- **WordPress APIs:** proposal candidate [WordPress.com REST API](https://developer.wordpress.com/docs/api/); current MoneyDigest importer uses its WordPress posts endpoint. Activation requires confirmed reuse permission.
- **[OneMap](https://www.onemap.gov.sg/apidocs/):** Singapore address search/geocoding, with credentials and token handling on the API side.
- **[UploadThing](https://docs.uploadthing.com/backend-adapters/express):** authenticated photo-upload infrastructure; live account setup and feature attachment remain separate.
- **[Resend](https://resend.com/docs/api-reference/emails/send-email):** selected transport for planned account-verification/reset emails.
- **[OpenStreetMap tiles](https://operations.osmfoundation.org/policies/tiles/) with Leaflet:** planned map rendering, subject to attribution and tile-use requirements.
- **[Browser Geolocation](https://www.w3.org/TR/geolocation/):** planned permission-based nearby discovery, with a manual-location fallback.

## First-time setup

Install pnpm **10.34.6** and Node **22.18+** (CI uses **22.23.1**). With Node 22 Corepack, `corepack enable pnpm` enables the shim; invoking `pnpm --version` inside this checkout selects the exact `packageManager` pin. From a local development checkout:

```sh
git clone https://github.com/WAD-Stonks/broke-oclock.git
cd broke-oclock
pnpm install --frozen-lockfile --ignore-scripts
pnpm run setup
```

pnpm is the only package manager. `pnpm-workspace.yaml` disables automatic install scripts and hoisting; Prisma generation is an explicit setup step. Users migrating an existing checkout must remove only the root/workspace `node_modules` directories, then reinstall from the frozen pnpm lockfile. Preserve `.env` and `.local/mongodb`. See [package-manager policy](docs/package-manager.md) and the Node runtime/build guidance.

`setup` preserves an existing `.env`, otherwise creates an ignored local configuration with a random auth secret, and generates Prisma Client. It does not provision Atlas, promote an administrator, seed deals, activate imports or send email.

Start the local database in terminal 1:

```sh
pnpm run db:local
```

This may download MongoDB on first use. The helper is local-only and unauthenticated; never expose it to the internet. It refuses to replace an existing listener on port 27017.

After confirming that `DATABASE_URL` targets your intended **local development replica set**, apply the schema and start the apps in terminal 2:

```sh
pnpm run db:push
pnpm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:3000`
- Better Auth: `/api/auth`
- Ingestion dashboard: `/admin/ingestion`
- Platform-admin dashboard: `/admin/accounts`

Vite proxies `/api` to Express. Admin pages require a real authenticated ADMIN account; setup does not create or promote one. Provisioning or demo fixtures require an explicitly approved isolated setup. MongoDB uses schema push, not Prisma Migrate; never run `db:push` blindly against Atlas or production.

## Configuration and deployment boundary

Use [`.env.example`](.env.example) and the [environment inventory](docs/environment-variables.md). Server credentials must never appear in `VITE_*`, browser code or committed files.

Production runtime values belong directly in the **Vercel API project's environment settings**, not in an assumed GitHub-to-Vercel sync. Existing GitHub `production` settings are retained but are not automatically copied to Vercel. The web app currently requires no frontend environment variables.

Imports remain off until `INGESTION_ENABLED` and `MONEYDIGEST_REUSE_APPROVED` are intentionally enabled with a configured source. Provider credentials alone do not implement missing workflows or authorize deployment. See [Vercel setup and safety boundaries](docs/vercel-setup.md).

## Commands and verification

```sh
pnpm run dev:web          # Vue only
pnpm run dev:api          # Express only
pnpm run db:generate      # Generate Prisma Client
pnpm run db:validate      # Validate Prisma schema
pnpm run format          # Biome formatting/import fixes
pnpm run lint            # Biome checks
pnpm run typecheck       # Workspace and tool types
pnpm run test:unit        # API, web and shared-package unit tests
pnpm run test:packages    # Shared-package tests only
pnpm run test:integration # Real HTTP/auth/Prisma with disposable MongoDB
pnpm exec playwright install chromium
pnpm run test:e2e         # Chromium browser tests
pnpm run build           # API and web builds
pnpm run check:all       # Full local quality gate
pnpm run audit           # Documented dependency-audit policy
```

Use `pnpm run test` for this Vitest project. For an isolated worktree without `.env`, Prisma validation can use the non-connecting URI described in [testing](docs/testing.md); integration suites supply their own disposable databases.

Most browser tests use explicitly synthetic API/provider responses. The community voting journey forwards browser calls to a real isolated Express API and disposable MongoDB database. API integration tests also exercise real HTTP, authentication and database behaviour. These tests do not claim that the proposal's complete connected demo already works. CI records verification for each PR commit; no test count is a permanent project guarantee.

## Week 8 plan: 5 to 11 October 2026

These are **internal proposal targets**, not submission deadlines or completion claims:

- **5 October:** confirm shared deal fields/filter semantics, merchant-access and deletion rules, verification thresholds, provider access and common test records. Keep unknown prices distinct from zero-priced deals.
- **7 October:** each owner demonstrates a first saved-data or authenticated API flow and requests review.
- **9 October:** connect screens to shared APIs and complete assigned cross-reviews, including map/feed consistency and merchant approval/ownership.
- **10 October:** run student and merchant journeys together; fix integration, permissions and responsive-layout failures.
- **11 October:** rehearse the Week 9 pitch, prepare a backup demo and record each task as COMPLETE, INCOMPLETE or BLOCKED with reviewer and next action.

Pitch split: Ashley covers problem/features; Noah covers stack/data/APIs; Kang En covers task/role boundaries; Allison, Isaac and Damien cover demo flows.

### Connected-demo acceptance

- **Student:** register/login, submit, discover in map and feed, filter by cuisine/price, save, vote and comment.
- **Merchant:** request access, receive approval for one stall, publish/edit/end its promotion, and remain unable to manage another stall or call admin actions.
- **Ingestion:** demonstrate a permitted live external API request and stored result, repeat it without duplicates, and inspect a failed-run record.
- **Failures:** expired deals, unknown prices, denied geolocation, invalid inputs, duplicate votes, logged-out writes and unauthorised merchant/admin actions.

Each owner supplies tests and a short run/demo note. The assigned reviewer checks the feature in Chrome and records the outcome. Venue-history analytics stay behind these core flows.

## Repository guide

- `apps/web`: Vue pages, feature modules, routes and typed client calls.
- `apps/api`: Express setup, named REST handlers, request-scoped identity and app-owned services.
- `packages`: shared auth, database, storage, contracts, integrations, email and UI.
- `e2e`: Playwright journeys; `scripts`: local setup, builds and test tooling.
- `docs`: architecture, contracts, setup, security and ownership guidance.

The API serves the health, readiness and current-user probes at `GET /api/health`, `GET /api/ready` and `GET /api/me`. Domain route assemblies expose conventional HTTP resources; the browser uses explicit Axios functions grouped by domain and contracts from `packages/contracts`. The retired `/api/trpc` endpoint returns 404. Better Auth and UploadThing keep their native endpoints.

Read [AGENTS.md](AGENTS.md), [development guide](docs/development-guide.md), [architecture](docs/architecture.md), [coding standards](docs/coding-standards.md), [platform-admin handoff](docs/platform-admin.md), [testing](docs/testing.md) and [contribution workflow](CONTRIBUTING.md). Earlier planning material in `docs/feature-plan.md` and `docs/contracts.md` must be reconciled with the current proposal and implemented contracts where it differs.

## Security, disclosure and final submission

This repository is public. Never commit credentials, session-state files, personal records, generated clients or unlicensed publisher fixtures. The dependency audit retains one documented Prisma CLI exception; `pnpm run audit` passing does not mean an unfiltered audit is clean. See [security notes](docs/security.md).

AI-assisted work includes scaffolding, framework/auth integration, ingestion, platform-admin and community-voting feature implementations, tests, CI and documentation. The [AI-use disclosure](docs/ai-use.md) records this work and the course restrictions; instructor clearance remains separate from code verification. Do not present AI-assisted features as student-authored work.

Keep [README.txt](README.txt) aligned for final submission. Add verified deployment/presentation/video links, actual contributions, complete feature-test results and safe grading-access instructions when available. Do not publish account passwords or invent deployment/demo results.
