import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { createMerchantRequest } from '@api/rest/routers/account/handlers/create-merchant-request'
import { deleteBookmark } from '@api/rest/routers/account/handlers/delete-bookmark'
import { getProfile } from '@api/rest/routers/account/handlers/get-profile'
import { listBookmarks } from '@api/rest/routers/account/handlers/list-bookmarks'
import { listMerchantRequests } from '@api/rest/routers/account/handlers/list-merchant-requests'
import { listSubmissions } from '@api/rest/routers/account/handlers/list-submissions'
import { saveBookmark } from '@api/rest/routers/account/handlers/save-bookmark'
import { searchVenues } from '@api/rest/routers/account/handlers/search-venues'
import { Router } from 'express'

export const createAccountRouter = (dependencies: RestDependencies): Router => {
  const router = Router()
  router.get('/profile', getProfile(dependencies))
  router.get('/bookmarks', listBookmarks(dependencies))
  router.put('/bookmarks/:dealId', saveBookmark(dependencies))
  router.delete('/bookmarks/:dealId', deleteBookmark(dependencies))
  router.get('/submissions', listSubmissions(dependencies))
  router.get('/venues', searchVenues(dependencies))
  router.get('/merchant-requests', listMerchantRequests(dependencies))
  router.post('/merchant-requests', createMerchantRequest(dependencies))
  router.all('/profile', methodNotAllowed('GET'))
  router.all('/bookmarks', methodNotAllowed('GET'))
  router.all('/bookmarks/:dealId', methodNotAllowed('PUT', 'DELETE'))
  router.all('/submissions', methodNotAllowed('GET'))
  router.all('/venues', methodNotAllowed('GET'))
  router.all('/merchant-requests', methodNotAllowed('GET', 'POST'))
  return router
}
