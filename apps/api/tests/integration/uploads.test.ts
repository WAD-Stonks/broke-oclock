import { spawnSync } from 'node:child_process'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { parseConfig } from '@api/config'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const origin = 'http://localhost:5173'
const fixtureIngestOrigin = 'https://sfo1.ingest.integration.test'
const fixtureIngestHost = 'sfo1.ingest.integration.test'
const fixtureApiKey = 'sk_integration_fixture_not_a_real_credential'
const fixtureToken = Buffer.from(
  JSON.stringify({
    apiKey: fixtureApiKey,
    appId: 'integration-test-app',
    regions: ['sfo1'],
    ingestHost: 'ingest.integration.test',
  }),
).toString('base64')

type FixtureCall = { url: string; body: unknown }
let mongo: MongoMemoryReplSet | undefined
let enabledServer: Server | undefined
let missingTokenServer: Server | undefined
let disconnect: (() => Promise<void>) | undefined
let enabledBaseURL = ''
let missingTokenBaseURL = ''
let originalFetch: typeof fetch
const fixtureCalls: FixtureCall[] = []

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const fixtureFetch = async (input: URL | RequestInfo, init?: RequestInit) => {
  const request = new Request(input, init)
  const url = new URL(request.url)

  // The test server is the only allowed non-fixture network destination.
  if (url.hostname === '127.0.0.1') return originalFetch(input, init)

  if (url.hostname === fixtureIngestHost && url.pathname === '/route-metadata') {
    const body = await request.clone().json()
    fixtureCalls.push({ url: url.href, body })
    return jsonResponse({ ok: true })
  }

  if (url.hostname === fixtureIngestHost && url.pathname === '/callback-result') {
    const body = await request.clone().json()
    fixtureCalls.push({ url: url.href, body })
    return jsonResponse({ ok: true })
  }

  throw new Error(`Unexpected external request from UploadThing handler: ${url.href}`)
}

const listen = async (
  handler: (
    request: import('node:http').IncomingMessage,
    response: import('node:http').ServerResponse,
  ) => void,
) => {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing local test server address')
  return { server, baseURL: `http://127.0.0.1:${address.port}` }
}

const request = (
  baseURL: string,
  path: string,
  body?: unknown,
  cookie = '',
  requestOrigin: string | null = origin,
) =>
  fetch(`${baseURL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(requestOrigin === null ? {} : { Origin: requestOrigin }),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')

const sign = (payload: string) =>
  `hmac-sha256=${createHmac('sha256', fixtureApiKey).update(payload).digest('hex')}`

const uploadPayload = (name: string, type: string, size = 128, input: unknown = null) => ({
  files: [{ name, type, size, lastModified: 1 }],
  input,
})

const postUpload = (
  payload: unknown,
  cookie = '',
  requestOrigin: string | null = origin,
  baseURL = enabledBaseURL,
) =>
  request(
    baseURL,
    '/api/uploadthing?actionType=upload&slug=photoUploader',
    payload,
    cookie,
    requestOrigin,
  )

const accounts = new Map<string, { cookie: string; userId: string }>()
const signup = async (name: string) => {
  const account = name === 'concurrent-b' ? 'second' : 'first'
  const cached = accounts.get(account)
  if (cached) return cached
  const email = `upload-${name}-${randomUUID()}@example.test`
  const password = randomBytes(24).toString('base64url')
  const registered = await request(enabledBaseURL, '/api/auth/sign-up/email', {
    name,
    email,
    password,
  })
  expect(registered.status).toBe(200)
  const cookie = cookieFrom(registered)
  expect(cookie).not.toBe('')
  const me = await request(enabledBaseURL, '/api/me', undefined, cookie)
  expect(me.status).toBe(200)
  const profile = await me.json()
  if (typeof profile.user.id !== 'string') throw new Error('Missing user ID')
  const identity = { cookie, userId: profile.user.id }
  accounts.set(account, identity)
  return identity
}

beforeAll(async () => {
  originalFetch = globalThis.fetch.bind(globalThis)
  vi.stubGlobal('fetch', fixtureFetch)
  vi.stubEnv('NODE_ENV', 'production')

  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  // Never consume a configured DATABASE_URL: always use this fresh disposable replica set.
  const databaseUrl = mongo.getUri(`integration_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
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
  const secret = randomBytes(32).toString('hex')
  const enabledConfig = parseConfig({
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: 'http://localhost:3000',
    WEB_ORIGIN: origin,
    PHOTO_STORAGE_PROVIDER: 'uploadthing',
    UPLOADTHING_TOKEN: fixtureToken,
    NODE_ENV: 'production',
  })
  const missingTokenConfig = parseConfig({
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: 'http://localhost:3000',
    WEB_ORIGIN: origin,
    PHOTO_STORAGE_PROVIDER: 'uploadthing',
    UPLOADTHING_TOKEN: 'UNSET',
    NODE_ENV: 'production',
  })

  const enabled = await listen(createApp(enabledConfig))
  enabledServer = enabled.server
  enabledBaseURL = enabled.baseURL
  const missing = await listen(createApp(missingTokenConfig))
  missingTokenServer = missing.server
  missingTokenBaseURL = missing.baseURL
}, 180_000)

