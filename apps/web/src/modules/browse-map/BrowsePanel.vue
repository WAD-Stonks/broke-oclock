<script setup lang="ts">
import DealDetail from '@web/modules/browse-map/DealDetail.vue'
import DealRowList from '@web/modules/browse-map/DealRowList.vue'
import type { DealRow, SelectedDeal, SelectedVenue } from '@web/modules/browse-map/types'
import VenueDeals from '@web/modules/browse-map/VenueDeals.vue'
import { computed, ref, watch } from 'vue'

// Floating white card over the map. On wide screens it occupies the right-hand column; on
// narrow screens it rises as a bottom sheet. Content stays mounted so the heading is always in
// the document. It shows one of three things on top: nothing (plain list), an outlet with
// several deals (`venue`), or one open deal (`deal`); the full list always follows.
const props = withDefaults(
  defineProps<{
    open: boolean
    rows?: readonly DealRow[]
    status?: 'loading' | 'ready' | 'error'
    venue?: SelectedVenue | null
    deal?: SelectedDeal | null
  }>(),
  { rows: () => [], status: 'loading', venue: null, deal: null },
)

const STATUS_MESSAGES = {
  loading: 'Loading deals…',
  error: 'Deals could not be loaded. Try again in a moment.',
} as const
const emit = defineEmits<{ close: []; select: [dealId: string, venueId: string]; back: [] }>()

const panel = ref<HTMLElement | null>(null)

const showingList = computed(() => !props.deal && !props.venue)
const hasDistances = computed(() => props.rows.some((row) => row.distanceMetres !== null))

const heading = computed(() => {
  if (props.rows.length === 0) return 'Browse deals'
  const noun = props.rows.length === 1 ? 'deal' : 'deals'
  return hasDistances.value ? `${props.rows.length} ${noun} nearby` : `${props.rows.length} ${noun}`
})
const listTitle = computed(() => (showingList.value ? 'All deals' : 'More deals'))
const panelLabel = computed(() => props.deal?.deal.title ?? props.venue?.venue.name ?? undefined)
const currentKey = computed(() =>
  props.deal ? `${props.deal.deal.id}:${props.deal.venue.id}` : null,
)

// Whatever was just opened should appear at the top straight away.
watch(
  () => [props.deal?.deal.id, props.venue?.venue.id] as const,
  () => {
    if (panel.value) panel.value.scrollTop = 0
  },
)
</script>

<template>
  <aside
    id="browse-panel"
    ref="panel"
    class="browse-panel"
    :class="{ 'is-open': open }"
    :aria-hidden="open ? 'false' : 'true'"
    :inert="open ? undefined : true"
    :aria-labelledby="showingList ? 'browse-title' : undefined"
    :aria-label="panelLabel"
    data-testid="browse-panel"
  >
    <div class="browse-panel__inner">
      <!-- The heading and status step aside while an outlet or deal is open. -->
      <header v-if="showingList" class="browse-panel__header">
        <h1 id="browse-title" class="browse-panel__title">{{ heading }}</h1>
        <button type="button" class="browse-pill browse-pill--compact" data-testid="panel-close" @click="emit('close')">
          Hide list
        </button>
      </header>

      <p v-if="showingList && status !== 'ready'" class="browse-panel__note" data-testid="deals-status" role="status">
        {{ STATUS_MESSAGES[status] }}
      </p>
      <p v-else-if="showingList && rows.length === 0" class="browse-panel__note" data-testid="deals-status" role="status">
        No deals match these filters.
      </p>

      <DealDetail
        v-if="deal"
        :selected="deal"
        @back="emit('back')"
        @select="(dealId, venueId) => emit('select', dealId, venueId)"
      />
      <VenueDeals
        v-else-if="venue"
        :selected="venue"
        @back="emit('back')"
        @select="(dealId, venueId) => emit('select', dealId, venueId)"
      />

      <section v-if="rows.length > 0" aria-labelledby="deal-list-title" class="browse-panel__section" :class="{ 'browse-panel__section--divided': !showingList }">
        <h2 id="deal-list-title" class="browse-panel__label" :class="{ 'visually-hidden': showingList }">{{ listTitle }}</h2>
        <DealRowList
          :rows="rows"
          :current-key="currentKey"
          test-id="nearby-list"
          @select="(dealId, venueId) => emit('select', dealId, venueId)"
        />
      </section>

      <section aria-labelledby="no-location-title" class="browse-panel__section browse-panel__section--divided">
        <h2 id="no-location-title" class="browse-panel__label">Deals without a fixed outlet</h2>
        <p class="browse-panel__muted mb-0">
          Online and no-fixed-location deals will be listed here instead of receiving map pins.
        </p>
      </section>
    </div>
  </aside>
</template>

<style scoped>
/* Narrow screens: a white bottom sheet with rounded top corners rising over the map. */
.browse-panel {
  --panel-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --panel-duration: 420ms;
  position: absolute;
  inset: auto 0 0 0;
  z-index: 1060;
  max-height: 70vh;
  overflow-y: auto;
  background: var(--paper-white);
  border-radius: var(--radius-card) var(--radius-card) 0 0;
  box-shadow: 0 -12px 32px rgba(27, 27, 31, 0.12);
  transform: translateY(100%);
  transition: transform var(--panel-duration) var(--panel-ease);
  font-family: var(--font-sans);
}

@supports (height: 100dvh) {
  .browse-panel {
    max-height: 70dvh;
  }
}

.browse-panel.is-open {
  transform: translateY(0);
}

.browse-panel__inner {
  padding: var(--space-5) var(--space-4) var(--space-8);
}

.browse-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-3);
}

.browse-panel__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 700;
  line-height: 1.2;
  color: var(--ink);
}

.browse-panel__note {
  margin: 0 0 var(--space-4);
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--ink-muted);
}

.browse-panel__section--divided {
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px solid var(--hairline);
}

.browse-panel__label {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-muted);
}

.browse-panel__muted {
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--ink-muted);
}

/* Wide screens: a floating rounded card in the right-hand grid column, over the map. */
@media (min-width: 992px) {
  .browse-panel {
    position: relative;
    inset: auto;
    z-index: 1060;
    grid-column: 2;
    grid-row: 1;
    max-height: none;
    height: calc(100% - var(--site-header-clearance) - var(--space-5));
    margin: var(--site-header-clearance) var(--space-5) var(--space-5) 0;
    overflow: hidden auto;
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    transform: none;
    transition: none;
  }

  /* Fixed inner width so text does not reflow while the column animates open. */
  .browse-panel__inner {
    width: calc(var(--browse-panel-width) - var(--space-5));
    padding: var(--space-5);
  }
}

@media (prefers-reduced-motion: reduce) {
  .browse-panel {
    transition: none;
  }
}
</style>
