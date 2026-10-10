import {
  type CommunityTransaction,
  requireOutlet,
  visibleDeal,
} from '@api/modules/community/voting'
import { DomainError } from '@api/modules/domain-error'
import { fencePlatformAccess } from '@api/modules/platform-admin/transaction'
import type { CommentResponse } from '@broke-oclock/contracts/community'
import type { PrismaClient } from '@broke-oclock/db'

type ReportInput = { reason: 'SPAM' | 'MISLEADING' | 'INAPPROPRIATE' | 'OTHER'; details?: string }
const retryWrite = async <T>(work: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await work()
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
const commentSelect = {
  id: true,
  dealId: true,
  authorId: true,
  body: true,
  venueId: true,
  createdAt: true,
  author: { select: { name: true } },
} as const
const formatComment = (
  comment: {
    id: string
    dealId: string
    authorId: string
    body: string
    venueId: string | null
    createdAt: Date
    author: { name: string }
  },
  userId?: string,
): CommentResponse => ({
  id: comment.id,
  dealId: comment.dealId,
  authorId: comment.authorId,
  authorName: comment.author.name,
  body: comment.body,
  venueId: comment.venueId,
  createdAt: comment.createdAt.toISOString(),
  canDelete: comment.authorId === userId,
})
export const listComments = (
  db: PrismaClient,
  dealId: string,
  userId: string | undefined,
  query: { cursor?: string; limit: number },
) =>
  db.$transaction(async (tx) => {
    await visibleDeal(tx, dealId)
    const rows = await tx.comment.findMany({
      where: {
        dealId,
        AND: [
          { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
          { OR: [{ hiddenAt: null }, { hiddenAt: { isSet: false } }] },
        ],
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      select: commentSelect,
    })
    return {
      items: rows.slice(0, query.limit).map((row) => formatComment(row, userId)),
      nextCursor: rows.length > query.limit ? (rows[query.limit - 1]?.id ?? null) : null,
    }
  })
export const createComment = (
  db: PrismaClient,
  dealId: string,
  userId: string,
  input: { body: string; venueId?: string | null; requestKey: string },
) =>
  retryWrite(() =>
    db.$transaction(async (tx) => {
      const deal = await visibleDeal(tx, dealId)
      if (input.venueId) await requireOutlet(tx, deal, input.venueId)
      const previous = await tx.comment.findUnique({
        where: { authorId_requestKey: { authorId: userId, requestKey: input.requestKey } },
        select: commentSelect,
      })
      if (previous) {
        if (
          previous.dealId !== dealId ||
          previous.body !== input.body ||
          previous.venueId !== (input.venueId ?? null)
        )
          throw new DomainError('CONFLICT', 'Request key already used')
        return formatComment(previous, userId)
      }
      const comment = await tx.comment.create({
        data: {
          dealId,
          authorId: userId,
          body: input.body,
          venueId: input.venueId ?? null,
          requestKey: input.requestKey,
        },
        select: commentSelect,
      })
      return formatComment(comment, userId)
    }),
  )
export const deleteComment = (
  db: PrismaClient,
  dealId: string,
  commentId: string,
  userId: string,
) =>
  db.$transaction(async (tx) => {
    const comment = await tx.comment.findFirst({
      where: { id: commentId, dealId },
      select: { id: true, authorId: true, deletedAt: true },
    })
    if (!comment) throw new DomainError('NOT_FOUND', 'Comment not found')
    if (comment.authorId !== userId)
      throw new DomainError('FORBIDDEN', 'Only the author can delete this comment')
    if (!comment.deletedAt)
      await tx.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } })
    return { ok: true as const }
  })
export const reportDeal = (db: PrismaClient, dealId: string, userId: string, input: ReportInput) =>
  retryWrite(() =>
    db.$transaction(async (tx) => {
      await visibleDeal(tx, dealId)
      const report = await tx.dealReport.upsert({
        where: { reporterId_dealId: { reporterId: userId, dealId } },
        create: { dealId, reporterId: userId, reason: input.reason, details: input.details },
        update: {},
        select: { id: true, status: true },
      })
      return report
    }),
  )
export const reportComment = (
  db: PrismaClient,
  dealId: string,
  commentId: string,
  userId: string,
  input: ReportInput,
) =>
  retryWrite(() =>
    db.$transaction(async (tx) => {
      await visibleDeal(tx, dealId)
      const comment = await tx.comment.findFirst({
        where: {
          id: commentId,
          dealId,
          AND: [
            { OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }] },
            { OR: [{ hiddenAt: null }, { hiddenAt: { isSet: false } }] },
          ],
        },
        select: { id: true, updatedAt: true },
      })
      if (!comment) throw new DomainError('NOT_FOUND', 'Comment not found')
      await tx.comment.update({
        where: { id: commentId },
        data: { updatedAt: new Date(Math.max(Date.now(), comment.updatedAt.getTime() + 1)) },
      })
      return tx.commentReport.upsert({
        where: { reporterId_commentId: { reporterId: userId, commentId } },
        create: { commentId, reporterId: userId, reason: input.reason, details: input.details },
        update: {},
        select: { id: true, status: true },
      })
    }),
  )

