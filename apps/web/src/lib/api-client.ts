import { createApiClient } from '@broke-oclock/api-client'

export {
  ApiClientError,
  type ApiClientErrorCode,
  createApiClient,
  toApiClientError,
} from '@broke-oclock/api-client'

export const api = createApiClient('/api')
