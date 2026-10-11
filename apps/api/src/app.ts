import { createAuth } from '@api/auth'
import type { AppConfig } from '@api/config'
import { apiErrorMiddleware } from '@api/errors'
import { createIngestionRuntime, type IngestionRuntime } from '@api/modules/ingestion/runtime'
import { requireJsonRequestBody } from '@api/rest/body'
import { methodNotAllowed } from '@api/rest/policy'
import { requireBoundedRestQuery } from '@api/rest/query'
import { createRestRouter } from '@api/rest/root'
import { createPhotoRouter } from '@api/uploads'
import { toNodeHandler } from '@broke-oclock/auth/node'
import type { ApiError } from '@broke-oclock/contracts/api'
import cors from 'cors'
import express, { type Express } from 'express'
import helmet from 'helmet'

export const createApp = (
  config: AppConfig,
  options: { ingestion?: IngestionRuntime } = {},
): Express => {
  const auth = createAuth(config)
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use('/api/trpc', (_request, response) => {
    response
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Not found' } } satisfies ApiError)
  })
  // These same-origin resources reject unsupported methods before global CORS preflight.
  // Preserve preflight behavior on the existing native SDK and REST routes.
  app.options(['/api/auth-methods', '/api/admin/overview'], methodNotAllowed('GET'))
  app.options('/api/ingestion/drafts/:dealId/outlet', methodNotAllowed('PATCH'))
  app.use(
    cors({
      origin: config.webOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  )

  app.all('/api/auth/*splat', toNodeHandler(auth))

  app.use(
    '/api/uploadthing',
    createPhotoRouter(config, (headers) => auth.api.getSession({ headers })),
  )

  app.use(requireBoundedRestQuery)
  app.use(requireJsonRequestBody)
  app.use(express.json({ limit: '100kb' }))

  app.use(
    '/api',
    createRestRouter({
      config,
      auth,
      ingestion: options.ingestion ?? createIngestionRuntime(config),
    }),
  )

  app.use((_request, response) => {
    response
      .status(404)
      .json({ error: { code: 'NOT_FOUND', message: 'Not found' } } satisfies ApiError)
  })
  app.use(apiErrorMiddleware)
  return app
}

export { createAuth }
