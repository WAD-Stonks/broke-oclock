import { ApiErrorException } from '@api/errors'
import { fenceDraftEvidence } from '@api/modules/ingestion/draft-evidence'
import {
  importedDealScope,
  isReviewReady,
  requireSelectedOutletAuthority,
} from '@api/modules/ingestion/review-policy'
import { accessTransaction, requireCurrentAdmin } from '@api/modules/platform-admin/transaction'
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
    const result = await accessTransaction(context.db, async (tx) => {
      await requireCurrentAdmin(tx, session.user.id)
      const deal = await tx.deal.findFirst({
        where: { ...importedDealScope, id: dealId },
        include: { sources: { include: { importedPost: true } }, venues: true },
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
      if (input.decision === 'APPROVE') await requireSelectedOutletAuthority(tx, deal)
      await fenceDraftEvidence(
        tx,
        deal.sources,
        now,
        input.decision === 'APPROVE' && deal.applicability === 'SELECTED_OUTLETS',
      )
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
    response.json(ingestionReviewResponseSchema.parse(result))
  })
