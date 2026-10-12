import { activeRecord } from '@api/modules/platform-admin/venues'
import type { RestDependencies } from '@api/rest/context'
import { createRestHandler, requireAdmin } from '@api/rest/context'
import { page, parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  platformPageSchema,
  platformVenueSchema,
  platformVenuesQuerySchema,
} from '@broke-oclock/contracts/platform-admin'

export const listAdminVenues = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    await requireAdmin(context, 'FORBIDDEN')
    const input = parseRestValue(platformVenuesQuerySchema, request.query)
    const rows = await context.db.venue.findMany({
      where: {
        ...activeRecord,
        merchant: { is: activeRecord },
        ...(input.cursor ? { id: { gt: input.cursor } } : {}),
        ...(input.search
          ? {
              AND: [
                {
                  OR: [
                    { name: { contains: input.search, mode: 'insensitive' } },
                    { address: { contains: input.search, mode: 'insensitive' } },
                    { merchant: { name: { contains: input.search, mode: 'insensitive' } } },
                  ],
                },
              ],
            }
          : {}),
      },
      take: input.limit + 1,
      orderBy: { id: 'asc' },
      select: { id: true, name: true, address: true, merchant: { select: { name: true } } },
    })
    response.json(
      platformPageSchema(platformVenueSchema).parse(
        page(
          rows.map((row) => ({
            id: row.id,
            name: row.name,
            address: row.address,
            merchantName: row.merchant.name,
          })),
          input.limit,
        ),
      ),
    )
  })
