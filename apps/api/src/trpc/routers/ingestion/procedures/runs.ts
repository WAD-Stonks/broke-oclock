import { adminProcedure } from '@api/modules/ingestion/policy'
import { MONEYDIGEST_SOURCE } from '@api/modules/ingestion/source'
import { z } from 'zod'
export const runsProcedure = adminProcedure
  .input(
    z
      .object({ limit: z.number().int().min(1).max(50).default(20) })
      .strict()
      .default({ limit: 20 }),
  )
  .output(
    z.object({
      items: z.array(
        z.object({
          id: z.string(),
          sourceName: z.string(),
          status: z.string(),
          startedAt: z.string(),
          finishedAt: z.string().nullable(),
          fetchedCount: z.number().int(),
          createdCount: z.number().int(),
          updatedCount: z.number().int(),
          failedCount: z.number().int(),
          errorCode: z.string().nullable(),
        }),
      ),
    }),
  )
  .query(async ({ ctx, input }) => {
    const rows = await ctx.db.ingestionRun.findMany({
      where: {
        source: {
          provider: MONEYDIGEST_SOURCE.provider,
          externalId: MONEYDIGEST_SOURCE.externalId,
        },
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: input.limit,
      select: {
        id: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        fetchedCount: true,
        createdCount: true,
        updatedCount: true,
        failedCount: true,
        errorCode: true,
        source: { select: { name: true } },
      },
    })
    return {
      items: rows.map((row) => ({
        id: row.id,
        sourceName: row.source.name,
        status: row.status,
        startedAt: row.startedAt.toISOString(),
        finishedAt: row.finishedAt?.toISOString() ?? null,
        fetchedCount: row.fetchedCount,
        createdCount: row.createdCount,
        updatedCount: row.updatedCount,
        failedCount: row.failedCount,
        errorCode: row.errorCode,
      })),
    }
  })
