import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { getHealth } from '@api/rest/routers/infrastructure/handlers/health'
import { getMe } from '@api/rest/routers/infrastructure/handlers/me'
import { getReady } from '@api/rest/routers/infrastructure/handlers/ready'
import { Router } from 'express'

export const createInfrastructureRouter = (dependencies: RestDependencies): Router => {
  const router = Router()
  router.get('/health', getHealth)
  router.get('/ready', getReady)
  router.get('/me', getMe(dependencies))
  router.all('/health', methodNotAllowed('GET'))
  router.all('/ready', methodNotAllowed('GET'))
  router.all('/me', methodNotAllowed('GET'))
  return router
}
