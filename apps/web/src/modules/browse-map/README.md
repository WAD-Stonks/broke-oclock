# Browse and map

Owner: Allison. Reviewer: Ashley. Route: `/browse`, assembled by `BrowsePage.vue`.

## Layout

The `/browse` route declares `meta.layout = 'canvas'` (see `src/router/layouts.ts`), so `App.vue` renders it full-bleed instead of inside the container shell. `BrowsePage.vue` is a two-column grid: the map and, to its right, the list panel column. The panel column is `0` until opened, so the map spans the whole viewport on arrival. On screens 992px and wider, opening the list widens the right-hand column and pushes the map aside; below that the panel rises as a bottom sheet over the map. Filters and the list toggle float over the map inside `.browse-overlays`, which ignores pointer events so the map stays draggable. Z-order: Leaflet controls 1000, overlays 1050, panel sheet 1060, site header 1100.

`DealMap.vue` opens fitted to `SINGAPORE_BOUNDS` and cannot be dragged outside them. On load the page asks for the visitor's location; when granted and inside Singapore it flies to them, draws the "you are here" dot and sorts the panel list nearest-first. The "Near me" pill repeats this. Refusal, unavailability or a position outside Singapore keeps the island view and explains why in a status line. It re-measures itself with a `ResizeObserver` whenever its column changes size.

## Scaffolded

- `map-config.ts`: zoom limits, focus zoom, bounds viscosity and the "you are here" marker styles.
- `basemap.ts`: `resolveBasemap(key)` picks CARTO Dark Matter (`dark_all`, keyed via `VITE_CARTO_API_KEY`) or falls back to OneMap `Night` (Singapore Land Authority, keyless) when the key is absent or a placeholder. Change `CARTO_STYLE` for other CARTO looks. Raster tiles cannot be restyled by the provider, so the navy cast is the `--map-tile-tint` CSS filter in `main.css`, applied to Leaflet's tile pane only; a true custom style would need CARTO's vector basemaps with MapLibre GL.
- `distance.ts`: haversine `distanceMetres`, nearest-first `sortByDistance` (returns a new array) and `formatDistance`.
- `singapore-bounds.ts`: `SINGAPORE_BOUNDS`, `toBoundsTuple` and `isWithinSingapore`. Positions outside Singapore are ignored rather than clamped.
- `types.ts`: `Coordinates` and the minimal `DealMarker` pin shape.
- `filters.ts`: immutable `BrowseFilters` state (`category`, `priceMaxMinor`, `validNow`) with `createDefaultFilters` and `updateFilters`.
- `use-geolocation.ts`: browser Geolocation wrapper with `idle`, `locating`, `granted`, `denied` and `unavailable` states plus `accuracyMetres`. Returns `null` on refusal; callers choose the fallback.
- `leaflet-icons.ts`: fixes Leaflet default marker icon paths under Vite.
- `DealMap.vue`: Leaflet lifecycle, basemap tiles, Singapore bounds, bottom-right zoom control, marker cluster group, the "you are here" dot and accuracy halo (`userPosition`, `userAccuracyMetres`), `markers` and `focus` props and the `select` event.
- `BrowseFilters.vue`: floating cream card with labelled category, max-price and valid-now controls bound with `v-model`.
- `BrowsePanel.vue`: the list panel (heading, scaffold note, nearest-first `nearby` list, no-fixed-outlet placeholder) with `open` prop and `close`/`select` events.

Local data: run `pnpm run db:local`, then `pnpm run db:seed` (see the root README) for synthetic deals to render.

## Still student-owned and unimplemented

- The shared eligible-published-deals query and its filter inputs (agree the procedure name and shape with Ashley so the feed and map match).
- Loading markers from that query, loading/error/empty states and the deal popup on `select`.
- The separate list for `ONLINE` and `NO_FIXED_LOCATION` deals; never invent coordinates for them.
- Expiring-soon sort, a distance radius filter on the shared query and the cuisine filter (no schema field yet). Client-side nearest-first ordering of loaded markers already exists in `distance.ts`.
- Playwright journey: load seeded map, apply a filter, open a matching deal; narrow viewport, no results and geolocation refusal.

Only approved published deals with matching content/review versions and source attribution may reach the map. See [feature-plan.md](../../../../../docs/feature-plan.md) and [ingestion.md](../../../../../docs/ingestion.md).
