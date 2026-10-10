import { activeRecord } from '@api/modules/platform-admin/venues'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { page } from '@api/rest/routers/platform-admin/validation'
import { parseRestInput } from '@api/rest/validation'
import {
  accountPageQuerySchema,
  type Submission,
  submissionsResponseSchema,
} from '@broke-oclock/contracts/account'

export const listSubmissions = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    const session = requireSession(context)
    const input = parseRestInput(accountPageQuerySchema, request.query)
    const cursorFilter = input.cursor ? { id: { lt: input.cursor } } : {}

    // Deals submitted by THIS user. activeRecord skips deals that were soft-deleted.
    const rows = await context.db.deal.findMany({
      where: { submittedById: session.user.id, ...activeRecord, ...cursorFilter },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
      select: {
        id: true,
        title: true,
        category: true,
        reviewStatus: true,
        reviewNote: true,
        createdAt: true,
      },
    })

    const items: Submission[] = []
    for (const row of rows) {
      items.push({
        id: row.id,
        title: row.title,
        category: row.category,
        reviewStatus: row.reviewStatus,
        reviewNote: row.reviewNote,
        createdAt: row.createdAt.toISOString(),
      })
    }

    response.json(submissionsResponseSchema.parse(page(items, input.limit)))
  })
