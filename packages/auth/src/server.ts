import { prismaAdapter } from '@better-auth/prisma-adapter'
import { db } from '@broke-oclock/db'
import { betterAuth } from 'better-auth'

export type AuthEmailMessage = { name: string; email: string; url: string }

// Supplied by the API (which owns the email provider). Implementations must never throw:
// a failed email must not break sign-up or the password-reset request.
export type AuthEmailSender = {
  sendVerification: (message: AuthEmailMessage) => Promise<void>
  sendPasswordReset: (message: AuthEmailMessage) => Promise<void>
}

export type AuthConfig = {
  baseURL: string
  secret: string
  trustedOrigin: string
  // Present only when the email provider is configured.
  email?: AuthEmailSender
}

type EmailHookData = { user: { name: string; email: string }; url: string }

// The consuming API validates environment values before calling this factory.
export const createAuth = (config: AuthConfig) => {
  const sender = config.email
  return betterAuth({
    baseURL: config.baseURL,
    basePath: '/api/auth',
    rateLimit: { enabled: true, window: 60, max: 100 },
    secret: config.secret,
    trustedOrigins: [config.trustedOrigin],
    database: prismaAdapter(db, {
      provider: 'mongodb',
      transaction: true,
    }),
    user: {
      additionalFields: {
        role: {
          type: ['USER', 'MERCHANT', 'MODERATOR', 'ADMIN'],
          required: false,
          defaultValue: 'USER',
          input: false,
          returned: true,
        },
      },
    },
    // Staff authorization must use fresh database-backed sessions.
    session: { cookieCache: { enabled: false } },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: Boolean(sender),
      ...(sender
        ? {
            // Not awaited on purpose: waiting for the provider would make the response time
            // reveal whether the address belongs to an account.
            sendResetPassword: async ({ user, url }: EmailHookData) => {
              void sender
                .sendPasswordReset({ name: user.name, email: user.email, url })
                .catch(() => undefined)
            },
          }
        : {}),
    },
    ...(sender
      ? {
          emailVerification: {
            sendOnSignUp: true,
            sendOnSignIn: true,
            sendVerificationEmail: async ({ user, url }: EmailHookData) => {
              void sender
                .sendVerification({ name: user.name, email: user.email, url })
                .catch(() => undefined)
            },
          },
        }
      : {}),
    advanced: {
      // Better Auth otherwise skips origin checking under NODE_ENV=test.
      // Keep the security boundary identical in integration tests and production.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      database: {
        generateId: false,
      },
    },
  })
}
