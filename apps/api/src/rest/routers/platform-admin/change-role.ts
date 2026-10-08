import { changeRole } from '@api/modules/platform-admin/roles'
import type { RestDependencies } from '@api/rest/context'
import { createRestHandler, requireAdmin } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  changePlatformRoleBodySchema,
  platformAccountParamsSchema,
  platformMutationResponseSchema,
} from '@broke-oclock/contracts/platform-admin'

export const changePlatformRole = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const session = await requireAdmin(context, 'FORBIDDEN')
    const { userId } = parseRestValue(platformAccountParamsSchema, request.params)
    const body = parseRestValue(changePlatformRoleBodySchema, request.body)
    response.json(
      platformMutationResponseSchema.parse(
        await changeRole(context.db, session.user.id, { userId, ...body }),
      ),
    )
  })
