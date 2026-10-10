// Single definition of "a signed-in user may see this deal's content".
export type DealVisibilityFields = {
  reviewStatus: string
  deletedAt: Date | null
  publishedAt: Date | null
  contentVersion: number
  reviewedVersion: number | null
}

// A deal is public only when ALL of these are true (see docs/database-schema.md).
export const isPubliclyVisible = (deal: DealVisibilityFields): boolean => {
  if (deal.reviewStatus !== 'APPROVED') return false // staff must have approved it
  if (deal.deletedAt) return false // not deleted
  if (!deal.publishedAt) return false // has been published
  if (deal.reviewedVersion !== deal.contentVersion) return false // approved text is the current text
  return true
}
