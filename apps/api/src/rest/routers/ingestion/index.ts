import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { patchIngestionDraftOutlet } from '@api/rest/routers/ingestion/handlers/associate-outlet'
import { getIngestionAccounts } from '@api/rest/routers/ingestion/handlers/get-accounts'
import { getIngestionDashboard } from '@api/rest/routers/ingestion/handlers/get-dashboard'
import { getIngestionDrafts } from '@api/rest/routers/ingestion/handlers/get-drafts'
import { getIngestionRuns } from '@api/rest/routers/ingestion/handlers/get-runs'
import { postIngestionDraftReview } from '@api/rest/routers/ingestion/handlers/review-draft'
import { postIngestionRun } from '@api/rest/routers/ingestion/handlers/run-ingestion'
import { searchIngestionLocations } from '@api/rest/routers/ingestion/handlers/search-locations'
import { Router } from 'express'

export const createIngestionRouter = (dependencies: RestDependencies): Router => {
  const router = Router()
  router.get('/dashboard', getIngestionDashboard(dependencies))
  router.get('/accounts', getIngestionAccounts(dependencies))
  router.get('/drafts', getIngestionDrafts(dependencies))
  router.patch('/drafts/:dealId/outlet', patchIngestionDraftOutlet(dependencies))
  router.all('/drafts/:dealId/outlet', methodNotAllowed('PATCH'))
  router.post('/drafts/:dealId/review', postIngestionDraftReview(dependencies))
  router.get('/runs', getIngestionRuns(dependencies))
  router.post('/runs', postIngestionRun(dependencies))
  router.get('/locations', searchIngestionLocations(dependencies))
  router.all('/dashboard', methodNotAllowed('GET'))
  router.all('/accounts', methodNotAllowed('GET'))
  router.all('/drafts', methodNotAllowed('GET'))
  router.all('/drafts/:dealId/review', methodNotAllowed('POST'))
  router.all('/runs', methodNotAllowed('GET', 'POST'))
  router.all('/locations', methodNotAllowed('GET'))
  return router
}
