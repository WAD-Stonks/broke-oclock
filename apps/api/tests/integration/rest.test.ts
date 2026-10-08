import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { gzipSync } from 'node:zlib'
import { parseConfig } from '@api/config'
import { createApiClient } from '@broke-oclock/api-client'
import { currentUserResponseSchema, healthResponseSchema } from '@broke-oclock/contracts/api'
import axios, { type AxiosInstance } from 'axios'
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

const clientFor = (cookie = '', requestOrigin = origin): AxiosInstance =>
  axios.create({
    baseURL,
    withCredentials: true,
    timeout: 30_000,
    headers: { Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}) },
  })
const browserClientFor = (cookie = '', requestOrigin = origin) => {
  const client = createApiClient(`${baseURL}/api`)
  client.http.defaults.headers.common = {
    ...client.http.defaults.headers.common,
    Origin: requestOrigin,
    ...(cookie ? { Cookie: cookie } : {}),
  }
  return client
}

const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')

const signUp = async (name: string): Promise<Credentials> => {
  const email = `rest-${randomUUID()}@example.test`
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
  await promisify(execFile)('pnpm', ['--dir', 'packages/db', 'run', 'push'], {
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
  firstAccount = await signUp('REST Integration User')
  secondAccount = await signUp('Second REST User')
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

describe('REST transport + real Better Auth session context', () => {
  it('calls health through Axios over the actual Express HTTP adapter', async () => {
    const response = await clientFor().get('/api/health')
    expect(healthResponseSchema.parse(response.data)).toEqual({ ok: true })
  })

  it('maps the compatible native me denial through the actual Axios HTTP adapter', async () => {
    const client = browserClientFor()
    client.http.defaults.adapter = 'http'
    await expect(client.infrastructure.me()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
      message: 'Unauthorized',
    })
  })

  it('rejects non-JSON request bodies before protected REST write dispatch', async () => {
    const response = await fetch(`${baseURL}/api/ingestion/runs`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'text/plain' },
      body: 'not JSON',
    })
    expect(response.status).toBe(415)
    expect(await response.json()).toEqual({
      error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Request body must be JSON' },
    })
  })

  it('enforces the request size limit even when a body has a non-JSON content type', async () => {
    const response = await fetch(`${baseURL}/api/ingestion/runs`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'text/plain' },
      body: 'x'.repeat(101 * 1024),
    })
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' },
    })
  })

  it('enforces the request limit after inflating compressed JSON over real HTTP', async () => {
    const response = await clientFor().post(
      '/api/ingestion/runs',
      gzipSync(JSON.stringify({ padding: 'x'.repeat(101 * 1024) })),
      {
        headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
        validateStatus: () => true,
      },
    )
    expect(response.status).toBe(413)
    expect(response.data).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' },
    })
  })

  it('returns an Allow header when a probe receives an unsupported method', async () => {
    try {
      await clientFor().post('/api/health')
      expect.fail('Health is read-only')
    } catch (error) {
      expect(error).toMatchObject({
        response: {
          status: 405,
          headers: { allow: 'GET' },
          data: { error: { code: 'METHOD_NOT_ALLOWED' } },
        },
      })
    }
  })

  it('returns a conventional REST 404 for the removed RPC endpoint', async () => {
    const response = await request('/api/trpc', undefined, firstAccount.cookie)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: { code: 'NOT_FOUND', message: 'Not found' },
    })
  })

  it.each(['health', 'me'])(
    'returns REST 404 for the retired top-level %s RPC path',
    async (path) => {
      const response = await request(`/api/trpc/${path}`, undefined, firstAccount.cookie)
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } })
    },
  )

  it('returns 404 for retired endpoints before CORS or body parsing on normal HTTP methods', async () => {
    const options = await fetch(`${baseURL}/api/trpc`, { method: 'OPTIONS' })
    expect(options.status).toBe(404)
    expect(await options.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } })

    const head = await fetch(`${baseURL}/api/trpc`, { method: 'HEAD' })
    expect(head.status).toBe(404)
    expect(await head.text()).toBe('')

    const malformed = await fetch(`${baseURL}/api/trpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{malformed',
    })
    expect(malformed.status).toBe(404)
    expect(await malformed.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } })

    const oversized = await fetch(`${baseURL}/api/trpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'x'.repeat(102_401) }),
    })
    expect(oversized.status).toBe(404)
    expect(await oversized.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } })
  })

  it('returns the same 404 for a legacy mutation path without performing a write', async () => {
    const response = await request(
      '/api/trpc/platformAdmin.changeRole',
      { userId: 'aaaaaaaaaaaaaaaaaaaaaaaa', expectedVersion: 0, role: 'ADMIN', note: 'legacy' },
      firstAccount.cookie,
    )
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } })
  })

  it('preserves the existing anonymous me probe response', async () => {
    await expect(clientFor().get('/api/me')).rejects.toMatchObject({
      response: {
        status: 401,
        data: { error: 'Unauthorized' },
      },
    })
  })

  it('uses the real signup cookie and returns only the public session shape', async () => {
    const account = firstAccount
    const response = await clientFor(account.cookie).get('/api/me')
    const profile = currentUserResponseSchema.parse(response.data)

    expect(profile).toEqual({
      user: {
        id: expect.stringMatching(/^[a-f0-9]{24}$/),
        name: 'REST Integration User',
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

  it('invalidates the me request after real Better Auth logout', async () => {
    const account = await signUp('Logout User')
    await expect(clientFor(account.cookie).get('/api/me')).resolves.toMatchObject({
      data: { user: { email: account.email } },
    })

    const logout = await request('/api/auth/sign-out', {}, account.cookie)
    expect(logout.status).toBe(200)
    await expect(clientFor(account.cookie).get('/api/me')).rejects.toMatchObject({
      response: { status: 401, data: { error: 'Unauthorized' } },
    })
    const typedClient = browserClientFor(account.cookie)
    typedClient.http.defaults.adapter = 'http'
    await expect(typedClient.infrastructure.me()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
      message: 'Unauthorized',
    })
  })

  it('keeps concurrent Axios requests on their own session identities', async () => {
    const [first, second] = [firstAccount, secondAccount]
    const [firstResponse, secondResponse] = await Promise.all([
      browserClientFor(first.cookie).infrastructure.me(),
      browserClientFor(second.cookie).infrastructure.me(),
    ])
    const firstProfile = currentUserResponseSchema.parse(firstResponse)
    const secondProfile = currentUserResponseSchema.parse(secondResponse)

    expect(firstProfile.user.email).toBe(first.email)
    expect(secondProfile.user.email).toBe(second.email)
    expect(firstProfile.user.id).not.toBe(secondProfile.user.id)
  })

  it('rejects oversized JSON before a write handler can run', async () => {
    const response = await fetch(`${baseURL}/api/ingestion/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ body: 'x'.repeat(102_401) }),
    })
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' },
    })
  })

  it('returns a conventional 400 for malformed JSON without exposing parser details', async () => {
    const response = await fetch(`${baseURL}/api/ingestion/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: '{malformed',
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' },
    })
  })

  it('rejects implicit HEAD before any write route is considered', async () => {
    try {
      await clientFor(firstAccount.cookie).head('/api/admin/accounts/aaaaaaaaaaaaaaaaaaaaaaaa/role')
      expect.fail('HEAD must not execute a write-only route')
    } catch (error) {
      expect(error).toMatchObject({
        response: { status: 405, headers: { allow: 'PATCH' } },
      })
    }
  })

  it('returns METHOD_NOT_ALLOWED when GET targets a write-only route', async () => {
    try {
      await clientFor(firstAccount.cookie).get('/api/admin/accounts/aaaaaaaaaaaaaaaaaaaaaaaa/role')
      expect.fail('GET must not execute a write-only route')
    } catch (error) {
      expect(error).toMatchObject({
        response: {
          status: 405,
          headers: { allow: 'PATCH' },
          data: { error: { code: 'METHOD_NOT_ALLOWED' } },
        },
      })
    }
  })
})
