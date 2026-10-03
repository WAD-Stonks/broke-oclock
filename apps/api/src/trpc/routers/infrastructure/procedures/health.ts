import { publicProcedure } from '@api/trpc/init'
import { healthResponseSchema } from '@broke-oclock/contracts/api'
import { z } from 'zod'

export const healthProcedure = publicProcedure
  .input(z.void())
  .output(healthResponseSchema)
  .query(() => ({ ok: true }))
