import { DomainError } from '@api/modules/domain-error'
import { MONEYDIGEST_SOURCE } from '@api/modules/ingestion/source'
import type { AccessTransaction } from '@api/modules/platform-admin/transaction'
import { activeVenue } from '@api/modules/platform-admin/venues'
export const importedDealScope = {
  origin: 'IMPORTED' as const,
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
  sources: {
    some: {
      importedPost: {
        source: {
          provider: MONEYDIGEST_SOURCE.provider,
          externalId: MONEYDIGEST_SOURCE.externalId,
        },
      },
    },
  },
}
// Selected-outlet approval must retain active merchant/outlet authority.
// Rejection and existing no-location readiness remain unchanged.
export const requireSelectedOutletAuthority = async (
  tx: AccessTransaction,
  deal: { applicability: string; merchantId: string | null; venues: { venueId: string }[] },
) => {
  if (deal.applicability !== 'SELECTED_OUTLETS') return
  if (!deal.merchantId || !deal.venues.length)
    throw new DomainError('PRECONDITION_FAILED', 'Selected outlet merchant required')
  for (const link of deal.venues) {
    const { merchant } = await activeVenue(tx, link.venueId)
    if (merchant.id !== deal.merchantId)
      throw new DomainError('PRECONDITION_FAILED', 'Selected outlet merchant mismatch')
  }
}
export const isReviewReady = (
  deal: {
    validFrom: Date | null
    validUntil: Date | null
    offerType: string
    priceMinor: number | null
    discountPercent: number | null
    sources: {
      sourceContentHash: string
      importedPost: { contentHash: string; errorCode: string | null }
    }[]
  },
  now: Date,
) =>
  Boolean(
    deal.validFrom &&
      deal.validUntil &&
      deal.validUntil > now &&
      deal.validFrom < deal.validUntil &&
      deal.sources.length &&
      deal.sources.every(
        (source) =>
          source.sourceContentHash === source.importedPost.contentHash &&
          !source.importedPost.errorCode,
      ) &&
      (deal.offerType !== 'FIXED_PRICE' || (deal.priceMinor !== null && deal.priceMinor >= 0)) &&
      (deal.offerType !== 'PERCENT_OFF' ||
        (deal.discountPercent !== null && deal.discountPercent > 0 && deal.discountPercent <= 100)),
  )
