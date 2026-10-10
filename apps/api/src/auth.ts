import type { AppConfig } from '@api/config'
import { createAuth as createSharedAuth } from '@broke-oclock/auth/server'
import type { Session } from '@broke-oclock/auth/types'
import type { CurrentUserResponse } from '@broke-oclock/contracts/api'
import { createEmailClient, createEmailOTPEmail } from '@broke-oclock/email/server'

export const createAuth = (config: AppConfig) => {
  const email = config.authProviders?.email
  const sender = email ? createEmailClient(email) : undefined
  return createSharedAuth({
    baseURL: config.betterAuthUrl,
    secret: config.betterAuthSecret,
    trustedOrigin: config.webOrigin,
    google: config.authProviders?.google,
    sendEmailOTP: sender
      ? async ({ email, otp, type }) => {
          await sender.send({ to: email, ...createEmailOTPEmail({ otp, type }) })
        }
      : undefined,
  })
}

export const toCurrentUserResponse = (session: Session): CurrentUserResponse => ({
  user: {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
  },
  session: { expiresAt: session.session.expiresAt.toISOString() },
})
