import { mount } from '@vue/test-utils'
import DealDetail from '@web/modules/browse-map/DealDetail.vue'
import type { SelectedDeal, VenuePin } from '@web/modules/browse-map/types'
import { describe, expect, it } from 'vitest'

const BEDOK = { id: '5eed03000000000000000000', name: 'Kopi Bedok', lat: 1.32, lng: 103.93 }
const TAMPINES = { id: '5eed03000000000000000001', name: 'Kopi Tampines', lat: 1.35, lng: 103.94 }

const KOPI = {
  id: '5eed04000000000000000000',
  title: 'Kopi $1',
  category: 'DRINKS',
  label: '$1',
  description: 'One dollar kopi before 10am.',
  offerType: 'FIXED_PRICE' as const,
  priceMinor: 100,
  discountPercent: null,
  terms: 'Dine-in only',
  validUntil: '2026-12-31T15:59:59.000Z',
  rawValidityText: null,
  votes: { alive: 3, dead: 1 },
  commentCount: 2,
  venues: [BEDOK, TAMPINES],
}
const TOAST = {
  ...KOPI,
  id: '5eed04000000000000000001',
  title: 'Toast $2',
  label: '$2',
  venues: [BEDOK],
}
const VENUE: VenuePin = { ...BEDOK, deals: [KOPI, TOAST] }

const SELECTED: SelectedDeal = { deal: KOPI, venue: VENUE, distanceMetres: 420 }

describe('DealDetail', () => {
  it('shows an image placeholder, the deal facts and the outlet being viewed', () => {
    const wrapper = mount(DealDetail, { props: { selected: SELECTED } })

    const placeholder = wrapper.get('[data-testid="deal-image-placeholder"]')
    expect(placeholder.attributes('role')).toBe('img')
    expect(placeholder.attributes('aria-label')).toContain('No photo')
    expect(wrapper.find('img').exists()).toBe(false)

    const text = wrapper.text()
    expect(wrapper.get('h2').text()).toBe('Kopi $1')
    expect(text).toContain('$1')
    expect(text).toContain('Drinks · Kopi Bedok · 420 m away')
    expect(text).toContain('One dollar kopi before 10am.')
    expect(text).toContain('Dine-in only')
    expect(text).toContain('Until 31 Dec 2026')
    expect(text).toContain('Also at 1 other outlet')
  })

  it('summarises the community review counts without letting anyone vote yet', () => {
    const wrapper = mount(DealDetail, { props: { selected: SELECTED } })
    const reviews = wrapper.get('[data-testid="deal-reviews"]')

    expect(reviews.get('[data-testid="vote-alive"]').text()).toContain('3')
    expect(reviews.get('[data-testid="vote-dead"]').text()).toContain('1')
    expect(reviews.get('[data-testid="vote-alive"]').attributes('disabled')).toBeDefined()
    expect(reviews.text()).toContain('3 of 4 people say it is still on')
    expect(reviews.text()).toContain('2 comments')
  })

  it('lists the other deals at the same outlet and lets the visitor hop to one', async () => {
    const wrapper = mount(DealDetail, { props: { selected: SELECTED } })
    const rows = wrapper.findAll('[data-testid="same-outlet-rows"] li')

    expect(wrapper.text()).toContain('More at Kopi Bedok')
    expect(rows.map((row) => row.text())).toEqual(['Toast $2Kopi Bedok · 420 m away$2'])
    await rows[0]?.get('button').trigger('click')
    expect(wrapper.emitted('select')).toEqual([[TOAST.id, BEDOK.id]])
  })

  it('explains when nobody has reviewed the deal, hides empty sections and emits back', async () => {
    const quiet: SelectedDeal = {
      deal: { ...KOPI, votes: { alive: 0, dead: 0 }, commentCount: 0, venues: [BEDOK] },
      venue: { ...BEDOK, deals: [KOPI] },
      distanceMetres: null,
    }
    const wrapper = mount(DealDetail, { props: { selected: quiet } })

    expect(wrapper.text()).toContain('No reports yet')
    expect(wrapper.text()).toContain('No comments yet')
    expect(wrapper.text()).not.toContain('Also at')
    expect(wrapper.text()).not.toContain('More at')
    expect(wrapper.text()).not.toContain('away')

    await wrapper.get('[data-testid="deal-back"]').trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
  })
})
