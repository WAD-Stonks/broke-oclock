// Filter state for the browse page. The shared deals query should accept the same shape so the
// map and Ashley's feed stay consistent. Cuisine is omitted until the schema has a cuisine field.
export type BrowseFilters = {
  readonly category: string
  readonly priceMaxMinor: number | null
  readonly validNow: boolean
}

export const ANY_CATEGORY = ''

export const createDefaultFilters = (): BrowseFilters => ({
  category: ANY_CATEGORY,
  priceMaxMinor: null,
  validNow: true,
})

export const updateFilters = <K extends keyof BrowseFilters>(
  filters: BrowseFilters,
  key: K,
  value: BrowseFilters[K],
): BrowseFilters => ({ ...filters, [key]: value })
