import type { AppConfig } from '@api/config'
import { prismaAdapter } from '@better-auth/prisma-adapter'
import { db } from '@broke-oclock/db'
import { betterAuth } from 'better-auth'

export const createAuth = (config: AppConfig) => {
  return betterAuth({
    baseURL: config.betterAuthUrl,
    basePath: '/api/auth',
    rateLimit: { enabled: true, window: 60, max: 100 },
    secret: config.betterAuthSecret,
    trustedOrigins: [config.webOrigin],
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
