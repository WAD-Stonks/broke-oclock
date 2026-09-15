import { z } from 'zod'

// Shared JSON schemas; no database or auth-server imports.
export const apiErrorSchema = z.object({ error: z.string() }).strict()
export const healthResponseSchema = z.object({ ok: z.literal(true) }).strict()
export const readinessResponseSchema = z.object({ ready: z.boolean() }).strict()
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
export type HealthResponse = z.infer<typeof healthResponseSchema>
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>
export type CurrentUserResponse = z.infer<typeof currentUserResponseSchema>
