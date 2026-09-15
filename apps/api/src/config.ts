export type AppConfig = {
  port: number
  webOrigin: string
  betterAuthUrl: string
  betterAuthSecret: string
  databaseUrl: string
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
export const parseConfig = (env: Environment): AppConfig => {
  const betterAuthSecret = requiredString(env, 'BETTER_AUTH_SECRET')
  if (betterAuthSecret.length < 32)
    throw new Error('BETTER_AUTH_SECRET must be at least 32 characters')
  return {
    port: parsePort(env.PORT),
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
