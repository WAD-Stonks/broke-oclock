import { isPubliclyVisible } from '@api/modules/account/visibility'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { page } from '@api/rest/routers/platform-admin/validation'
import { parseRestInput } from '@api/rest/validation'
import {
  accountPageQuerySchema,
  type Bookmark,
  bookmarksResponseSchema,
} from '@broke-oclock/contracts/account'

export const listBookmarks = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    const session = requireSession(context)
    const input = parseRestInput(accountPageQuerySchema, request.query)

    // "cursor" is the id of the last item the browser already has.
    // Ids go up over time, so "id less than cursor" means "older than that".
    const cursorFilter = input.cursor ? { id: { lt: input.cursor } } : {}

    // Only THIS user's bookmarks, newest first. We ask for one extra row (limit + 1)
    // so we can tell if there is another page.
    const rows = await context.db.bookmark.findMany({
      where: { userId: session.user.id, ...cursorFilter },
      orderBy: { id: 'desc' },
      take: input.limit + 1,
      select: {
        id: true,
        dealId: true,
        createdAt: true,
        deal: {
          select: {
            title: true,
            category: true,
            description: true,
            validUntil: true,
            reviewStatus: true,
            deletedAt: true,
            publishedAt: true,
            contentVersion: true,
            reviewedVersion: true,
          },
        },
      },
    })

    // Turn each database row into what the browser should see.
    const items: Bookmark[] = []
    for (const row of rows) {
      const deal = row.deal
      if (isPubliclyVisible(deal)) {
        items.push({
          id: row.id,
          dealId: row.dealId,
          savedAt: row.createdAt.toISOString(),
          deal: {
            title: deal.title,
            category: deal.category,
            description: deal.description,
            validUntil: deal.validUntil ? deal.validUntil.toISOString() : null,
          },
        })
      } else {
        // The deal is no longer public: send no details, so hidden text never leaks.
        items.push({
          id: row.id,
          dealId: row.dealId,
          savedAt: row.createdAt.toISOString(),
          deal: null,
        })
      }
    }

    // page() cuts the extra row and works out nextCursor for us.
    response.json(bookmarksResponseSchema.parse(page(items, input.limit)))
  })
