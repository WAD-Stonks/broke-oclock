<script setup lang="ts">
import type { VenueDealSummary } from '@broke-oclock/contracts/venues'
import { offerLabel, validityLabel } from '@web/modules/venues-feed/deal-format'
import { computed } from 'vue'

const props = defineProps<{ deal: VenueDealSummary }>()
const offer = computed(() => offerLabel(props.deal))
const validity = computed(() => validityLabel(props.deal))
</script>

<template>
  <article class="venue-deal-card card h-100 shadow-sm" data-testid="venue-deal-card">
    <img v-if="deal.imageUrl" :src="deal.imageUrl" :alt="deal.title" class="venue-deal-image card-img-top"
      loading="lazy" />
    <div v-else class="venue-deal-image venue-deal-image-empty card-img-top" aria-hidden="true">
      No photo
    </div>
    <div class="card-body d-flex flex-column gap-2">
      <span class="badge text-bg-light border align-self-start">{{ deal.category }}</span>
      <h3 class="h6 fw-semibold mb-0 venue-deal-title">{{ deal.title }}</h3>
      <p v-if="offer" class="fs-5 fw-bold text-primary mb-0">{{ offer }}</p>
      <p class="small text-secondary mb-0 mt-auto">{{ validity }}</p>
    </div>
  </article>
</template>

<style scoped>
.venue-deal-card {
  overflow: hidden;
}

.venue-deal-image {
  aspect-ratio: 4 / 3;
  width: 100%;
  object-fit: cover;
}

.venue-deal-image-empty {
  display: grid;
  place-items: center;
  background: var(--bs-secondary-bg);
  color: var(--bs-secondary-color);
  font-size: 0.875rem;
}

.venue-deal-title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}
</style>
