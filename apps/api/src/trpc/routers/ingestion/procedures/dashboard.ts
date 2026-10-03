import { adminProcedure } from '@api/modules/ingestion/policy'
import { MONEYDIGEST_SOURCE, sourceWhere } from '@api/modules/ingestion/source'
import { z } from 'zod'
export const dashboardProcedure = adminProcedure
  .input(z.void())
  .output(
    z.object({
      source: z.object({
        name: z.string(),
        enabled: z.boolean(),
        reuseApproved: z.boolean(),
        onemapConfigured: z.boolean(),
      }),
      counts: z.object({
        pending: z.number().int(),
        approved: z.number().int(),
        rejected: z.number().int(),
        failed: z.number().int(),
      }),
    }),
  )
  .query(async ({ ctx }) => {
    const source = await ctx.db.importSource.findUnique({
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
      ctx.db.deal.count({ where: { ...scope, reviewStatus: 'PENDING' } }),
      ctx.db.deal.count({ where: { ...scope, reviewStatus: 'APPROVED' } }),
      ctx.db.deal.count({ where: { ...scope, reviewStatus: 'REJECTED' } }),
      source ? ctx.db.importedPost.count({ where: { sourceId: source.id, status: 'FAILED' } }) : 0,
    ])
    return {
      source: {
        name: MONEYDIGEST_SOURCE.name,
        enabled: Boolean(ctx.ingestion?.enabled && source?.enabled),
        reuseApproved: ctx.ingestion?.reuseApproved ?? false,
        onemapConfigured: Boolean(ctx.ingestion?.searchLocations),
      },
      counts: { pending, approved, rejected, failed },
    }
  })
