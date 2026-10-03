import { isReviewReady } from '@api/modules/ingestion/review-policy'
import { describe, expect, it } from 'vitest'

const now = new Date('2026-10-03T00:00:00Z')
const known = {
  validFrom: new Date('2026-09-30T16:00:00Z'),
  validUntil: new Date('2026-12-31T16:00:00Z'),
  offerType: 'BUY_ONE_GET_ONE',
  priceMinor: null,
  discountPercent: null,
  sources: [
    {
      sourceContentHash: 'synthetic-hash',
      importedPost: { contentHash: 'synthetic-hash', errorCode: null },
    },
  ],
}
describe('admin approval readiness', () => {
  it('blocks unknown starts, expired windows and mismatched snapshots', () => {
    expect(isReviewReady({ ...known, validFrom: null }, now)).toBe(false)
    expect(isReviewReady({ ...known, validUntil: now }, now)).toBe(false)
    expect(
      isReviewReady(
        {
          ...known,
          sources: [
            { sourceContentHash: 'older', importedPost: { contentHash: 'newer', errorCode: null } },
          ],
        },
        now,
      ),
    ).toBe(false)
    expect(isReviewReady(known, now)).toBe(true)
  })
})
