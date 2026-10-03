<script setup lang="ts">
import { BButton } from '@broke-oclock/ui'
import { api, type RouterOutputs } from '@web/lib/api-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { ref } from 'vue'

const props = defineProps<{ configured: boolean }>()
const emit = defineEmits<{ denied: [code: string] }>()
const query = ref('')
const searchedQuery = ref('')
const items = ref<RouterOutputs['ingestion']['searchLocations']['items'] | null>(null)
const pending = ref(false)
const error = ref('')
const search = async () => {
  if (pending.value || !props.configured || query.value.trim().length < 2 || query.value.trim().length > 120) return
  pending.value = true
  error.value = ''
  items.value = null
  searchedQuery.value = query.value.trim()
  try {
    const result = await api.ingestion.searchLocations.query({ query: searchedQuery.value })
    items.value = result.items
  } catch (failure) {
    const code = errorCode(failure)
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') emit('denied', code)
    error.value = 'Unable to search locations. Please try again.'
  } finally { pending.value = false }
}
</script>

<template>
  <section aria-labelledby="locations-title" class="card p-4 mb-4">
    <h2 id="locations-title" class="h4">OneMap location lookup</h2>
    <p class="text-secondary">Candidates are not verified merchants or outlets. This tool does not attach a location to a deal.</p>
    <p>Data source: OneMap · <a href="https://www.onemap.gov.sg/legal/opendatalicence.html" target="_blank" rel="noopener noreferrer">Singapore Open Data Licence</a></p>
    <p v-if="!configured">OneMap is not configured. Ask an administrator to configure the server integration.</p>
    <form data-testid="location-search" @submit.prevent="search" :aria-busy="pending">
      <label for="location-query" class="form-label">Address, building or postal code</label>
      <input id="location-query" v-model="query" class="form-control mb-3" type="search" minlength="2" maxlength="120" required :disabled="pending || !configured" />
      <BButton data-testid="search-locations" type="submit" variant="outline-primary" :disabled="pending || !configured || query.trim().length < 2 || query.trim().length > 120">{{ pending ? 'Searching…' : 'Search locations' }}</BButton>
    </form>
    <p v-if="pending" class="mt-3" role="status">Searching OneMap…</p>
    <p v-if="error" class="text-danger mt-3" role="alert">{{ error }}</p>
    <p v-if="items" class="mt-3">Candidates for “{{ searchedQuery }}”</p>
    <p v-if="items?.length === 0">No location candidates found.</p>
    <ul v-if="items?.length" class="list-unstyled mb-0">
      <li v-for="(candidate, index) in items" :key="index" class="border-top py-3 text-break">
        <h3 class="h6">{{ candidate.searchValue }}</h3>
        <p class="mb-1">{{ candidate.address }} · Postal code: {{ candidate.postalCode ?? 'Not supplied' }}</p>
        <p class="small mb-0">Coordinates: {{ candidate.latitude }}, {{ candidate.longitude }}</p>
      </li>
    </ul>
  </section>
</template>
