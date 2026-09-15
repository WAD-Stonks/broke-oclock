import { spawnSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { parseConfig } from '@api/config'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const origin = 'http://localhost:5173'
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let disconnect: (() => Promise<void>) | undefined
let baseURL = ''

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

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  // Never consume a configured DATABASE_URL: always use this fresh disposable replica set.
  const databaseUrl = mongo.getUri(`integration_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  const pushed = spawnSync('bun', ['run', '--cwd', 'packages/db', 'push'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    timeout: 60_000,
  })
  if (pushed.status !== 0) throw new Error(`Disposable schema push failed: ${pushed.stderr}`)
  const { db } = await import('@broke-oclock/db')
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
  })

  it('rejects auth mutation from an untrusted origin', async () => {
    const response = await request(
      '/api/auth/sign-up/email',
      {
        name: 'Blocked',
        email: `blocked-${randomUUID()}@example.test`,
        password: randomBytes(24).toString('base64url'),
      },
      '',
      'https://untrusted.example',
    )
    expect(response.status).toBe(403)
  })
})
