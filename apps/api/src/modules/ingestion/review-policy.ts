import { MONEYDIGEST_SOURCE } from '@api/modules/ingestion/source'
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
