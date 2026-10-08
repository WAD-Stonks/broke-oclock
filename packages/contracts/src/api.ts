import { z } from 'zod'

// Shared JSON schemas; no database or auth-server imports.
export const apiErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'METHOD_NOT_ALLOWED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PRECONDITION_FAILED',
  'TOO_MANY_REQUESTS',
  'BAD_GATEWAY',
  'INTERNAL_SERVER_ERROR',
])
export const apiErrorSchema = z
  .object({
    error: z.object({ code: apiErrorCodeSchema, message: z.string().min(1).max(200) }).strict(),
  })
  .strict()
export const healthResponseSchema = z.object({ ok: z.literal(true) }).strict()
export const readinessResponseSchema = z.object({ ready: z.boolean() }).strict()
export const currentUserUnauthorizedResponseSchema = z.strictObject({
  error: z.literal('Unauthorized'),
})

export const currentUserResponseSchema = z
  .object({
    user: z
      .object({
        id: z.string().min(1),
        name: z.string(),
        email: z.email(),
        emailVerified: z.boolean(),
      })
      .strict(),
    session: z.object({ expiresAt: z.iso.datetime() }).strict(),
  })
  .strict()

export type ApiError = z.infer<typeof apiErrorSchema>
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>
export type HealthResponse = z.infer<typeof healthResponseSchema>
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>
export type CurrentUserResponse = z.infer<typeof currentUserResponseSchema>
