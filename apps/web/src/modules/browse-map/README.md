# Browse and map

Owner: Allison. Reviewer: Ashley. Route: `/` (the landing page; `/browse` redirects here), assembled by `BrowsePage.vue`.

## Layout

The `/` route declares `meta.layout = 'canvas'` (see `src/router/layouts.ts`), so `App.vue` renders it full-bleed instead of inside the container shell. `BrowsePage.vue` is a two-column grid: the map spans both columns and the list panel card sits in the right-hand column over it. That column is `0` until opened, so the card slides in over the map on screens 992px and wider while Leaflet's bottom-right controls move left by `--map-right-inset`; below that the panel rises as a bottom sheet over the map. Filters and the list toggle float over the map inside `.browse-overlays`, which ignores pointer events so the map stays draggable. Z-order: Leaflet controls 1000, overlays 1050, panel sheet 1060, site header 1100.

`DealMap.vue` opens fitted to `SINGAPORE_BOUNDS` and cannot be dragged outside them. On load the page asks for the visitor's location; when granted and inside Singapore it flies to them, draws the "you are here" dot and sorts the panel list nearest-first. The "Near me" pill repeats this. Refusal, unavailability or a position outside Singapore keeps the island view and explains why in a status line. It re-measures itself with a `ResizeObserver` whenever its column changes size.

## Look

The browse screen follows the "Bubbly" direction: a light paper-coloured basemap, white floating cards and pills with soft shadows, ink text, a sunny-yellow primary action and soft pastel category tints. Each outlet is one pin: a tinted circle with the category's outline icon (coffee, soup, ice cream, cookie, cake, or a tag for anything else) and a black badge underneath showing the price or offer, or "3 deals" when the outlet has several. The visitor's position is a sky-blue dot with a faint halo. Tokens (`--sunny`, `--sky`, `--tint-*`, `--font-display` for Fredoka, radii, shadows) live in `src/assets/main.css` alongside the shared `.paper-card`, `.browse-pill` and `.browse-back` classes; `index.html` loads Fredoka and Plus Jakarta Sans and falls back to system fonts offline. The site header highlights the second half of the brand name in yellow.

## Scaffolded

