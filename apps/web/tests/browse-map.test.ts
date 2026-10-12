import { flushPromises, mount } from '@vue/test-utils'
import App from '@web/App.vue'
import { createDefaultFilters, updateFilters } from '@web/modules/browse-map/filters'
import { useGeolocation } from '@web/modules/browse-map/use-geolocation'
import routes from '@web/router/routes'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMemoryHistory, createRouter } from 'vue-router'

const rest = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('@web/lib/api-client', () => ({ api: { deals: { list: rest.list } } }))

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

const SEED_VENUE = {
  id: '5eed03000000000000000000',
  name: "McDonald's Bedok Mall",
  lat: 1.3248,
  lng: 103.9293,
}
const SEED_PIN = {
  id: '5eed04000000000000000000',
  title: '$1 sundae after 2pm',
  category: 'DESSERT',
  label: '$1',
  description: 'Vanilla cone or sundae for a dollar.',
  offerType: 'FIXED_PRICE',
  priceMinor: 100,
  discountPercent: null,
  terms: null,
  validUntil: null,
  rawValidityText: null,
  votes: { alive: 2, dead: 0 },
  commentCount: 0,
  venues: [SEED_VENUE],
}
const SECOND_PIN = {
  ...SEED_PIN,
  id: '5eed04000000000000000001',
  title: 'McSpicy meal $5',
  label: '$5',
  category: 'FOOD',
  votes: { alive: 0, dead: 0 },
}
const DETAIL = '[data-testid="deal-detail"]'

beforeEach(() => {
  rest.list.mockReset()
  rest.list.mockResolvedValue({ items: [SEED_PIN], categories: ['DESSERT'] })
})

const fakeGeolocation = (
  behave: (ok: PositionCallback, fail: PositionErrorCallback) => void,
): Geolocation =>
  ({
    getCurrentPosition: (ok: PositionCallback, fail?: PositionErrorCallback | null) =>
      behave(ok, fail ?? (() => {})),
  }) as unknown as Geolocation

