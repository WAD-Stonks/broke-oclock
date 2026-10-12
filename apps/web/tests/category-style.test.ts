import {
  CATEGORY_ICON_PATHS,
  categoryStyle,
  createCategoryIconElement,
  FALLBACK_CATEGORY_STYLE,
} from '@web/modules/browse-map/category-style'
import { describe, expect, it } from 'vitest'

describe('categoryStyle', () => {
  it('maps known categories to a tint and icon regardless of case', () => {
    expect(categoryStyle('DESSERT')).toEqual({ tint: 'var(--tint-dessert)', icon: 'ice-cream' })
    expect(categoryStyle('drinks').icon).toBe('coffee')
  })

  it('falls back to the neutral tag for unknown categories', () => {
    expect(categoryStyle('MYSTERY')).toBe(FALLBACK_CATEGORY_STYLE)
  })
})

describe('createCategoryIconElement', () => {
  it('draws one path per icon segment and hides the svg from assistive tech', () => {
    const svg = createCategoryIconElement('cookie')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.querySelectorAll('path')).toHaveLength(CATEGORY_ICON_PATHS.cookie.length)
  })
})
