import type { AppConfig } from '@api/config'
import { DomainError } from '@api/modules/domain-error'
import { fencePlatformAccess } from '@api/modules/platform-admin/transaction'
import type { CommunityResponse, VoteValue } from '@broke-oclock/contracts/community'
import type { PrismaClient } from '@broke-oclock/db'

export type CommunityTransaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]
export type CommunityPolicy = AppConfig['community']
export const DEFAULT_POLICY: CommunityPolicy = {
  evidenceWindowHours: 72,
  confirmThreshold: 3,
  deadThreshold: 2,
  reconfirmHours: 24,
  contentReportThreshold: 3,
}

export const visibleDeal = async (tx: CommunityTransaction, dealId: string) => {
  const deal = await tx.deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      title: true,
      description: true,
      reviewStatus: true,
      deletedAt: true,
      publishedAt: true,
      contentVersion: true,
      reviewedVersion: true,
      validFrom: true,
      validUntil: true,
      submittedById: true,
      merchantId: true,
      applicability: true,
    },
  })
  if (
    !deal ||
    deal.deletedAt ||
    deal.reviewStatus !== 'APPROVED' ||
    !deal.publishedAt ||
    deal.reviewedVersion !== deal.contentVersion
  )
    throw new DomainError('NOT_FOUND', 'Deal not found')
  return deal
}
type Deal = Awaited<ReturnType<typeof visibleDeal>>

const venuesFor = async (tx: CommunityTransaction, deal: Deal) => {
  if (deal.applicability === 'SELECTED_OUTLETS') {
    const rows = await tx.dealVenue.findMany({
      where: { dealId: deal.id },
      select: { venue: { select: { id: true, name: true, deletedAt: true } } },
    })
    return rows.map((row) => row.venue).filter((venue) => !venue.deletedAt)
  }
  if (deal.applicability === 'ALL_MERCHANT_OUTLETS' && deal.merchantId)
    return tx.venue.findMany({
      where: {
        merchantId: deal.merchantId,
        OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      },
      select: { id: true, name: true, deletedAt: true },
    })
  return []
}
const managementVenueIdsFor = async (
  tx: CommunityTransaction,
  deal: Deal,
  participatingVenueIds: string[],
) => {
  if (deal.applicability !== 'ONLINE' && deal.applicability !== 'NO_FIXED_LOCATION')
    return participatingVenueIds
  if (!deal.merchantId) return []
  const venues = await tx.venue.findMany({
    where: {
      merchantId: deal.merchantId,
      OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
    },
    select: { id: true },
  })
  return venues.map((venue) => venue.id)
}
export const requireOutlet = async (tx: CommunityTransaction, deal: Deal, venueId: string) => {
  if (!(await venuesFor(tx, deal)).some((venue) => venue.id === venueId))
    throw new DomainError('BAD_REQUEST', 'Outlet is not part of this promotion')
}
const status = (alive: number, dead: number, policy: CommunityPolicy) =>
  alive >= policy.confirmThreshold && dead >= policy.deadThreshold
    ? ('DISPUTED' as const)
    : alive >= policy.confirmThreshold
      ? ('CONFIRMED' as const)
      : dead >= policy.deadThreshold
        ? ('REPORTED_ENDED' as const)
        : ('UNVERIFIED' as const)
const validityFor = (deal: Deal, now: Date) =>
  deal.validUntil && deal.validUntil <= now
    ? ('EXPIRED' as const)
    : deal.validFrom && deal.validFrom > now
      ? ('SCHEDULED' as const)
      : !deal.validFrom || !deal.validUntil
        ? ('UNKNOWN' as const)
        : ('ACTIVE' as const)

