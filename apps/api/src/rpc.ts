import type { AppConfig } from '@api/config'
import { createTRPCContext } from '@api/trpc/context'
import { appRouter } from '@api/trpc/root'
import type { Auth } from '@broke-oclock/auth/types'
import { RPC_BATCH_LIMIT } from '@broke-oclock/contracts/rpc'
import { createExpressMiddleware } from '@trpc/server/adapters/express'

export const createRpcMiddleware = (config: AppConfig, auth: Auth) =>
  createExpressMiddleware({
    router: appRouter,
    maxBatchSize: RPC_BATCH_LIMIT,
    maxBodySize: 100 * 1024,
    createContext: (opts) => createTRPCContext(opts, config, auth),
  })
