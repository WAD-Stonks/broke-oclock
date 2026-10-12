import { CARTO_STYLE, ONEMAP_STYLE, resolveBasemap } from '@web/modules/browse-map/basemap'
import { describe, expect, it } from 'vitest'

describe('resolveBasemap', () => {
  it('prefers the light CARTO and OneMap styles', () => {
    expect(CARTO_STYLE).toBe('light_all')
    expect(ONEMAP_STYLE).toBe('Grey')
  })

  it('uses CARTO with the key as a query parameter when a key is configured', () => {
    const basemap = resolveBasemap('abc 123')

    expect(basemap.provider).toBe('carto')
    expect(basemap.url).toBe(
      'https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=abc%20123',
    )
    expect(basemap.attribution).toContain('CARTO')
    expect(basemap.attribution).toContain('OpenStreetMap')
  })

  it('falls back to OneMap Grey when the key is missing or a placeholder', () => {
    for (const key of [undefined, '', '   ', 'UNSET', 'unset', 'UNCONFIGURED']) {
      const basemap = resolveBasemap(key)
      expect(basemap.provider).toBe('onemap')
      expect(basemap.url).toBe('https://www.onemap.gov.sg/maps/tiles/Grey/{z}/{x}/{y}.png')
      expect(basemap.attribution).toContain('Singapore Land Authority')
    }
  })
})
