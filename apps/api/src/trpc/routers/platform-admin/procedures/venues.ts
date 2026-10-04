import { platformAdminProcedure } from '@api/modules/platform-admin/authorization'
import { objectId, page, pageOf, pagination, search } from '@api/modules/platform-admin/schemas'
import { activeRecord } from '@api/modules/platform-admin/venues'
import { z } from 'zod'

export const venuesProcedure = platformAdminProcedure
  .input(z.strictObject({ ...pagination, search }))
  .output(
    pageOf(
      z.object({ id: objectId, name: z.string(), merchantName: z.string(), address: z.string() }),
    ),
  )
  .query(async ({ ctx, input }) => {
    const rows = await ctx.db.venue.findMany({
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
    return page(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        address: row.address,
        merchantName: row.merchant.name,
      })),
      input.limit,
    )
  })
