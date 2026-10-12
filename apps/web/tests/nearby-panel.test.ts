import { mount } from '@vue/test-utils'
import BrowsePanel from '@web/modules/browse-map/BrowsePanel.vue'
import type { DealRow, VenuePin } from '@web/modules/browse-map/types'
import { describe, expect, it } from 'vitest'

const deal = (id: string, title: string, label: string) => ({
  id,
  title,
  label,
  category: 'FOOD',
  description: '',
  offerType: 'FIXED_PRICE' as const,
  priceMinor: 100,
  discountPercent: null,
  terms: null,
  validUntil: null,
  rawValidityText: null,
  votes: { alive: 0, dead: 0 },
  commentCount: 0,
  venues: [],
})
const KOPI = deal('a', 'Kopi set', '$4.50')
const PRATA = deal('b', 'Prata deal', '$2')
const BISHAN: VenuePin = { id: 'v1', name: 'Bishan St 22', lat: 1.3, lng: 103.85, deals: [KOPI] }
const ANG_MO_KIO: VenuePin = { id: 'v2', name: 'AMK Hub', lat: 1.31, lng: 103.9, deals: [PRATA] }

const ROWS: readonly DealRow[] = [
  { key: 'a:v1', deal: KOPI, venue: BISHAN, distanceMetres: 420 },
  { key: 'b:v2', deal: PRATA, venue: ANG_MO_KIO, distanceMetres: 5600 },
]

describe('BrowsePanel list', () => {
  it('counts the deals nearby and lists them with outlet, distance and price', async () => {
    const wrapper = mount(BrowsePanel, { props: { open: true, status: 'ready', rows: ROWS } })

    expect(wrapper.get('h1').text()).toBe('2 deals nearby')
    const items = wrapper.findAll('[data-testid="nearby-list"] li')
    expect(items.map((item) => item.text())).toEqual([
      'Kopi setBishan St 22 · 420 m away$4.50',
      'Prata dealAMK Hub · 5.6 km away$2',
    ])

    await items[1]?.get('button').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['b', 'v2']])
  })

  it('shows an outlet with several deals to choose from', () => {
    const venue = { ...BISHAN, deals: [KOPI, PRATA] }
    const wrapper = mount(BrowsePanel, {
      props: { open: true, status: 'ready', rows: ROWS, venue: { venue, distanceMetres: 420 } },
    })

    expect(wrapper.find('h1').exists()).toBe(false)
    expect(wrapper.attributes('aria-label')).toBe('Bishan St 22')
    const venueView = wrapper.get('[data-testid="venue-deals"]')
    expect(venueView.text()).toContain('2 deals at this outlet · 420 m away')
    expect(venueView.findAll('[data-testid="venue-deal-rows"] li')).toHaveLength(2)
  })
})
