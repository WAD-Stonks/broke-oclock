import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import type { IngestionRuntime } from '@api/modules/ingestion/runtime'
import { MONEYDIGEST_SOURCE, sourceWhere } from '@api/modules/ingestion/source'
import { createApiClient } from '@broke-oclock/api-client'
import { createOneMapClient } from '@broke-oclock/integrations/server'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const origin = 'http://localhost:5173'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
let baseURL = ''
let admin: { id: string; cookie: string }
let clock = new Date('2026-10-10T00:00:00.000Z')
const publisher = vi.fn<IngestionRuntime['listPosts']>().mockResolvedValue([])
const runtime: IngestionRuntime = {
  enabled: false,
  reuseApproved: false,
  listPosts: publisher,
  now: () => clock,
}
const clientFor = (cookie = admin.cookie) => {
  const client = createApiClient(`${baseURL}/api`)
  Object.assign(client.http.defaults.headers.common, { Cookie: cookie, Origin: origin })
  return client
}
const canonicalSource = (enabled = true, url = MONEYDIGEST_SOURCE.url) =>
  db.importSource.upsert({
    where: sourceWhere,
    create: { ...MONEYDIGEST_SOURCE, enabled, url },
    update: { enabled, url },
  })
const counts = () =>
  Promise.all([db.ingestionRun.count(), db.importedPost.count(), db.deal.count()])

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`lane_e_provider_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await promisify(execFile)('pnpm', ['--dir', 'packages/db', 'run', 'push'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    timeout: 60_000,
  })
  db = (await import('@broke-oclock/db')).db
  const { createApp } = await import('@api/app')
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing disposable HTTP listener')
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
      { ingestion: runtime },
    ),
  )
  const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      name: 'Lane E provider admin',
      email: `lane-e-${randomUUID()}@example.test`,
      password: randomBytes(24).toString('base64url'),
    }),
  })
  expect(response.status).toBe(200)
  const body = await response.json()
  admin = {
    id: body.user.id,
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; '),
  }
  await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
}, 180_000)
beforeEach(() => {
  runtime.enabled = false
  runtime.reuseApproved = false
  delete runtime.searchLocations
  publisher.mockClear()
  clock = new Date(clock.getTime() + 30_000)
})
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})

describe('controlled provider gates through actual admin Axios HTTP and disposable persistence', () => {
  it.each([
    [false, false],
    [false, true],
    [true, false],
  ])(
    'makes zero publisher calls for opt-in=%s reuse-attestation=%s',
    async (enabled, reuseApproved) => {
      await canonicalSource()
      Object.assign(runtime, { enabled, reuseApproved })
      const before = await counts()
      await expect(clientFor().ingestion.run()).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        status: 412,
      })
      expect(publisher).not.toHaveBeenCalled()
      expect(await counts()).toEqual(before)
    },
  )

  it.each(['missing', 'disabled', 'noncanonical-url', 'decoy-identity'] as const)(
    'does not contact a publisher for %s source evidence',
    async (condition) => {
      runtime.enabled = true
      runtime.reuseApproved = true
      await db.importSource.deleteMany({ where: { runs: { none: {} }, posts: { none: {} } } })
      if (condition === 'disabled') await canonicalSource(false)
      if (condition === 'noncanonical-url')
        await canonicalSource(true, 'https://untrusted.example/')
      if (condition === 'decoy-identity')
        await db.importSource.create({
          data: {
            ...MONEYDIGEST_SOURCE,
            externalId: `synthetic-decoy-${randomUUID()}`,
            enabled: true,
          },
        })
      const before = await counts()
      await expect(clientFor().ingestion.run()).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        status: 412,
      })
      expect(publisher).not.toHaveBeenCalled()
      expect(await counts()).toEqual(before)
      const source = await db.importSource.findUniqueOrThrow({ where: sourceWhere })
      if (condition === 'missing' || condition === 'decoy-identity')
        expect(source.enabled).toBe(false)
      else
        expect(source).toMatchObject(
          condition === 'disabled' ? { enabled: false } : { url: 'https://untrusted.example/' },
        )
    },
  )

  it('separates canonical identity from display name and configured readiness from live acceptance', async () => {
    runtime.enabled = true
    runtime.reuseApproved = true
    const source = await canonicalSource()
    await db.importSource.update({
      where: { id: source.id },
      data: { name: 'Synthetic display label only' },
    })
    const before = await counts()
    const overview = await clientFor().platformAdmin.overview()
    expect(overview.readiness).toMatchObject({
      ingestionOptIn: true,
      reuseAttested: true,
      sourceRecordEnabled: true,
      sourceIdentityValid: true,
      importAllowed: true,
      oneMapConfigured: false,
      liveProviderAcceptance: 'NOT_ESTABLISHED',
    })
    expect(publisher).not.toHaveBeenCalled()
    expect(await counts()).toEqual(before)
    const result = await clientFor().ingestion.run()
    expect(result).toMatchObject({
      status: 'SUCCEEDED',
      fetchedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      failedCount: 0,
    })
    expect(publisher).toHaveBeenCalledExactlyOnceWith({ page: 1, perPage: 20 })
    expect(await db.ingestionRun.findUniqueOrThrow({ where: { id: result.runId } })).toMatchObject({
      sourceId: source.id,
      status: 'SUCCEEDED',
    })
  })

  it('reports enabled but wrong canonical URL as not importable without read-side effects', async () => {
    runtime.enabled = true
    runtime.reuseApproved = true
    await canonicalSource(true, 'https://untrusted.example/')
    const before = await counts()
    const overview = await clientFor().platformAdmin.overview()
    expect(overview.readiness).toMatchObject({
      ingestionOptIn: true,
      reuseAttested: true,
      sourceRecordEnabled: true,
      sourceIdentityValid: false,
      importAllowed: false,
      liveProviderAcceptance: 'NOT_ESTABLISHED',
    })
    expect(publisher).not.toHaveBeenCalled()
    expect(await counts()).toEqual(before)
    await expect(clientFor().ingestion.run()).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      status: 412,
    })
    expect(publisher).not.toHaveBeenCalled()
  })

  it('does not equate a configured OneMap search function with accepted live-provider evidence', async () => {
    const search = vi.fn<NonNullable<IngestionRuntime['searchLocations']>>().mockResolvedValue([])
    runtime.searchLocations = search
    const before = await counts()
    const overview = await clientFor().platformAdmin.overview()
    expect(overview.readiness).toMatchObject({
      oneMapConfigured: true,
      liveProviderAcceptance: 'NOT_ESTABLISHED',
    })
    expect(search).not.toHaveBeenCalled()
    expect(publisher).not.toHaveBeenCalled()
    expect(await counts()).toEqual(before)
  })
})

const match = {
  SEARCHVAL: 'Synthetic place',
  ADDRESS: 'Synthetic address',
  POSTAL: '123456',
  LATITUDE: '1.3',
  LONGITUDE: '103.8',
}
const results = { found: 1, totalNumPages: 1, pageNum: 1, results: [match] }
const authPayload = {
  access_token: 'synthetic-token-not-a-live-secret',
  expiry_timestamp: 4_000_000_000,
}
const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })

describe('real OneMap adapter with explicit mocked external fetch, actual protected search HTTP', () => {
  it('fails before transport when OneMap is not configured', async () => {
    await expect(
      clientFor().ingestion.searchLocations({ query: 'Synthetic place' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', status: 412 })
  })

  it.each([
    [
      'HTTP200 error plus valid results',
      { ...results, error: 'Synthetic provider unavailable' },
      200,
      false,
    ],
    ['HTTP200 auth error plus valid results', { ...results, error: 'Invalid token' }, 200, false],
    ['HTTP200 malformed error plus results', { ...results, error: {} }, 200, false],
    [
      'malformed coordinates',
      { ...results, results: [{ ...match, LATITUDE: 'not-a-number' }] },
      200,
      false,
    ],
    ['HTTP auth failure', {}, 401, false],
    ['authentication payload failure', { error: 'Synthetic authentication rejected' }, 200, true],
    ['HTTP provider failure', {}, 503, false],
  ] as const)(
    'never presents %s as search success or caches it',
    async (_name, payload, status, failsAuth) => {
      const providerFetch = vi.fn<typeof fetch>().mockImplementation(async (url) => {
        const authenticating = String(url).includes('/getToken')
        return authenticating && !failsAuth
          ? jsonResponse(authPayload)
          : jsonResponse(payload, status)
      })
      const provider = createOneMapClient({
        email: 'synthetic@onemap.example.test',
        password: 'synthetic-test-only-password',
        fetch: providerFetch,
      })
      runtime.searchLocations = provider.search
      for (let attempt = 0; attempt < 2; attempt++) {
        const callsBefore = providerFetch.mock.calls.length
        await expect(
          clientFor().ingestion.searchLocations({ query: 'Synthetic place' }),
        ).rejects.toMatchObject({
          code: 'BAD_GATEWAY',
          status: 502,
          message: 'Location provider unavailable',
        })
        expect(providerFetch.mock.calls.length).toBeGreaterThan(callsBefore)
      }
      expect(publisher).not.toHaveBeenCalled()
    },
  )

  it('maps the real bounded adapter timeout to non-success without a real provider connection', async () => {
    let signal: AbortSignal | null | undefined
    const providerFetch = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (String(url).includes('/getToken')) return jsonResponse(authPayload)
      signal = init?.signal
      return new Promise<Response>(() => {})
    })
    const provider = createOneMapClient({
      email: 'synthetic@onemap.example.test',
      password: 'synthetic-test-only-password',
      fetch: providerFetch,
    })
    runtime.searchLocations = provider.search
    await expect(
      clientFor().ingestion.searchLocations({ query: 'Synthetic timeout' }),
    ).rejects.toMatchObject({
      code: 'BAD_GATEWAY',
      status: 502,
      message: 'Location provider unavailable',
    })
    expect(signal?.aborted).toBe(true)
    expect(providerFetch).toHaveBeenCalledTimes(2)
  }, 20_000)

  it('returns only validated candidate fields for controlled successful provider evidence', async () => {
    const providerFetch = vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        jsonResponse(String(url).includes('/getToken') ? authPayload : results),
      )
    const provider = createOneMapClient({
      email: 'synthetic@onemap.example.test',
      password: 'synthetic-test-only-password',
      fetch: providerFetch,
    })
    runtime.searchLocations = provider.search
    expect(await clientFor().ingestion.searchLocations({ query: 'Synthetic place' })).toEqual({
      items: [
        {
          searchValue: 'Synthetic place',
          address: 'Synthetic address',
          postalCode: '123456',
          latitude: 1.3,
          longitude: 103.8,
        },
      ],
    })
    expect(
      await clientFor().ingestion.searchLocations({ query: 'Synthetic place' }),
    ).toHaveProperty('items')
    expect(providerFetch).toHaveBeenCalledTimes(2)
    expect(publisher).not.toHaveBeenCalled()
  })
})
