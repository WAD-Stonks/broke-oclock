import type { VenueDetailResponse } from '@broke-oclock/contracts/venues'
import { flushPromises, mount } from '@vue/test-utils'
import { ApiClientError } from '@web/lib/api-client'
import VenuePage from '@web/pages/VenuePage.vue'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

// Synthetic REST boundary: page projection only, not live venue data.
const rest = vi.hoisted(() => ({ venue: vi.fn() }))
vi.mock('@web/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  },
  api: { venues: { get: rest.venue } },
}))

const venueId = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const detail: VenueDetailResponse = {
  venue: {
    id: venueId,
    name: 'Synthetic Kopi Tampines',
    address: '1 Example Street',
    area: 'Tampines',
    postalCode: '520001',
    merchantName: 'Synthetic Kopi',
  },
  deals: [
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
      imageUrl: 'https://example.test/kopi.jpg',
    },
    {
      id: 'cccccccccccccccccccccccc',
      title: 'Toast discount',
      category: 'Food',
      offerType: 'PERCENT_OFF',
      priceMinor: null,
      currency: 'SGD',
      discountPercent: 20,
      validUntil: null,
      rawValidityText: 'While stocks last',
      imageUrl: null,
    },
  ],
  pastDeals: [
    {
      id: 'dddddddddddddddddddddddd',
      title: 'Old kaya toast set',
      offerType: 'BUY_ONE_GET_ONE',
      priceMinor: null,
      currency: 'SGD',
      discountPercent: null,
      validUntil: '2026-09-30T16:00:00.000Z',
    },
  ],
}

const mountAt = async (path: string) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/venues/:venueId', component: VenuePage }],
  })
  await router.push(path)
  const wrapper = mount(VenuePage, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.resetAllMocks()
})

it('renders the venue header and a card per ongoing deal', async () => {
  rest.venue.mockResolvedValue(detail)
  const wrapper = await mountAt(`/venues/${venueId}`)
  expect(rest.venue).toHaveBeenCalledWith(venueId)
  expect(wrapper.find('.venue-logo').text()).toBe('SK')
  expect(wrapper.find('h1').text()).toBe('Synthetic Kopi Tampines')
  expect(wrapper.text()).toContain('1 Example Street, Singapore 520001')
  expect(wrapper.find('h2').text()).toBe('Ongoing Deals')
  const cards = wrapper.findAll('[data-testid="venue-deal-card"]')
  expect(cards).toHaveLength(2)
  expect(cards[0]?.find('img').attributes('src')).toBe('https://example.test/kopi.jpg')
  expect(cards[0]?.text()).toContain('$3.50')
  expect(cards[0]?.text()).toContain('Until 31 Oct 2026')
  expect(cards[1]?.find('img').exists()).toBe(false)
  expect(cards[1]?.text()).toContain('20% off')
  expect(cards[1]?.text()).toContain('While stocks last')
})

it('lists past deals under Deal History with a no-longer-active label', async () => {
  rest.venue.mockResolvedValue(detail)
  const wrapper = await mountAt(`/venues/${venueId}`)
  const history = wrapper.find('[aria-labelledby="deal-history-title"]')
  expect(history.find('h2').text()).toBe('Deal History')
  expect(history.text()).toContain('No longer active')
  const rows = history.findAll('[data-testid="venue-past-deal"]')
  expect(rows).toHaveLength(1)
  expect(rows[0]?.text()).toContain('Old kaya toast set')
  expect(rows[0]?.text()).toContain('Ended 30 Sept 2026')
  expect(rows[0]?.text()).toContain('1-for-1')
})

it('shows empty messages when the venue has no ongoing or past deals', async () => {
  rest.venue.mockResolvedValue({ ...detail, deals: [], pastDeals: [] })
  const wrapper = await mountAt(`/venues/${venueId}`)
  expect(wrapper.text()).toContain('No ongoing deals at this venue right now.')
  expect(wrapper.text()).toContain('No past deals at this venue yet.')
  expect(wrapper.find('[data-testid="venue-deal-card"]').exists()).toBe(false)
  expect(wrapper.find('[data-testid="venue-past-deal"]').exists()).toBe(false)
})

it('shows not found for a missing venue and retries other failures', async () => {
  rest.venue.mockRejectedValueOnce(
    new (ApiClientError as unknown as new (code: string) => Error)('NOT_FOUND'),
  )
  const missing = await mountAt(`/venues/${venueId}`)
  expect(missing.text()).toContain('Venue not found')

  rest.venue.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(detail)
  const failing = await mountAt(`/venues/${venueId}`)
  expect(failing.text()).toContain('Unable to load this venue')
  await failing.find('button').trigger('click')
  await flushPromises()
  expect(failing.find('h1').text()).toBe('Synthetic Kopi Tampines')
})
