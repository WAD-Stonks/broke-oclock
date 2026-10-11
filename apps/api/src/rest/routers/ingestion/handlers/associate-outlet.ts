import { associateDraftOutlet } from '@api/modules/ingestion/associate-outlet'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import {
  ingestionOutletAssociationParamsSchema,
  ingestionOutletAssociationRequestSchema,
  ingestionOutletAssociationResponseSchema,
} from '@broke-oclock/contracts/ingestion'
import type { RequestHandler } from 'express'

export const patchIngestionDraftOutlet = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (request, response, context) => {
    const session = await requireAdmin(context)
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    const { dealId } = parseRestInput(ingestionOutletAssociationParamsSchema, request.params)
    const input = parseRestInput(ingestionOutletAssociationRequestSchema, request.body)
    const result = await associateDraftOutlet(
      context.db,
      session.user.id,
      dealId,
      input,
      context.ingestion?.now() ?? new Date(),
    )
    response.json(ingestionOutletAssociationResponseSchema.parse(result))
  })
