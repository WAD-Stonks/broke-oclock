import { adminProcedure } from '@api/modules/ingestion/policy'
import { importedDealScope, isReviewReady } from '@api/modules/ingestion/review-policy'
import { z } from 'zod'

const id = z.string().regex(/^[a-f0-9]{24}$/)
export const queueProcedure = adminProcedure
  .input(
    z
      .object({
        limit: z.number().int().min(1).max(50).default(20),
        status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
        cursor: id.optional(),
      })
      .strict()
      .default({ limit: 20, status: 'PENDING' }),
  )
  .output(
    z.object({
      items: z.array(
        z.object({
          id,
          title: z.string(),
          description: z.string(),
          terms: z.string().nullable(),
          category: z.string(),
          offerType: z.string(),
          validFrom: z.string().nullable(),
          validUntil: z.string().nullable(),
          rawValidityText: z.string().nullable(),
          applicability: z.string(),
          reviewStatus: z.string(),
          contentVersion: z.number().int(),
          sourceUrl: z.string(),
          sourceName: z.string(),
          reviewNote: z.string().nullable(),
          reviewReady: z.boolean(),
        }),
      ),
      nextCursor: id.nullable(),
    }),
  )
  .query(async ({ ctx, input }) => {
    const rows = await ctx.db.deal.findMany({
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
      reviewStatus: row.reviewStatus,
      contentVersion: row.contentVersion,
      sourceUrl: row.sources[0]?.sourceUrl ?? '',
      sourceName: row.sources[0]?.importedPost.source.name ?? '',
      reviewNote: row.reviewNote,
      reviewReady: isReviewReady(row, ctx.ingestion?.now() ?? new Date()),
    }))
    return { items, nextCursor: rows.length > input.limit ? (items.at(-1)?.id ?? null) : null }
  })
