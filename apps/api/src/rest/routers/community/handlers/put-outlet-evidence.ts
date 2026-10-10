import { setVote } from '@api/modules/community/voting'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  communityResponseSchema,
  outletEvidenceParamsSchema,
  setVoteBodySchema,
} from '@broke-oclock/contracts/community'
import { z } from 'zod'

export const putOutletEvidence = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const session = requireSession(context)
    const { dealId, venueId } = parseRestInput(outletEvidenceParamsSchema, request.params)
    parseRestInput(z.strictObject({}), request.query)
    const input = parseRestInput(setVoteBodySchema, request.body)
    response.setHeader('Cache-Control', 'private, no-store')
    response.json(
      communityResponseSchema.parse(
        await setVote(
          context.db,
          dealId,
          session.user.id,
          input,
          venueId,
          dependencies.config.community,
        ),
      ),
    )
  })
