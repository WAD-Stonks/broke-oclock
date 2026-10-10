import { getCommunity } from '@api/modules/community/voting'
import { createRestHandler, type RestDependencies } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  communityDealParamsSchema,
  communityResponseSchema,
} from '@broke-oclock/contracts/community'
import { z } from 'zod'

export const getDealCommunity = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    const { dealId } = parseRestInput(communityDealParamsSchema, request.params)
    parseRestInput(z.strictObject({}), request.query)
    response.setHeader('Cache-Control', 'private, no-store')
    response.json(
      communityResponseSchema.parse(
        await getCommunity(
          context.db,
          dealId,
          context.session?.user.id,
          dependencies.config.community,
        ),
      ),
    )
  })
