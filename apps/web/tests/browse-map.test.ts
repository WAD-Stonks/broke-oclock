import { flushPromises, mount } from '@vue/test-utils'
import App from '@web/App.vue'
import { createDefaultFilters, updateFilters } from '@web/modules/browse-map/filters'
import { useGeolocation } from '@web/modules/browse-map/use-geolocation'
import routes from '@web/router/routes'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

async function mountAt(path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, {
    global: {
      plugins: [router],
      // Leaflet needs a real layout engine; the map component is covered by the browser suite.
      stubs: { DealMap: true },
    },
  })
  return { router, wrapper }
}

const TOGGLE = '[data-testid="panel-toggle"]'
const PANEL = '[data-testid="browse-panel"]'

const fakeGeolocation = (
  behave: (ok: PositionCallback, fail: PositionErrorCallback) => void,
): Geolocation =>
  ({
    getCurrentPosition: (ok: PositionCallback, fail?: PositionErrorCallback | null) =>
      behave(ok, fail ?? (() => {})),
  }) as unknown as Geolocation

describe('browse page', () => {
  it('renders the scaffolded browse page with filters and map region', async () => {
    const { wrapper } = await mountAt('/browse')

    expect(wrapper.get('h1').text()).toBe('Browse deals')
    expect(wrapper.text()).toContain('Deal data is not connected yet.')
    expect(wrapper.find('form[aria-label="Deal filters"]').exists()).toBe(true)
    expect(wrapper.get('label[for="browse-category"]').text()).toBe('Category')
    expect(wrapper.find('deal-map-stub').exists()).toBe(true)
    expect(wrapper.text()).toContain('Deals without a fixed outlet')
  })

  it('starts with the map spanning the canvas and the list panel closed', async () => {
    const { wrapper } = await mountAt('/browse')

    expect(wrapper.find('main.container').exists()).toBe(false)
    expect(wrapper.get('main').classes()).toContain('site-canvas')
    expect(wrapper.find('[data-testid="browse-canvas"] deal-map-stub').exists()).toBe(true)

    const toggle = wrapper.get(TOGGLE)
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('aria-controls')).toBe('browse-panel')
    const panel = wrapper.get(PANEL)
    expect(panel.attributes('id')).toBe('browse-panel')
    expect(panel.attributes('aria-hidden')).toBe('true')
    expect(panel.classes()).not.toContain('is-open')
  })

  it('opens the deal list panel from the toggle and closes it from the panel', async () => {
    const { wrapper } = await mountAt('/browse')

    await wrapper.get(TOGGLE).trigger('click')
    expect(wrapper.get(TOGGLE).attributes('aria-expanded')).toBe('true')
    expect(wrapper.get(PANEL).attributes('aria-hidden')).toBe('false')
    expect(wrapper.get(PANEL).classes()).toContain('is-open')
    expect(wrapper.get('[data-testid="browse-canvas"]').classes()).toContain('is-panel-open')

    await wrapper.get('[data-testid="panel-close"]').trigger('click')
    expect(wrapper.get(TOGGLE).attributes('aria-expanded')).toBe('false')
    expect(wrapper.get(PANEL).attributes('aria-hidden')).toBe('true')
  })

  it('tells the visitor when their location is unavailable and lists no nearby deals yet', async () => {
    // jsdom has no navigator.geolocation, so the page cannot locate the visitor.
    const { wrapper } = await mountAt('/browse')
    await flushPromises()

    const status = wrapper.get('[data-testid="location-status"]')
    expect(status.attributes('role')).toBe('status')
    expect(status.text()).toContain('Location unavailable')
    expect(wrapper.get('[data-testid="near-me"]').text()).toBe('Near me')
    expect(wrapper.find('[data-testid="nearby-list"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('No deals loaded yet')
  })

  it('keeps the container shell for ordinary pages', async () => {
    const { wrapper } = await mountAt('/')

    expect(wrapper.get('main').classes()).toContain('container')
    expect(wrapper.find('.site-canvas').exists()).toBe(false)
  })

  it('links to the browse page from the header', async () => {
    const { router, wrapper } = await mountAt('/')

    await wrapper.get('[data-testid="nav-toggle"]').trigger('click')
    await wrapper.get('[data-testid="nav-menu"] a[href="/browse"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/browse')
  })

  it('updates filter state immutably from the controls', async () => {
    const { wrapper } = await mountAt('/browse')

    const checkbox = wrapper.get<HTMLInputElement>('#browse-valid-now')
    expect(checkbox.element.checked).toBe(true)
    await checkbox.setValue(false)
    expect(checkbox.element.checked).toBe(false)

    const price = wrapper.get<HTMLInputElement>('#browse-price-max')
    await price.setValue('4.5')
    await price.trigger('change')
    expect(price.element.value).toBe('4.5')
  })
})

describe('browse filters state', () => {
  it('starts with any category, no price cap and valid-now enabled', () => {
    expect(createDefaultFilters()).toEqual({ category: '', priceMaxMinor: null, validNow: true })
  })

  it('returns a new object and leaves the original untouched', () => {
    const original = createDefaultFilters()
    const next = updateFilters(original, 'priceMaxMinor', 500)

    expect(next).not.toBe(original)
    expect(next.priceMaxMinor).toBe(500)
    expect(original.priceMaxMinor).toBeNull()
  })
})

describe('useGeolocation', () => {
  it('reports granted with the browser position and accuracy', async () => {
    const geo = fakeGeolocation((ok) =>
      ok({ coords: { latitude: 1.3, longitude: 103.8, accuracy: 25 } } as GeolocationPosition),
    )
    const { status, position, accuracyMetres, locate } = useGeolocation(geo)

    await expect(locate()).resolves.toEqual({ lat: 1.3, lng: 103.8 })
    expect(status.value).toBe('granted')
    expect(position.value).toEqual({ lat: 1.3, lng: 103.8 })
    expect(accuracyMetres.value).toBe(25)
  })

  it('reports denied without a position when permission is refused', async () => {
    const geo = fakeGeolocation((_ok, fail) =>
      fail({ code: 1, message: 'denied' } as GeolocationPositionError),
    )
    const { status, position, accuracyMetres, locate } = useGeolocation(geo)

    await expect(locate()).resolves.toBeNull()
    expect(status.value).toBe('denied')
    expect(position.value).toBeNull()
    expect(accuracyMetres.value).toBeNull()
  })

  it('reports unavailable for other failures and for missing geolocation support', async () => {
    const failing = useGeolocation(
      fakeGeolocation((_ok, fail) =>
        fail({ code: 2, message: 'unavailable' } as GeolocationPositionError),
      ),
    )
    await expect(failing.locate()).resolves.toBeNull()
    expect(failing.status.value).toBe('unavailable')

    const missing = useGeolocation(undefined)
    await expect(missing.locate()).resolves.toBeNull()
    expect(missing.status.value).toBe('unavailable')
  })
})