const requireStaff = async (tx: CommunityTransaction, actorId: string) => {
  await fencePlatformAccess(tx)
  const user = await tx.user.findUnique({
    where: { id: actorId },
    select: { id: true, role: true, updatedAt: true },
  })
  if (user?.role !== 'MODERATOR' && user?.role !== 'ADMIN')
    throw new DomainError('FORBIDDEN', 'Moderator required')
  await tx.user.update({
    where: { id: actorId },
    data: { updatedAt: new Date(Math.max(Date.now(), user.updatedAt.getTime() + 1)) },
  })
}
export const listReports = (
  db: PrismaClient,
  actorId: string,
  query: { cursor?: string; limit: number },
  priorityThreshold = 3,
) =>
  db.$transaction(async (tx) => {
    await requireStaff(tx, actorId)
    const where = { status: 'OPEN' as const, ...(query.cursor ? { id: { lt: query.cursor } } : {}) }
    const [deals, comments] = await Promise.all([
      tx.dealReport.findMany({
        where,
        orderBy: { id: 'desc' },
        take: query.limit + 1,
        select: {
          id: true,
          dealId: true,
          reason: true,
          details: true,
          status: true,
          createdAt: true,
        },
      }),
      tx.commentReport.findMany({
        where,
        orderBy: { id: 'desc' },
        take: query.limit + 1,
        select: {
          id: true,
          commentId: true,
          reason: true,
          details: true,
          status: true,
          createdAt: true,
        },
      }),
    ])
    const combined = [
      ...deals.map((report) => ({
        ...report,
        targetType: 'DEAL' as const,
        targetId: report.dealId,
      })),
      ...comments.map((report) => ({
        ...report,
        targetType: 'COMMENT' as const,
        targetId: report.commentId,
      })),
    ].sort((a, b) => b.id.localeCompare(a.id))
    const page = combined.slice(0, query.limit)
    const items = await Promise.all(
      page.map(async (report) => {
        const openCount =
          report.targetType === 'DEAL'
            ? await tx.dealReport.count({ where: { dealId: report.targetId, status: 'OPEN' } })
            : await tx.commentReport.count({
                where: { commentId: report.targetId, status: 'OPEN' },
              })
        return {
          id: report.id,
          targetType: report.targetType,
          targetId: report.targetId,
          reason: report.reason,
          details: report.details,
          status: report.status,
          createdAt: report.createdAt.toISOString(),
          openCount,
          priority: openCount >= priorityThreshold,
        }
      }),
    )
    return { items, nextCursor: combined.length > query.limit ? (page.at(-1)?.id ?? null) : null }
  })
export const moderateReport = (
  db: PrismaClient,
  actorId: string,
  kind: 'DEAL' | 'COMMENT',
  reportId: string,
  input: { status: 'RESOLVED' | 'DISMISSED'; note: string; hide: boolean },
) =>
  db.$transaction(async (tx) => {
    await requireStaff(tx, actorId)
    if (input.hide && input.status === 'DISMISSED')
      throw new DomainError('BAD_REQUEST', 'Dismissed reports cannot hide content')
    if (kind === 'DEAL') {
      const report = await tx.dealReport.findUnique({ where: { id: reportId } })
      if (!report) throw new DomainError('NOT_FOUND', 'Report not found')
      if (report.status !== 'OPEN') throw new DomainError('CONFLICT', 'Report already reviewed')
      if (input.hide) {
        const deal = await tx.deal.findUnique({ where: { id: report.dealId } })
        if (!deal) throw new DomainError('NOT_FOUND', 'Deal not found')
        await tx.deal.update({ where: { id: deal.id }, data: { reviewStatus: 'HIDDEN' } })
      }
      await tx.dealReport.update({
        where: { id: report.id },
        data: {
          status: input.status,
          resolution: input.note,
          resolvedAt: new Date(),
          resolvedById: actorId,
        },
      })
      await tx.communityModerationAudit.create({
        data: {
          actorId,
          targetType: kind,
          targetId: report.dealId,
          action: input.hide ? 'HIDE_AND_REVIEW' : 'REVIEW',
          note: input.note,
        },
      })
    } else {
      const report = await tx.commentReport.findUnique({ where: { id: reportId } })
      if (!report) throw new DomainError('NOT_FOUND', 'Report not found')
      if (report.status !== 'OPEN') throw new DomainError('CONFLICT', 'Report already reviewed')
      if (input.hide)
        await tx.comment.update({ where: { id: report.commentId }, data: { hiddenAt: new Date() } })
      await tx.commentReport.update({
        where: { id: report.id },
        data: {
          status: input.status,
          resolution: input.note,
          resolvedAt: new Date(),
          resolvedById: actorId,
        },
      })
      await tx.communityModerationAudit.create({
        data: {
          actorId,
          targetType: kind,
          targetId: report.commentId,
          action: input.hide ? 'HIDE_AND_REVIEW' : 'REVIEW',
          note: input.note,
        },
      })
    }
    return { id: reportId, status: input.status }
  })