- `map-config.ts`: zoom limits, focus zoom, bounds viscosity and the "you are here" marker styles.
- `basemap.ts`: `resolveBasemap(key)` picks CARTO Positron (`light_all`, keyed via `VITE_CARTO_API_KEY`) or falls back to OneMap `Grey` (Singapore Land Authority, keyless) when the key is absent or a placeholder. Change `CARTO_STYLE` or `ONEMAP_STYLE` for other looks. Tiles render untinted; a true custom style would need CARTO's vector basemaps with MapLibre GL.
- `distance.ts`: haversine `distanceMetres`, nearest-first `sortByDistance` (returns a new array) and `formatDistance`.
- `singapore-bounds.ts`: `SINGAPORE_BOUNDS`, `toBoundsTuple` and `isWithinSingapore`. Positions outside Singapore are ignored rather than clamped.
- `types.ts`: `Coordinates` and the minimal `DealMarker` pin shape, including the optional short pin `label`.
- `filters.ts`: immutable `BrowseFilters` state (`category`, `priceMaxMinor`, `validNow`) with `createDefaultFilters` and `updateFilters`.
- `use-geolocation.ts`: browser Geolocation wrapper with `idle`, `locating`, `granted`, `denied` and `unavailable` states plus `accuracyMetres`. Returns `null` on refusal; callers choose the fallback.
- `deal-pin.ts`: `pinLabel` (short `label` or clipped title) and `createDealPinIcon`, the coral text-pill `L.divIcon` built from DOM nodes so deal text is never parsed as HTML.
- `DealMap.vue`: Leaflet lifecycle, basemap tiles, Singapore bounds, bottom-right zoom control, coral-pill markers in a cluster group, the "you are here" dot and accuracy halo (`userPosition`, `userAccuracyMetres`), `markers` and `focus` props and the `select` event. Leaflet-built elements (pins, clusters, zoom bar, attribution) are restyled with `:deep` rules in this file.
- `BrowseFilters.vue`: a row of small white pills (category select, "Max $" price box and a "Valid now" toggle backed by a real checkbox) bound with `v-model`. Labels stay in the document, visually hidden where the pill text already says it.
- `load-deals.ts`: `toDealsQuery` (filters to query string), `toVenuePins` (groups deals by outlet so an outlet with several deals gets one pin), `toDealRows` (one row per deal and outlet, nearest-first with a position, query order without) and `findSelectedVenue` / `findSelectedDeal` (a `Selection` back to its outlet, deal and distance).
- `category-style.ts`: tint and Lucide icon path data per category, `categoryStyle(category)` with a neutral fallback, and `createCategoryIconElement` for DOM-built pins.
- `venue-pin.ts`: `pinLabel` (clipped offer text), `pinBadgeText` (price for one deal, count for several) and `createVenuePinIcon`, the bubble-plus-badge `L.divIcon` built from DOM nodes so deal text is never parsed as HTML.
- `deal-format.ts`: `formatValidity` ("Until 31 Dec 2026" in Singapore time, else the raw validity text), `formatCategory` and `formatOtherOutlets`.
- `CategoryBubble.vue`: the tinted icon circle in three sizes, used in rows, the detail view and the venue view.
- `DealRowList.vue`: rows with bubble, title, outlet and distance, and the price on the right; marks the current row and emits `select(dealId, venueId)`.
- `BrowsePanel.vue`: the floating card (bottom sheet on narrow screens) with `open`, `rows`, `status`, `venue` and `deal` props and `close`/`select`/`back` events. Its heading counts the deals ("6 deals nearby"). With an outlet or deal open it hides the heading, labels the panel after what is open, renders `VenueDeals` or `DealDetail` first, retitles the list "More deals", marks the open row and scrolls back to the top.
- `VenueDeals.vue`: an outlet with several deals: back button, outlet name, "N deals at this outlet" and its rows.
- `DealDetail.vue`: the open deal: a photo placeholder (deal photos are not served yet) with the back button and category bubble over it, the price, title, "Category · Outlet · distance" line, description, a facts box (validity, terms, other outlets), `DealReviewSummary` and "More at <outlet>" rows for the outlet's other deals. Emits `back` and `select`.
- `DealReviewSummary.vue`: read-only community evidence from the API ("Still on"/"Gone" tallies styled as the buttons they will become, plus the comment count). The buttons are disabled until the community module supplies the vote and comment endpoints; the reason is only in their tooltip.

Selecting a pin flies the map to that outlet and opens the panel: an outlet with one deal opens that deal; an outlet with several shows its deals to choose from. Selecting any list row opens that deal at that outlet. Back from a deal returns to its outlet when the outlet has other deals, otherwise to the list, which stays open. A filter change that drops the outlet clears the selection by itself.

Local data: run `pnpm run db:local`, then `pnpm run db:seed` (see the root README) for synthetic deals to render.

## Still student-owned and unimplemented

- Deal photos in the drawer: `GET /api/deals` does not return uploaded images yet, so `DealDetail` shows a placeholder.
- Live voting and comments in the drawer, once the community module exposes them. The drawer only reads the tallies the deals list already returns.
- The separate list for `ONLINE` and `NO_FIXED_LOCATION` deals; never invent coordinates for them.
- Expiring-soon sort, a distance radius filter on the shared query and the cuisine filter (no schema field yet). Client-side nearest-first ordering of loaded markers already exists in `distance.ts`.
- Playwright journey: load seeded map, apply a filter, open a matching deal; narrow viewport, no results and geolocation refusal.

Only approved published deals with matching content/review versions and source attribution may reach the map. See [feature-plan.md](../../../../../docs/feature-plan.md) and [ingestion.md](../../../../../docs/ingestion.md).
