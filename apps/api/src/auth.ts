import type { AppConfig } from '@api/config'
import { createAuth as createSharedAuth } from '@broke-oclock/auth/server'

export const createAuth = (config: AppConfig) =>
  createSharedAuth({
    baseURL: config.betterAuthUrl,
    secret: config.betterAuthSecret,
    trustedOrigin: config.webOrigin,
  })
