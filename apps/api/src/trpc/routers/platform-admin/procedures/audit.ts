import { platformAdminProcedure } from '@api/modules/platform-admin/authorization'
import { objectId, page, pageOf, pagination, roleSchema } from '@api/modules/platform-admin/schemas'
import { z } from 'zod'

export const auditProcedure = platformAdminProcedure
  .input(z.strictObject({ ...pagination, userId: objectId.optional() }))
  .output(
    pageOf(
      z.object({
        id: objectId,
        actorId: objectId,
        actorName: z.string(),
        action: z.string(),
        targetUserId: objectId,
        venueId: objectId.nullable(),
        note: z.string(),
        roleBefore: roleSchema.nullable(),
        roleAfter: roleSchema.nullable(),
        createdAt: z.string().datetime(),
      }),
    ),
  )
  .query(async ({ ctx, input }) => {
    const rows = await ctx.db.platformAudit.findMany({
      where: { targetUserId: input.userId, ...(input.cursor ? { id: { lt: input.cursor } } : {}) },
      take: input.limit + 1,
      orderBy: { id: 'desc' },
      select: {
        id: true,
        actorId: true,
        actorName: true,
        action: true,
        targetUserId: true,
        venueId: true,
        note: true,
        roleBefore: true,
        roleAfter: true,
        createdAt: true,
      },
    })
    return page(
      rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      input.limit,
    )
  })
