import { moderateReport } from '@api/modules/community/discussion'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import { moderateBodySchema, reportResponseSchema } from '@broke-oclock/contracts/community'
import { z } from 'zod'

const paramsSchema = z.strictObject({
  kind: z.enum(['DEAL', 'COMMENT']),
  reportId: z.string().regex(/^[a-f0-9]{24}$/),
})
export const postModeration = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const session = requireSession(context)
    const { kind, reportId } = parseRestInput(paramsSchema, request.params)
    parseRestInput(z.strictObject({}), request.query)
    const input = parseRestInput(moderateBodySchema, request.body)
    response.setHeader('Cache-Control', 'private, no-store')
    response.json(
      reportResponseSchema.parse(
        await moderateReport(context.db, session.user.id, kind, reportId, input),
      ),
    )
  })
