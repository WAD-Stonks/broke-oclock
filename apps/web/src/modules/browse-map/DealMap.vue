<script setup lang="ts">
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import L from 'leaflet'
import 'leaflet.markercluster'
import { readCartoApiKey, resolveBasemap } from '@web/modules/browse-map/basemap'
import { configureDefaultMarkerIcon } from '@web/modules/browse-map/leaflet-icons'
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
import type { Coordinates, DealMarker } from '@web/modules/browse-map/types'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

// The map always opens fitted to Singapore. `focus` later pans/zooms to a point, for example
// the visitor's located position; it is ignored on first paint so the island is shown whole.
// `userPosition` draws the "you are here" dot; `userAccuracyMetres` sizes its halo.
const props = withDefaults(
  defineProps<{
    markers?: readonly DealMarker[]
    focus?: Coordinates | null
    focusZoom?: number
    userPosition?: Coordinates | null
    userAccuracyMetres?: number | null
  }>(),
  {
    markers: () => [],
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

const syncMarkers = (markers: readonly DealMarker[]) => {
  if (!cluster) return
  cluster.clearLayers()
  for (const marker of markers) {
    L.marker([marker.lat, marker.lng], { title: marker.title })
      .on('click', () => emit('select', marker.id))
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
  configureDefaultMarkerIcon()
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
  syncMarkers(props.markers)
  syncUserPosition(props.userPosition, props.userAccuracyMetres)
  resizeObserver = observeResize(container.value)
})

watch(() => props.markers, syncMarkers)
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
/* Fills whatever box the page gives it; the browse canvas decides the size. */
.deal-map-region,
.deal-map {
  position: relative;
  width: 100%;
  height: 100%;
}

/* Raster tiles cannot be restyled server-side, so the navy cast is a CSS filter on the tile
   pane. Vectors, markers and controls live in other panes and keep their true colours. */
.deal-map :deep(.leaflet-container) {
  background: var(--map-canvas);
}

.deal-map :deep(.leaflet-tile-pane) {
  filter: var(--map-tile-tint);
}

/* Leaflet creates the dot outside Vue's template, so reach it with :deep. */
.deal-map :deep(.deal-map-user-dot) {
  box-sizing: border-box;
  background: var(--color-voltage-blue);
  border: 2.5px solid var(--color-cream);
  border-radius: 50%;
  box-shadow: 0 0 0 1.5px var(--color-voltage-blue);
}
</style>
