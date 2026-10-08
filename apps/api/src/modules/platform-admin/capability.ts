import { DomainError } from '@api/modules/domain-error'
import {
  type AccessTransaction,
  currentUser,
  fencePlatformAccess,
} from '@api/modules/platform-admin/transaction'
import { activeVenue } from '@api/modules/platform-admin/venues'

// Call INSIDE the same interactive transaction as the merchant's eventual write.
// This is not a read/query helper: it fences against revocation and role changes.
// No future merchant endpoint is protected until it adopts this helper.
export const requireMerchantStall = async (
  tx: AccessTransaction,
  userId: string,
  venueId: string,
) => {
  await fencePlatformAccess(tx)
  const user = await currentUser(tx, userId)
  if (user.role !== 'MERCHANT') throw new DomainError('FORBIDDEN')
  const grant = await tx.stallGrant.findUnique({ where: { userId_venueId: { userId, venueId } } })
  if (!grant || grant.revokedAt) throw new DomainError('FORBIDDEN')
  await activeVenue(tx, venueId)
  await tx.user.update({
    where: { id: user.id },
    data: { updatedAt: new Date(Math.max(Date.now(), user.updatedAt.getTime() + 1)) },
  })
  return { userId, venueId, grantId: grant.id, grantVersion: grant.version }
}
