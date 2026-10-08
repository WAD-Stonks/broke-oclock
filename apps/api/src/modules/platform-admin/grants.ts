import { DomainError } from '@api/modules/domain-error'
import { invalidatePendingRequests } from '@api/modules/platform-admin/invalidation'
import {
  type AccessTransaction,
  accessTransaction,
  checkVersion,
  conflict,
  currentUser,
  type Database,
  requireCurrentAdmin,
} from '@api/modules/platform-admin/transaction'
import { activeVenue } from '@api/modules/platform-admin/venues'

export const activateGrant = async (tx: AccessTransaction, userId: string, venueId: string) => {
  const existing = await tx.stallGrant.findUnique({
    where: { userId_venueId: { userId, venueId } },
  })
  if (existing && !existing.revokedAt) throw conflict()
  return existing
    ? tx.stallGrant.update({
        where: { id: existing.id },
        data: { revokedAt: null, version: { increment: 1 } },
      })
    : tx.stallGrant.create({ data: { userId, venueId, revokedAt: null } })
}
export const revokeStall = (
  db: Database,
  actorId: string,
  input: { grantId: string; expectedVersion: number; note: string },
) =>
  accessTransaction(db, async (tx) => {
    const actor = await requireCurrentAdmin(tx, actorId)
    const grant = await tx.stallGrant.findUnique({ where: { id: input.grantId } })
    if (!grant) throw new DomainError('NOT_FOUND')
    checkVersion(grant.version, input.expectedVersion)
    if (grant.revokedAt) throw conflict()
    const target = await currentUser(tx, grant.userId)
    await invalidatePendingRequests(
      tx,
      actor,
      target.id,
      'Stall access revoked; submit a fresh request',
      grant.venueId,
    )
    await tx.stallGrant.update({
      where: { id: grant.id },
      data: { revokedAt: new Date(), version: { increment: 1 } },
    })
    await tx.user.update({
      where: { id: target.id },
      data: { platformVersion: (target.platformVersion ?? 0) + 1 },
    })
    await tx.platformAudit.create({
      data: {
        actorId,
        actorName: actor.name,
        action: 'STALL_REVOKED',
        targetUserId: target.id,
        venueId: grant.venueId,
        note: input.note,
        roleBefore: null,
        roleAfter: null,
      },
    })
    return { id: grant.id, version: grant.version + 1 }
  })

export const grantStall = (
  db: Database,
  actorId: string,
  input: { userId: string; venueId: string; expectedUserVersion: number; note: string },
) =>
  accessTransaction(db, async (tx) => {
    const actor = await requireCurrentAdmin(tx, actorId)
    if (actorId === input.userId) throw new DomainError('FORBIDDEN', 'Cannot grant yourself access')
    const target = await currentUser(tx, input.userId)
    checkVersion(target.platformVersion, input.expectedUserVersion)
    if (target.role !== 'MERCHANT')
      throw new DomainError('PRECONDITION_FAILED', 'A merchant account is required')
    await activeVenue(tx, input.venueId)
    const grant = await activateGrant(tx, target.id, input.venueId)
    await tx.user.update({
      where: { id: target.id },
      data: { platformVersion: (target.platformVersion ?? 0) + 1 },
    })
    await tx.platformAudit.create({
      data: {
        actorId,
        actorName: actor.name,
        action: 'STALL_GRANTED',
        targetUserId: target.id,
        venueId: input.venueId,
        note: input.note,
        roleBefore: null,
        roleAfter: null,
      },
    })
    return { id: grant.id, version: grant.version }
  })
