import { toCurrentUserResponse } from '@api/auth'
import { createRestHandler, type RestDependencies } from '@api/rest/context'
import {
  currentUserResponseSchema,
  currentUserUnauthorizedResponseSchema,
} from '@broke-oclock/contracts/api'
import type { RequestHandler } from 'express'

export const getMe = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (_request, response, context) => {
    const session = context.session
    if (!session) {
      response
        .status(401)
        .json(currentUserUnauthorizedResponseSchema.parse({ error: 'Unauthorized' }))
      return
    }
    response.json(currentUserResponseSchema.parse(toCurrentUserResponse(session)))
  })
