import { ApiErrorException } from '@api/errors'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  ingestionLocationsQuerySchema,
  ingestionLocationsResponseSchema,
} from '@broke-oclock/contracts/ingestion'
import type { RequestHandler } from 'express'

export const searchIngestionLocations = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (request, response, context) => {
    await requireAdmin(context)
    const input = parseRestInput(ingestionLocationsQuerySchema, request.query)
    if (!context.ingestion?.searchLocations)
      throw new ApiErrorException('PRECONDITION_FAILED', 'OneMap is not configured')
    const items = await context.ingestion
      .searchLocations(input.query)
      .then((matches) => matches.slice(0, 20))
      .catch(() => {
        throw new ApiErrorException('BAD_GATEWAY', 'Location provider unavailable')
      })
    response.json(ingestionLocationsResponseSchema.parse({ items }))
  })
