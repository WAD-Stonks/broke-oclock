import { mount } from '@vue/test-utils'
import BrowsePanel from '@web/modules/browse-map/BrowsePanel.vue'
import { describe, expect, it } from 'vitest'

describe('BrowsePanel nearby list', () => {
  it('lists deals nearest first with formatted distances and emits select', async () => {
    const wrapper = mount(BrowsePanel, {
      props: {
        open: true,
        nearby: [
          { id: 'a', title: 'Kopi set', lat: 1.3, lng: 103.85, distanceMetres: 420 },
          { id: 'b', title: 'Prata deal', lat: 1.31, lng: 103.9, distanceMetres: 5600 },
        ],
      },
    })

    const items = wrapper.findAll('[data-testid="nearby-list"] li')
    expect(items.map((item) => item.text())).toEqual(['Kopi set 420 m', 'Prata deal 5.6 km'])

    await items[1]?.get('button').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['b']])
  })
})
