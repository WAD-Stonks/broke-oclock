# Coding standards

## Tooling

- Bun for installs and scripts. Commit `bun.lock`; use `bun install --frozen-lockfile` in CI. Do not add npm/pnpm/yarn locks.
- Biome alone for JS/TS/Vue linting and formatting. Two-space indentation, single quotes, semicolons only where needed. Use `bun run format`; don't introduce ESLint, Oxlint or Prettier.
- Prisma's own formatter handles `.prisma`. Markdown and YAML are reviewed manually; do not claim Biome validates every language.
- Strict TypeScript. Avoid `any`, unchecked casts, non-null assertions and `@ts-ignore`. A narrow suppression needs an explanation and a test. External JSON and request inputs need runtime validation; TypeScript types do not validate data.

## Naming and layout

- Vue SFCs: `PascalCase.vue`, `<script setup lang="ts">`; views end in `Page.vue` where consistent.
- TypeScript files/folders: `kebab-case`; variables/functions `camelCase`; types `PascalCase`.
- Prefer named arrow functions. Return explicit public DTOs, not entire database records. Use type-only imports for types.
- Feature code belongs under its module; shared components only when genuinely reused. Avoid dumping application logic into `utils.ts` or `App.vue`.
- Keep components focused, pass typed props, emit typed events. Derived state belongs in `computed`; avoid watchers that merely copy state.

## API and data safety

- Validate params/query/body, bound page sizes and input lengths, and return stable HTTP status/error codes. Do not trust a frontend-selected owner/user ID.
- Authenticate protected requests; check record ownership and moderator permissions separately. Router guards are UX, never the security boundary.
- Use typed Prisma operations. Check duplicate-vote/save constraints under concurrency before calling them safe.
- Use UTC timestamps in storage; document Asia/Singapore interpretation for promotion dates. Store original validity text when parsing is uncertain. Unknown validity must not silently become 'valid now'.
- Keep commercial expiry, community evidence and moderation separate. An expiry date is not proof an outlet honours the deal; a vote is not ground truth.
- Credentials stay server-side in ignored `.env` or deployment secrets. No session token in localStorage; no passwords, cookies, connection strings or provider tokens in logs.
- Never render imported HTML with `v-html` without an approved sanitization policy. Never fetch arbitrary submitted URLs server-side.

## Frontend and accessibility

- Use Bootstrap CSS with Vue-owned state. Avoid competing Bootstrap JS and Vue mutations of the same element.
- Semantic buttons/links, labels, visible focus, keyboard access, loading/empty/error states, and no horizontal overflow on mobile.
- Client validation helps UX; the API must repeat authoritative validation. Block duplicate submits while pending and preserve drafts after errors.
- No fabricated data/statistics presented as live results. Test fixtures must be labelled and isolated.

## Tests and review

- Vitest for unit/integration tests; `bun run test` invokes Vitest. `bun test` is a different runner and is not this project's test command.
- Playwright for E2E. Prefer role/label selectors, deterministic fixtures, real integration on main journeys and controlled mocks only at external boundaries.
- Tests for success, invalid input, forbidden ownership and important boundary conditions belong with every feature. Coverage reports inform review; they are not proof of correctness.
- Small conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). Branch from current main using `feature/...` or `fix/...`; no `codex/` school branches. Open a PR with test evidence; no force-pushing main or auto-merging.
- Before PR: format, `bun run check:all`, review the whole diff and check for secrets/generated output. Every teammate codes and tests their slice.

See [AI use](ai-use.md) before asking an assistant to implement assessed project features.
