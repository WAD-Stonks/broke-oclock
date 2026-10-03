import { adminProcedure } from '@api/modules/ingestion/policy'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
export const searchLocationsProcedure = adminProcedure
  .input(z.object({ query: z.string().trim().min(2).max(120) }).strict())
  .output(
    z.object({
      items: z
        .array(
          z.object({
            searchValue: z.string().max(1000),
            address: z.string().max(1000),
            postalCode: z.string().nullable(),
            latitude: z.number().min(-90).max(90),
            longitude: z.number().min(-180).max(180),
          }),
        )
        .max(20),
    }),
  )
  .query(async ({ ctx, input }) => {
    if (!ctx.ingestion?.searchLocations)
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'OneMap is not configured' })
    try {
      return { items: (await ctx.ingestion.searchLocations(input.query)).slice(0, 20) }
    } catch {
      throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Location provider unavailable' })
    }
  })
