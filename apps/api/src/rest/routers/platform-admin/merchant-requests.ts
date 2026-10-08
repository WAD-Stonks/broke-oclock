import type { RestDependencies } from '@api/rest/context'
import { createRestHandler, requireAdmin } from '@api/rest/context'
import { page, parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  merchantRequestSchema,
  merchantRequestsQuerySchema,
  platformPageSchema,
} from '@broke-oclock/contracts/platform-admin'

export const listMerchantRequests = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    await requireAdmin(context, 'FORBIDDEN')
    const input = parseRestValue(merchantRequestsQuerySchema, request.query)
    const rows = await context.db.merchantAccessRequest.findMany({
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
    response.json(
      platformPageSchema(merchantRequestSchema).parse(
        page(
          rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
          input.limit,
        ),
      ),
    )
  })
