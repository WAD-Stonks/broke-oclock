<template>
  <div class="browse-canvas" :class="{ 'is-panel-open': isPanelOpen }" data-testid="browse-canvas">
    <BrowsePanel
      :open="isPanelOpen"
      :rows="rows"
      :venue="selectedVenue"
      :deal="selectedDeal"
      :status="dealsStatus"
      @close="closePanel"
      @select="selectDeal"
      @back="goBack"
    />

    <div class="browse-canvas__map">
      <DealMap
        :focus="focus"
        :pins="pins"
        :user-position="position"
        :user-accuracy-metres="accuracyMetres"
        @select="selectVenue"
      />

      <!-- Floating UI over the map, Google-Maps style. The container ignores pointer events so
           the map underneath stays draggable; each control opts back in. -->
      <div class="browse-overlays">
       <BrowseFilters v-model="filters" :categories="categories" class="browse-overlays__filters" />

        <div class="browse-overlays__actions">
          <button
            type="button"
            class="browse-pill browse-pill--primary"
            data-testid="panel-toggle"
            aria-controls="browse-panel"
            :aria-expanded="isPanelOpen"
            @click="togglePanel"
          >
            <svg class="browse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 6h.01" /><path d="M8 6h13" /><path d="M3 12h.01" /><path d="M8 12h13" /><path d="M3 18h.01" /><path d="M8 18h13" />
            </svg>
            {{ isPanelOpen ? 'Hide list' : 'Show list' }}
          </button>
          <button
            type="button"
            class="browse-pill"
            data-testid="near-me"
            :disabled="status === 'locating'"
            @click="focusOnMe"
          >
            <svg class="browse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m3 11 19-9-9 19-2-8-8-2z" />
            </svg>
            {{ status === 'locating' ? 'Locating…' : 'Near me' }}
          </button>
          <p
            v-if="locationMessage"
            class="browse-overlays__status"
            role="status"
            data-testid="location-status"
          >
            {{ locationMessage }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DealPin } from '@broke-oclock/contracts/deals'
import { api } from '@web/lib/api-client'
import BrowseFilters from '@web/modules/browse-map/BrowseFilters.vue'
import BrowsePanel from '@web/modules/browse-map/BrowsePanel.vue'
import DealMap from '@web/modules/browse-map/DealMap.vue'
import { type BrowseFilters as BrowseFilterState, createDefaultFilters } from '@web/modules/browse-map/filters'
import {
  findSelectedDeal,
  findSelectedVenue,
  toDealRows,
  toDealsQuery,
  toVenuePins,
} from '@web/modules/browse-map/load-deals'
import { isWithinSingapore } from '@web/modules/browse-map/singapore-bounds'
import type { Coordinates, Selection } from '@web/modules/browse-map/types'
import { type GeolocationStatus, useGeolocation } from '@web/modules/browse-map/use-geolocation'
import { computed, onMounted, ref, watch } from 'vue'

export type DealsStatus = 'loading' | 'ready' | 'error'


const LOCATION_MESSAGES: Partial<Record<GeolocationStatus, string>> = {
  denied: 'Location access was refused, so the map shows all of Singapore.',
  unavailable: 'Location unavailable, so the map shows all of Singapore.',
}
const OUTSIDE_SINGAPORE_MESSAGE = 'You are outside Singapore, so the map shows the whole island.'

const filters = ref<BrowseFilterState>(createDefaultFilters())
// The outlet (and optionally the deal) open in the panel; null shows the plain list.
const selection = ref<Selection | null>(null)
// Where the map should fly next: the visitor's position or a chosen deal's outlet. Null on
// arrival, so the map shows the whole island.
const focus = ref<Coordinates | null>(null)
const outsideSingapore = ref(false)
// The map spans the whole canvas on arrival; the list panel is opt-in.
const isPanelOpen = ref(false)

const deals = ref<readonly DealPin[]>([])
const categories = ref<readonly string[]>([])
const dealsStatus = ref<DealsStatus>('loading')

const { status, position, accuracyMetres, locate } = useGeolocation()

// One pin per outlet, however many deals it has.
const pins = computed(() => toVenuePins(deals.value))
// Nearest first once the visitor is located; otherwise query order without distances.
const rows = computed(() => toDealRows(pins.value, position.value))
// Both resolve to null by themselves if a filter change drops the outlet from the list.
const selectedVenue = computed(() => findSelectedVenue(pins.value, selection.value, position.value))
const selectedDeal = computed(() => findSelectedDeal(pins.value, selection.value, position.value))

const locationMessage = computed(() =>
  outsideSingapore.value ? OUTSIDE_SINGAPORE_MESSAGE : LOCATION_MESSAGES[status.value],
)

