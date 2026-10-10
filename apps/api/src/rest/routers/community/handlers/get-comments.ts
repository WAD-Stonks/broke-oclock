import { listComments } from '@api/modules/community/discussion'
import { createRestHandler, type RestDependencies } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  commentsQuerySchema,
  commentsResponseSchema,
  communityDealParamsSchema,
} from '@broke-oclock/contracts/community'

export const getComments = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    const { dealId } = parseRestInput(communityDealParamsSchema, request.params)
    const query = parseRestInput(commentsQuerySchema, request.query)
    response.setHeader('Cache-Control', 'private, no-store')
    response.json(
      commentsResponseSchema.parse(
        await listComments(context.db, dealId, context.session?.user.id, query),
      ),
    )
  })
