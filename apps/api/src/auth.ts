import type { AppConfig } from '@api/config'
import { createAuth as createSharedAuth } from '@broke-oclock/auth/server'
import type { Session } from '@broke-oclock/auth/types'
import type { CurrentUserResponse } from '@broke-oclock/contracts/api'

export const createAuth = (config: AppConfig) =>
  createSharedAuth({
    baseURL: config.betterAuthUrl,
    secret: config.betterAuthSecret,
    trustedOrigin: config.webOrigin,
  })

export const toCurrentUserResponse = (session: Session): CurrentUserResponse => ({
  user: {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
  },
  session: { expiresAt: session.session.expiresAt.toISOString() },
})
