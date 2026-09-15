import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import type { AppRouter } from '@api/trpc/root'
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const origin = 'http://localhost:5173'
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let disconnect: (() => Promise<void>) | undefined
let baseURL = ''

type Credentials = { email: string; cookie: string }
let firstAccount: Credentials
let secondAccount: Credentials

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

const clientFor = (cookie = '') =>
  createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseURL}/api/trpc`,
        fetch: async (input, init) => {
          const headers = new Headers(init?.headers)
          headers.set('Origin', origin)
          if (cookie) headers.set('Cookie', cookie)
          return fetch(input, { ...init, headers })
        },
      }),
    ],
  })

const signUp = async (name: string): Promise<Credentials> => {
  const email = `rpc-${randomUUID()}@example.test`
  const password = randomBytes(24).toString('base64url')
  const response = await request('/api/auth/sign-up/email', { name, email, password })
  expect(response.status).toBe(200)
  const cookie = cookieFrom(response)
  expect(cookie).not.toBe('')
  expect(response.headers.getSetCookie().some((value) => value.includes('HttpOnly'))).toBe(true)
  return { email, cookie }
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  // Never consume a configured DATABASE_URL: always use this fresh disposable replica set.
  const databaseUrl = mongo.getUri(`integration_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  // Do not block the event loop: the in-memory Mongo process needs its output drained.
  await promisify(execFile)('bun', ['run', '--cwd', 'packages/db', 'push'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    timeout: 60_000,
  })
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
  // Reuse two real accounts so setup respects Better Auth's signup throttle.
  // The logout case creates its own third account; RPC queries remain concurrent.
  firstAccount = await signUp('RPC Integration User')
  secondAccount = await signUp('Second RPC User')
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

describe('real HTTP tRPC + Better Auth session context', () => {
  it('calls health through the typed RPC client', async () => {
    await expect(clientFor().health.query()).resolves.toEqual({ ok: true })
  })

  it('rejects an anonymous me query with UNAUTHORIZED', async () => {
    await expect(clientFor().me.query()).rejects.toMatchObject({ data: { code: 'UNAUTHORIZED' } })
  })

  it('uses the real signup cookie and returns only the public session shape', async () => {
    const account = firstAccount
    const profile = await clientFor(account.cookie).me.query()

    expect(profile).toEqual({
      user: {
        id: expect.stringMatching(/^[a-f0-9]{24}$/),
        name: 'RPC Integration User',
        email: account.email,
        emailVerified: false,
      },
      session: {
        expiresAt: expect.stringMatching(
          /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$/,
        ),
      },
    })
    expect(profile.user).not.toHaveProperty('password')
    expect(profile.session).not.toHaveProperty('token')
  })

  it('invalidates the RPC me query after real Better Auth logout', async () => {
    const account = await signUp('Logout User')
    await expect(clientFor(account.cookie).me.query()).resolves.toMatchObject({
      user: { email: account.email },
    })

    const logout = await request('/api/auth/sign-out', {}, account.cookie)
    expect(logout.status).toBe(200)
    await expect(clientFor(account.cookie).me.query()).rejects.toMatchObject({
      data: { code: 'UNAUTHORIZED' },
    })
  })

  it('keeps concurrent clients on their own session identities', async () => {
    const [first, second] = [firstAccount, secondAccount]
    const [firstProfile, secondProfile] = await Promise.all([
      clientFor(first.cookie).me.query(),
      clientFor(second.cookie).me.query(),
    ])

    expect(firstProfile.user.email).toBe(first.email)
    expect(secondProfile.user.email).toBe(second.email)
    expect(firstProfile.user.id).not.toBe(secondProfile.user.id)
  })

  it('rejects unexpected procedure input through raw HTTP with Zod BAD_REQUEST', async () => {
    const input = encodeURIComponent(JSON.stringify({ unexpected: true }))
    const response = await fetch(`${baseURL}/api/trpc/health?input=${input}`, {
      headers: { Origin: origin },
    })

    expect(response.status).toBe(400)
    const payload = await response.json()
    expect(payload.error?.data?.code).toBe('BAD_REQUEST')
  })
  it('rejects oversized batches before running procedures', async () => {
    const paths = Array.from({ length: 21 }, () => 'health').join(',')
    const response = await fetch(`${baseURL}/api/trpc/${paths}?batch=1`)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(JSON.stringify(body)).toContain('BAD_REQUEST')
    expect(JSON.stringify(body)).not.toContain('"result"')
  })
})
