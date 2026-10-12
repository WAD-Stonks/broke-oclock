import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { getVenue } from '@api/rest/routers/venues/handlers/get-venue'
import { Router } from 'express'

export const createVenuesRouter = (dependencies: RestDependencies): Router => {
  const router = Router()
  router.get('/:venueId', getVenue(dependencies))
  router.all('/:venueId', methodNotAllowed('GET'))
  return router
}
