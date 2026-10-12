import { reviewRequest } from '@api/modules/platform-admin/requests'
import type { RestDependencies } from '@api/rest/context'
import { createRestHandler, requireAdmin } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  platformMutationResponseSchema,
  reviewMerchantRequestBodySchema,
  reviewMerchantRequestParamsSchema,
} from '@broke-oclock/contracts/platform-admin'

export const reviewMerchantRequest = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const session = await requireAdmin(context, 'FORBIDDEN')
    const { requestId } = parseRestValue(reviewMerchantRequestParamsSchema, request.params)
    const body = parseRestValue(reviewMerchantRequestBodySchema, request.body)
    response.json(
      platformMutationResponseSchema.parse(
        await reviewRequest(context.db, session.user.id, { requestId, ...body }),
      ),
    )
  })
