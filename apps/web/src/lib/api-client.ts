import type { AppRouter } from '@broke-oclock/api/types'
import { RPC_BATCH_LIMIT } from '@broke-oclock/contracts/rpc'
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

export const createRpcClient = (
  options: {
    url?: string
    fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  } = {},
) =>
  createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: options.url ?? '/api/trpc',
        maxItems: RPC_BATCH_LIMIT,
        fetch: (input, init) =>
          (options.fetch ?? globalThis.fetch)(input, { ...init, credentials: 'include' }),
      }),
    ],
  })

export type RouterInputs = inferRouterInputs<AppRouter>
export type RouterOutputs = inferRouterOutputs<AppRouter>
export const api = createRpcClient()
