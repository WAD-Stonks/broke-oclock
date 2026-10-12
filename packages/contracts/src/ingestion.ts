import { boundedQueryInteger } from '@contracts/query'
import { z } from 'zod'

const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/)
const boundedLimitSchema = boundedQueryInteger(1, 50, 20, /^\d{1,2}$/)

export const ingestionDashboardQuerySchema = z.object({}).strict()

export const ingestionDashboardResponseSchema = z
  .object({
    source: z.object({
      name: z.string(),
      enabled: z.boolean(),
      reuseApproved: z.boolean(),
      onemapConfigured: z.boolean(),
    }),
    counts: z.object({
      pending: z.number().int(),
      approved: z.number().int(),
      rejected: z.number().int(),
      failed: z.number().int(),
    }),
  })
  .strict()

export const ingestionRunsQuerySchema = z.object({ limit: boundedLimitSchema }).strict()
export const ingestionRunResponseSchema = z
  .object({
    runId: z.string(),
    status: z.string(),
    fetchedCount: z.number().int(),
    createdCount: z.number().int(),
    updatedCount: z.number().int(),
    failedCount: z.number().int(),
  })
  .strict()
export const ingestionRunsResponseSchema = z
  .object({
    items: z.array(
      z
        .object({
          id: z.string(),
          sourceName: z.string(),
          status: z.string(),
          startedAt: z.string(),
          finishedAt: z.string().nullable(),
          fetchedCount: z.number().int(),
          createdCount: z.number().int(),
          updatedCount: z.number().int(),
          failedCount: z.number().int(),
          errorCode: z.string().nullable(),
        })
        .strict(),
    ),
  })
  .strict()

export const ingestionDraftsQuerySchema = z
  .object({
    limit: boundedLimitSchema,
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
    cursor: objectIdSchema.optional(),
  })
  .strict()
export const ingestionOutletSchema = z.strictObject({
  id: objectIdSchema,
  name: z.string(),
  address: z.string(),
  merchantName: z.string(),
})
export const ingestionOutletAssociationParamsSchema = z.strictObject({ dealId: objectIdSchema })
export const ingestionOutletAssociationRequestSchema = z.strictObject({
  expectedContentVersion: z.number().int().min(1).max(2_147_483_646),
  venueId: objectIdSchema,
})
export const ingestionOutletAssociationResponseSchema = z.strictObject({
  id: objectIdSchema,
  contentVersion: z.number().int().min(1).max(2_147_483_647),
  reviewStatus: z.literal('PENDING'),
  applicability: z.literal('SELECTED_OUTLETS'),
  merchantId: objectIdSchema,
  outlet: ingestionOutletSchema,
})
export type IngestionOutlet = z.infer<typeof ingestionOutletSchema>
export type IngestionOutletAssociationRequest = z.infer<
  typeof ingestionOutletAssociationRequestSchema
>
export type IngestionOutletAssociationResponse = z.infer<
  typeof ingestionOutletAssociationResponseSchema
>

export const ingestionDraftSchema = z
  .object({
    id: objectIdSchema,
    title: z.string(),
    description: z.string(),
    terms: z.string().nullable(),
    category: z.string(),
    offerType: z.string(),
    validFrom: z.string().nullable(),
    validUntil: z.string().nullable(),
    rawValidityText: z.string().nullable(),
    applicability: z.string(),
    merchantId: objectIdSchema.nullable().default(null),
    outlet: ingestionOutletSchema.nullable().default(null),
    reviewStatus: z.string(),
    contentVersion: z.number().int(),
    sourceUrl: z.string(),
    sourceName: z.string(),
    reviewNote: z.string().nullable(),
    reviewReady: z.boolean(),
  })
  .strict()
export const ingestionDraftsResponseSchema = z
  .object({ items: z.array(ingestionDraftSchema), nextCursor: objectIdSchema.nullable() })
  .strict()
export const ingestionReviewRequestSchema = z
  .object({
    expectedContentVersion: z.number().int().min(1),
    decision: z.enum(['APPROVE', 'REJECT']),
    note: z.string().trim().min(1).max(1000),
  })
  .strict()
export const ingestionReviewResponseSchema = z
  .object({ id: objectIdSchema, reviewStatus: z.string() })
  .strict()

export const ingestionAccountsQuerySchema = z
  .object({ limit: boundedLimitSchema, cursor: objectIdSchema.optional() })
  .strict()
export const ingestionAccountsResponseSchema = z
  .object({
    items: z.array(
      z
        .object({
          id: objectIdSchema,
          name: z.string(),
          email: z.string(),
          role: z.enum(['USER', 'MERCHANT', 'MODERATOR', 'ADMIN']),
          createdAt: z.string(),
        })
        .strict(),
    ),
    nextCursor: objectIdSchema.nullable(),
  })
  .strict()

export const ingestionLocationsQuerySchema = z
  .object({ query: z.string().trim().min(2).max(120) })
  .strict()
export const ingestionLocationsResponseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            searchValue: z.string().max(1000),
            address: z.string().max(1000),
            postalCode: z.string().nullable(),
            latitude: z.number().min(-90).max(90),
            longitude: z.number().min(-180).max(180),
          })
          .strict(),
      )
      .max(20),
  })
  .strict()

export type IngestionDashboardResponse = z.infer<typeof ingestionDashboardResponseSchema>
export type IngestionRunsQuery = z.infer<typeof ingestionRunsQuerySchema>
export type IngestionRunResponse = z.infer<typeof ingestionRunResponseSchema>
export type IngestionRunsResponse = z.infer<typeof ingestionRunsResponseSchema>
export type IngestionDraftsQuery = z.infer<typeof ingestionDraftsQuerySchema>
export type IngestionDraft = z.infer<typeof ingestionDraftSchema>
export type IngestionDraftsResponse = z.infer<typeof ingestionDraftsResponseSchema>
export type IngestionReviewRequest = z.infer<typeof ingestionReviewRequestSchema>
export type IngestionReviewResponse = z.infer<typeof ingestionReviewResponseSchema>
export type IngestionAccountsQuery = z.infer<typeof ingestionAccountsQuerySchema>
export type IngestionAccountsResponse = z.infer<typeof ingestionAccountsResponseSchema>
export type IngestionLocationsQuery = z.infer<typeof ingestionLocationsQuerySchema>
export type IngestionLocationsResponse = z.infer<typeof ingestionLocationsResponseSchema>
