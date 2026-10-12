import { distanceMetres, formatDistance, sortByDistance } from '@web/modules/browse-map/distance'
import { describe, expect, it } from 'vitest'

const SMU = { lat: 1.2966, lng: 103.8521 }
const RAFFLES_PLACE = { lat: 1.284, lng: 103.8514 }
const JURONG_EAST = { lat: 1.3329, lng: 103.7436 }

describe('distanceMetres', () => {
  it('is zero for the same point and symmetric', () => {
    expect(distanceMetres(SMU, SMU)).toBe(0)
    expect(distanceMetres(SMU, JURONG_EAST)).toBeCloseTo(distanceMetres(JURONG_EAST, SMU), 6)
  })

  it('matches the known distance from SMU to Raffles Place within 5%', () => {
    const metres = distanceMetres(SMU, RAFFLES_PLACE)
    expect(metres).toBeGreaterThan(1300)
    expect(metres).toBeLessThan(1500)
  })
})

describe('sortByDistance', () => {
  it('returns a new nearest-first array with distances and leaves the input untouched', () => {
    const markers = [
      { id: 'far', title: 'Jurong', ...JURONG_EAST },
      { id: 'near', title: 'Raffles', ...RAFFLES_PLACE },
    ] as const
    const input = [...markers]

    const sorted = sortByDistance(input, SMU)

    expect(sorted.map((deal) => deal.id)).toEqual(['near', 'far'])
    expect(sorted[0]?.distanceMetres).toBeLessThan(sorted[1]?.distanceMetres ?? 0)
    expect(input.map((deal) => deal.id)).toEqual(['far', 'near'])
    expect(sorted).not.toBe(input)
  })

  it('returns an empty array for no markers', () => {
    expect(sortByDistance([], SMU)).toEqual([])
  })
})

describe('formatDistance', () => {
  it('rounds metres below a kilometre and uses one decimal above it', () => {
    expect(formatDistance(0)).toBe('0 m')
    expect(formatDistance(347.6)).toBe('350 m')
    expect(formatDistance(999)).toBe('1.0 km')
    expect(formatDistance(1234)).toBe('1.2 km')
    expect(formatDistance(12_345)).toBe('12.3 km')
  })
})
