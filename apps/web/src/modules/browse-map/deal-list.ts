import type { VenueDealSummary } from '@broke-oclock/contracts/venues'
import type { LocationQuery, LocationQueryRaw } from 'vue-router'

export type DealOfferType = VenueDealSummary['offerType']

export type DealListItem = VenueDealSummary & {
  venue: { id: string; name: string; area: string | null } | null
}
export type DealListFilters = {
  q: string
  offerType: DealOfferType | null
}

export const offerTypeOptions: { value: DealOfferType; label: string }[] = [
  { value: 'BUY_ONE_GET_ONE', label: '1-for-1' },
  { value: 'PERCENT_OFF', label: 'Percent off' },
  { value: 'FIXED_PRICE', label: 'Fixed price' },
  { value: 'OTHER', label: 'Other' },
]

const firstValue = (value: LocationQuery[string]) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? ''

export const filtersFromQuery = (query: LocationQuery): DealListFilters => {
  const offer = firstValue(query.offer)
  return {
    q: firstValue(query.q),
    offerType: offerTypeOptions.find((option) => option.value === offer)?.value ?? null,
  }
}

export const filtersToQuery = (filters: DealListFilters): LocationQueryRaw => ({
  ...(filters.q ? { q: filters.q } : {}),
  ...(filters.offerType ? { offer: filters.offerType } : {}),
})

export const hasActiveFilters = (filters: DealListFilters) =>
  filters.q !== '' || filters.offerType !== null

export const fetchDeals = async (_filters: DealListFilters): Promise<DealListItem[]> => []
