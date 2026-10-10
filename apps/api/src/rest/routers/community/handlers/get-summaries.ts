import { getCommunity } from '@api/modules/community/voting'
import { DomainError } from '@api/modules/domain-error'
import { createRestHandler, type RestDependencies } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  communitySummariesQuerySchema,
  communitySummariesResponseSchema,
} from '@broke-oclock/contracts/community'
import { z } from 'zod'

export const getCommunitySummaries = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    parseRestInput(z.strictObject({}), request.params)
    const { ids } = parseRestInput(communitySummariesQuerySchema, request.query)
    const summaries = await Promise.all(
      [...new Set(ids)].map(async (dealId) => {
        try {
          return await getCommunity(context.db, dealId, undefined, dependencies.config.community)
        } catch (error) {
          if (error instanceof DomainError && error.code === 'NOT_FOUND') return null
          throw error
        }
      }),
    )
    response.setHeader('Cache-Control', 'private, no-store')
    response.json(
      communitySummariesResponseSchema.parse({
        items: summaries
          .filter((item) => item !== null)
          .map(({ dealId, validity, status, aliveCount, deadCount }) => ({
            dealId,
            validity,
            status,
            aliveCount,
            deadCount,
          })),
      }),
    )
  })
