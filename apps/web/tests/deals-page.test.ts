import { flushPromises, mount } from '@vue/test-utils'
import type { DealListItem } from '@web/modules/browse-map/deal-list'
import DealsPage from '@web/pages/DealsPage.vue'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

// Synthetic data source: page projection only, not the pending deals list API.
const source = vi.hoisted(() => ({ fetchDeals: vi.fn() }))
vi.mock('@web/modules/browse-map/deal-list', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@web/modules/browse-map/deal-list')>()),
  fetchDeals: source.fetchDeals,
}))

const deals: DealListItem[] = [
  {
    id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    title: 'Kopi set',
    category: 'Food',
    offerType: 'FIXED_PRICE',
    priceMinor: 350,
    currency: 'SGD',
    discountPercent: null,
    validUntil: '2026-10-31T16:00:00.000Z',
    rawValidityText: null,
    imageUrl: null,
    venue: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Synthetic Kopi', area: 'Tampines' },
  },
  {
    id: 'cccccccccccccccccccccccc',
    title: 'Online voucher',
    category: 'Shopping',
    offerType: 'PERCENT_OFF',
    priceMinor: null,
    currency: 'SGD',
    discountPercent: 15,
    validUntil: null,
    rawValidityText: 'While stocks last',
    imageUrl: null,
    venue: null,
  },
]

const mountAt = async (path: string) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/deals', name: 'deals', component: DealsPage },
      { path: '/venues/:venueId', name: 'venue', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  const wrapper = mount(DealsPage, { global: { plugins: [router] } })
  await flushPromises()
  return { router, wrapper }
}

beforeEach(() => {
  vi.resetAllMocks()
})

it('renders a card per deal with a link to its venue', async () => {
  source.fetchDeals.mockResolvedValue(deals)
  const { wrapper } = await mountAt('/deals')
  expect(source.fetchDeals).toHaveBeenCalledWith({ q: '', offerType: null })
  expect(wrapper.text()).toContain('2 deals')
  const cards = wrapper.findAll('[data-testid="venue-deal-card"]')
  expect(cards).toHaveLength(2)
  expect(cards[0]?.text()).toContain('$3.50')
  const link = cards[0]?.find('[data-testid="deal-venue-link"]')
  expect(link?.text()).toBe('Synthetic Kopi · Tampines')
  expect(link?.attributes('href')).toBe('/venues/aaaaaaaaaaaaaaaaaaaaaaaa')
  expect(cards[1]?.text()).toContain('15% off')
  expect(cards[1]?.find('[data-testid="deal-venue-link"]').exists()).toBe(false)
})

it('reads filters from the URL and writes new filters back to it', async () => {
  source.fetchDeals.mockResolvedValue(deals)
  const { router, wrapper } = await mountAt('/deals?q=kopi&offer=FIXED_PRICE')
  expect(source.fetchDeals).toHaveBeenLastCalledWith({ q: 'kopi', offerType: 'FIXED_PRICE' })
  expect((wrapper.get('#deal-search').element as HTMLInputElement).value).toBe('kopi')

  await wrapper.get('#deal-search').setValue('  toast ')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ q: 'toast', offer: 'FIXED_PRICE' })
  expect(source.fetchDeals).toHaveBeenLastCalledWith({ q: 'toast', offerType: 'FIXED_PRICE' })

  await wrapper.get('#deal-offer').setValue('')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ q: 'toast' })
})

it('searches as you type every few characters or after a pause', async () => {
  source.fetchDeals.mockResolvedValue(deals)
  const { router, wrapper } = await mountAt('/deals')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const input = wrapper.get('#deal-search')

  await input.setValue('ko')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({})

  await input.setValue('kop')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ q: 'kop' })

  await input.setValue('kopi')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ q: 'kop' })
  vi.advanceTimersByTime(400)
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ q: 'kopi' })
  expect((input.element as HTMLInputElement).value).toBe('kopi')

  await input.setValue('')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({})
  vi.useRealTimers()
})

it('ignores unknown offer types in the URL', async () => {
  source.fetchDeals.mockResolvedValue([])
  await mountAt('/deals?offer=FREE_MONEY')
  expect(source.fetchDeals).toHaveBeenCalledWith({ q: '', offerType: null })
})

it('distinguishes no deals from no filter matches and can clear filters', async () => {
  source.fetchDeals.mockResolvedValue([])
  const unfiltered = await mountAt('/deals')
  expect(unfiltered.wrapper.get('[data-testid="deals-empty"]').text()).toContain('No deals yet')

  const { router, wrapper } = await mountAt('/deals?q=nothing')
  expect(wrapper.get('[data-testid="deals-empty"]').text()).toContain('No deals match your filters')
  await wrapper.get('[data-testid="deals-empty"] button').trigger('click')
  await flushPromises()
  expect(router.currentRoute.value.query).toEqual({})
})

it('shows an error state and retries', async () => {
  source.fetchDeals.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(deals)
  const { wrapper } = await mountAt('/deals')
  expect(wrapper.text()).toContain('Unable to load deals')
  await wrapper.get('[role="alert"] button').trigger('click')
  await flushPromises()
  expect(wrapper.findAll('[data-testid="venue-deal-card"]')).toHaveLength(2)
})
