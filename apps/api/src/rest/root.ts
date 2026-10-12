import type { RestDependencies } from '@api/rest/context'
import { createAccountRouter } from '@api/rest/routers/account'
import { createInfrastructureRouter } from '@api/rest/routers/infrastructure'
import { createIngestionRouter } from '@api/rest/routers/ingestion'
import { createPlatformAdminRouter } from '@api/rest/routers/platform-admin'
import { createVenuesRouter } from '@api/rest/routers/venues'
import { Router } from 'express'

export const createRestRouter = (dependencies: RestDependencies): Router => {
  const router = Router()
  router.use(createInfrastructureRouter(dependencies))
  router.use('/ingestion', createIngestionRouter(dependencies))
  router.use('/account', createAccountRouter(dependencies))
  router.use(createPlatformAdminRouter(dependencies))
  router.use('/venues', createVenuesRouter(dependencies))
  return router
}
