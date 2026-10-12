# Components

Owns reusable app-shell UI shared across routes. `SiteHeader.vue` is the floating pill navigation (title plus hamburger) that sits over the page like a map overlay; `site-nav-links.ts` holds its destinations and `use-site-menu.ts` owns open/close, Escape, click-outside and focus behaviour. `AppShell.vue` in `@broke-oclock/ui` provides the page container, and `App.vue` reserves `--site-header-clearance` above it.

Do not add `DealCard.vue` yet. Its props, content hierarchy, and states are a team contract decision for the browse-map and add-deal workstreams.
