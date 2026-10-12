LoBangers
IS216 Web Application Development II | G9 | Team Stonkers - LoBangers
Repository/workspace: broke-oclock
Repository: https://github.com/WAD-Stonks/broke-oclock

PROPOSAL
Aligned with IS216_G9_LoBangers_Project_Proposal, updated 4 October 2026:
https://docs.google.com/document/d/1asblldD4jfM9ypkjNeQ-47ydnXJ5j_z3MA2ysA-ehjs/edit
Full overview, implementation status, APIs and Week 8 targets: README.md.

PURPOSE AND SCOPE
Help students find discounted food near them through a map and searchable feed,
with shared cuisine, promotional-price-in-SGD, location and validity filters.
Planned flows include community submissions, votes/comments, saved deals,
merchant access requests, promotions for authorised stalls, separate platform
administration and attributed external imports. Venue history and
promotion-frequency analytics are stretch goals.

TEAM AND CROSS-REVIEW
- Ashley Tan Min Yee: venue pages/feed/search/cuisine and price filters.
  Reviewer: Allison Margaret Loo Li Houng.
- Damien Law Yong Chung: availability votes/comments/reports/freshness.
  Reviewer: Leong Zhi Xin Isaac.
- Lwin Moe Htet (Noah): ingestion/platform administration/merchant approvals/
  stall links/account roles/audit history. Reviewer: Wong Kang En.
- Leong Zhi Xin Isaac: community submission and merchant promotion dashboard.
  Reviewer: Damien Law Yong Chung.
- Allison Margaret Loo Li Houng: map/markers/discovery filters/deal popup.
  Reviewer: Ashley Tan Min Yee.
- Wong Kang En: authentication/profile/saved deals/own submissions/merchant
  request flow and planned email verification/reset. Reviewer: Noah.

BOUNDARIES
Kang En owns user-facing authentication and requests; Noah owns admin approval,
roles and stall links; Isaac owns merchant promotion management. An active
account-to-stall grant is required in addition to the MERCHANT role. The current
schema also retains MODERATOR alongside USER, MERCHANT and ADMIN.

CURRENT STATUS
Implemented: auth/database/test foundation; manual default-off MoneyDigest
import/parsing/deduplication/review at /admin/ingestion; account/role management,
merchant request review, stall grants/revocation and audit at /admin/accounts;
server-side OneMap adapter, UploadThing infrastructure and Resend transport.

Remaining: public discovery, submissions, merchant promotion management,
community features, personal account/saved-deal screens, user-facing merchant
requests, verification/reset email flows and the connected demo. Account
deletion awaits an agreed retention/anonymisation policy. No automatic admin
provisioning or approved deployment is supplied by setup.

The proposal names Scoobify/WordPress.com and @ThisCounted; its Week 8 target is
one permitted public deal API. Current code uses MoneyDigest, not a Telegram
scraper or an active Scoobify feed. Imports remain disabled pending permission
and configuration; scheduled imports and confirmed outlet association remain
separate work. The team must reconcile the final source plan before activation.

STACK
Vue 3/TypeScript/Vue Router/Vite/Bootstrap 5/BootstrapVueNext; Express 5/REST/Axios/Zod;
Better Auth; Prisma 6.19/MongoDB replica set; pnpm workspaces; UploadThing;
OneMap; Resend transport; planned Leaflet/OpenStreetMap/Browser Geolocation;
Vercel hosting target; Biome/Vitest/Playwright/GitHub Actions.

LOCAL SETUP
Install pnpm 10.34.6 and Node 22.18+ (CI: 22.23.1).
Only pnpm manages dependencies; pnpm-lock.yaml is the sole lockfile. Automatic
install scripts are disabled; setup explicitly generates Prisma. Users migrating an existing checkout must remove only root/workspace node_modules before reinstalling, keeping
.env and .local/mongodb. See docs/package-manager.md. From repository root:
  pnpm install --frozen-lockfile --ignore-scripts
  pnpm run setup
Terminal 1:
  pnpm run db:local
Confirm DATABASE_URL targets your intended LOCAL development replica set.
Terminal 2:
  pnpm run db:push
  pnpm run dev
Frontend: http://localhost:5173
API: http://localhost:3000
Admin pages require a real authenticated ADMIN; setup does not promote users.
Never blindly apply db:push to Atlas/production or expose the unauthenticated
local database helper. Development data persists in ignored .local/mongodb/;
integration tests use separate disposable replica sets.

CONFIGURATION
Use .env.example and docs/environment-variables.md. Preserve existing .env.
Runtime production credentials belong in the Vercel API project's environment
settings, not an assumed GitHub-to-Vercel sync. No secrets in VITE_* or Git.
Automatic deployments remain disabled under docs/vercel-setup.md.

TESTS
  pnpm exec playwright install chromium
  pnpm run check:all
  pnpm run audit
Use pnpm run test for Vitest. The full gate checks lint, schema,
types, unit/integration/browser tests and builds. Browser API/provider fixtures
are synthetic; real HTTP/auth/database behaviour is tested separately. A fully
connected browser-to-database demo remains an acceptance task. One documented
Prisma CLI advisory is excepted by the audit policy; see docs/security.md.

WEEK 8 INTERNAL TARGETS (5 TO 11 OCTOBER 2026)
5 October: shared fields, filtering, ownership/deletion rules, thresholds,
provider access and test records agreed.
7 October: first saved-data/authenticated flow per owner.
9 October: connected APIs/screens and assigned cross-reviews.
10 October: student and merchant journeys, integration and responsive fixes.
11 October: Week 9 pitch rehearsal, backup demo and task/reviewer status update.
These are proposal targets, not completion claims or submission deadlines.

ACCEPTANCE JOURNEYS
Student: register/login, submit, find in map/feed, cuisine/price filter, save,
vote and comment.
Merchant: request access, receive approval for one stall, publish/edit/end its
promotion; other stalls and platform-admin actions remain inaccessible.
Ingestion: permitted live API request, stored result, duplicate-free repeat and
visible failed run. Include expired deals, unknown prices, denied geolocation,
invalid forms, duplicate votes and unauthorised writes as failure cases.

GUIDES
README.md; AGENTS.md; docs/development-guide.md; docs/architecture.md;
docs/coding-standards.md; docs/testing.md; docs/ingestion.md;
docs/platform-admin.md; docs/database-schema.md; CONTRIBUTING.md.

AI DISCLOSURE AND FINAL SUBMISSION
Hermes Agent assisted scaffolding, framework/auth, ingestion/parsing/review,
platform-admin feature implementations, pnpm and Node runtime migration, tests, CI and documentation. These
features are not claimed as student-authored. Obtain instructor clearance under
the recorded course restrictions before assessed use; see docs/ai-use.md.
Before final submission add verified deployed/presentation/video links, actual
contributions, complete feature-test results and safe grading-access instructions
through the approved channel. Never publish passwords or fabricate demo results.
