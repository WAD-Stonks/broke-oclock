import { listReports } from '@api/modules/community/discussion'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import { moderationQuerySchema, moderationResponseSchema } from '@broke-oclock/contracts/community'

export const getCommunityReports = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    const session = requireSession(context)
    const query = parseRestInput(moderationQuerySchema, request.query)
    response.setHeader('Cache-Control', 'private, no-store')
    response.json(
      moderationResponseSchema.parse(
        await listReports(
          context.db,
          session.user.id,
          query,
          dependencies.config.community.contentReportThreshold,
        ),
      ),
    )
  })
