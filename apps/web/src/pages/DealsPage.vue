<script setup lang="ts">
import { BSpinner } from '@broke-oclock/ui'
import {
  type DealListFilters,
  type DealListItem,
  type DealOfferType,
  fetchDeals,
  filtersFromQuery,
  filtersToQuery,
  hasActiveFilters,
  offerTypeOptions,
} from '@web/modules/browse-map/deal-list'
import VenueDealCard from '@web/modules/venues-feed/VenueDealCard.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const state = ref<'loading' | 'ready' | 'error'>('loading')
const deals = ref<DealListItem[]>([])
const search = ref('')
const offerType = ref<DealOfferType | ''>('')
let latestRequest = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined
let appliedSearch: string | null = null

const SEARCH_CHAR_STEP = 3
const SEARCH_PAUSE_MS = 400

const filters = computed(() => filtersFromQuery(route.query))
const filtered = computed(() => hasActiveFilters(filters.value))

const load = async () => {
  const request = ++latestRequest
  state.value = 'loading'
  try {
    const data = await fetchDeals(filters.value)
    if (request !== latestRequest) return
    deals.value = data
    state.value = 'ready'
  } catch {
    if (request !== latestRequest) return
    deals.value = []
    state.value = 'error'
  }
}

const applyFilters = (next: DealListFilters) => {
  clearTimeout(searchTimer)
  appliedSearch = next.q
  if (next.q === filters.value.q && next.offerType === filters.value.offerType) return
  router.replace({ query: filtersToQuery(next) })
}

const applySearch = () =>
  applyFilters({ q: search.value.trim(), offerType: offerType.value || null })

const clearFilters = () => router.replace({ query: {} })

watch(
  filters,
  (current) => {
    if (current.q !== appliedSearch) search.value = current.q
    offerType.value = current.offerType ?? ''
    load()
  },
  { immediate: true, deep: true },
)

watch(search, (value) => {
  clearTimeout(searchTimer)
  const q = value.trim()
  if (q === '' || Math.abs(q.length - filters.value.q.length) >= SEARCH_CHAR_STEP) applySearch()
  else searchTimer = setTimeout(applySearch, SEARCH_PAUSE_MS)
})

watch(offerType, applySearch)

onBeforeUnmount(() => clearTimeout(searchTimer))
</script>

<template>
  <section class="deals-page pb-5" aria-labelledby="deals-title">
    <header class="mb-4">
      <h1 id="deals-title" class="h2 fw-bold mb-1">Browse Deals</h1>
    </header>

    <form class="row g-2 align-items-end mb-4" aria-label="Filter deals" @submit.prevent="applySearch">
      <div class="col-12 col-md">
        <label for="deal-search" class="form-label small text-secondary mb-1">Search</label>
        <div class="input-group">
          <span class="input-group-text bg-body text-secondary" aria-hidden="true">
            <svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path
                d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0" />
            </svg>
          </span>
          <input id="deal-search" v-model="search" type="search" class="form-control" placeholder="Search deals" />
        </div>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <label for="deal-offer" class="form-label small text-secondary mb-1">Offer type</label>
        <div class="input-group">
          <span class="input-group-text bg-body text-secondary" aria-hidden="true">
            <svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path
                d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.128.334L10 8.692V13.5a.5.5 0 0 1-.342.474l-3 1A.5.5 0 0 1 6 14.5V8.692L1.628 3.834A.5.5 0 0 1 1.5 3.5zm1 .5v1.308l4.372 4.858A.5.5 0 0 1 7 8.5v5.306l2-.666V8.5a.5.5 0 0 1 .128-.334L13.5 3.308V2z" />
            </svg>
          </span>
          <select id="deal-offer" v-model="offerType" class="form-select">
            <option value="">All offers</option>
            <option v-for="option in offerTypeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>
      <!-- TODO(deals-api): add controls for new filters here, copying the Offer type block. -->
      <div v-if="filtered" class="col-12 col-sm-auto">
        <button type="button" class="btn btn-outline-secondary w-100" @click="clearFilters">Clear</button>
      </div>
    </form>

    <div v-if="state === 'loading'" class="text-center py-5" role="status">
      <BSpinner />
      <p class="text-secondary mt-3 mb-0">Loading deals…</p>
    </div>

    <div v-else-if="state === 'error'" class="text-center py-5" role="alert">
      <h2 class="h4 mb-2">Unable to load deals</h2>
      <p class="text-secondary">Something went wrong. Please try again.</p>
      <button type="button" class="btn btn-outline-primary" @click="load">Retry</button>
    </div>

    <div v-else-if="deals.length === 0" class="text-center py-5" data-testid="deals-empty">
      <template v-if="filtered">
        <h2 class="h4 mb-2">No deals match your filters</h2>
        <p class="text-secondary">Try a different search or offer type.</p>
        <button type="button" class="btn btn-outline-secondary" @click="clearFilters">Clear filters</button>
      </template>
      <template v-else>
        <h2 class="h4 mb-2">No deals yet</h2>
        <p class="text-secondary mb-0">Check back soon!</p>
      </template>
    </div>

    <template v-else>
      <p class="small text-secondary mb-3" aria-live="polite">
        {{ deals.length }} {{ deals.length === 1 ? 'deal' : 'deals' }}
      </p>
      <ul class="row g-3 list-unstyled mb-0" aria-label="Deals">
        <li v-for="deal in deals" :key="deal.id" class="col-6 col-md-4 col-lg-3">
          <VenueDealCard :deal="deal">
            <template #meta>
              <RouterLink v-if="deal.venue" :to="{ name: 'venue', params: { venueId: deal.venue.id } }"
                class="small text-secondary text-decoration-none stretched-link" data-testid="deal-venue-link">
                {{ deal.venue.name }}<template v-if="deal.venue.area"> · {{ deal.venue.area }}</template>
              </RouterLink>
            </template>
          </VenueDealCard>
        </li>
      </ul>
    </template>
  </section>
</template>
