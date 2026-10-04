import { activateGrant } from '@api/modules/platform-admin/grants'
import { requestSubmission } from '@api/modules/platform-admin/schemas'
import {
  accessTransaction,
  checkVersion,
  conflict,
  currentUser,
  type Database,
  requireCurrentAdmin,
} from '@api/modules/platform-admin/transaction'
import { activeVenue } from '@api/modules/platform-admin/venues'
import { TRPCError } from '@trpc/server'
import type { z } from 'zod'

// Kang En's future protected, trusted-origin procedure supplies the session user ID,
// NEVER a body userId. This internal service accepts no role/status/actor overrides.
export const submitMerchantAccessRequest = async (
  db: Database,
  authenticatedUserId: string,
  rawInput: z.input<typeof requestSubmission>,
) => {
  const parsed = requestSubmission.safeParse(rawInput)
  if (!parsed.success)
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid merchant request' })
  const input = parsed.data
  return accessTransaction(db, async (tx) => {
    const user = await currentUser(tx, authenticatedUserId)
    if (user.role !== 'USER' && user.role !== 'MERCHANT')
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Staff accounts cannot request merchant access',
      })
    const { venue, merchant } = await activeVenue(tx, input.venueId)
    const existing = await tx.merchantAccessRequest.findFirst({
      where: { userId: user.id, venueId: venue.id, status: 'PENDING' },
    })
    const grant = await tx.stallGrant.findUnique({
      where: { userId_venueId: { userId: user.id, venueId: venue.id } },
    })
    if (existing || (grant && !grant.revokedAt)) throw conflict()
    await tx.user.update({
      where: { id: user.id },
      data: { updatedAt: new Date(Math.max(Date.now(), user.updatedAt.getTime() + 1)) },
    })
    const request = await tx.merchantAccessRequest.create({
      data: {
        userId: user.id,
        venueId: venue.id,
        userName: user.name,
        userEmail: user.email,
        venueName: venue.name,
        merchantName: merchant.name,
        message: input.message,
        reviewNote: null,
      },
    })
    await tx.platformAudit.create({
      data: {
        actorId: user.id,
        actorName: user.name,
        action: 'REQUEST_SUBMITTED',
        targetUserId: user.id,
        venueId: venue.id,
        note: 'Merchant access requested',
        roleBefore: null,
        roleAfter: null,
      },
    })
    return { id: request.id, version: request.version, status: request.status }
  })
}

export const reviewRequest = (
  db: Database,
  actorId: string,
  input: {
    requestId: string
    expectedVersion: number
    decision: 'APPROVE' | 'REJECT'
    note: string
  },
) =>
  accessTransaction(db, async (tx) => {
    const actor = await requireCurrentAdmin(tx, actorId)
    const request = await tx.merchantAccessRequest.findUnique({ where: { id: input.requestId } })
    if (!request) throw new TRPCError({ code: 'NOT_FOUND' })
    checkVersion(request.version, input.expectedVersion)
    if (request.status !== 'PENDING') throw conflict()
    const target = await currentUser(tx, request.userId)
    if (input.decision === 'APPROVE') {
      if (target.id === actorId)
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Cannot approve your own access' })
      if (target.role !== 'USER' && target.role !== 'MERCHANT')
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Staff accounts cannot be made merchants by approval',
        })
      await activeVenue(tx, request.venueId)
      await activateGrant(tx, target.id, request.venueId)
      await tx.user.update({
        where: { id: target.id },
        data: { role: 'MERCHANT', platformVersion: (target.platformVersion ?? 0) + 1 },
      })
    } else {
      await tx.user.update({
        where: { id: target.id },
        data: { updatedAt: new Date(Math.max(Date.now(), target.updatedAt.getTime() + 1)) },
      })
    }
    const status = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'
    await tx.merchantAccessRequest.update({
      where: { id: request.id },
      data: {
        status,
        version: { increment: 1 },
        reviewNote: input.note,
        reviewedById: actorId,
        reviewedAt: new Date(),
      },
    })
    const promoted = input.decision === 'APPROVE' && target.role === 'USER'
    await tx.platformAudit.create({
      data: {
        actorId,
        actorName: actor.name,
        action: input.decision === 'APPROVE' ? 'REQUEST_APPROVED' : 'REQUEST_REJECTED',
        targetUserId: target.id,
        venueId: request.venueId,
        note: input.note,
        roleBefore: promoted ? 'USER' : null,
        roleAfter: promoted ? 'MERCHANT' : null,
      },
    })
    return { id: request.id, version: request.version + 1 }
  })
