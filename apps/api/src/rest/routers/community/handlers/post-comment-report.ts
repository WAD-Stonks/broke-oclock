import { reportComment } from '@api/modules/community/discussion'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  commentParamsSchema,
  createReportBodySchema,
  reportResponseSchema,
} from '@broke-oclock/contracts/community'
import { z } from 'zod'

export const postCommentReport = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const session = requireSession(context)
    const { dealId, commentId } = parseRestInput(commentParamsSchema, request.params)
    parseRestInput(z.strictObject({}), request.query)
    const input = parseRestInput(createReportBodySchema, request.body)
    response.setHeader('Cache-Control', 'private, no-store')
    response.json(
      reportResponseSchema.parse(
        await reportComment(context.db, dealId, commentId, session.user.id, input),
      ),
    )
  })
