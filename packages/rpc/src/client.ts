import { RPC_BATCH_LIMIT } from '@rpc/constants'
import type { AppRouter } from '@rpc/types'
import { createTRPCClient, httpBatchLink } from '@trpc/client'

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
