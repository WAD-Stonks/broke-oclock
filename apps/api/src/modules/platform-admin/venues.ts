import type { AccessTransaction } from '@api/modules/platform-admin/transaction'
import { TRPCError } from '@trpc/server'

export const activeRecord = { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] }
export const activeGrant = { OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }] }
export const activeVenue = async (tx: AccessTransaction, venueId: string) => {
  const venue = await tx.venue.findUnique({ where: { id: venueId } })
  const merchant = venue ? await tx.merchant.findUnique({ where: { id: venue.merchantId } }) : null
  if (!venue || venue.deletedAt || !merchant || merchant.deletedAt)
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'An active stall and merchant are required',
    })
  // Write real monotonic timestamps: a snapshot read alone could race a soft delete.
  await tx.venue.update({
    where: { id: venue.id },
    data: { updatedAt: new Date(Math.max(Date.now(), venue.updatedAt.getTime() + 1)) },
  })
  await tx.merchant.update({
    where: { id: merchant.id },
    data: { updatedAt: new Date(Math.max(Date.now(), merchant.updatedAt.getTime() + 1)) },
  })
  return { venue, merchant }
}
