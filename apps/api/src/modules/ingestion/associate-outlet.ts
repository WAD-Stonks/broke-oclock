import { DomainError } from '@api/modules/domain-error'
import { fenceDraftEvidence } from '@api/modules/ingestion/draft-evidence'
import { importedDealScope } from '@api/modules/ingestion/review-policy'
import {
  accessTransaction,
  type Database,
  requireCurrentAdmin,
} from '@api/modules/platform-admin/transaction'
import { activeVenue } from '@api/modules/platform-admin/venues'
import type { IngestionOutletAssociationRequest } from '@broke-oclock/contracts/ingestion'

export const associateDraftOutlet = async (
  db: Database,
  actorId: string,
  dealId: string,
  input: IngestionOutletAssociationRequest,
  now: Date,
) =>
  accessTransaction(db, async (tx) => {
    await requireCurrentAdmin(tx, actorId)
    const deal = await tx.deal.findFirst({
      where: { ...importedDealScope, id: dealId },
      include: { sources: { include: { importedPost: true } }, venues: true },
    })
    if (!deal) throw new DomainError('NOT_FOUND')
    if (
      deal.reviewStatus !== 'PENDING' ||
      deal.contentVersion !== input.expectedContentVersion ||
      deal.publishedAt
    )
      throw new DomainError('CONFLICT', 'Draft changed or already reviewed')
    const unassociated =
      deal.applicability === 'NO_FIXED_LOCATION' &&
      deal.venues.length === 0 &&
      deal.merchantId === null
    const single =
      deal.applicability === 'SELECTED_OUTLETS' &&
      deal.venues.length === 1 &&
      deal.merchantId !== null
    if (!unassociated && !single)
      throw new DomainError('PRECONDITION_FAILED', 'Unsupported outlet association state')
    const existingLink = deal.venues[0]
    if (single && existingLink) {
      const previous = await activeVenue(tx, existingLink.venueId)
      if (previous.merchant.id !== deal.merchantId)
        throw new DomainError('PRECONDITION_FAILED', 'Inconsistent outlet merchant')
      if (previous.venue.id === input.venueId)
        throw new DomainError('PRECONDITION_FAILED', 'Outlet selection is unchanged')
    }
    const { venue, merchant } = await activeVenue(tx, input.venueId)
    await fenceDraftEvidence(tx, deal.sources, now, true)
    const changed = await tx.deal.updateMany({
      where: {
        ...importedDealScope,
        id: deal.id,
        contentVersion: input.expectedContentVersion,
        reviewStatus: 'PENDING',
        OR: [{ publishedAt: null }, { publishedAt: { isSet: false } }],
      },
      data: {
        merchantId: merchant.id,
        applicability: 'SELECTED_OUTLETS',
        contentVersion: { increment: 1 },
        reviewedVersion: null,
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
        publishedAt: null,
      },
    })
    if (changed.count !== 1) throw new DomainError('CONFLICT', 'Draft changed or already reviewed')
    if (single && existingLink) {
      const deleted = await tx.dealVenue.deleteMany({
        where: { id: existingLink.id, dealId: deal.id, venueId: existingLink.venueId },
      })
      if (deleted.count !== 1) throw new DomainError('CONFLICT', 'Outlet association changed')
    }
    await tx.dealVenue.create({ data: { dealId: deal.id, venueId: venue.id } })
    return {
      id: deal.id,
      contentVersion: deal.contentVersion + 1,
      reviewStatus: 'PENDING' as const,
      applicability: 'SELECTED_OUTLETS' as const,
      merchantId: merchant.id,
      outlet: {
        id: venue.id,
        name: venue.name,
        address: venue.address,
        merchantName: merchant.name,
      },
    }
  })
