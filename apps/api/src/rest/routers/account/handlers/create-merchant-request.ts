import { submitMerchantAccessRequest } from '@api/modules/platform-admin/requests'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import { createMerchantRequestBodySchema } from '@broke-oclock/contracts/account'
import { platformMutationResponseSchema } from '@broke-oclock/contracts/platform-admin'

export const createMerchantRequest = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    // 1. Changes data: only accept requests from our website.
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)

    // 2. The user id comes from the session. The body only has venueId and message.
    const session = requireSession(context)
    const body = parseRestInput(createMerchantRequestBodySchema, request.body)

    // 3. The rules (no duplicate pending request, staff can't apply, venue must be active)
    //    already live in submitMerchantAccessRequest. If one is broken it throws an error that
    //    becomes 409 (duplicate) or 412 (not allowed) automatically.
    const result = await submitMerchantAccessRequest(context.db, session.user.id, body)

    // 4. 201 = "created".
    response.status(201).json(platformMutationResponseSchema.parse(result))
  })
