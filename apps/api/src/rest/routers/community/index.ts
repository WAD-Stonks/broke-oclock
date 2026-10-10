import type { RestDependencies } from '@api/rest/context'
import { methodNotAllowed } from '@api/rest/policy'
import { removeComment } from '@api/rest/routers/community/handlers/delete-comment'
import { getComments } from '@api/rest/routers/community/handlers/get-comments'
import { getDealCommunity } from '@api/rest/routers/community/handlers/get-community'
import { getCommunityReports } from '@api/rest/routers/community/handlers/get-reports'
import { getCommunitySummaries } from '@api/rest/routers/community/handlers/get-summaries'
import { postComment } from '@api/rest/routers/community/handlers/post-comment'
import { postCommentReport } from '@api/rest/routers/community/handlers/post-comment-report'
import { postDealReport } from '@api/rest/routers/community/handlers/post-deal-report'
import { postModeration } from '@api/rest/routers/community/handlers/post-moderation'
import { putOutletEvidence } from '@api/rest/routers/community/handlers/put-outlet-evidence'
import { putDealVote } from '@api/rest/routers/community/handlers/put-vote'
import { Router } from 'express'

export const createCommunityRouter = (dependencies: RestDependencies): Router => {
  const router = Router()
  router.get('/deals/:dealId/community', getDealCommunity(dependencies))
  router.get('/community/summaries', getCommunitySummaries(dependencies))
  router.put('/deals/:dealId/vote', putDealVote(dependencies))
  router.put('/deals/:dealId/outlets/:venueId/evidence', putOutletEvidence(dependencies))
  router.get('/deals/:dealId/comments', getComments(dependencies))
  router.post('/deals/:dealId/comments', postComment(dependencies))
  router.delete('/deals/:dealId/comments/:commentId', removeComment(dependencies))
  router.post('/deals/:dealId/reports', postDealReport(dependencies))
  router.post('/deals/:dealId/comments/:commentId/reports', postCommentReport(dependencies))
  router.get('/admin/community/reports', getCommunityReports(dependencies))
  router.post('/admin/community/reports/:kind/:reportId/review', postModeration(dependencies))
  router.all('/deals/:dealId/community', methodNotAllowed('GET'))
  router.all('/community/summaries', methodNotAllowed('GET'))
  router.all('/deals/:dealId/vote', methodNotAllowed('PUT'))
  router.all('/deals/:dealId/outlets/:venueId/evidence', methodNotAllowed('PUT'))
  router.all('/deals/:dealId/comments', methodNotAllowed('GET', 'POST'))
  router.all('/deals/:dealId/comments/:commentId', methodNotAllowed('DELETE'))
  router.all('/deals/:dealId/reports', methodNotAllowed('POST'))
  router.all('/deals/:dealId/comments/:commentId/reports', methodNotAllowed('POST'))
  router.all('/admin/community/reports', methodNotAllowed('GET'))
  router.all('/admin/community/reports/:kind/:reportId/review', methodNotAllowed('POST'))
  return router
}
