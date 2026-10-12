import { ApiErrorException } from '@api/errors'
import { isPubliclyVisible } from '@api/modules/account/visibility'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import { bookmarkParamsSchema } from '@broke-oclock/contracts/account'

export const saveBookmark = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    // 1. This route changes data, so only accept requests from our own website.
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)

    // 2. Who is logged in? We always take the user from the session, never from the request.
    const session = requireSession(context)
    const userId = session.user.id

    // 3. Check the dealId in the URL looks valid.
    const { dealId } = parseRestInput(bookmarkParamsSchema, request.params)

    // 4. The deal must exist and be public. Hidden deals get the same "not found" as missing ones.
    const deal = await context.db.deal.findUnique({ where: { id: dealId } })
    if (!deal || !isPubliclyVisible(deal)) {
      throw new ApiErrorException('NOT_FOUND')
    }

    // 5. upsert = create if missing, do nothing if it already exists, so saving twice is safe.
    await context.db.bookmark.upsert({
      where: { userId_dealId: { userId, dealId } },
      create: { userId, dealId },
      update: {},
    })

    response.json({ saved: true })
  })
