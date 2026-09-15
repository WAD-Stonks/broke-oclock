import type { AppConfig } from '@api/config'
import { fromNodeHeaders } from '@broke-oclock/auth/node'
import type { Auth } from '@broke-oclock/auth/types'
import { createExpressMiddleware } from '@broke-oclock/rpc/express'
import { appRouter, RPC_BATCH_LIMIT } from '@broke-oclock/rpc/server'

export const createRpcMiddleware = (config: AppConfig, auth: Auth) =>
  createExpressMiddleware({
    router: appRouter,
    maxBatchSize: RPC_BATCH_LIMIT,
    maxBodySize: 100 * 1024,
    createContext: async ({ req }) => ({
      session: await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }),
      hasTrustedOrigin: req.get('origin') === config.webOrigin,
    }),
  })
