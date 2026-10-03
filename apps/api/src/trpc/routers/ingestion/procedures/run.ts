import { adminProcedure } from '@api/modules/ingestion/policy'
import { runIngestion } from '@api/modules/ingestion/service'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
export const runProcedure = adminProcedure
  .input(z.void())
  .output(
    z.object({
      runId: z.string(),
      status: z.string(),
      fetchedCount: z.number().int(),
      createdCount: z.number().int(),
      updatedCount: z.number().int(),
      failedCount: z.number().int(),
    }),
  )
  .mutation(({ ctx }) => {
    if (!ctx.ingestion)
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Ingestion is disabled' })
    return runIngestion(ctx.db, ctx.ingestion)
  })