export const readCommunity = async (
  tx: CommunityTransaction,
  dealId: string,
  userId: string | undefined,
  now: Date,
  policy: CommunityPolicy = DEFAULT_POLICY,
): Promise<CommunityResponse> => {
  const deal = await visibleDeal(tx, dealId)
  const venues = await venuesFor(tx, deal)
  const venueIds = venues.map((venue) => venue.id)
  const managementVenueIds = await managementVenueIdsFor(tx, deal, venueIds)
  const since = new Date(now.getTime() - policy.evidenceWindowHours * 60 * 60 * 1000)
  const votes = await tx.dealVote.findMany({
    where: { dealId, contentVersion: deal.contentVersion, observedAt: { gte: since, lte: now } },
    select: { userId: true, value: true, observedAt: true },
  })
  const recorded = await tx.dealVote.groupBy({
    by: ['value'],
    where: { dealId },
    _count: { _all: true },
  })
  const outletVotes = venueIds.length
    ? await tx.outletEvidence.findMany({
        where: {
          dealId,
          venueId: { in: venueIds },
          contentVersion: deal.contentVersion,
          observedAt: { gte: since, lte: now },
        },
        select: { userId: true, venueId: true, value: true, observedAt: true },
      })
    : []
  const voterIds = [
    ...new Set([
      ...votes.map((vote) => vote.userId),
      ...outletVotes.map((vote) => vote.userId),
      ...(userId ? [userId] : []),
    ]),
  ]
  const grants =
    voterIds.length && managementVenueIds.length
      ? await tx.stallGrant.findMany({
          where: {
            userId: { in: voterIds },
            venueId: { in: managementVenueIds },
            OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }],
          },
          select: { userId: true, venueId: true },
        })
      : []
  const managed = new Map<string, Set<string>>()
  for (const grant of grants)
    managed.set(grant.userId, (managed.get(grant.userId) ?? new Set()).add(grant.venueId))
  const independent = (id: string, venueId?: string) =>
    id !== deal.submittedById && (venueId ? !managed.get(id)?.has(venueId) : !managed.get(id)?.size)
  const summarize = (
    records: { userId: string; value: VoteValue; observedAt: Date | null }[],
    venueId?: string,
  ) => {
    const eligible = records.filter((vote) => independent(vote.userId, venueId))
    const alive = eligible.filter((vote) => vote.value === 'ALIVE')
    const dead = eligible.filter((vote) => vote.value === 'DEAD')
    return {
      aliveCount: alive.length,
      deadCount: dead.length,
      status: status(alive.length, dead.length, policy),
      lastConfirmedAt: alive.length
        ? new Date(Math.max(...alive.map((vote) => vote.observedAt?.getTime() ?? 0))).toISOString()
        : null,
    }
  }
  const whole = summarize(votes)
  const validity = validityFor(deal, now)
  const current = userId
    ? await tx.dealVote.findUnique({
        where: { userId_dealId: { userId, dealId } },
        select: { value: true, contentVersion: true, observedAt: true },
      })
    : null
  const currentOutlets =
    userId && venueIds.length
      ? await tx.outletEvidence.findMany({
          where: { userId, dealId, venueId: { in: venueIds } },
          select: { venueId: true, value: true, contentVersion: true, observedAt: true },
        })
      : []
  const closed = validity === 'EXPIRED' || validity === 'SCHEDULED'
  const reason = !userId
    ? ('SIGN_IN' as const)
    : !independent(userId)
      ? ('OWNER' as const)
      : closed
        ? ('CLOSED' as const)
        : null
  return {
    dealId: deal.id,
    title: deal.title,
    description: deal.description,
    validity,
    validUntil: deal.validUntil?.toISOString() ?? null,
    ...whole,
    recordedAliveCount: recorded.find((row) => row.value === 'ALIVE')?._count._all ?? 0,
    recordedDeadCount: recorded.find((row) => row.value === 'DEAD')?._count._all ?? 0,
    currentVote: current?.contentVersion === deal.contentVersion ? current.value : null,
    reconfirmAt:
      current?.contentVersion === deal.contentVersion && current.observedAt
        ? new Date(
            current.observedAt.getTime() + policy.reconfirmHours * 60 * 60 * 1000,
          ).toISOString()
        : null,
    canVote: reason === null,
    voteBlockReason: reason,
    contentVersion: deal.contentVersion,
    evaluatedAt: now.toISOString(),
    evidenceWindowHours: policy.evidenceWindowHours,
    reconfirmHours: policy.reconfirmHours,
    confirmThreshold: policy.confirmThreshold,
    deadThreshold: policy.deadThreshold,
    outlets: venues.map((venue) => {
      const evidence = summarize(
        outletVotes.filter((vote) => vote.venueId === venue.id),
        venue.id,
      )
      const mine = currentOutlets.find((vote) => vote.venueId === venue.id)
      return {
        ...evidence,
        venueId: venue.id,
        name: venue.name,
        currentVote: mine?.contentVersion === deal.contentVersion ? mine.value : null,
        reconfirmAt:
          mine?.contentVersion === deal.contentVersion
            ? new Date(
                mine.observedAt.getTime() + policy.reconfirmHours * 60 * 60 * 1000,
              ).toISOString()
            : null,
        canVote: Boolean(userId && !closed && independent(userId, venue.id)),
      }
    }),
  }
}
export const getCommunity = (
  db: PrismaClient,
  dealId: string,
  userId?: string,
  policy: CommunityPolicy = DEFAULT_POLICY,
) => db.$transaction((tx) => readCommunity(tx, dealId, userId, new Date(), policy))

