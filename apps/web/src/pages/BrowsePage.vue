<template>
  <div class="browse-canvas" :class="{ 'is-panel-open': isPanelOpen }" data-testid="browse-canvas">
    <BrowsePanel :open="isPanelOpen" :nearby="nearby" @close="closePanel" @select="selectDeal" />

    <div class="browse-canvas__map">
      <DealMap
        :focus="focus"
        :markers="markers"
        :user-position="position"
        :user-accuracy-metres="accuracyMetres"
        @select="selectDeal"
      />

      <!-- Floating UI over the map, Google-Maps style. The container ignores pointer events so
           the map underneath stays draggable; each control opts back in. -->
      <div class="browse-overlays">
        <BrowseFilters v-model="filters" class="browse-overlays__filters" />

        <div class="browse-overlays__actions">
          <button
            type="button"
            class="browse-pill"
            data-testid="panel-toggle"
            aria-controls="browse-panel"
            :aria-expanded="isPanelOpen"
            @click="togglePanel"
          >
            {{ isPanelOpen ? 'Hide list' : 'Show list' }}
          </button>
          <button
            type="button"
            class="browse-pill"
            data-testid="near-me"
            :disabled="status === 'locating'"
            @click="focusOnMe"
          >
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
import BrowseFilters from '@web/modules/browse-map/BrowseFilters.vue'
import BrowsePanel from '@web/modules/browse-map/BrowsePanel.vue'
import DealMap from '@web/modules/browse-map/DealMap.vue'
import { sortByDistance } from '@web/modules/browse-map/distance'
import { type BrowseFilters as BrowseFilterState, createDefaultFilters } from '@web/modules/browse-map/filters'
import { isWithinSingapore } from '@web/modules/browse-map/singapore-bounds'
import type { Coordinates, DealMarker } from '@web/modules/browse-map/types'
import { type GeolocationStatus, useGeolocation } from '@web/modules/browse-map/use-geolocation'
import { computed, onMounted, ref } from 'vue'

const LOCATION_MESSAGES: Partial<Record<GeolocationStatus, string>> = {
  denied: 'Location access was refused, so the map shows all of Singapore.',
  unavailable: 'Location unavailable, so the map shows all of Singapore.',
}
const OUTSIDE_SINGAPORE_MESSAGE = 'You are outside Singapore, so the map shows the whole island.'

const filters = ref<BrowseFilterState>(createDefaultFilters())
const selectedDealId = ref<string | null>(null)
// Null until the visitor shares a position inside Singapore; the map shows the island meanwhile.
const focus = ref<Coordinates | null>(null)
const outsideSingapore = ref(false)
// The map spans the whole canvas on arrival; the list panel is opt-in.
const isPanelOpen = ref(false)

// Replace with the shared deals query (api.deals.*) once the procedure is registered.
const markers = ref<readonly DealMarker[]>([])

const { status, position, accuracyMetres, locate } = useGeolocation()

// Nearest-first for the panel. Without a location the list stays in query order.
const nearby = computed(() => (position.value ? sortByDistance(markers.value, position.value) : []))

const locationMessage = computed(() =>
  outsideSingapore.value ? OUTSIDE_SINGAPORE_MESSAGE : LOCATION_MESSAGES[status.value],
)

const selectDeal = (id: string) => {
  selectedDealId.value = id
  isPanelOpen.value = true
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

onMounted(focusOnMe)
</script>

<style scoped>
/* Two-column grid: map + panel column on the right. The panel column is 0 until opened on wide
   screens, so the map fills the viewport and then slides aside rather than being covered. */
.browse-canvas {
  --browse-panel-width: 24rem;
  --panel-column: 0px;
  --canvas-ease: cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--panel-column);
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  overflow: hidden;
  transition: grid-template-columns 420ms var(--canvas-ease);
}

@media (min-width: 992px) {
  .browse-canvas.is-panel-open {
    --panel-column: var(--browse-panel-width);
  }
}

.browse-canvas__map {
  position: relative;
  grid-column: 1;
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

.browse-overlays__filters {
  position: absolute;
  top: calc(var(--site-header-clearance) + var(--spacing-20));
  left: var(--spacing-20);
  width: min(calc(100% - 2 * var(--spacing-20)), 20rem);
}

.browse-overlays__actions {
  position: absolute;
  bottom: var(--spacing-29);
  left: 50%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-11);
  width: max-content;
  max-width: calc(100% - 2 * var(--spacing-20));
  transform: translateX(-50%);
  pointer-events: none;
}

.browse-overlays__actions > * {
  pointer-events: auto;
}

.browse-overlays__status {
  flex-basis: 100%;
  margin: 0;
  padding: var(--spacing-7) var(--spacing-14);
  font-family: var(--font-founders-grotesk);
  font-size: var(--text-body-sm);
  letter-spacing: -0.02em;
  line-height: var(--leading-body-sm);
  text-align: center;
  color: var(--color-ink);
  background: var(--color-cream);
  border: 1.5px solid var(--color-ash);
}

@media (min-width: 992px) {
  .browse-overlays__actions {
    left: var(--spacing-20);
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
