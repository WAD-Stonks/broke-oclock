import { ApiErrorException } from '@api/errors'
import type { RequestHandler } from 'express'

// Express's bounded simple parser counts empty segments against maxKeys=1000.
// Reject before accessing request.query so it cannot hide later invalid fields.
export const requireBoundedRestQuery: RequestHandler = (request, _response, next) => {
  const question = request.originalUrl.indexOf('?')
  if (question !== -1) {
    let segments = 1
    for (let index = question + 1; index < request.originalUrl.length; index++) {
      if (request.originalUrl[index] === '&' && ++segments > 1000) {
        next(new ApiErrorException('BAD_REQUEST', 'Query is too complex'))
        return
      }
    }
  }
  next()
}