const loadDeals = async () => {
  dealsStatus.value = 'loading'
  try {
    const response = await api.deals.list(toDealsQuery(filters.value))
    deals.value = response.items
    categories.value = response.categories
    dealsStatus.value = 'ready'
  } catch (error) {
    console.error('Could not load deals', error)
    dealsStatus.value = 'error'
  }
}



const flyToVenue = (venueId: string) => {
  const pin = pins.value.find((candidate) => candidate.id === venueId)
  if (pin) focus.value = { lat: pin.lat, lng: pin.lng }
}

// From a map pin: an outlet with one deal opens that deal; with several, the outlet's list.
const selectVenue = (venueId: string) => {
  const pin = pins.value.find((candidate) => candidate.id === venueId)
  if (!pin) return
  const onlyDeal = pin.deals.length === 1 ? pin.deals[0] : undefined
  selection.value = { venueId, dealId: onlyDeal?.id ?? null }
  flyToVenue(venueId)
  isPanelOpen.value = true
}

// From any list row: open that deal at that outlet.
const selectDeal = (dealId: string, venueId: string) => {
  selection.value = { venueId, dealId }
  flyToVenue(venueId)
  isPanelOpen.value = true
}

// Back from a deal returns to its outlet when the outlet has other deals, else to the list.
const goBack = () => {
  const current = selection.value
  const venue = selectedVenue.value?.venue
  if (current?.dealId && venue && venue.deals.length > 1) {
    selection.value = { venueId: current.venueId, dealId: null }
    return
  }
  selection.value = null
}

const togglePanel = () => {
  isPanelOpen.value = !isPanelOpen.value
}

const closePanel = () => {
  isPanelOpen.value = false
}

// Centre on the visitor when they are in Singapore; otherwise keep the island view and say why.
const focusOnMe = async () => {
  const located = await locate()
  outsideSingapore.value = located !== null && !isWithinSingapore(located)
  // A fresh object each time so re-pressing the button re-centres even at the same spot.
  focus.value = located && !outsideSingapore.value ? { ...located } : null
}
watch(filters, loadDeals, { immediate: true })
onMounted(focusOnMe)
</script>

<style scoped>
/* Two-column grid. The map spans both columns so it shows beneath the floating panel card; the
   right-hand column grows from 0 when the panel opens, sliding the card in over the map. Leaflet's
   bottom-right controls read --map-right-inset so they move out from under the card. */
.browse-canvas {
  --browse-panel-width: 26rem;
  --panel-column: 0px;
  --map-right-inset: 0px;
  --canvas-ease: cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--panel-column);
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  overflow: hidden;
  background: var(--map-canvas);
  transition: grid-template-columns 420ms var(--canvas-ease);
}

@media (min-width: 992px) {
  .browse-canvas.is-panel-open {
    --panel-column: var(--browse-panel-width);
    --map-right-inset: var(--browse-panel-width);
  }
}

.browse-canvas__map {
  position: relative;
  grid-column: 1 / -1;
  grid-row: 1;
  min-width: 0;
  min-height: 0;
}

/* Above Leaflet's controls (z 1000), below the fixed site header (z 1100). */
.browse-overlays {
  position: absolute;
  inset: 0;
  z-index: 1050;
  pointer-events: none;
}

.browse-overlays > * {
  pointer-events: auto;
}

/* Filter pills hang under the header card, matching its left edge, and wrap on narrow screens. */
.browse-overlays__filters {
  position: absolute;
  top: calc(var(--site-header-clearance) + var(--space-3));
  left: var(--space-5);
  max-width: calc(100% - 2 * var(--space-5));
}

.browse-overlays__actions {
  position: absolute;
  bottom: var(--space-6);
  left: 50%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  width: max-content;
  max-width: calc(100% - 2 * var(--space-5));
  transform: translateX(-50%);
  pointer-events: none;
}

.browse-overlays__actions > * {
  pointer-events: auto;
}

/* Location notice: a small white chip under the action pills. */
.browse-overlays__status {
  flex-basis: 100%;
  margin: 0;
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  font-weight: 500;
  line-height: 1.5;
  text-align: center;
  color: var(--ink);
  background: var(--paper-white);
  border-radius: var(--radius-control);
  box-shadow: var(--shadow-pill);
}

@media (min-width: 992px) {
  .browse-overlays__actions {
    left: var(--space-5);
    justify-content: flex-start;
    transform: none;
  }

  .browse-overlays__status {
    text-align: left;
  }
}

@media (prefers-reduced-motion: reduce) {
  .browse-canvas {
    transition: none;
  }
}
</style>
