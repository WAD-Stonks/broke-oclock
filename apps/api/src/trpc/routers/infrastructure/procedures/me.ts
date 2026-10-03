import { toCurrentUserResponse } from '@api/auth'
import { protectedProcedure } from '@api/trpc/init'
import { currentUserResponseSchema } from '@broke-oclock/contracts/api'
import { z } from 'zod'

export const meProcedure = protectedProcedure
  .input(z.void())
  .output(currentUserResponseSchema)
  .query(({ ctx }) => toCurrentUserResponse(ctx.session))
