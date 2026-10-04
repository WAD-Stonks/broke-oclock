import { platformAdminProcedure } from '@api/modules/platform-admin/authorization'
import {
  objectId,
  page,
  pageOf,
  pagination,
  requestStatus,
  version,
} from '@api/modules/platform-admin/schemas'
import { z } from 'zod'

export const requestsProcedure = platformAdminProcedure
  .input(z.strictObject({ ...pagination, status: requestStatus.optional() }))
  .output(
    pageOf(
      z.object({
        id: objectId,
        userId: objectId,
        userName: z.string(),
        userEmail: z.string(),
        venueId: objectId,
        venueName: z.string(),
        merchantName: z.string(),
        status: requestStatus,
        version,
        message: z.string(),
        reviewNote: z.string().nullable(),
        createdAt: z.string().datetime(),
      }),
    ),
  )
  .query(async ({ ctx, input }) => {
    const rows = await ctx.db.merchantAccessRequest.findMany({
      where: { status: input.status, ...(input.cursor ? { id: { lt: input.cursor } } : {}) },
      take: input.limit + 1,
      orderBy: { id: 'desc' },
      select: {
        id: true,
        userId: true,
        userName: true,
        userEmail: true,
        venueId: true,
        venueName: true,
        merchantName: true,
        status: true,
        version: true,
        message: true,
        reviewNote: true,
        createdAt: true,
      },
    })
    return page(
      rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      input.limit,
    )
  })
