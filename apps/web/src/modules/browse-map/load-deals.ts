import type { DealPin, DealsQuery } from '@broke-oclock/contracts/deals'
import { distanceMetres, sortByDistance } from '@web/modules/browse-map/distance'
import type { BrowseFilters } from '@web/modules/browse-map/filters'
import type {
  Coordinates,
  DealRow,
  SelectedDeal,
  SelectedVenue,
  Selection,
  VenuePin,
} from '@web/modules/browse-map/types'

export const toDealsQuery = (filters: BrowseFilters): DealsQuery => ({
  ...(filters.category ? { category: filters.category } : {}),
  ...(filters.priceMaxMinor === null ? {} : { priceMaxMinor: filters.priceMaxMinor }),
  validNow: filters.validNow ? 'true' : 'false',
})

// Groups deals by outlet so an outlet with several deals gets one pin. Outlets keep the order
// in which they first appear and each outlet's deals keep the query order.
export const toVenuePins = (deals: readonly DealPin[]): readonly VenuePin[] => {
  const pins = new Map<string, VenuePin>()
  for (const deal of deals) {
    for (const venue of deal.venues) {
      const existing = pins.get(venue.id)
      pins.set(
        venue.id,
        existing
          ? { ...existing, deals: [...existing.deals, deal] }
          : { id: venue.id, name: venue.name, lat: venue.lat, lng: venue.lng, deals: [deal] },
      )
    }
  }
  return [...pins.values()]
}

const rowKey = (deal: DealPin, venue: VenuePin) => `${deal.id}:${venue.id}`

// One row per deal and outlet. Nearest outlet first when the visitor's position is known,
// otherwise query order without distances.
export const toDealRows = (
  pins: readonly VenuePin[],
  position: Coordinates | null,
): readonly DealRow[] => {
  const ordered = position
    ? sortByDistance(pins, position)
    : pins.map((pin) => ({ ...pin, distanceMetres: null }))
  return ordered.flatMap((venue) =>
    venue.deals.map((deal) => ({
      key: rowKey(deal, venue),
      deal,
      venue,
      distanceMetres: venue.distanceMetres,
    })),
  )
}

const distanceTo = (venue: VenuePin, position: Coordinates | null) =>
  position ? distanceMetres(position, venue) : null

// Null when nothing is selected or the outlet left the list (for example after a filter change).
export const findSelectedVenue = (
  pins: readonly VenuePin[],
  selection: Selection | null,
  position: Coordinates | null,
): SelectedVenue | null => {
  if (!selection) return null
  const venue = pins.find((pin) => pin.id === selection.venueId)
  return venue ? { venue, distanceMetres: distanceTo(venue, position) } : null
}

// Null unless a specific deal at the selected outlet is open.
export const findSelectedDeal = (
  pins: readonly VenuePin[],
  selection: Selection | null,
  position: Coordinates | null,
): SelectedDeal | null => {
  const selected = findSelectedVenue(pins, selection, position)
  if (!selected || !selection?.dealId) return null
  const deal = selected.venue.deals.find((candidate) => candidate.id === selection.dealId)
  return deal ? { deal, venue: selected.venue, distanceMetres: selected.distanceMetres } : null
}
