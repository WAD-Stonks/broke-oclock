import type { VenueDealSummary, VenuePastDealSummary } from '@broke-oclock/contracts/venues'

const dateFormat = new Intl.DateTimeFormat('en-SG', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Singapore',
})

export const formatPrice = (priceMinor: number, currency: string) =>
  new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(priceMinor / 100)

type DealOffer = Pick<VenueDealSummary, 'offerType' | 'priceMinor' | 'currency' | 'discountPercent'>

export const offerLabel = (deal: DealOffer): string | null => {
  if (deal.offerType === 'BUY_ONE_GET_ONE') return '1-for-1'
  if (deal.offerType === 'PERCENT_OFF' && deal.discountPercent !== null)
    return `${deal.discountPercent}% off`
  if (deal.priceMinor !== null) return formatPrice(deal.priceMinor, deal.currency)
  return null
}

const lastValidDate = (validUntil: string) =>
  dateFormat.format(new Date(new Date(validUntil).getTime() - 1))

export const validityLabel = (deal: VenueDealSummary): string => {
  if (deal.validUntil) return `Until ${lastValidDate(deal.validUntil)}`
  return deal.rawValidityText ?? 'No end date listed'
}

export const endedLabel = (deal: VenuePastDealSummary): string =>
  `Ended ${lastValidDate(deal.validUntil)}`

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('')
