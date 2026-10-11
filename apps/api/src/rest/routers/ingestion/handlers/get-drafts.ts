import { importedDealScope, isReviewReady } from '@api/modules/ingestion/review-policy'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  ingestionDraftsQuerySchema,
  ingestionDraftsResponseSchema,
} from '@broke-oclock/contracts/ingestion'
import type { RequestHandler } from 'express'

export const getIngestionDrafts = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (request, response, context) => {
    await requireAdmin(context)
    const input = parseRestInput(ingestionDraftsQuerySchema, request.query)
    const rows = await context.db.deal.findMany({
      where: {
        ...importedDealScope,
        reviewStatus: input.status,
        ...(input.cursor ? { id: { gt: input.cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: input.limit + 1,
      select: {
        id: true,
        title: true,
        description: true,
        terms: true,
        category: true,
        offerType: true,
        validFrom: true,
        validUntil: true,
        rawValidityText: true,
        applicability: true,
        merchantId: true,
        venues: {
          select: {
            venue: {
              select: { id: true, name: true, address: true, merchant: { select: { name: true } } },
            },
          },
        },
        reviewStatus: true,
        contentVersion: true,
        reviewNote: true,
        priceMinor: true,
        discountPercent: true,
        sources: {
          take: 1,
          orderBy: { id: 'asc' },
          select: {
            sourceUrl: true,
            sourceContentHash: true,
            importedPost: {
              select: { contentHash: true, errorCode: true, source: { select: { name: true } } },
            },
          },
        },
      },
    })
    const items = rows.slice(0, input.limit).map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      terms: row.terms,
      category: row.category,
      offerType: row.offerType,
      validFrom: row.validFrom?.toISOString() ?? null,
      validUntil: row.validUntil?.toISOString() ?? null,
      rawValidityText: row.rawValidityText,
      applicability: row.applicability,
      merchantId: row.merchantId,
      outlet:
        row.venues.length === 1 && row.venues[0]
          ? {
              id: row.venues[0].venue.id,
              name: row.venues[0].venue.name,
              address: row.venues[0].venue.address,
              merchantName: row.venues[0].venue.merchant.name,
            }
          : null,
      reviewStatus: row.reviewStatus,
      contentVersion: row.contentVersion,
      sourceUrl: row.sources[0]?.sourceUrl ?? '',
      sourceName: row.sources[0]?.importedPost.source.name ?? '',
      reviewNote: row.reviewNote,
      reviewReady: isReviewReady(row, context.ingestion?.now() ?? new Date()),
    }))
    response.json(
      ingestionDraftsResponseSchema.parse({
        items,
        nextCursor: rows.length > input.limit ? (items.at(-1)?.id ?? null) : null,
      }),
    )
  })
