import {
  isWithinSingapore,
  SINGAPORE_BOUNDS,
  toBoundsTuple,
} from '@web/modules/browse-map/singapore-bounds'
import { describe, expect, it } from 'vitest'

describe('singapore bounds', () => {
  it('accepts a position inside Singapore', () => {
    expect(isWithinSingapore({ lat: 1.3521, lng: 103.8198 })).toBe(true)
  })

  it('rejects positions outside Singapore', () => {
    expect(isWithinSingapore({ lat: 1.4927, lng: 103.7414 })).toBe(false) // Johor Bahru
    expect(isWithinSingapore({ lat: -6.2, lng: 106.8 })).toBe(false) // Jakarta
  })

  it('maps the box to Leaflet south-west / north-east pairs', () => {
    expect(toBoundsTuple(SINGAPORE_BOUNDS)).toEqual([
      [SINGAPORE_BOUNDS.south, SINGAPORE_BOUNDS.west],
      [SINGAPORE_BOUNDS.north, SINGAPORE_BOUNDS.east],
    ])
  })
})
