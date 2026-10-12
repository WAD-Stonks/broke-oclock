<script setup lang="ts">
import DealRowList from '@web/modules/browse-map/DealRowList.vue'
import { formatDistance } from '@web/modules/browse-map/distance'
import type { DealRow, SelectedVenue } from '@web/modules/browse-map/types'
import { computed } from 'vue'

// An outlet with several deals: pick which one to open.
const props = defineProps<{ selected: SelectedVenue }>()
const emit = defineEmits<{ back: []; select: [dealId: string, venueId: string] }>()

const rows = computed<readonly DealRow[]>(() =>
  props.selected.venue.deals.map((deal) => ({
    key: `${deal.id}:${props.selected.venue.id}`,
    deal,
    venue: props.selected.venue,
    distanceMetres: props.selected.distanceMetres,
  })),
)

const subtitle = computed(() => {
  const count = `${rows.value.length} deals at this outlet`
  return props.selected.distanceMetres === null
    ? count
    : `${count} · ${formatDistance(props.selected.distanceMetres)} away`
})
</script>

<template>
  <section class="venue-deals" data-testid="venue-deals" aria-labelledby="venue-title">
    <button type="button" class="browse-back" data-testid="deal-back" aria-label="Back" @click="emit('back')">
      <svg class="browse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
      </svg>
    </button>
    <h2 id="venue-title" class="venue-deals__title">{{ selected.venue.name }}</h2>
    <p class="venue-deals__subtitle">{{ subtitle }}</p>
    <DealRowList :rows="rows" test-id="venue-deal-rows" @select="(dealId, venueId) => emit('select', dealId, venueId)" />
  </section>
</template>

<style scoped>
.venue-deals {
  margin-bottom: var(--space-5);
}

.venue-deals__title {
  margin: var(--space-4) 0 var(--space-1);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 700;
  line-height: 1.2;
  color: var(--ink);
}

.venue-deals__subtitle {
  margin: 0 0 var(--space-4);
  font-size: var(--text-sm);
  color: var(--ink-muted);
}
</style>
