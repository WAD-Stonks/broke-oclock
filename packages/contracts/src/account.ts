import {
  merchantRequestStatusSchema,
  platformObjectIdSchema,
  platformPageSchema,
  platformRoleSchema,
  platformVenueSchema,
} from '@contracts/platform-admin'
import { boundedQueryInteger } from '@contracts/query'
import { z } from 'zod'

export const accountPageQuerySchema = z.strictObject({
  cursor: platformObjectIdSchema.optional(),
  limit: boundedQueryInteger(1, 50, 20),
})

export const accountProfileSchema = z.object({
  id: platformObjectIdSchema,
  name: z.string(),
  email: z.string(),
  role: platformRoleSchema,
  createdAt: z.string().datetime(),
})

export const bookmarkParamsSchema = z.strictObject({ dealId: platformObjectIdSchema })
export const bookmarkStateSchema = z.object({ saved: z.boolean() })
// deal is null when the bookmarked deal is no longer public; never expose its hidden content.
export const bookmarkSchema = z.object({
  id: platformObjectIdSchema,
  dealId: platformObjectIdSchema,
  savedAt: z.string().datetime(),
  deal: z
    .object({
      title: z.string(),
      category: z.string(),
      description: z.string(),
      validUntil: z.string().datetime().nullable(),
    })
    .nullable(),
})
export const bookmarksResponseSchema = platformPageSchema(bookmarkSchema)

export const submissionSchema = z.object({
  id: platformObjectIdSchema,
  title: z.string(),
  category: z.string(),
  reviewStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'HIDDEN']),
  reviewNote: z.string().nullable(),
  createdAt: z.string().datetime(),
})
export const submissionsResponseSchema = platformPageSchema(submissionSchema)

export const accountVenuesQuerySchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
})
export const accountVenuesResponseSchema = z.array(platformVenueSchema)

export const createMerchantRequestBodySchema = z.strictObject({
  venueId: platformObjectIdSchema,
  message: z.string().trim().min(1).max(1000),
})
export const myMerchantRequestSchema = z.object({
  id: platformObjectIdSchema,
  venueName: z.string(),
  merchantName: z.string(),
  status: merchantRequestStatusSchema,
  reviewNote: z.string().nullable(),
  createdAt: z.string().datetime(),
})
export const myMerchantRequestsResponseSchema = platformPageSchema(myMerchantRequestSchema)

export type AccountPageQuery = z.input<typeof accountPageQuerySchema>
export type AccountProfile = z.infer<typeof accountProfileSchema>
export type BookmarkState = z.infer<typeof bookmarkStateSchema>
export type Bookmark = z.infer<typeof bookmarkSchema>
export type Submission = z.infer<typeof submissionSchema>
export type AccountVenue = z.infer<typeof platformVenueSchema>
export type CreateMerchantRequestBody = z.input<typeof createMerchantRequestBodySchema>
export type MyMerchantRequest = z.infer<typeof myMerchantRequestSchema>