afterAll(async () => {
  for (const server of [enabledServer, missingTokenServer]) {
    if (!server) continue
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  await disconnect?.()
  await mongo?.stop()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
}, 180_000)

describe('real HTTP UploadThing infrastructure', () => {
  it('returns 503 when UploadThing is selected without a usable token', async () => {
    const get = await request(missingTokenBaseURL, '/api/uploadthing')
    expect(get.status).toBe(503)
    expect(await get.json()).toEqual({ error: 'Photo storage is not configured' })

    const post = await postUpload(
      uploadPayload('missing.jpg', 'image/jpeg'),
      '',
      origin,
      missingTokenBaseURL,
    )
    expect(post.status).toBe(503)
    expect(await post.json()).toEqual({ error: 'Photo storage is not configured' })
  })

  it('publishes only the public photo route configuration', async () => {
    const response = await request(enabledBaseURL, '/api/uploadthing')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual([
      {
        slug: 'photoUploader',
        config: {
          'image/jpeg': {
            maxFileSize: '4MB',
            maxFileCount: 1,
            minFileCount: 0,
            contentDisposition: 'inline',
          },
          'image/png': {
            maxFileSize: '4MB',
            maxFileCount: 1,
            minFileCount: 0,
            contentDisposition: 'inline',
          },
          'image/webp': {
            maxFileSize: '4MB',
            maxFileCount: 1,
            minFileCount: 0,
            contentDisposition: 'inline',
          },
        },
      },
    ])
    expect(Object.keys(body[0])).toEqual(['slug', 'config'])
  })

  it('requires the exact browser origin before resolving a session', async () => {
    const user = await signup('origin')
    const before = fixtureCalls.length

    const missingOrigin = await postUpload(
      uploadPayload('missing-origin.jpg', 'image/jpeg'),
      user.cookie,
      null,
    )
    expect(missingOrigin.status).toBe(403)

    const badOrigin = await postUpload(
      uploadPayload('bad-origin.jpg', 'image/jpeg'),
      user.cookie,
      'https://untrusted.example',
    )
    expect(badOrigin.status).toBe(403)
    expect(fixtureCalls.length).toBe(before)
  })

  it('requires a real authenticated Better Auth cookie for a browser upload', async () => {
    const before = fixtureCalls.length
    const response = await postUpload(uploadPayload('anonymous.jpg', 'image/jpeg'))
    expect(response.status).toBe(401)
    expect(fixtureCalls.length).toBe(before)
  })

  it.each([
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
  ] as const)(
    'accepts one %s image up to the 4MB limit through the SDK handler',
    async (label, type) => {
      const user = await signup(label)
      const before = fixtureCalls.length
      const response = await postUpload(
        uploadPayload(`${label}.upload`, type, 4 * 1024 * 1024),
        user.cookie,
      )
      expect(response.status, await response.clone().text()).toBe(200)
      const body = await response.json()
      expect(body).toHaveLength(1)
      expect(body[0]).toMatchObject({ name: `${label}.upload`, customId: null })

      const calls = fixtureCalls
        .slice(before)
        .filter((call) => call.url.endsWith('/route-metadata'))
      expect(calls).toHaveLength(1)
    },
  )

  it.each([
    ['rejects SVG', uploadPayload('vector.svg', 'image/svg+xml')],
    [
      'rejects more than one file across allowed types',
      {
        files: [
          { name: 'one.jpg', type: 'image/jpeg', size: 128, lastModified: 1 },
          { name: 'two.png', type: 'image/png', size: 128, lastModified: 1 },
        ],
        input: null,
      },
    ],
    ['rejects empty files', uploadPayload('empty.webp', 'image/webp', 0)],
    ['rejects files over 4MB', uploadPayload('large.jpg', 'image/jpeg', 4 * 1024 * 1024 + 1)],
  ] as const)('%s', async (_label, payload) => {
    const user = await signup('invalid')
    const before = fixtureCalls.length
    const response = await postUpload(payload, user.cookie)
    expect(response.status).toBe(400)
    expect(fixtureCalls.length).toBe(before)
  })

  it('caps JSON control requests before they reach the SDK', async () => {
    const user = await signup('large-body')
    const before = fixtureCalls.length
    const response = await postUpload(
      uploadPayload('test.jpg', 'image/jpeg', 128, { padding: 'x'.repeat(17 * 1024) }),
      user.cookie,
    )
    expect(response.status).toBe(413)
    expect(fixtureCalls.length).toBe(before)
  })

  it('passes session identity as metadata and ignores client-supplied identity', async () => {
    const user = await signup('metadata')
    const before = fixtureCalls.length
    const response = await postUpload(
      uploadPayload('metadata.jpg', 'image/jpeg', 128, { userId: 'attacker-controlled-id' }),
      user.cookie,
    )
    expect(response.status).toBe(200)

    const calls = fixtureCalls.slice(before).filter((call) => call.url.endsWith('/route-metadata'))
    expect(calls).toHaveLength(1)
    expect(calls[0]?.body).toMatchObject({ metadata: { userId: user.userId } })
    expect(calls[0]?.body).not.toMatchObject({ metadata: { userId: 'attacker-controlled-id' } })
  })

  it('handles a valid SDK-signed callback without browser credentials and returns completion data', async () => {
    const user = await signup('callback')
    const file = {
      name: 'callback.webp',
      size: 128,
      type: 'image/webp',
      lastModified: 1,
      customId: null,
      key: 'callback-file-key',
      url: `${fixtureIngestOrigin}/f/callback-file-key`,
      appUrl: `${fixtureIngestOrigin}/f/callback-file-key`,
      ufsUrl: `${fixtureIngestOrigin}/f/callback-file-key`,
      fileHash: 'integration-file-hash',
    }
    const payload = JSON.stringify({
      status: 'uploaded',
      file,
      origin: fixtureIngestOrigin,
      metadata: { userId: user.userId },
    })
    const before = fixtureCalls.length
    const callback = await fetch(`${enabledBaseURL}/api/uploadthing?slug=photoUploader`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'uploadthing-hook': 'callback',
        'x-uploadthing-signature': sign(payload),
      },
      body: payload,
    })
    expect(callback.status).toBe(200)
    expect(fixtureCalls.slice(before).some((call) => call.url.endsWith('/callback-result'))).toBe(
      true,
    )
    const result = fixtureCalls.slice(before).find((call) => call.url.endsWith('/callback-result'))
    expect(result?.body).toEqual({
      fileKey: file.key,
      callbackData: { uploadedBy: user.userId, key: file.key, url: file.ufsUrl },
    })
  })

  it('rejects a forged callback before invoking completion or making an external request', async () => {
    const user = await signup('forged')
    const file = {
      name: 'forged.jpg',
      size: 128,
      type: 'image/jpeg',
      lastModified: 1,
      customId: null,
      key: 'forged-file-key',
      url: `${fixtureIngestOrigin}/f/forged-file-key`,
      appUrl: `${fixtureIngestOrigin}/f/forged-file-key`,
      ufsUrl: `${fixtureIngestOrigin}/f/forged-file-key`,
      fileHash: 'forged-file-hash',
    }
    const payload = JSON.stringify({
      status: 'uploaded',
      file,
      origin: fixtureIngestOrigin,
      metadata: { userId: user.userId },
    })
    const before = fixtureCalls.length
    const response = await fetch(`${enabledBaseURL}/api/uploadthing?slug=photoUploader`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'uploadthing-hook': 'callback',
        'x-uploadthing-signature': 'hmac-sha256=forged',
      },
      body: payload,
    })
    expect(response.status).toBe(400)
    expect(fixtureCalls.length).toBe(before)
  })

  it('preserves metadata identity for concurrent different-user uploads', async () => {
    const [first, second] = await Promise.all([signup('concurrent-a'), signup('concurrent-b')])
    const before = fixtureCalls.length
    const responses = await Promise.all([
      postUpload(
        uploadPayload('first.jpg', 'image/jpeg', 128, { userId: 'wrong-a' }),
        first.cookie,
      ),
      postUpload(
        uploadPayload('second.png', 'image/png', 128, { userId: 'wrong-b' }),
        second.cookie,
      ),
    ])
    expect(responses.map((response) => response.status)).toEqual([200, 200])
    const uploads = await Promise.all(responses.map((response) => response.json()))

    const calls = fixtureCalls.slice(before).filter((call) => call.url.endsWith('/route-metadata'))
    expect(calls).toHaveLength(2)
    for (const [index, user] of [first, second].entries()) {
      expect(calls.map((call) => call.body)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fileKeys: [uploads[index][0].key],
            metadata: { userId: user.userId },
          }),
        ]),
      )
    }
    const identities = calls.map(
      (call) => (call.body as { metadata: { userId: string } }).metadata.userId,
    )
    expect(new Set(identities)).toEqual(new Set([first.userId, second.userId]))
    expect(identities).not.toContain('wrong-a')
    expect(identities).not.toContain('wrong-b')
  })
})
