import { revokeStall } from '@api/modules/platform-admin/grants'
import type { RestDependencies } from '@api/rest/context'
import { createRestHandler, requireAdmin } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  grantParamsSchema,
  platformMutationResponseSchema,
  revokeStallBodySchema,
} from '@broke-oclock/contracts/platform-admin'

export const deleteStallGrant = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const session = await requireAdmin(context, 'FORBIDDEN')
    const { grantId } = parseRestValue(grantParamsSchema, request.params)
    const body = parseRestValue(revokeStallBodySchema, request.body)
    response.json(
      platformMutationResponseSchema.parse(
        await revokeStall(context.db, session.user.id, { grantId, ...body }),
      ),
    )
  })
