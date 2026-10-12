<script setup lang="ts">
import type { VenueDetailResponse } from '@broke-oclock/contracts/venues'
import { BSpinner } from '@broke-oclock/ui'
import { ApiClientError, api } from '@web/lib/api-client'
import { endedLabel, initials, offerLabel } from '@web/modules/venues-feed/deal-format'
import VenueDealCard from '@web/modules/venues-feed/VenueDealCard.vue'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const state = ref<'loading' | 'ready' | 'not-found' | 'error'>('loading')
const detail = ref<VenueDetailResponse | null>(null)
let latestRequest = 0

const venueId = computed(() => String(route.params.venueId ?? ''))

const load = async () => {
  const request = ++latestRequest
  state.value = 'loading'
  detail.value = null
  try {
    const data = await api.venues.get(venueId.value)
    if (request !== latestRequest) return
    detail.value = data
    state.value = 'ready'
  } catch (failure) {
    if (request !== latestRequest) return
    const code = failure instanceof ApiClientError ? failure.code : null
    state.value = code === 'NOT_FOUND' || code === 'BAD_REQUEST' ? 'not-found' : 'error'
  }
}

watch(venueId, load, { immediate: true })
</script>

<template>
  <section class="venue-page py-5">
    <div v-if="state === 'loading'" class="text-center py-5" role="status">
      <BSpinner />
      <p class="text-secondary mt-3 mb-0">Loading venue…</p>
    </div>

    <div v-else-if="state === 'not-found'" class="text-center py-5" role="alert">
      <h1 class="h3 mb-2">Venue not found</h1>
      <p class="text-secondary mb-0">This venue does not exist or is no longer listed.</p>
    </div>

    <div v-else-if="state === 'error'" class="text-center py-5" role="alert">
      <h1 class="h3 mb-2">Unable to load this venue</h1>
      <p class="text-secondary">Something went wrong. Please try again.</p>
      <button type="button" class="btn btn-outline-primary" @click="load">Retry</button>
    </div>

    <template v-else-if="detail">
      <header class="d-flex flex-column align-items-center text-center mb-5">
        <div class="venue-logo mb-3" aria-hidden="true">{{ initials(detail.venue.merchantName) }}</div>
        <h1 class="h2 fw-bold mb-2">{{ detail.venue.name }}</h1>
        <p class="text-secondary mb-0">
          {{ detail.venue.address }}<template v-if="detail.venue.postalCode">, Singapore {{ detail.venue.postalCode
            }}</template>
        </p>
      </header>

      <section aria-labelledby="ongoing-deals-title">
        <h2 id="ongoing-deals-title" class="h4 fw-semibold mb-3">Ongoing Deals</h2>
        <p v-if="detail.deals.length === 0" class="text-secondary">
          No ongoing deals at this venue right now.
        </p>
        <ul v-else class="row g-3 list-unstyled mb-0" aria-label="Ongoing deals">
          <li v-for="deal in detail.deals" :key="deal.id" class="col-6 col-md-4 col-lg-3">
            <VenueDealCard :deal="deal" />
          </li>
        </ul>
      </section>

      <section class="mt-5" aria-labelledby="deal-history-title">
        <div class="d-flex flex-wrap align-items-baseline justify-content-between gap-2 mb-3">
          <h2 id="deal-history-title" class="h4 fw-semibold mb-0">Deal History</h2>
          <span class="badge text-bg-secondary">No longer active</span>
        </div>
        <p v-if="detail.pastDeals.length === 0" class="text-secondary">
          No past deals at this venue yet.
        </p>
        <ul v-else class="list-group" aria-label="Past deals">
          <li v-for="deal in detail.pastDeals" :key="deal.id"
            class="list-group-item d-flex justify-content-between align-items-center gap-3"
            data-testid="venue-past-deal">
            <div class="text-break">
              <div class="fw-semibold">{{ deal.title }}</div>
              <div class="small text-secondary">{{ endedLabel(deal) }}</div>
            </div>
            <span v-if="offerLabel(deal)" class="text-secondary fw-semibold text-nowrap">
              {{ offerLabel(deal) }}
            </span>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
.venue-logo {
  display: grid;
  place-items: center;
  width: 8rem;
  height: 8rem;
  border-radius: 50%;
  background: var(--bs-primary-bg-subtle);
  border: 3px solid var(--bs-primary-border-subtle);
  color: var(--bs-primary-text-emphasis);
  font-size: 2.5rem;
  font-weight: 700;
}
</style>