export const setVote = async (
  db: PrismaClient,
  dealId: string,
  userId: string,
  input: { value: VoteValue; expectedVersion: number; reconfirm?: boolean },
  venueId?: string,
  policy: CommunityPolicy = DEFAULT_POLICY,
) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        await fencePlatformAccess(tx)
        // Deal edits must write this row; the transaction conflicts with a concurrent edit.
        const locked = await tx.deal.findUnique({
          where: { id: dealId },
          select: { id: true, updatedAt: true },
        })
        if (!locked) throw new DomainError('NOT_FOUND', 'Deal not found')
        await tx.deal.update({
          where: { id: dealId },
          data: { updatedAt: new Date(Math.max(Date.now(), locked.updatedAt.getTime() + 1)) },
        })
        const deal = await visibleDeal(tx, dealId)
        if (deal.contentVersion !== input.expectedVersion)
          throw new DomainError('CONFLICT', 'Deal changed. Refresh before confirming.')
        if (venueId) await requireOutlet(tx, deal, venueId)
        const now = new Date()
        if (['EXPIRED', 'SCHEDULED'].includes(validityFor(deal, now)))
          throw new DomainError('CONFLICT', 'Voting is closed for this deal')
        if (!(await tx.user.findUnique({ where: { id: userId }, select: { id: true } })))
          throw new DomainError('UNAUTHORIZED')
        const venues = await venuesFor(tx, deal)
        const managementVenueIds = venueId
          ? [venueId]
          : await managementVenueIdsFor(
              tx,
              deal,
              venues.map((venue) => venue.id),
            )
        const managed = await tx.stallGrant.count({
          where: {
            userId,
            venueId: { in: managementVenueIds },
            OR: [{ revokedAt: null }, { revokedAt: { isSet: false } }],
          },
        })
        if (userId === deal.submittedById || managed)
          throw new DomainError('FORBIDDEN', 'Promotion owners cannot verify their own promotion')
        if (venueId) {
          const where = { userId_dealId_venueId: { userId, dealId, venueId } }
          const before = await tx.outletEvidence.findUnique({ where })
          const changed =
            !before || before.value !== input.value || before.contentVersion !== deal.contentVersion
          if (
            !changed &&
            input.reconfirm &&
            now.getTime() - before.observedAt.getTime() < policy.reconfirmHours * 60 * 60 * 1000
          )
            throw new DomainError(
              'CONFLICT',
              `Reconfirmation is available after ${policy.reconfirmHours} hours`,
            )
          if (changed || input.reconfirm)
            await tx.outletEvidence.upsert({
              where,
              create: {
                dealId,
                venueId,
                userId,
                value: input.value,
                contentVersion: deal.contentVersion,
                observedAt: now,
              },
              update: { value: input.value, contentVersion: deal.contentVersion, observedAt: now },
            })
        } else {
          const where = { userId_dealId: { userId, dealId } }
          const before = await tx.dealVote.findUnique({ where })
          const changed =
            !before || before.value !== input.value || before.contentVersion !== deal.contentVersion
          if (
            !changed &&
            input.reconfirm &&
            before.observedAt &&
            now.getTime() - before.observedAt.getTime() < policy.reconfirmHours * 60 * 60 * 1000
          )
            throw new DomainError(
              'CONFLICT',
              `Reconfirmation is available after ${policy.reconfirmHours} hours`,
            )
          if (changed || input.reconfirm)
            await tx.dealVote.upsert({
              where,
              create: {
                dealId,
                userId,
                value: input.value,
                contentVersion: deal.contentVersion,
                observedAt: now,
              },
              update: { value: input.value, contentVersion: deal.contentVersion, observedAt: now },
            })
        }
        return readCommunity(tx, dealId, userId, new Date(), policy)
      })
    } catch (error) {
      if (
        !(
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error.code === 'P2002' || error.code === 'P2034')
        )
      )
        throw error
      if (attempt === 4)
        throw new DomainError('CONFLICT', 'Concurrent update. Refresh and try again.')
    }
  }
  throw new DomainError('CONFLICT')
}
