<script setup lang="ts">
import { formatDistance, type NearbyDeal } from '@web/modules/browse-map/distance'

// Side panel for the deal list. On wide screens it opens on the right and pushes the map aside;
// on narrow screens it rises as a bottom sheet over the map. Content stays mounted so the heading is always in the document.
withDefaults(defineProps<{ open: boolean; nearby?: readonly NearbyDeal[] }>(), {
  nearby: () => [],
})
const emit = defineEmits<{ close: []; select: [id: string] }>()

// Leading space keeps the button's accessible name readable ("Kopi set 420 m") after the
// template compiler condenses the whitespace between the two spans.
const distanceLabel = (deal: NearbyDeal) => ` ${formatDistance(deal.distanceMetres)}`
</script>

<template>
  <aside
    id="browse-panel"
    class="browse-panel"
    :class="{ 'is-open': open }"
    :aria-hidden="open ? 'false' : 'true'"
    :inert="open ? undefined : true"
    aria-labelledby="browse-title"
    data-testid="browse-panel"
  >
    <div class="browse-panel__inner">
      <header class="browse-panel__header">
        <h1 id="browse-title" class="browse-panel__title">Browse deals</h1>
        <button
          type="button"
          class="browse-pill browse-pill--compact"
          data-testid="panel-close"
          @click="emit('close')"
        >
          Hide list
        </button>
      </header>

      <p class="browse-panel__note">Map and filters are scaffolded. Deal data is not connected yet.</p>

      <section aria-labelledby="deal-list-title" class="browse-panel__section">
        <h2 id="deal-list-title" class="browse-panel__label">Nearby deals</h2>
        <ol v-if="nearby.length > 0" class="browse-panel__list" data-testid="nearby-list">
          <li v-for="deal in nearby" :key="deal.id">
            <button type="button" class="browse-panel__deal" @click="emit('select', deal.id)">
              <span class="browse-panel__deal-title">{{ deal.title }}</span>
              <span class="browse-panel__deal-distance">{{ distanceLabel(deal) }}</span>
            </button>
          </li>
        </ol>
        <p v-else class="browse-panel__muted mb-0">
          No deals loaded yet. Nearest deals to your location will be listed here.
        </p>
      </section>

      <section aria-labelledby="no-location-title" class="browse-panel__section">
        <h2 id="no-location-title" class="browse-panel__label">Deals without a fixed outlet</h2>
        <p class="browse-panel__muted mb-0">
          Online and no-fixed-location deals will be listed here instead of receiving map pins.
        </p>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.browse-panel {
  --panel-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --panel-duration: 420ms;
  position: absolute;
  inset: auto 0 0 0;
  z-index: 1060;
  max-height: 70vh;
  overflow-y: auto;
  background: var(--color-cream);
  border-top: 1.5px solid var(--color-ash);
  transform: translateY(100%);
  transition: transform var(--panel-duration) var(--panel-ease);
  font-family: var(--font-founders-grotesk);
  letter-spacing: -0.02em;
  font-feature-settings: "clig", "liga";
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
  padding: var(--spacing-20) var(--spacing-29) var(--spacing-29);
}

.browse-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-14);
  margin-bottom: var(--spacing-11);
}

.browse-panel__title {
  margin: 0;
  font-size: var(--text-subheading);
  font-weight: var(--font-weight-light);
  line-height: 1.2;
  color: var(--color-voltage-blue);
}

.browse-panel__note {
  margin: 0 0 var(--spacing-20);
  font-size: var(--text-body-sm);
  line-height: var(--leading-body-sm);
  color: var(--color-ink);
}

.browse-panel__section {
  padding-top: var(--spacing-14);
  border-top: 1.5px solid var(--color-ash);
}

.browse-panel__section + .browse-panel__section {
  margin-top: var(--spacing-20);
}

.browse-panel__label {
  margin: 0 0 var(--spacing-7);
  font-size: var(--text-body-sm);
  font-weight: var(--font-weight-light);
  text-transform: uppercase;
  color: var(--color-voltage-blue);
}

.browse-panel__muted {
  font-size: var(--text-body-sm);
  line-height: var(--leading-body-sm);
  color: var(--color-ink);
  opacity: 0.7;
}

/* Nearest-first list: hairline rows, title left, distance right. */
.browse-panel__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.browse-panel__list li + li {
  border-top: 1.5px solid var(--color-ash);
}

.browse-panel__deal {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-14);
  width: 100%;
  padding: var(--spacing-11) 0;
  font: inherit;
  font-size: var(--text-body-sm);
  line-height: var(--leading-body-sm);
  color: var(--color-ink);
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.browse-panel__deal:hover .browse-panel__deal-title,
.browse-panel__deal:focus-visible .browse-panel__deal-title {
  color: var(--color-voltage-blue);
}

.browse-panel__deal-distance {
  flex: 0 0 auto;
  color: var(--color-voltage-blue);
}

/* Wide screens: the panel occupies the right-hand grid column; the parent animates its width. */
@media (min-width: 992px) {
  .browse-panel {
    position: relative;
    inset: auto;
    grid-column: 2;
    grid-row: 1;
    max-height: none;
    height: 100%;
    overflow: hidden auto;
    border-top: 0;
    border-left: 1.5px solid var(--color-ash);
    transform: none;
    transition: none;
  }

  /* Fixed inner width so text does not reflow while the column animates open. */
  .browse-panel__inner {
    width: var(--browse-panel-width);
    padding-top: calc(var(--site-header-clearance) + var(--spacing-20));
  }
}

@media (prefers-reduced-motion: reduce) {
  .browse-panel {
    transition: none;
  }
}
</style>
