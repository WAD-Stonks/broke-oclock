import { db } from '@broke-oclock/db'
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node'
import cors from 'cors'
import express, { type ErrorRequestHandler, type Express } from 'express'
import helmet from 'helmet'

import { createAuth } from './auth.js'
import type { AppConfig } from './config.js'
import { createPhotoRouter } from './uploads.js'

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
    response.json({ ok: true })
  })

  app.all('/api/auth/*splat', toNodeHandler(auth))

  app.use(
    '/api/uploadthing',
    createPhotoRouter(config, (headers) => auth.api.getSession({ headers })),
  )

  app.use(express.json({ limit: '100kb' }))

  app.get('/api/ready', async (_request, response) => {
    try {
      await db.user.findFirst({ select: { id: true } })
      response.json({ ready: true })
    } catch {
      response.status(503).json({ ready: false })
    }
  })

  app.get('/api/me', async (request, response) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    })

    if (!session) {
      response.status(401).json({ error: 'Unauthorized' })
      return
    }

    response.json({
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
      },
      session: {
        expiresAt: session.session.expiresAt,
      },
    })
  })

  app.use((_request, response) => {
    response.status(404).json({ error: 'Not found' })
  })
  const handleError: ErrorRequestHandler = (_error, _request, response, _next) => {
    response.status(500).json({ error: 'Internal server error' })
  }
  app.use(handleError)
  return app
}

export { createAuth }
