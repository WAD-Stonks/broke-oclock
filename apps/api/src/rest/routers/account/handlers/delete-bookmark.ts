import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import { bookmarkParamsSchema } from '@broke-oclock/contracts/account'

export const deleteBookmark = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    // 1. Changes data, so check the request comes from our website.
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)

    // 2. Logged-in user and the dealId from the URL.
    const session = requireSession(context)
    const { dealId } = parseRestInput(bookmarkParamsSchema, request.params)

    // 3. Delete only a bookmark that belongs to THIS user. Putting userId in the where
    //    means nobody can ever delete someone else's bookmark.
    //    deleteMany does not complain if nothing matches, so deleting twice is fine.
    await context.db.bookmark.deleteMany({
      where: { userId: session.user.id, dealId },
    })

    response.json({ saved: false })
  })
