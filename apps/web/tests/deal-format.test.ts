import {
  formatCategory,
  formatOtherOutlets,
  formatValidity,
} from '@web/modules/browse-map/deal-format'
import { describe, expect, it } from 'vitest'

describe('formatValidity', () => {
  it('shows the end date in Singapore time when one is known', () => {
    expect(formatValidity('2026-12-31T15:59:59.000Z', null)).toBe('Until 31 Dec 2026')
  })

  it('falls back to the raw validity text, then to a no-end-date note', () => {
    expect(formatValidity(null, 'Weekdays before 11am')).toBe('Weekdays before 11am')
    expect(formatValidity(null, null)).toBe('No end date given')
  })

  it('prefers the raw text when the stored date is unreadable', () => {
    expect(formatValidity('not-a-date', 'While stocks last')).toBe('While stocks last')
  })
})

describe('formatCategory', () => {
  it('turns an upper-case category code into a readable word', () => {
    expect(formatCategory('DESSERT')).toBe('Dessert')
    expect(formatCategory('FAST_FOOD')).toBe('Fast food')
  })
})

describe('formatOtherOutlets', () => {
  it('counts the outlets other than the one being viewed', () => {
    expect(formatOtherOutlets(1)).toBeNull()
    expect(formatOtherOutlets(2)).toBe('Also at 1 other outlet')
    expect(formatOtherOutlets(4)).toBe('Also at 3 other outlets')
  })
})
