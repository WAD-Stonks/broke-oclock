import { createAuth, toCurrentUserResponse } from '@api/auth'
import type { AppConfig } from '@api/config'
import { createRpcMiddleware } from '@api/rpc'
import { createPhotoRouter } from '@api/uploads'
import { fromNodeHeaders, toNodeHandler } from '@broke-oclock/auth/node'
import type { ApiError, HealthResponse, ReadinessResponse } from '@broke-oclock/contracts/api'
import { db } from '@broke-oclock/db'
import cors from 'cors'
import express, { type ErrorRequestHandler, type Express } from 'express'
import helmet from 'helmet'

export const createApp = (config: AppConfig): Express => {
  const auth = createAuth(config)
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(
    cors({
      origin: config.webOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  )

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true } satisfies HealthResponse)
  })

  app.all('/api/auth/*splat', toNodeHandler(auth))

  app.use(
    '/api/uploadthing',
    createPhotoRouter(config, (headers) => auth.api.getSession({ headers })),
  )

  app.use('/api/trpc', createRpcMiddleware(config, auth))
  app.use(express.json({ limit: '100kb' }))

  app.get('/api/ready', async (_request, response) => {
    try {
      await db.user.findFirst({ select: { id: true } })
      response.json({ ready: true } satisfies ReadinessResponse)
    } catch {
      response.status(503).json({ ready: false } satisfies ReadinessResponse)
    }
  })

  app.get('/api/me', async (request, response) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    })

    if (!session) {
      response.status(401).json({ error: 'Unauthorized' } satisfies ApiError)
      return
    }

    response.json(toCurrentUserResponse(session))
  })

  app.use((_request, response) => {
    response.status(404).json({ error: 'Not found' } satisfies ApiError)
  })
  const handleError: ErrorRequestHandler = (_error, _request, response, _next) => {
    response.status(500).json({ error: 'Internal server error' } satisfies ApiError)
  }
  app.use(handleError)
  return app
}

export { createAuth }
