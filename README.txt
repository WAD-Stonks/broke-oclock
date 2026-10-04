Broke O'Clock — WAD2 project starter

Repository: https://github.com/WAD-Stonks/broke-oclock
Status: infrastructure starter, NOT final project deliverable.

SETUP: Install Bun1.4.2 and Node22.18+. From repository root:
  bun install --frozen-lockfile
  bun run setup
Terminal1: bun run db:local
Terminal2: bun run db:push; bun run dev
Frontend: http://localhost:5173 ; API: http://localhost:3000

TEST: bunx playwright install chromium; bun run check:all

Full setup, folder structure, coding standards, limitations and official links:
README.md and docs/architecture.md, docs/coding-standards.md, docs/testing.md.

AI DISCLOSURE: Hermes Agent assisted initial scaffolding, framework/auth,
ingestion/parsing/review and platform-admin feature implementations, tests, CI
and documentation. These features are not claimed as student-authored work.
Obtain instructor clearance under the recorded course restrictions before
assessed use. See docs/ai-use.md and keep this disclosure current.

ADMIN: /admin/accounts; contracts and teammate handoffs in docs/platform-admin.md.
No account deletion, automatic admin provisioning or live imports are enabled.

Before final submission add the real deployed URL, presentation/video links,
team contributions, complete feature/test coverage and safe grading-access
instructions through the instructor's approved channel. Never publish real
passwords or secret keys in this public repository.
