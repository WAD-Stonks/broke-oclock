import type { DealPin } from '@broke-oclock/contracts/deals'
import {
  findSelectedDeal,
  findSelectedVenue,
  toDealRows,
  toVenuePins,
} from '@web/modules/browse-map/load-deals'
import { describe, expect, it } from 'vitest'

const BEDOK = { id: '5eed03000000000000000000', name: 'Kopi Bedok', lat: 1.32, lng: 103.93 }
const TAMPINES = { id: '5eed03000000000000000001', name: 'Kopi Tampines', lat: 1.35, lng: 103.94 }

const base = {
  category: 'DRINKS',
  description: 'Seed',
  offerType: 'FIXED_PRICE' as const,
  priceMinor: 100,
  discountPercent: null,
  terms: null,
  validUntil: null,
  rawValidityText: null,
  votes: { alive: 0, dead: 0 },
  commentCount: 0,
}
const KOPI: DealPin = {
  ...base,
  id: '5eed04000000000000000000',
  title: 'Kopi $1',
  label: '$1',
  venues: [BEDOK, TAMPINES],
}
const TOAST: DealPin = {
  ...base,
  id: '5eed04000000000000000001',
  title: 'Toast $2',
  label: '$2',
  venues: [BEDOK],
}

describe('toVenuePins', () => {
  it('groups deals by outlet, keeping first-seen outlet order and query order within an outlet', () => {
    const pins = toVenuePins([KOPI, TOAST])
    expect(pins.map((pin) => pin.id)).toEqual([BEDOK.id, TAMPINES.id])
    expect(pins[0]?.deals.map((deal) => deal.title)).toEqual(['Kopi $1', 'Toast $2'])
    expect(pins[1]?.deals.map((deal) => deal.title)).toEqual(['Kopi $1'])
  })
})

describe('toDealRows', () => {
  it('lists one row per deal and outlet in query order without distances when unlocated', () => {
    const rows = toDealRows(toVenuePins([KOPI, TOAST]), null)
    expect(rows.map((row) => row.key)).toEqual([
      `${KOPI.id}:${BEDOK.id}`,
      `${TOAST.id}:${BEDOK.id}`,
      `${KOPI.id}:${TAMPINES.id}`,
    ])
    expect(rows.every((row) => row.distanceMetres === null)).toBe(true)
  })

  it('puts the nearest outlet first when a position is known', () => {
    const rows = toDealRows(toVenuePins([KOPI, TOAST]), { lat: 1.35, lng: 103.94 })
    expect(rows[0]?.venue.id).toBe(TAMPINES.id)
    expect(rows[0]?.distanceMetres).toBe(0)
  })
})

describe('selection helpers', () => {
  const pins = toVenuePins([KOPI, TOAST])

  it('resolves an outlet, and a deal at it, with the distance from the visitor', () => {
    const venue = findSelectedVenue(
      pins,
      { venueId: TAMPINES.id, dealId: null },
      { lat: 1.35, lng: 103.94 },
    )
    expect(venue?.venue.name).toBe('Kopi Tampines')
    expect(venue?.distanceMetres).toBe(0)

    const deal = findSelectedDeal(pins, { venueId: BEDOK.id, dealId: TOAST.id }, null)
    expect(deal?.deal).toBe(TOAST)
    expect(deal?.venue.id).toBe(BEDOK.id)
    expect(deal?.distanceMetres).toBeNull()
  })

  it('returns null for no selection, an unknown outlet, or a deal not at that outlet', () => {
    expect(findSelectedVenue(pins, null, null)).toBeNull()
    expect(findSelectedVenue(pins, { venueId: 'unknown', dealId: null }, null)).toBeNull()
    expect(findSelectedDeal(pins, { venueId: BEDOK.id, dealId: null }, null)).toBeNull()
    expect(findSelectedDeal(pins, { venueId: TAMPINES.id, dealId: TOAST.id }, null)).toBeNull()
  })
})
