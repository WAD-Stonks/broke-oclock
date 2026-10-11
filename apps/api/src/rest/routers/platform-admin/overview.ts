import { readAdminOverview } from '@api/modules/platform-admin/overview'
import { type RestContext, type RestDependencies, requireAdmin } from '@api/rest/context'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import { fromNodeHeaders } from '@broke-oclock/auth/node'
import { adminOverviewQuerySchema } from '@broke-oclock/contracts/platform-admin'
import { db } from '@broke-oclock/db'
import type { RequestHandler } from 'express'

export const getAdminOverview =
  (dependencies: RestDependencies): RequestHandler =>
  async (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store')
    try {
      const context: RestContext = {
        db,
        ingestion: dependencies.ingestion,
        session: await dependencies.auth.api.getSession({
          headers: fromNodeHeaders(request.headers),
          query: { disableRefresh: true },
        }),
      }
      await requireAdmin(context, 'FORBIDDEN')
      parseRestValue(adminOverviewQuerySchema, request.query)
      response.json(await readAdminOverview(context, dependencies.config))
    } catch (error) {
      next(error)
    }
  }
