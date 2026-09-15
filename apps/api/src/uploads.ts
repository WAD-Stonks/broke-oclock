import { fromNodeHeaders } from 'better-auth/node'
import { type ErrorRequestHandler, json, type Request, Router } from 'express'
import { createRouteHandler, createUploadthing, type FileRouter } from 'uploadthing/express'
import { UploadThingError } from 'uploadthing/server'
import type { AppConfig } from './config.js'

type UploadSession = { user: { id: string } } | null
type GetSession = (headers: Headers) => Promise<UploadSession>
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
const fileLimit = { maxFileSize: '4MB', maxFileCount: 1, minFileCount: 0 } as const

const createFileRouter = (identities: WeakMap<Request, string>) => {
  const f = createUploadthing()
  return {
    photoUploader: f(
      {
        'image/jpeg': fileLimit,
        'image/png': fileLimit,
        'image/webp': fileLimit,
      },
      { awaitServerData: true },
    )
      .middleware(({ req, files }) => {
        const userId = identities.get(req)
        if (!userId)
          throw new UploadThingError({ code: 'FORBIDDEN', message: 'Sign in to upload photos' })
        if (
          files.length !== 1 ||
          files.some(
            (file) =>
              !allowedTypes.includes(file.type) || file.size <= 0 || file.size > 4 * 1024 * 1024,
          )
        ) {
          throw new UploadThingError({
            code: 'BAD_REQUEST',
            message: 'Upload one JPEG, PNG or WebP image, up to 4 MB',
          })
        }
        return { userId }
      })
      // Infrastructure response only. Deal attachment/ownership persistence is student-owned.
      .onUploadComplete(({ metadata, file }) => ({
        uploadedBy: metadata.userId,
        key: file.key,
        url: file.ufsUrl,
      })),
  } satisfies FileRouter
}

export type PhotoFileRouter = ReturnType<typeof createFileRouter>

export const createPhotoRouter = (config: AppConfig, getSession: GetSession) => {
  const router = Router()
  const storage = config.photoStorage
  if (!storage) {
    router.use((_request, response) => {
      response.status(503).json({ error: 'Photo storage is not configured' })
    })
    return router
  }

  const identities = new WeakMap<Request, string>()
  router.use(json({ limit: '16kb' }))
  router.use(async (request, response, next) => {
    if (request.method === 'POST' && request.query.actionType === 'upload') {
      if (request.get('origin') !== config.webOrigin) {
        response.status(403).json({ error: 'Untrusted upload origin' })
        return
      }
      // Resolve auth OUTSIDE Effect fibers; never read ambient request identity there.
      const session = await getSession(fromNodeHeaders(request.headers))
      if (!session) {
        response.status(401).json({ error: 'Sign in to upload photos' })
        return
      }
      identities.set(request, session.user.id)
    }
    // Provider callbacks have no browser session. The SDK verifies their signature.
    next()
  })
  router.use(
    createRouteHandler({
      router: createFileRouter(identities),
      config: {
        token: storage.token,
        isDev: storage.isDev,
        callbackUrl: new URL('/api/uploadthing', config.betterAuthUrl).href,
        logLevel: 'Error',
      },
    }),
  )
  const handleError: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    const tooLarge =
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      error.type === 'entity.too.large'
    response
      .status(tooLarge ? 413 : 400)
      .json({ error: tooLarge ? 'Upload request too large' : 'Invalid upload request' })
  }
  router.use(handleError)
  return router
}
