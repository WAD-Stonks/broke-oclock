import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { getAdminAccount } from '@api/rest/routers/platform-admin/account'
import { listAdminAccounts } from '@api/rest/routers/platform-admin/accounts'
import { listPlatformAudit } from '@api/rest/routers/platform-admin/audit'
import { changePlatformRole } from '@api/rest/routers/platform-admin/change-role'
import { createStallGrant } from '@api/rest/routers/platform-admin/grant-stall'
import { listMerchantRequests } from '@api/rest/routers/platform-admin/merchant-requests'
import { reviewMerchantRequest } from '@api/rest/routers/platform-admin/review-merchant-request'
import { deleteStallGrant } from '@api/rest/routers/platform-admin/revoke-stall'
import { listAdminVenues } from '@api/rest/routers/platform-admin/venues'
import { Router } from 'express'

export const createPlatformAdminRouter = (dependencies: RestDependencies) => {
  const router = Router()
  router.get('/admin/accounts', listAdminAccounts(dependencies))
  router.get('/admin/accounts/:userId', getAdminAccount(dependencies))
  router.patch('/admin/accounts/:userId/role', changePlatformRole(dependencies))
  router.get('/admin/venues', listAdminVenues(dependencies))
  router.get('/admin/merchant-requests', listMerchantRequests(dependencies))
  router.post('/admin/merchant-requests/:requestId/review', reviewMerchantRequest(dependencies))
  router.post('/admin/stall-grants', createStallGrant(dependencies))
  router.delete('/admin/stall-grants/:grantId', deleteStallGrant(dependencies))
  router.get('/admin/audit', listPlatformAudit(dependencies))
  router.all('/admin/accounts', methodNotAllowed('GET'))
  router.all('/admin/accounts/:userId', methodNotAllowed('GET'))
  router.all('/admin/accounts/:userId/role', methodNotAllowed('PATCH'))
  router.all('/admin/venues', methodNotAllowed('GET'))
  router.all('/admin/merchant-requests', methodNotAllowed('GET'))
  router.all('/admin/merchant-requests/:requestId/review', methodNotAllowed('POST'))
  router.all('/admin/stall-grants', methodNotAllowed('POST'))
  router.all('/admin/stall-grants/:grantId', methodNotAllowed('DELETE'))
  router.all('/admin/audit', methodNotAllowed('GET'))
  return router
}
