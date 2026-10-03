import type { AppConfig } from '@api/config'
import type { OneMapClient, OneMapMatch } from '@broke-oclock/integrations/server'
export type IngestionRuntime = {
  enabled: boolean
  reuseApproved: boolean
  listPosts: (options: { page: number; perPage: number }) => Promise<readonly unknown[]>
  searchLocations?: (query: string) => Promise<OneMapMatch[]>
  now: () => Date
}
export const createIngestionRuntime = (config: AppConfig): IngestionRuntime => {
  const options = config.ingestion
  const oneMap = options?.oneMap
  return {
    enabled: options?.enabled ?? false,
    reuseApproved: options?.reuseApproved ?? false,
    now: () => new Date(),
    listPosts: async (page) => {
      const { createMoneyDigestClient } = await import('@broke-oclock/integrations/server')
      return createMoneyDigestClient().listPosts(page)
    },
    ...(oneMap
      ? {
          searchLocations: (() => {
            // A single provider client retains its token cache across request contexts.
            let client: Promise<OneMapClient> | undefined
            return async (query: string) => {
              client ??= import('@broke-oclock/integrations/server').then(
                ({ createOneMapClient }) => createOneMapClient(oneMap),
              )
              return (await client).search(query)
            }
          })(),
        }
      : {}),
  }
}
