import { ApiErrorException } from '@api/errors'
import { importedDealScope, isReviewReady } from '@api/modules/ingestion/review-policy'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  ingestionReviewRequestSchema,
  ingestionReviewResponseSchema,
} from '@broke-oclock/contracts/ingestion'
import type { RequestHandler } from 'express'
import { z } from 'zod'

const reviewPathSchema = z.object({ dealId: z.string().regex(/^[a-f0-9]{24}$/) }).strict()

export const postIngestionDraftReview = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (request, response, context) => {
    const session = await requireAdmin(context)
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const { dealId } = parseRestInput(reviewPathSchema, request.params)
    const input = parseRestInput(ingestionReviewRequestSchema, request.body)
    const result = await context.db
      .$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: session.user.id },
          select: { role: true },
        })
        if (user?.role !== 'ADMIN') throw new ApiErrorException('FORBIDDEN', 'FORBIDDEN')
        const deal = await tx.deal.findFirst({
          where: { ...importedDealScope, id: dealId },
          include: { sources: { include: { importedPost: true } } },
        })
        if (!deal) throw new ApiErrorException('NOT_FOUND', 'NOT_FOUND')
        if (deal.reviewStatus !== 'PENDING' || deal.contentVersion !== input.expectedContentVersion)
          throw new ApiErrorException('CONFLICT', 'Draft changed or already reviewed')
        const now = context.ingestion?.now() ?? new Date()
        if (input.decision === 'APPROVE' && !isReviewReady(deal, now))
          throw new ApiErrorException(
            'PRECONDITION_FAILED',
            'Draft needs validity, offer or source clarification',
          )
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
            data: {
              updatedAt: new Date(Math.max(now.getTime(), evidence.updatedAt.getTime() + 1)),
            },
          })
          if (fenced.count !== 1) throw new ApiErrorException('CONFLICT', 'Source evidence changed')
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
            reviewedById: session.user.id,
            reviewedAt: now,
            reviewedVersion: input.expectedContentVersion,
            publishedAt: input.decision === 'APPROVE' ? now : null,
          },
        })
        if (changed.count !== 1)
          throw new ApiErrorException('CONFLICT', 'Draft changed or already reviewed')
        return { id: deal.id, reviewStatus }
      })
      .catch((error: unknown) => {
        if (typeof error === 'object' && error && 'code' in error && error.code === 'P2034')
          throw new ApiErrorException('CONFLICT', 'Draft changed or already reviewed')
        throw error
      })
    response.json(ingestionReviewResponseSchema.parse(result))
  })
