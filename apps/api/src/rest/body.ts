import { ApiErrorException } from '@api/errors'
import type { RequestHandler } from 'express'

export const requireJsonRequestBody: RequestHandler = (request, _response, next) => {
  const length = Number(request.get('Content-Length') ?? '0')
  if (length > 100 * 1024) {
    next(new ApiErrorException('PAYLOAD_TOO_LARGE'))
    return
  }
  const hasBody = length > 0 || request.get('Transfer-Encoding') !== undefined
  if (hasBody && !request.is('application/json')) {
    next(new ApiErrorException('UNSUPPORTED_MEDIA_TYPE', 'Request body must be JSON'))
    return
  }
  next()
}
