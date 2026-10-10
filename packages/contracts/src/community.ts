import { z } from 'zod'

export const communityDealParamsSchema = z.strictObject({
  dealId: z.string().regex(/^[a-f0-9]{24}$/),
})
export const communitySummariesQuerySchema = z.strictObject({
  ids: z
    .string()
    .max(499)
    .transform((value) => value.split(','))
    .pipe(z.array(communityDealParamsSchema.shape.dealId).min(1).max(20)),
})
export const communityCardSchema = z.strictObject({
  dealId: communityDealParamsSchema.shape.dealId,
  validity: z.enum(['ACTIVE', 'EXPIRED', 'SCHEDULED', 'UNKNOWN']),
  status: z.enum(['UNVERIFIED', 'CONFIRMED', 'REPORTED_ENDED', 'DISPUTED']),
  aliveCount: z.number().int().nonnegative(),
  deadCount: z.number().int().nonnegative(),
})
export const communitySummariesResponseSchema = z.strictObject({
  items: z.array(communityCardSchema),
})
export const voteValueSchema = z.enum(['ALIVE', 'DEAD'])
export const setVoteBodySchema = z.strictObject({
  value: voteValueSchema,
  expectedVersion: z.number().int().positive(),
  reconfirm: z.boolean().optional(),
})
export const communityStatusSchema = z.enum([
  'UNVERIFIED',
  'CONFIRMED',
  'REPORTED_ENDED',
  'DISPUTED',
])
export const evidenceScopeSchema = z.strictObject({
  aliveCount: z.number().int().nonnegative(),
  deadCount: z.number().int().nonnegative(),
  status: communityStatusSchema,
  lastConfirmedAt: z.iso.datetime().nullable(),
})
export const outletSummarySchema = evidenceScopeSchema.extend({
  venueId: communityDealParamsSchema.shape.dealId,
  name: z.string(),
  currentVote: voteValueSchema.nullable(),
  reconfirmAt: z.iso.datetime().nullable(),
  canVote: z.boolean(),
})
export const communityResponseSchema = z.strictObject({
  dealId: communityDealParamsSchema.shape.dealId,
  title: z.string(),
  description: z.string(),
  validity: z.enum(['ACTIVE', 'EXPIRED', 'SCHEDULED', 'UNKNOWN']),
  validUntil: z.iso.datetime().nullable(),
  aliveCount: z.number().int().nonnegative(),
  deadCount: z.number().int().nonnegative(),
  recordedAliveCount: z.number().int().nonnegative(),
  recordedDeadCount: z.number().int().nonnegative(),
  currentVote: voteValueSchema.nullable(),
  reconfirmAt: z.iso.datetime().nullable(),
  lastConfirmedAt: z.iso.datetime().nullable(),
  canVote: z.boolean(),
  contentVersion: z.number().int().positive(),
  evaluatedAt: z.iso.datetime(),
  status: communityStatusSchema,
  evidenceWindowHours: z.number().int().positive(),
  reconfirmHours: z.number().int().positive(),
  confirmThreshold: z.number().int().positive(),
  deadThreshold: z.number().int().positive(),
  voteBlockReason: z.enum(['SIGN_IN', 'OWNER', 'CLOSED']).nullable(),
  outlets: z.array(outletSummarySchema),
})
export const outletEvidenceParamsSchema = communityDealParamsSchema.extend({
  venueId: communityDealParamsSchema.shape.dealId,
})
export const commentParamsSchema = communityDealParamsSchema.extend({
  commentId: communityDealParamsSchema.shape.dealId,
})
export const commentSchema = z.strictObject({
  id: communityDealParamsSchema.shape.dealId,
  dealId: communityDealParamsSchema.shape.dealId,
  authorId: communityDealParamsSchema.shape.dealId,
  authorName: z.string(),
  body: z.string(),
  venueId: communityDealParamsSchema.shape.dealId.nullable(),
  createdAt: z.iso.datetime(),
  canDelete: z.boolean(),
})
export const commentsQuerySchema = z.strictObject({
  cursor: communityDealParamsSchema.shape.dealId.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
export const commentsResponseSchema = z.strictObject({
  items: z.array(commentSchema),
  nextCursor: communityDealParamsSchema.shape.dealId.nullable(),
})
export const createCommentBodySchema = z.strictObject({
  body: z.string().trim().min(1).max(1000),
  venueId: communityDealParamsSchema.shape.dealId.nullable().optional(),
  requestKey: z.uuid(),
})
export const actionResponseSchema = z.strictObject({ ok: z.literal(true) })
export const reportReasonSchema = z.enum(['SPAM', 'MISLEADING', 'INAPPROPRIATE', 'OTHER'])
export const createReportBodySchema = z.strictObject({
  reason: reportReasonSchema,
  details: z.string().trim().max(1000).optional(),
})
export const reportResponseSchema = z.strictObject({
  id: communityDealParamsSchema.shape.dealId,
  status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']),
})
export const moderationQuerySchema = z.strictObject({
  cursor: communityDealParamsSchema.shape.dealId.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
export const moderationItemSchema = z.strictObject({
  id: communityDealParamsSchema.shape.dealId,
  targetType: z.enum(['DEAL', 'COMMENT']),
  targetId: communityDealParamsSchema.shape.dealId,
  reason: reportReasonSchema,
  details: z.string().nullable(),
  status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']),
  createdAt: z.iso.datetime(),
  openCount: z.number().int().nonnegative(),
  priority: z.boolean(),
})
export const moderationResponseSchema = z.strictObject({
  items: z.array(moderationItemSchema),
  nextCursor: communityDealParamsSchema.shape.dealId.nullable(),
})
export const moderateBodySchema = z.strictObject({
  status: z.enum(['RESOLVED', 'DISMISSED']),
  note: z.string().trim().min(1).max(500),
  hide: z.boolean().default(false),
})
export type VoteValue = z.infer<typeof voteValueSchema>
export type CommunityResponse = z.infer<typeof communityResponseSchema>
export type CommentResponse = z.infer<typeof commentSchema>
