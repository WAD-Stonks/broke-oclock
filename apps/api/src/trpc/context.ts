import type { AppConfig } from '@api/config'
import { fromNodeHeaders } from '@broke-oclock/auth/node'
import type { Auth } from '@broke-oclock/auth/types'
import { db } from '@broke-oclock/db'
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express'

// A fresh session per HTTP request; the database client is shared, not user identity.
export const createTRPCContext = async (
  { req }: CreateExpressContextOptions,
  config: AppConfig,
  auth: Auth,
) => ({
  db,
  session: await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }),
  hasTrustedOrigin: req.get('origin') === config.webOrigin,
})

export type Context = Awaited<ReturnType<typeof createTRPCContext>>
