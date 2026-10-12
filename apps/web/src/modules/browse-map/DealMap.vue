<script setup lang="ts">
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import L from 'leaflet'
import 'leaflet.markercluster'
import { readCartoApiKey, resolveBasemap } from '@web/modules/browse-map/basemap'
import {
  BOUNDS_VISCOSITY,
  FOCUS_ZOOM,
  MAX_ACCURACY_HALO_METRES,
  MAX_ZOOM,
  MIN_ZOOM,
  USER_ACCURACY_STYLE,
  USER_DOT_CLASS,
  USER_DOT_SIZE_PX,
  ZOOM_CONTROL_POSITION,
} from '@web/modules/browse-map/map-config'
import { SINGAPORE_BOUNDS, toBoundsTuple } from '@web/modules/browse-map/singapore-bounds'
import type { Coordinates, VenuePin } from '@web/modules/browse-map/types'
import { createVenuePinIcon } from '@web/modules/browse-map/venue-pin'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

// The map always opens fitted to Singapore. `focus` later pans/zooms to a point, for example
// the visitor's located position; it is ignored on first paint so the island is shown whole.
// `userPosition` draws the "you are here" dot; `userAccuracyMetres` sizes its halo.
const props = withDefaults(
  defineProps<{
    pins?: readonly VenuePin[]
    focus?: Coordinates | null
    focusZoom?: number
    userPosition?: Coordinates | null
    userAccuracyMetres?: number | null
  }>(),
  {
    pins: () => [],
    focus: null,
    focusZoom: FOCUS_ZOOM,
    userPosition: null,
    userAccuracyMetres: null,
  },
)
const emit = defineEmits<{ select: [id: string] }>()

const container = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let cluster: L.MarkerClusterGroup | null = null
let userLayer: L.LayerGroup | null = null
let resizeObserver: ResizeObserver | null = null

// The canvas resizes the map when the list panel opens; Leaflet must re-measure its container.
const observeResize = (element: HTMLElement) => {
  if (typeof ResizeObserver === 'undefined') return null
  const observer = new ResizeObserver(() => map?.invalidateSize({ animate: false }))
  observer.observe(element)
  return observer
}

// Each outlet is one pin: a tinted category bubble with a price (or deal count) badge below.
const pinTitle = (pin: VenuePin) =>
  pin.deals.length === 1 ? `${pin.deals[0]?.title} at ${pin.name}` : `${pin.deals.length} deals at ${pin.name}`

const syncPins = (pins: readonly VenuePin[]) => {
  if (!cluster) return
  cluster.clearLayers()
  for (const pin of pins) {
    const title = pinTitle(pin)
    L.marker([pin.lat, pin.lng], {
      icon: createVenuePinIcon(pin),
      title,
      alt: title,
      riseOnHover: true,
    })
      .on('click', () => emit('select', pin.id))
      .addTo(cluster)
  }
}

const syncUserPosition = (position: Coordinates | null, accuracy: number | null) => {
  if (!userLayer) return
  userLayer.clearLayers()
  if (!position) return
  const latLng = L.latLng(position.lat, position.lng)
  if (accuracy !== null && accuracy <= MAX_ACCURACY_HALO_METRES) {
    L.circle(latLng, { ...USER_ACCURACY_STYLE, radius: accuracy, interactive: false }).addTo(
      userLayer,
    )
  }
  const icon = L.divIcon({
    className: USER_DOT_CLASS,
    iconSize: [USER_DOT_SIZE_PX, USER_DOT_SIZE_PX],
    iconAnchor: [USER_DOT_SIZE_PX / 2, USER_DOT_SIZE_PX / 2],
  })
  L.marker(latLng, { icon, interactive: false, keyboard: false, alt: 'You are here' })
    .bindTooltip('You are here', { direction: 'top', offset: [0, -USER_DOT_SIZE_PX / 2] })
    .addTo(userLayer)
}

