import type { AppConfig } from '@api/config'
import { parseRestInput } from '@api/rest/validation'
import { authMethodsQuerySchema, authMethodsResponseSchema } from '@broke-oclock/contracts/api'
import type { RequestHandler } from 'express'

export const getAuthMethods =
  (config: AppConfig): RequestHandler =>
  (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    parseRestInput(authMethodsQuerySchema, request.query)
    response.json(
      authMethodsResponseSchema.parse({
        password: true,
        google: Boolean(config.authProviders?.google),
        emailOtp: Boolean(config.authProviders?.email),
        passwordRecovery: Boolean(config.authProviders?.email),
      }),
    )
  }
