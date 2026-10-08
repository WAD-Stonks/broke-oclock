import { MONEYDIGEST_SOURCE, sourceWhere } from '@api/modules/ingestion/source'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  ingestionDashboardQuerySchema,
  ingestionDashboardResponseSchema,
} from '@broke-oclock/contracts/ingestion'
import type { RequestHandler } from 'express'

export const getIngestionDashboard = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (request, response, context) => {
    await requireAdmin(context)
    parseRestInput(ingestionDashboardQuerySchema, request.query)
    const source = await context.db.importSource.findUnique({
      where: sourceWhere,
      select: { id: true, enabled: true },
    })
    const scope = {
      origin: 'IMPORTED' as const,
      OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
      sources: {
        some: {
          importedPost: {
            source: {
              provider: MONEYDIGEST_SOURCE.provider,
              externalId: MONEYDIGEST_SOURCE.externalId,
            },
          },
        },
      },
    }
    const [pending, approved, rejected, failed] = await Promise.all([
      context.db.deal.count({ where: { ...scope, reviewStatus: 'PENDING' } }),
      context.db.deal.count({ where: { ...scope, reviewStatus: 'APPROVED' } }),
      context.db.deal.count({ where: { ...scope, reviewStatus: 'REJECTED' } }),
      source
        ? context.db.importedPost.count({ where: { sourceId: source.id, status: 'FAILED' } })
        : 0,
    ])
    response.json(
      ingestionDashboardResponseSchema.parse({
        source: {
          name: MONEYDIGEST_SOURCE.name,
          enabled: Boolean(context.ingestion?.enabled && source?.enabled),
          reuseApproved: context.ingestion?.reuseApproved ?? false,
          onemapConfigured: Boolean(context.ingestion?.searchLocations),
        },
        counts: { pending, approved, rejected, failed },
      }),
    )
  })
