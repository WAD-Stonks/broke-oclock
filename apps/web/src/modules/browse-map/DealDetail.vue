<script setup lang="ts">
import CategoryBubble from '@web/modules/browse-map/CategoryBubble.vue'
import DealReviewSummary from '@web/modules/browse-map/DealReviewSummary.vue'
import DealRowList from '@web/modules/browse-map/DealRowList.vue'
import { formatCategory, formatOtherOutlets, formatValidity } from '@web/modules/browse-map/deal-format'
import { formatDistance } from '@web/modules/browse-map/distance'
import type { DealRow, SelectedDeal } from '@web/modules/browse-map/types'
import { computed } from 'vue'

// The open deal: a photo placeholder (deal photos are not served yet) with the back button and
// category bubble over it, the headline price, the written details, the review summary and
// the other deals at the same outlet.
const props = defineProps<{ selected: SelectedDeal }>()
const emit = defineEmits<{ back: []; select: [dealId: string, venueId: string] }>()

const PHOTO_PLACEHOLDER_LABEL = 'No photo for this deal yet'

const meta = computed(() => {
  const parts = [formatCategory(props.selected.deal.category), props.selected.venue.name]
  if (props.selected.distanceMetres !== null)
    parts.push(`${formatDistance(props.selected.distanceMetres)} away`)
  return parts.join(' · ')
})
const validity = computed(() =>
  formatValidity(props.selected.deal.validUntil, props.selected.deal.rawValidityText),
)
const otherOutlets = computed(() => formatOtherOutlets(props.selected.deal.venues.length))

// The outlet's other deals, so a visitor who arrived from a pin can hop between them.
const otherRows = computed<readonly DealRow[]>(() =>
  props.selected.venue.deals
    .filter((deal) => deal.id !== props.selected.deal.id)
    .map((deal) => ({
      key: `${deal.id}:${props.selected.venue.id}`,
      deal,
      venue: props.selected.venue,
      distanceMetres: props.selected.distanceMetres,
    })),
)
</script>

<template>
  <article class="deal-detail" data-testid="deal-detail">
    <div class="deal-detail__photo-frame">
      <div
        class="deal-detail__photo"
        data-testid="deal-image-placeholder"
        role="img"
        :aria-label="PHOTO_PLACEHOLDER_LABEL"
      >
        <span class="deal-detail__photo-text" aria-hidden="true">deal photo</span>
      </div>
      <button type="button" class="browse-back deal-detail__back" data-testid="deal-back" aria-label="Back" @click="emit('back')">
        <svg class="browse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
        </svg>
      </button>
      <CategoryBubble class="deal-detail__bubble" :category="selected.deal.category" size="lg" />
    </div>

    <p class="deal-detail__price">{{ selected.deal.label }}</p>
    <h2 class="deal-detail__title">{{ selected.deal.title }}</h2>
    <p class="deal-detail__meta">{{ meta }}</p>
    <p class="deal-detail__description">{{ selected.deal.description }}</p>

    <dl class="deal-detail__facts">
      <div class="deal-detail__fact">
        <dt>Valid</dt>
        <dd>{{ validity }}</dd>
      </div>
      <div v-if="selected.deal.terms" class="deal-detail__fact">
        <dt>Terms</dt>
        <dd>{{ selected.deal.terms }}</dd>
      </div>
      <div v-if="otherOutlets" class="deal-detail__fact">
        <dt>Outlets</dt>
        <dd>{{ otherOutlets }}</dd>
      </div>
    </dl>

    <DealReviewSummary :votes="selected.deal.votes" :comment-count="selected.deal.commentCount" />

    <section v-if="otherRows.length > 0" class="deal-detail__more" aria-labelledby="same-outlet-title">
      <h3 id="same-outlet-title" class="deal-detail__label">More at {{ selected.venue.name }}</h3>
      <DealRowList :rows="otherRows" test-id="same-outlet-rows" @select="(dealId, venueId) => emit('select', dealId, venueId)" />
    </section>
  </article>
</template>

<style scoped>
.deal-detail {
  margin-bottom: var(--space-5);
}

.deal-detail__photo-frame {
  position: relative;
  margin-bottom: var(--space-6);
}

/* Paper block with a faint diagonal weave, sized like a landscape photo. */
.deal-detail__photo {
  display: grid;
  place-items: center;
  aspect-ratio: 16 / 10;
  background:
    repeating-linear-gradient(-45deg, transparent 0 10px, rgba(27, 27, 31, 0.035) 10px 11px),
    var(--paper);
  border-radius: var(--radius-control);
}

.deal-detail__photo-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: var(--text-xs);
  color: var(--ink-muted);
}

.deal-detail__back {
  position: absolute;
  top: var(--space-3);
  left: var(--space-3);
}

/* The category bubble sits half over the bottom-left corner of the photo. */
.deal-detail__bubble {
  position: absolute;
  bottom: calc(var(--space-5) * -1);
  left: var(--space-3);
}

.deal-detail__price {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 700;
  line-height: 1.1;
  color: var(--ink);
}

.deal-detail__title {
  margin: var(--space-1) 0 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: 1.2;
  color: var(--ink);
}

.deal-detail__meta {
  margin: var(--space-1) 0 var(--space-3);
  font-size: var(--text-sm);
  color: var(--ink-muted);
}

.deal-detail__description {
  margin: 0 0 var(--space-4);
  font-size: var(--text-sm);
  line-height: 1.55;
  color: var(--ink);
  white-space: pre-line;
}

/* Facts in a soft paper box. */
.deal-detail__facts {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0 0 var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: var(--paper);
  border-radius: var(--radius-control);
}

.deal-detail__fact {
  display: grid;
  grid-template-columns: 5rem minmax(0, 1fr);
  gap: var(--space-3);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.deal-detail__fact dt {
  font-weight: 500;
  color: var(--ink-muted);
}

.deal-detail__fact dd {
  margin: 0;
  color: var(--ink);
}

.deal-detail__more {
  margin-top: var(--space-5);
}

.deal-detail__label {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-muted);
}
</style>
