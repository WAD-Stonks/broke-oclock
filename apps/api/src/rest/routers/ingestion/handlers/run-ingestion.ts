import { ApiErrorException } from '@api/errors'
import { runIngestion } from '@api/modules/ingestion/service'
import { createRestHandler, type RestDependencies, requireAdmin } from '@api/rest/context'
import { requireTrustedOrigin } from '@api/rest/policy'
import { parseRestInput } from '@api/rest/validation'
import { ingestionRunResponseSchema } from '@broke-oclock/contracts/ingestion'
import type { RequestHandler } from 'express'
import { z } from 'zod'

export const postIngestionRun = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (request, response, context) => {
    await requireAdmin(context)
    requireTrustedOrigin(request.get('Origin'), dependencies.config.webOrigin)
    parseRestInput(z.undefined(), request.body)
    if (!context.ingestion)
      throw new ApiErrorException('PRECONDITION_FAILED', 'Ingestion is disabled')
    response.json(
      ingestionRunResponseSchema.parse(await runIngestion(context.db, context.ingestion)),
    )
  })
