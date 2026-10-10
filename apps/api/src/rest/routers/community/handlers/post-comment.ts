import { createComment } from '@api/modules/community/discussion'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  commentSchema,
  communityDealParamsSchema,
  createCommentBodySchema,
} from '@broke-oclock/contracts/community'
import { z } from 'zod'

export const postComment = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const session = requireSession(context)
    const { dealId } = parseRestInput(communityDealParamsSchema, request.params)
    parseRestInput(z.strictObject({}), request.query)
    const input = parseRestInput(createCommentBodySchema, request.body)
    response.setHeader('Cache-Control', 'private, no-store')
    response
      .status(201)
      .json(commentSchema.parse(await createComment(context.db, dealId, session.user.id, input)))
  })
