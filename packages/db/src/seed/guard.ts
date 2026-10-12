// The seed only ever writes to a local MongoDB. Atlas and other remote hosts are refused.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const MONGODB_SCHEME = 'mongodb://'

const hostWithoutPort = (entry: string) => entry.replace(/:\d+$/, '').trim()

export const isLocalDatabaseUrl = (url: string | undefined): boolean => {
  if (!url?.startsWith(MONGODB_SCHEME)) return false
  const authority = url.slice(MONGODB_SCHEME.length).split(/[/?]/, 1)[0] ?? ''
  const hosts = authority.slice(authority.lastIndexOf('@') + 1)
  if (hosts.length === 0) return false
  return hosts.split(',').every((entry) => LOCAL_HOSTS.has(hostWithoutPort(entry)))
}

export const assertLocalDatabaseUrl = (url: string | undefined): void => {
  if (isLocalDatabaseUrl(url)) return
  throw new Error(
    'Refusing to seed: DATABASE_URL must point at a local MongoDB (mongodb://127.0.0.1 or localhost). Start it with `pnpm run db:local`.',
  )
}
