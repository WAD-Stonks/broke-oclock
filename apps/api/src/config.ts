export type AppConfig = {
  port: number
  webOrigin: string
  betterAuthUrl: string
  betterAuthSecret: string
  databaseUrl: string
  ingestion?: {
    enabled: boolean
    reuseApproved: boolean
    oneMap?: { email: string; password: string }
  }
  photoStorage?: { token: string; isDev: boolean }
  authProviders?: {
    google?: { clientId: string; clientSecret: string }
    email?: { apiKey: string; from: string }
  }
}

type Environment = Record<string, string | undefined>
const requiredString = (env: Environment, name: string): string => {
  const value = env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}
const parseOrigin = (value: string, name: string): string => {
  try {
    const url = new URL(value)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw new Error('not an origin')
    return url.origin
  } catch {
    throw new Error(`${name} must be an HTTP(S) origin without credentials, path, query or hash`)
  }
}
const parsePort = (value: string | undefined): number => {
  const port = Number(value ?? '3000')
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be an integer between 1 and 65535')
  return port
}
// Accept SRV and replica-set host lists; the MongoDB driver validates the complete URI.
const validateDatabaseUrl = (value: string): string => {
  if (!/^mongodb(?:\+srv)?:\/\/[^/\s]+\/[^?/#\s]+(?:\?[^#\s]*)?$/.test(value))
    throw new Error(
      'DATABASE_URL must be a MongoDB connection string with an explicit database name',
    )
  return value
}
const parsePhotoStorage = (env: Environment): AppConfig['photoStorage'] => {
  const provider = env.PHOTO_STORAGE_PROVIDER?.trim()
  if (!provider || provider === 'UNCONFIGURED') return undefined
  if (provider !== 'uploadthing') throw new Error('PHOTO_STORAGE_PROVIDER must be uploadthing')
  const token = env.UPLOADTHING_TOKEN?.trim()
  if (!token || ['UNSET', 'UNCONFIGURED'].includes(token)) return undefined
  return { token, isDev: env.NODE_ENV === 'development' }
}

const parseFlag = (env: Environment, name: string): boolean => {
  const value = env[name]?.trim()
  if (!value || value === 'false') return false
  if (value === 'true') return true
  throw new Error(`${name} must be true or false`)
}
const parseIngestion = (env: Environment): AppConfig['ingestion'] => {
  const email = env.ONEMAP_EMAIL?.trim()
  const password = env.ONEMAP_EMAIL_PASSWORD?.trim()
  const configured =
    email &&
    password &&
    ![email, password].some((value) => ['UNSET', 'UNCONFIGURED'].includes(value))
  return {
    enabled: parseFlag(env, 'INGESTION_ENABLED'),
    reuseApproved: parseFlag(env, 'MONEYDIGEST_REUSE_APPROVED'),
    ...(configured ? { oneMap: { email, password } } : {}),
  }
}

const parseAuthProviders = (env: Environment): AppConfig['authProviders'] => {
  const value = (name: string, valid: RegExp) => {
    const raw = env[name]
    if (raw === undefined) return undefined
    if (/[\r\n]/u.test(raw)) throw new Error('Invalid authentication provider configuration')
    const trimmed = raw.trim()
    if (!trimmed || /^(?:unset|unconfigured)$/iu.test(trimmed)) return undefined
    if (!valid.test(trimmed)) throw new Error('Invalid authentication provider configuration')
    return trimmed
  }
  const clientId = value('GOOGLE_CLIENT_ID', /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/u)
  const clientSecret = value('GOOGLE_CLIENT_SECRET', /^[A-Za-z0-9._-]+$/u)
  const apiKey = value('RESEND_API_KEY', /^re_[A-Za-z0-9_-]+$/u)
  const from = value('EMAIL_FROM', /^(?:[^<>\r\n]+ <)?[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>?$/u)
  return {
    ...(clientId && clientSecret ? { google: { clientId, clientSecret } } : {}),
    ...(apiKey && from ? { email: { apiKey, from } } : {}),
  }
}

export const parseConfig = (env: Environment): AppConfig => {
  const betterAuthSecret = requiredString(env, 'BETTER_AUTH_SECRET')
  if (betterAuthSecret.length < 32)
    throw new Error('BETTER_AUTH_SECRET must be at least 32 characters')
  return {
    port: parsePort(env.PORT),
    ingestion: parseIngestion(env),
    authProviders: parseAuthProviders(env),
    photoStorage: parsePhotoStorage(env),
    webOrigin: parseOrigin(env.WEB_ORIGIN?.trim() || 'http://localhost:5173', 'WEB_ORIGIN'),
    betterAuthUrl: parseOrigin(
      env.BETTER_AUTH_URL?.trim() || 'http://localhost:3000',
      'BETTER_AUTH_URL',
    ),
    betterAuthSecret,
    databaseUrl: validateDatabaseUrl(requiredString(env, 'DATABASE_URL')),
  }
}
export const loadConfig = (): AppConfig => parseConfig(process.env)