onMounted(() => {
  if (!container.value) return
  const bounds = L.latLngBounds(
    toBoundsTuple(SINGAPORE_BOUNDS).map(([lat, lng]) => L.latLng(lat, lng)),
  )
  map = L.map(container.value, {
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    maxBounds: bounds,
    maxBoundsViscosity: BOUNDS_VISCOSITY,
    // Floating filters occupy the top-left corner, so zoom lives bottom-right like Google Maps.
    zoomControl: false,
  })
  map.fitBounds(bounds)
  L.control.zoom({ position: ZOOM_CONTROL_POSITION }).addTo(map)
  const basemap = resolveBasemap(readCartoApiKey())
  L.tileLayer(basemap.url, { attribution: basemap.attribution, maxZoom: MAX_ZOOM }).addTo(map)
  cluster = L.markerClusterGroup()
  cluster.addTo(map)
  userLayer = L.layerGroup().addTo(map)
  syncPins(props.pins)
  syncUserPosition(props.userPosition, props.userAccuracyMetres)
  resizeObserver = observeResize(container.value)
})

watch(() => props.pins, syncPins)
watch(
  () => [props.userPosition, props.userAccuracyMetres] as const,
  ([position, accuracy]) => syncUserPosition(position, accuracy),
)
watch(
  () => props.focus,
  (focus) => {
    if (focus) map?.flyTo([focus.lat, focus.lng], props.focusZoom)
  },
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  map?.remove()
  map = null
  cluster = null
  userLayer = null
})
</script>

<template>
  <section aria-label="Deal map" class="deal-map-region" data-testid="deal-map">
    <div ref="container" class="deal-map" />
  </section>
</template>

<style scoped>
.deal-map-region,
.deal-map {
  position: relative;
  width: 100%;
  height: 100%;
}


.deal-map :deep(.leaflet-container) {
  font-family: var(--font-sans);
  background: var(--map-canvas);
}


.deal-map :deep(.deal-map-pin) {
  background: transparent;
  border: 0;
}

/* Bubble centred on the outlet, badge hanging just below it. */
.deal-map :deep(.deal-map-pin__stack) {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  transform: translate(-50%, -50%);
  transition: transform 160ms ease;
}

.deal-map :deep(.deal-map-pin__bubble) {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 52px;
  height: 52px;
  color: var(--ink);
  background: var(--pin-tint, var(--tint-other));
  border: 4px solid var(--paper-white);
  border-radius: 50%;
  box-shadow: var(--shadow-pill);
}

.deal-map :deep(.deal-map-pin__bubble svg) {
  width: 22px;
  height: 22px;
}

.deal-map :deep(.deal-map-pin__badge) {
  padding: 3px 10px;
  font-family: var(--font-display);
  font-size: var(--text-xs);
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
  color: var(--paper-white);
  background: var(--ink);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-pill);
}

.deal-map :deep(.deal-map-pin:hover .deal-map-pin__stack),
.deal-map :deep(.deal-map-pin:focus-visible .deal-map-pin__stack) {
  transform: translate(-50%, -50%) scale(1.06);
}

/* Cluster bubbles: a soft sunny ring around a solid sunny count. */
.deal-map :deep(.marker-cluster) {
  background: var(--sunny-soft);
}

.deal-map :deep(.marker-cluster div) {
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--ink);
  background: var(--sunny);
}

/* "You are here": sky-blue dot with a white ring over the soft accuracy halo. */
.deal-map :deep(.deal-map-user-dot) {
  box-sizing: border-box;
  background: var(--sky);
  border: 3px solid var(--paper-white);
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(27, 27, 31, 0.3);
}

/* Bottom-right controls slide left while the list card covers that corner of the map. */
.deal-map :deep(.leaflet-right) {
  right: var(--map-right-inset, 0px);
  transition: right 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

@media (prefers-reduced-motion: reduce) {
  .deal-map :deep(.leaflet-right) {
    transition: none;
  }
}

/* Zoom control and attribution restyled as small white paper cards. */
.deal-map :deep(.leaflet-bar) {
  border: 0;
  border-radius: var(--radius-control);
  box-shadow: var(--shadow-pill);
  overflow: hidden;
}

.deal-map :deep(.leaflet-bar a) {
  color: var(--ink);
  background: var(--paper-white);
  border-bottom-color: var(--hairline);
}

.deal-map :deep(.leaflet-bar a:hover),
.deal-map :deep(.leaflet-bar a:focus-visible) {
  background: var(--paper);
}

.deal-map :deep(.leaflet-control-attribution) {
  color: var(--ink-muted);
  background: rgba(255, 255, 255, 0.85);
  border-top-left-radius: var(--radius-control);
}

.deal-map :deep(.leaflet-control-attribution a) {
  color: var(--ink);
}
</style>
