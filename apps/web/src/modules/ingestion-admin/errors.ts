import { ApiClientError } from '@web/lib/api-client'

export const errorCode = (error: unknown): string | undefined => {
  return error instanceof ApiClientError ? error.code : undefined
}
