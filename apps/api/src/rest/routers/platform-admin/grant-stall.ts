import { grantStall } from '@api/modules/platform-admin/grants'
import type { RestDependencies } from '@api/rest/context'
import { createRestHandler, requireAdmin } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  grantStallBodySchema,
  platformMutationResponseSchema,
} from '@broke-oclock/contracts/platform-admin'

export const createStallGrant = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const session = await requireAdmin(context, 'FORBIDDEN')
    const body = parseRestValue(grantStallBodySchema, request.body)
    response.json(
      platformMutationResponseSchema.parse(await grantStall(context.db, session.user.id, body)),
    )
  })
