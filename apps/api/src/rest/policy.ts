import { ApiErrorException } from '@api/errors'
import type { RequestHandler } from 'express'

export const requireTrustedOrigin = (origin: string | undefined, trustedOrigin: string): void => {
  if (origin !== trustedOrigin) {
    throw new ApiErrorException('FORBIDDEN', 'Untrusted request origin')
  }
}

export const methodNotAllowed =
  (...allowedMethods: string[]): RequestHandler =>
  (_request, response, next) => {
    response.setHeader('Allow', allowedMethods.join(', '))
    next(new ApiErrorException('METHOD_NOT_ALLOWED', 'Method not allowed'))
  }