describe('browse page', () => {
  it('renders the scaffolded browse page with filters and map region', async () => {
    const { wrapper } = await mountAt('/')

    expect(wrapper.get('h1').text()).toBe('Browse deals')
    expect(wrapper.get('[data-testid="deals-status"]').text()).toBe('Loading deals…')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('1 deal')
    expect(wrapper.find('[data-testid="deals-status"]').exists()).toBe(false)
    expect(rest.list).toHaveBeenCalledWith({ validNow: 'true' })

    expect(wrapper.find('form[aria-label="Deal filters"]').exists()).toBe(true)
    expect(wrapper.get('label[for="browse-category"]').text()).toBe('Category')
    expect(wrapper.find('deal-map-stub').exists()).toBe(true)
    expect(wrapper.text()).toContain('Deals without a fixed outlet')
  })

  it('starts with the map spanning the canvas and the list panel closed', async () => {
    const { wrapper } = await mountAt('/')

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
    const { wrapper } = await mountAt('/')

    await wrapper.get(TOGGLE).trigger('click')
    expect(wrapper.get(TOGGLE).attributes('aria-expanded')).toBe('true')
    expect(wrapper.get(PANEL).attributes('aria-hidden')).toBe('false')
    expect(wrapper.get(PANEL).classes()).toContain('is-open')
    expect(wrapper.get('[data-testid="browse-canvas"]').classes()).toContain('is-panel-open')

    await wrapper.get('[data-testid="panel-close"]').trigger('click')
    expect(wrapper.get(TOGGLE).attributes('aria-expanded')).toBe('false')
    expect(wrapper.get(PANEL).attributes('aria-hidden')).toBe('true')
  })

  it('tells the visitor when their location is unavailable and lists deals without distances', async () => {
    // jsdom has no navigator.geolocation, so the page cannot locate the visitor.
    const { wrapper } = await mountAt('/browse')
    await flushPromises()

    const status = wrapper.get('[data-testid="location-status"]')
    expect(status.attributes('role')).toBe('status')
    expect(status.text()).toContain('Location unavailable')
    expect(wrapper.get('[data-testid="near-me"]').text()).toBe('Near me')
    expect(wrapper.get('h1').text()).toBe('1 deal')
    const items = wrapper.findAll('[data-testid="nearby-list"] li')
    expect(items.map((item) => item.text())).toEqual(["$1 sundae after 2pmMcDonald's Bedok Mall$1"])
  })

  it('opens a deal from the list, flies the map to its outlet and shows its details', async () => {
    const { wrapper } = await mountAt('/browse')
    await flushPromises()
    await wrapper.get(TOGGLE).trigger('click')
    expect(wrapper.find(DETAIL).exists()).toBe(false)

    await wrapper.get('[data-testid="nearby-list"] button').trigger('click')

    const map = wrapper.findComponent({ name: 'DealMap' })
    expect(map.props('focus')).toEqual({ lat: SEED_VENUE.lat, lng: SEED_VENUE.lng })
    // The list heading makes way for the deal; the panel is named after it instead.
    expect(wrapper.get(PANEL).find('h1').exists()).toBe(false)
    expect(wrapper.get(PANEL).attributes('aria-label')).toBe('$1 sundae after 2pm')
    const detail = wrapper.get(DETAIL)
    expect(detail.find('[data-testid="deal-image-placeholder"]').exists()).toBe(true)
    expect(detail.get('h2').text()).toBe('$1 sundae after 2pm')
    expect(detail.text()).toContain("McDonald's Bedok Mall")
    expect(detail.text()).toContain('Vanilla cone or sundae for a dollar.')
    expect(detail.get('[data-testid="vote-alive"]').text()).toContain('2')
    // The rest of the deals stay listed under the details, with the open one marked.
    expect(wrapper.get('#deal-list-title').text()).toBe('More deals')
    expect(wrapper.get('[data-testid="nearby-list"] li').attributes('aria-current')).toBe('true')

    await wrapper.get('[data-testid="deal-back"]').trigger('click')
    expect(wrapper.find(DETAIL).exists()).toBe(false)
    expect(wrapper.get(PANEL).get('h1').text()).toBe('1 deal')
  })

  it('opens the panel on the deal when a pin with one deal is clicked', async () => {
    const { wrapper } = await mountAt('/browse')
    await flushPromises()
    expect(wrapper.get(PANEL).attributes('aria-hidden')).toBe('true')

    wrapper.findComponent({ name: 'DealMap' }).vm.$emit('select', SEED_VENUE.id)
    await flushPromises()

    expect(wrapper.get(PANEL).attributes('aria-hidden')).toBe('false')
    expect(wrapper.get(DETAIL).get('h2').text()).toBe('$1 sundae after 2pm')
    expect(wrapper.findComponent({ name: 'DealMap' }).props('focus')).toEqual({
      lat: SEED_VENUE.lat,
      lng: SEED_VENUE.lng,
    })
  })

  it('shows an outlet with several deals before opening one, and steps back through them', async () => {
    rest.list.mockResolvedValue({ items: [SEED_PIN, SECOND_PIN], categories: ['DESSERT', 'FOOD'] })
    const { wrapper } = await mountAt('/browse')
    await flushPromises()

    // One pin for the outlet, badged with the deal count.
    const pins = wrapper.findComponent({ name: 'DealMap' }).props('pins')
    expect(pins).toHaveLength(1)
    expect(pins[0].deals.map((deal: { title: string }) => deal.title)).toEqual([
      '$1 sundae after 2pm',
      'McSpicy meal $5',
    ])

    wrapper.findComponent({ name: 'DealMap' }).vm.$emit('select', SEED_VENUE.id)
    await flushPromises()
    const venueView = wrapper.get('[data-testid="venue-deals"]')
    expect(venueView.get('h2').text()).toBe("McDonald's Bedok Mall")
    expect(venueView.text()).toContain('2 deals at this outlet')
    expect(wrapper.find(DETAIL).exists()).toBe(false)

    await venueView.findAll('[data-testid="venue-deal-rows"] button')[1]?.trigger('click')
    expect(wrapper.get(DETAIL).get('h2').text()).toBe('McSpicy meal $5')
    expect(wrapper.get('[data-testid="same-outlet-rows"]').text()).toContain('$1 sundae after 2pm')

    await wrapper.get('[data-testid="deal-back"]').trigger('click')
    expect(wrapper.find(DETAIL).exists()).toBe(false)
    expect(wrapper.find('[data-testid="venue-deals"]').exists()).toBe(true)

    await wrapper.get('[data-testid="deal-back"]').trigger('click')
    expect(wrapper.find('[data-testid="venue-deals"]').exists()).toBe(false)
    expect(wrapper.get(PANEL).get('h1').text()).toBe('2 deals')
  })

  it('keeps the container shell for ordinary pages', async () => {
    const { wrapper } = await mountAt('/getting-started')

    expect(wrapper.get('main').classes()).toContain('container')
    expect(wrapper.find('.site-canvas').exists()).toBe(false)
  })

  it('links back to the browse landing page from the header', async () => {
    const { router, wrapper } = await mountAt('/getting-started')

    await wrapper.get('[data-testid="nav-toggle"]').trigger('click')
    await wrapper.get('[data-testid="nav-menu"] a[href="/"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/')
    expect(wrapper.find('.site-canvas').exists()).toBe(true)
  })

  it('redirects the old /browse address to the landing page', async () => {
    const { router } = await mountAt('/browse')

    expect(router.currentRoute.value.path).toBe('/')
    expect(router.currentRoute.value.name).toBe('browse')
  })

  it('updates filter state immutably from the controls', async () => {
    const { wrapper } = await mountAt('/')

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
    expect(createDefaultFilters()).toEqual({
      category: '',
      priceMaxMinor: null,
      validNow: true,
    })
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
      ok({
        coords: { latitude: 1.3, longitude: 103.8, accuracy: 25 },
      } as GeolocationPosition),
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
