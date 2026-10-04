import { z } from 'zod'

export const objectId = z.string().regex(/^[a-f0-9]{24}$/)
export const roleSchema = z.enum(['USER', 'MERCHANT', 'MODERATOR', 'ADMIN'])
export const requestStatus = z.enum(['PENDING', 'APPROVED', 'REJECTED'])
export const requestSubmission = z.strictObject({
  venueId: objectId,
  message: z.string().trim().min(1).max(1000),
})
export const note = z.string().trim().min(1).max(500)
export const version = z.number().int().min(0).max(2_147_483_646)
export const mutationResult = z.object({ id: objectId, version })
export const pagination = {
  cursor: objectId.optional(),
  limit: z.number().int().min(1).max(100).default(25),
}
export const search = z.string().trim().max(100).optional()
export const accountSummary = z.object({
  id: objectId,
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  version: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
})
export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: objectId.nullable() })
export const page = <T extends { id: string }>(items: T[], limit: number) => ({
  items: items.slice(0, limit),
  nextCursor: items.length > limit ? (items[limit - 1]?.id ?? null) : null,
})
