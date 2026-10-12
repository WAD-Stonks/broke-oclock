import type { DealPin } from '@broke-oclock/contracts/deals'
import { categoryStyle, createCategoryIconElement } from '@web/modules/browse-map/category-style'
import { DEAL_PIN_CLASS, DEAL_PIN_LABEL_MAX_CHARS } from '@web/modules/browse-map/map-config'
import type { VenuePin } from '@web/modules/browse-map/types'
import L from 'leaflet'

const ELLIPSIS = '…'

export const pinLabel = (deal: Pick<DealPin, 'title' | 'label'>): string => {
  // An empty label (no price or offer text yet) falls back to the title.
  const text = deal.label.trim() || deal.title.trim()
  if (text.length <= DEAL_PIN_LABEL_MAX_CHARS) return text
  return `${text.slice(0, DEAL_PIN_LABEL_MAX_CHARS - 1).trimEnd()}${ELLIPSIS}`
}

// One deal: its price or offer. Several deals at the outlet: how many there are.
export const pinBadgeText = (deals: readonly Pick<DealPin, 'title' | 'label'>[]): string => {
  const [first] = deals
  if (deals.length === 1 && first) return pinLabel(first)
  return `${deals.length} deals`
}

// A tinted bubble with the first deal's category icon, and a black badge underneath. Built from
// DOM nodes so deal text is never parsed as HTML.
export const createVenuePinIcon = (pin: Pick<VenuePin, 'deals'>): L.DivIcon => {
  const style = categoryStyle(pin.deals[0]?.category ?? '')
  const bubble = document.createElement('span')
  bubble.className = `${DEAL_PIN_CLASS}__bubble`
  bubble.style.setProperty('--pin-tint', style.tint)
  bubble.append(createCategoryIconElement(style.icon))

  const badge = document.createElement('span')
  badge.className = `${DEAL_PIN_CLASS}__badge`
  badge.textContent = pinBadgeText(pin.deals)

  const root = document.createElement('span')
  root.className = `${DEAL_PIN_CLASS}__stack`
  root.append(bubble, badge)
  return L.divIcon({ className: DEAL_PIN_CLASS, html: root, iconSize: [0, 0], iconAnchor: [0, 0] })
}
