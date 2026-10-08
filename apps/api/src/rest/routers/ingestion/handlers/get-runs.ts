import { MONEYDIGEST_SOURCE } from '@api/modules/ingestion/source'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  ingestionRunsQuerySchema,
  ingestionRunsResponseSchema,
} from '@broke-oclock/contracts/ingestion'
import type { RequestHandler } from 'express'

export const getIngestionRuns = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (request, response, context) => {
    await requireAdmin(context)
    const input = parseRestInput(ingestionRunsQuerySchema, request.query)
    const rows = await context.db.ingestionRun.findMany({
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
    response.json(
      ingestionRunsResponseSchema.parse({
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
      }),
    )
  })
