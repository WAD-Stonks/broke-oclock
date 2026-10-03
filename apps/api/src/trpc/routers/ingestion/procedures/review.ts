import { adminProcedure } from '@api/modules/ingestion/policy'
import { importedDealScope, isReviewReady } from '@api/modules/ingestion/review-policy'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
export const reviewProcedure = adminProcedure
  .input(
    z
      .object({
        dealId: z.string().regex(/^[a-f0-9]{24}$/),
        expectedContentVersion: z.number().int().min(1),
        decision: z.enum(['APPROVE', 'REJECT']),
        note: z.string().trim().min(1).max(1000),
      })
      .strict(),
  )
  .output(z.object({ id: z.string(), reviewStatus: z.string() }))
  .mutation(async ({ ctx, input }) =>
    ctx.db
      .$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: ctx.session.user.id },
          select: { role: true },
        })
        if (user?.role !== 'ADMIN') throw new TRPCError({ code: 'FORBIDDEN' })
        const deal = await tx.deal.findFirst({
          where: { ...importedDealScope, id: input.dealId },
          include: { sources: { include: { importedPost: true } } },
        })
        if (!deal) throw new TRPCError({ code: 'NOT_FOUND' })
        if (deal.reviewStatus !== 'PENDING' || deal.contentVersion !== input.expectedContentVersion)
          throw new TRPCError({ code: 'CONFLICT', message: 'Draft changed or already reviewed' })
        const now = ctx.ingestion?.now() ?? new Date()
        if (input.decision === 'APPROVE' && !isReviewReady(deal, now))
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Draft needs validity, offer or source clarification',
          })
        // Both processPost and recordPostFailure write ImportedPost, even when
        // they deliberately leave Deal and its immutable citation untouched.
        // CAS-write every evidence row so those paths conflict with this review
        // transaction instead of permitting approval from a stale snapshot.
        for (const source of deal.sources) {
          const evidence = source.importedPost
          const fenced = await tx.importedPost.updateMany({
            where: {
              id: evidence.id,
              contentHash: evidence.contentHash,
              status: evidence.status,
              updatedAt: evidence.updatedAt,
              ...(evidence.errorCode === null
                ? { OR: [{ errorCode: null }, { errorCode: { isSet: false } }] }
                : { errorCode: evidence.errorCode }),
            },
            // Force a real write, including same-millisecond reviews, without
            // modifying the source content or any approved Deal/DealSource.
            data: {
              updatedAt: new Date(Math.max(now.getTime(), evidence.updatedAt.getTime() + 1)),
            },
          })
          if (fenced.count !== 1)
            throw new TRPCError({ code: 'CONFLICT', message: 'Source evidence changed' })
        }
        const reviewStatus =
          input.decision === 'APPROVE' ? ('APPROVED' as const) : ('REJECTED' as const)
        const changed = await tx.deal.updateMany({
          where: {
            ...importedDealScope,
            id: deal.id,
            contentVersion: input.expectedContentVersion,
            reviewStatus: 'PENDING',
          },
          data: {
            reviewStatus,
            reviewNote: input.note,
            reviewedById: ctx.session.user.id,
            reviewedAt: now,
            reviewedVersion: input.expectedContentVersion,
            publishedAt: input.decision === 'APPROVE' ? now : null,
          },
        })
        if (changed.count !== 1)
          throw new TRPCError({ code: 'CONFLICT', message: 'Draft changed or already reviewed' })
        return { id: deal.id, reviewStatus }
      })
      .catch((error: unknown) => {
        if (typeof error === 'object' && error && 'code' in error && error.code === 'P2034')
          throw new TRPCError({ code: 'CONFLICT', message: 'Draft changed or already reviewed' })
        throw error
      }),
  )
