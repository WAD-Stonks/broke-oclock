import type { RestDependencies } from '@api/rest/context'
import { createRestHandler, requireAdmin } from '@api/rest/context'
import { page, parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  platformAuditEntrySchema,
  platformAuditQuerySchema,
  platformPageSchema,
} from '@broke-oclock/contracts/platform-admin'

export const listPlatformAudit = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    await requireAdmin(context, 'FORBIDDEN')
    const input = parseRestValue(platformAuditQuerySchema, request.query)
    const rows = await context.db.platformAudit.findMany({
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
    response.json(
      platformPageSchema(platformAuditEntrySchema).parse(
        page(
          rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
          input.limit,
        ),
      ),
    )
  })
