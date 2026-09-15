import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const origin = 'http://localhost:5173'
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let disconnect: (() => Promise<void>) | undefined
let baseURL = ''
let roleAccount: { email: string; cookies: string }
let db!: typeof import('@broke-oclock/db').db

type Role = 'USER' | 'MODERATOR' | 'ADMIN'
type SessionUser = { name: string; email: string; role?: Role }

const request = (path: string, body?: object, cookie = '', requestOrigin = origin) =>
  fetch(`${baseURL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      Origin: requestOrigin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
const signUp = async (name = 'Role Test User', role?: Role) => {
  const email = `role-${randomUUID()}@example.test`
  const response = await request('/api/auth/sign-up/email', {
    name,
    email,
    password: randomBytes(24).toString('base64url'),
    ...(role ? { role } : {}),
  })
  expect(response.status).toBe(200)
  const cookies = cookieFrom(response)
  expect(cookies).not.toBe('')
  return { cookies, email }
}
const getSession = async (cookies: string) => {
  const response = await request('/api/auth/get-session', undefined, cookies)
  expect(response.status).toBe(200)
  return (await response.json()) as { user: SessionUser }
}
const persistedRole = async (email: string) => {
  const user = await db.user.findUniqueOrThrow({ where: { email } })
  return user.role
}
const assignRoleInDb = async (email: string, role: Role) => {
  await db.user.update({ where: { email }, data: { role } })
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  // Never consume a configured DATABASE_URL: always use this fresh disposable replica set.
  const databaseUrl = mongo.getUri(`integration_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  // Keep the event loop free to drain the disposable Mongo process output.
  await promisify(execFile)('bun', ['run', '--cwd', 'packages/db', 'push'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    timeout: 60_000,
  })
  const importedDb = await import('@broke-oclock/db')
  db = importedDb.db
  disconnect = () => db.$disconnect()
  const { createApp } = await import('@api/app')
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing local test server address')
  baseURL = `http://127.0.0.1:${address.port}`
  server.on(
    'request',
    createApp(
      parseConfig({
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
        BETTER_AUTH_URL: baseURL,
        WEB_ORIGIN: origin,
      }),
    ),
  )
}, 180_000)

afterAll(async () => {
  if (server) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server?.close(() => resolve()))
  }
  await disconnect?.()
  await mongo?.stop()
  vi.unstubAllEnvs()
})

describe('real Express + Better Auth + Prisma + MongoDB', () => {
  it('reports liveness separately from database readiness and protects /me', async () => {
    const health = await request('/api/health')
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ ok: true })
    expect(health.headers.get('x-content-type-options')).toBe('nosniff')
    expect((await request('/api/ready')).status).toBe(200)
    expect((await request('/api/me')).status).toBe(401)
    expect((await request('/api/auth/ok')).status).toBe(200)
  })

  it('registers, reads persisted session, logs out, logs in and rejects a bad password', async () => {
    const email = `integration-${randomUUID()}@example.test`
    const password = randomBytes(24).toString('base64url')
    const registered = await request('/api/auth/sign-up/email', {
      name: 'Integration Test',
      email,
      password,
    })
    expect(registered.status).toBe(200)
    const cookies = cookieFrom(registered)
    expect(cookies.length).toBeGreaterThan(0)
    expect(registered.headers.getSetCookie().some((cookie) => cookie.includes('HttpOnly'))).toBe(
      true,
    )
    const me = await request('/api/me', undefined, cookies)
    expect(me.status).toBe(200)
    const profile = await me.json()
    expect(profile.user.email).toBe(email)
    expect(profile.user.id).toMatch(/^[a-f0-9]{24}$/)
    expect(profile.user).not.toHaveProperty('password')
    expect(profile.session).not.toHaveProperty('token')
    const session = await request('/api/auth/get-session', undefined, cookies)
    expect((await session.json()).user.email).toBe(email)
    const logout = await request('/api/auth/sign-out', {}, cookies)
    expect(logout.status).toBe(200)
    expect((await request('/api/me', undefined, cookies)).status).toBe(401)
    const wrong = await request('/api/auth/sign-in/email', {
      email,
      password: randomBytes(24).toString('base64url'),
    })
    expect(wrong.status).toBe(401)
    const login = await request('/api/auth/sign-in/email', { email, password })
    expect(login.status).toBe(200)
    expect((await request('/api/me', undefined, cookieFrom(login))).status).toBe(200)
    roleAccount = { email, cookies: cookieFrom(login) }
  })

  it('persists USER by default and exposes it through the real session endpoint', async () => {
    const { cookies, email } = roleAccount

    expect(await persistedRole(email)).toBe('USER')
    expect((await getSession(cookies)).user.role).toBe('USER')
  })

  it.each(['ADMIN', 'MODERATOR'] as const)(
    'does not allow hostile signup role %s to elevate the account',
    async (role) => {
      const { cookies, email } = await signUp('Hostile Role Test User', role)

      expect(await persistedRole(email)).toBe('USER')
      expect((await getSession(cookies)).user.role).toBe('USER')
    },
  )

  it('does not allow profile role elevation while preserving legitimate name edits', async () => {
    const { cookies, email } = roleAccount

    const hostileUpdate = await request('/api/auth/update-user', { role: 'ADMIN' }, cookies)
    expect([200, 400]).toContain(hostileUpdate.status)
    expect(await persistedRole(email)).toBe('USER')
    expect((await getSession(cookies)).user.role).toBe('USER')

    const nameUpdate = await request('/api/auth/update-user', { name: 'After Name Edit' }, cookies)
    expect(nameUpdate.status).toBe(200)
    expect((await getSession(cookies)).user.name).toBe('After Name Edit')
    expect(await persistedRole(email)).toBe('USER')
  })

  it.each(['MODERATOR', 'ADMIN'] as const)(
    'reflects a disposable DB-side %s assignment in the next session read',
    async (role) => {
      const { cookies, email } = roleAccount

      await assignRoleInDb(email, role)

      expect((await getSession(cookies)).user.role).toBe(role)
      await assignRoleInDb(email, 'USER')
      expect((await getSession(cookies)).user.role).toBe('USER')
    },
  )

  it('rejects auth mutation from an untrusted origin', async () => {
    // Reuse an authenticated account rather than exhausting the signup-specific limiter.
    const response = await request(
      '/api/auth/update-user',
      { name: 'Blocked' },
      roleAccount.cookies,
      'https://untrusted.example',
    )
    expect(response.status).toBe(403)
    expect((await getSession(roleAccount.cookies)).user.name).toBe('After Name Edit')
  })
})
