import type { AppConfig } from '@api/config'
import { ApiErrorException } from '@api/errors'
import type { IngestionRuntime } from '@api/modules/ingestion/runtime'
import { fromNodeHeaders } from '@broke-oclock/auth/node'
import type { Auth } from '@broke-oclock/auth/types'
import { db } from '@broke-oclock/db'
import type { Request, RequestHandler } from 'express'

export type RestContext = {
  db: typeof db
  session: Awaited<ReturnType<Auth['api']['getSession']>>
  ingestion?: IngestionRuntime
}

export type RestDependencies = {
  config: AppConfig
  auth: Auth
  ingestion?: IngestionRuntime
}

export const createRestContext = async (
  request: Request,
  _config: AppConfig,
  auth: Auth,
  ingestion?: IngestionRuntime,
): Promise<RestContext> => ({
  db,
  ingestion,
  session: await auth.api.getSession({ headers: fromNodeHeaders(request.headers) }),
})

export const requireSession = (context: RestContext) => {
  if (!context.session) throw new ApiErrorException('UNAUTHORIZED', 'UNAUTHORIZED')
  return context.session
}

export const requireAdmin = async (context: RestContext, message = 'Administrator required') => {
  const session = requireSession(context)
  const user = await context.db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  })
  if (user?.role !== 'ADMIN') throw new ApiErrorException('FORBIDDEN', message)
  return session
}

export const createRestHandler = <T extends RequestHandler>(
  dependencies: RestDependencies,
  handle: (
    request: Parameters<RequestHandler>[0],
    response: Parameters<RequestHandler>[1],
    context: RestContext,
  ) => void | Promise<void>,
): T =>
  (async (request, response, next) => {
    try {
      const context = await createRestContext(
        request,
        dependencies.config,
        dependencies.auth,
        dependencies.ingestion,
      )
      await handle(request, response, context)
    } catch (error) {
      next(error)
    }
  }) as T
