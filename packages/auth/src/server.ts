import { prismaAdapter } from '@better-auth/prisma-adapter'
import { db } from '@broke-oclock/db'
import { betterAuth } from 'better-auth'

export type AuthConfig = {
  baseURL: string
  secret: string
  trustedOrigin: string
}

// The consuming API validates environment values before calling this factory.
export const createAuth = (config: AuthConfig) => {
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
    emailAndPassword: {
      enabled: true,
    },
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
