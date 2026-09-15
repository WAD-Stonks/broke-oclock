# Broke O'Clock web starter

Minimal Vue frontend shell for the parent Bun monorepo. This is intentionally not a finished deals app: it contains the app shell, honest starter copy, developer setup route, 404 handling, Bootstrap baseline, and generic BetterAuth Vue client wiring.

## Run

```sh
cd ../..
bun install --frozen-lockfile
bun run setup
bun run dev:web
```

The Vite dev server binds to `localhost:5173` and proxies same-origin `/api` requests to `http://localhost:3000`. No frontend secrets or API implementation belong here.

## Scripts

- `bun run dev` — Vite on localhost:5173 with strict port checking
- `bun run build` — production build
- `bun run typecheck` — `vue-tsc --noEmit`
- `bun run test:unit` — Vitest + Vue Test Utils + jsdom

## Routes

- `/` — starter home page
- `/getting-started` — six-module ownership notes and folder path
- `/:pathMatch(.*)*` — accessible 404 page

## Conventions

Use two-space indentation, single quotes, and semicolons only as needed to match the parent Biome configuration. Keep workstream behavior in `src/modules/<module>/`; these folders currently contain ownership notes only. `src/components/DealCard.vue` is deliberately absent until the team agrees on its contract.

References: [Vue quick start](https://vuejs.org/guide/quick-start.html), [Bootstrap with Vite](https://getbootstrap.com/docs/5.3/getting-started/vite/), and [BetterAuth client](https://better-auth.com/docs/concepts/client).
