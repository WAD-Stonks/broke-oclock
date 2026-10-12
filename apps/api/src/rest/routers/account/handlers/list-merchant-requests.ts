import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { page } from '@api/rest/routers/platform-admin/validation'
import { parseRestInput } from '@api/rest/validation'
import {
  accountPageQuerySchema,
  type MyMerchantRequest,
  myMerchantRequestsResponseSchema,
} from '@broke-oclock/contracts/account'

export const listMerchantRequests = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    const session = requireSession(context)
    const input = parseRestInput(accountPageQuerySchema, request.query)
    const cursorFilter = input.cursor ? { id: { lt: input.cursor } } : {}

    // Only THIS user's requests, newest first.
    const rows = await context.db.merchantAccessRequest.findMany({
      where: { userId: session.user.id, ...cursorFilter },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
      select: {
        id: true,
        venueName: true,
        merchantName: true,
        status: true,
        reviewNote: true,
        createdAt: true,
      },
    })

    const items: MyMerchantRequest[] = []
    for (const row of rows) {
      items.push({
        id: row.id,
        venueName: row.venueName,
        merchantName: row.merchantName,
        status: row.status,
        reviewNote: row.reviewNote,
        createdAt: row.createdAt.toISOString(),
      })
    }

    response.json(myMerchantRequestsResponseSchema.parse(page(items, input.limit)))
  })
