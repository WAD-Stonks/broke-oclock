import { DEAL_PIN_CLASS, DEAL_PIN_LABEL_MAX_CHARS } from '@web/modules/browse-map/map-config'
import { createVenuePinIcon, pinBadgeText, pinLabel } from '@web/modules/browse-map/venue-pin'
import { describe, expect, it } from 'vitest'

describe('pinLabel', () => {
  it('prefers the short label and falls back to the title', () => {
    expect(pinLabel({ title: 'Kopi set', label: '$4.50' })).toBe('$4.50')
    expect(pinLabel({ title: 'Kopi set', label: '' })).toBe('Kopi set')
    expect(pinLabel({ title: '  1-for-1  ', label: '  1-for-1  ' })).toBe('1-for-1')
  })

  it('clips long text so a badge never becomes a banner', () => {
    const long = 'Half-price chicken rice all afternoon'
    const label = pinLabel({ title: long, label: long })

    expect(label.length).toBe(DEAL_PIN_LABEL_MAX_CHARS)
    expect(label.endsWith('…')).toBe(true)
    expect(long.startsWith(label.slice(0, -1).trimEnd())).toBe(true)
  })
})

describe('pinBadgeText', () => {
  it('shows the price for one deal and a count for several', () => {
    expect(pinBadgeText([{ title: 'Kopi', label: '$1' }])).toBe('$1')
    expect(
      pinBadgeText([
        { title: 'Kopi', label: '$1' },
        { title: 'Toast', label: '$2' },
      ]),
    ).toBe('2 deals')
  })
})

describe('createVenuePinIcon', () => {
  it('builds a tinted category bubble with an icon and a badge, never parsing HTML', () => {
    const icon = createVenuePinIcon({
      deals: [
        { title: '<img src=x onerror=alert(1)>', label: '<b>$12</b>', category: 'DRINKS' },
      ] as never,
    })
    const element = icon.createIcon()

    expect(icon.options.className).toBe(DEAL_PIN_CLASS)
    expect(icon.options.iconSize).toEqual([0, 0])
    const bubble = element.querySelector(`.${DEAL_PIN_CLASS}__bubble`) as HTMLElement
    expect(bubble.style.getPropertyValue('--pin-tint')).toBe('var(--tint-drinks)')
    expect(bubble.querySelector('svg path')).not.toBeNull()
    expect(element.querySelector(`.${DEAL_PIN_CLASS}__badge`)?.textContent).toBe('<b>$12</b>')
    expect(element.querySelector('b')).toBeNull()
    expect(element.querySelector('img')).toBeNull()
  })
})
