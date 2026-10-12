import type { RestDependencies } from '@api/rest/context'
import { createDealsRouter } from '@api/rest/routers/deals'
import { createInfrastructureRouter } from '@api/rest/routers/infrastructure'
import { createIngestionRouter } from '@api/rest/routers/ingestion'
import { createPlatformAdminRouter } from '@api/rest/routers/platform-admin'

import { Router } from 'express'

export const createRestRouter = (dependencies: RestDependencies): Router => {
  const router = Router()
  router.use(createInfrastructureRouter(dependencies))
  router.use('/ingestion', createIngestionRouter(dependencies))
  router.use(createPlatformAdminRouter(dependencies))
  router.use('/deals', createDealsRouter(dependencies))
  return router
}
