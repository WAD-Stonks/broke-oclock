import { toCurrentUserResponse } from '@api/auth'
import { protectedProcedure, publicProcedure } from '@api/trpc/init'
import { currentUserResponseSchema, healthResponseSchema } from '@broke-oclock/contracts/api'
import { z } from 'zod'

export const infrastructureProcedures = {
  health: publicProcedure
    .input(z.void())
    .output(healthResponseSchema)
    .query(() => ({ ok: true })),
  me: protectedProcedure
    .input(z.void())
    .output(currentUserResponseSchema)
    .query(({ ctx }) => toCurrentUserResponse(ctx.session)),
}
