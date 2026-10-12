import { routeLayout } from '@web/router/layouts'
import routes from '@web/router/routes'
import { describe, expect, it } from 'vitest'

describe('route layouts', () => {
  it('defaults to the container shell when a route declares no layout', () => {
    expect(routeLayout({ meta: {} })).toBe('shell')
  })

  it('returns the declared layout', () => {
    expect(routeLayout({ meta: { layout: 'canvas' } })).toBe('canvas')
  })

  it('gives only the browse route the full-bleed canvas', () => {
    const canvasRoutes = routes.filter((route) => route.meta?.layout === 'canvas')
    expect(canvasRoutes.map((route) => route.path)).toEqual(['/browse'])
  })
})
