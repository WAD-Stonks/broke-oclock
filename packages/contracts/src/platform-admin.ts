import { boundedQueryInteger } from '@contracts/query'
import { z } from 'zod'

export const platformObjectIdSchema = z.string().regex(/^[a-f0-9]{24}$/)
export const platformRoleSchema = z.enum(['USER', 'MERCHANT', 'MODERATOR', 'ADMIN'])
export const merchantRequestStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED'])
export const platformVersionSchema = z.number().int().min(0).max(2_147_483_646)
export const platformNoteSchema = z.string().trim().min(1).max(500)
const paginationQuery = {
  cursor: platformObjectIdSchema.optional(),
  limit: boundedQueryInteger(1, 100, 25),
}
const searchQuery = z.string().trim().max(100).optional()

export const platformAccountSummarySchema = z.object({
  id: platformObjectIdSchema,
  name: z.string(),
  email: z.string(),
  role: platformRoleSchema,
  version: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
})
export const platformPageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: platformObjectIdSchema.nullable() })

export const platformAccountsQuerySchema = z.strictObject({
  ...paginationQuery,
  search: searchQuery,
  role: platformRoleSchema.optional(),
})
export const platformAccountParamsSchema = z.strictObject({ userId: platformObjectIdSchema })
export const platformAccountResponseSchema = platformAccountSummarySchema.extend({
  grants: z.array(
    z.object({
      id: platformObjectIdSchema,
      venueId: platformObjectIdSchema,
      venueName: z.string(),
      merchantName: z.string(),
      version: platformVersionSchema,
      createdAt: z.string().datetime(),
    }),
  ),
})
export const platformVenuesQuerySchema = z.strictObject({ ...paginationQuery, search: searchQuery })
export const platformVenueSchema = z.object({
  id: platformObjectIdSchema,
  name: z.string(),
  merchantName: z.string(),
  address: z.string(),
})
export const merchantRequestsQuerySchema = z.strictObject({
  ...paginationQuery,
  status: merchantRequestStatusSchema.optional(),
})
export const merchantRequestSchema = z.object({
  id: platformObjectIdSchema,
  userId: platformObjectIdSchema,
  userName: z.string(),
  userEmail: z.string(),
  venueId: platformObjectIdSchema,
  venueName: z.string(),
  merchantName: z.string(),
  status: merchantRequestStatusSchema,
  version: platformVersionSchema,
  message: z.string(),
  reviewNote: z.string().nullable(),
  createdAt: z.string().datetime(),
})
export const reviewMerchantRequestParamsSchema = z.strictObject({
  requestId: platformObjectIdSchema,
})
export const reviewMerchantRequestBodySchema = z.strictObject({
  expectedVersion: platformVersionSchema,
  decision: z.enum(['APPROVE', 'REJECT']),
  note: platformNoteSchema,
})
export const changePlatformRoleBodySchema = z.strictObject({
  expectedVersion: platformVersionSchema,
  role: platformRoleSchema,
  note: platformNoteSchema,
})
export const grantStallBodySchema = z.strictObject({
  userId: platformObjectIdSchema,
  venueId: platformObjectIdSchema,
  expectedUserVersion: platformVersionSchema,
  note: platformNoteSchema,
})
export const grantParamsSchema = z.strictObject({ grantId: platformObjectIdSchema })
export const revokeStallBodySchema = z.strictObject({
  expectedVersion: platformVersionSchema,
  note: platformNoteSchema,
})
export const platformMutationResponseSchema = z.object({
  id: platformObjectIdSchema,
  version: platformVersionSchema,
})
export const platformAuditQuerySchema = z.strictObject({
  ...paginationQuery,
  userId: platformObjectIdSchema.optional(),
})
export const platformAuditEntrySchema = z.object({
  id: platformObjectIdSchema,
  actorId: platformObjectIdSchema,
  actorName: z.string(),
  action: z.string(),
  targetUserId: platformObjectIdSchema,
  venueId: platformObjectIdSchema.nullable(),
  note: z.string(),
  roleBefore: platformRoleSchema.nullable(),
  roleAfter: platformRoleSchema.nullable(),
  createdAt: z.string().datetime(),
})

export type PlatformAccountsQuery = z.input<typeof platformAccountsQuerySchema>
export type PlatformAccountSummary = z.infer<typeof platformAccountSummarySchema>
export type PlatformRole = z.infer<typeof platformRoleSchema>
export type PlatformAccountResponse = z.infer<typeof platformAccountResponseSchema>
export type PlatformVenue = z.infer<typeof platformVenueSchema>
export type MerchantRequestsQuery = z.input<typeof merchantRequestsQuerySchema>
export type MerchantRequest = z.infer<typeof merchantRequestSchema>
export type ReviewMerchantRequestBody = z.infer<typeof reviewMerchantRequestBodySchema>
export type ChangePlatformRoleBody = z.infer<typeof changePlatformRoleBodySchema>
export type GrantStallBody = z.infer<typeof grantStallBodySchema>
export type RevokeStallBody = z.infer<typeof revokeStallBodySchema>
export type PlatformMutationResponse = z.infer<typeof platformMutationResponseSchema>
export type PlatformAuditQuery = z.input<typeof platformAuditQuerySchema>
export type PlatformAuditEntry = z.infer<typeof platformAuditEntrySchema>
