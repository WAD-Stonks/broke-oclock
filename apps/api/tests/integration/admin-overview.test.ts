import { execFile } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import type { IngestionRuntime } from '@api/modules/ingestion/runtime'
import { MONEYDIGEST_SOURCE } from '@api/modules/ingestion/source'
import { createApiClient } from '@broke-oclock/api-client'
import axios from 'axios'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'

const origin = 'http://localhost:5173'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
let baseURL = ''
let admin: { id: string; cookie: string }
let member: { id: string; cookie: string }
const listPosts = vi
  .fn<IngestionRuntime['listPosts']>()
  .mockRejectedValue(new Error('No publisher calls'))
const searchLocations = vi
  .fn<NonNullable<IngestionRuntime['searchLocations']>>()
  .mockRejectedValue(new Error('No OneMap calls'))
const runtime: IngestionRuntime = {
  enabled: true,
  reuseApproved: true,
  listPosts,
  now: () => new Date('2026-10-10T00:00:00.000Z'),
}
const signup = async () => {
  const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Synthetic overview account',
      email: `${randomUUID()}@example.test`,
      password: randomBytes(24).toString('base64url'),
    }),
  })
  expect(response.status).toBe(200)
  const body = await response.json()
  return {
    id: body.user.id as string,
    cookie: response.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; '),
  }
}
const http = (cookie = '') =>
  axios.create({
    baseURL,
    timeout: 10000,
    validateStatus: () => true,
    headers: cookie ? { Cookie: cookie } : {},
  })
const snapshot = async () =>
  (
    await Promise.all([
      db.user.findMany({ orderBy: { id: 'asc' } }),
      db.session.findMany({ orderBy: { id: 'asc' } }),
      db.platformAccessFence.findMany(),
      db.platformAudit.findMany(),
      db.importSource.findMany({ orderBy: { id: 'asc' } }),
      db.ingestionRun.findMany({ orderBy: { id: 'asc' } }),
      db.importedPost.findMany({ orderBy: { id: 'asc' } }),
      db.deal.findMany({ orderBy: { id: 'asc' } }),
      db.account.findMany({ orderBy: { id: 'asc' } }),
      db.verification.findMany({ orderBy: { id: 'asc' } }),
      db.merchantAccessRequest.findMany({ orderBy: { id: 'asc' } }),
      db.dealSource.findMany({ orderBy: { id: 'asc' } }),
    ])
  ).map((records) => createHash('sha256').update(JSON.stringify(records)).digest('hex'))
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    instanceOpts: [{ launchTimeout: 60000 }],
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`overview_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await promisify(execFile)('pnpm', ['--dir', 'packages/db', 'run', 'push'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    timeout: 60000,
  })
  db = (await import('@broke-oclock/db')).db
  const { createApp } = await import('@api/app')
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing local server')
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
  admin = await signup()
  member = await signup()
  await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
}, 180000)
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})
it('requires real cookie and current ADMIN and reads empty readiness without bootstrapping or provider calls', async () => {
  expect((await http().get('/api/admin/overview')).status).toBe(401)
  expect((await http(member.cookie).get('/api/admin/overview')).status).toBe(403)
  const before = await snapshot()
  const response = await http(admin.cookie).get('/api/admin/overview')
  expect(response.status).toBe(200)
  expect(response.headers['cache-control']).toBe('no-store')
  expect(response.data).toEqual({
    generatedAt: '2026-10-10T00:00:00.000Z',
    counts: { pendingMerchantRequests: 0, pendingImportedDrafts: 0, failedImportedPosts: 0 },
    recentRuns: [],
    readiness: {
      googleConfigured: false,
      emailConfigured: false,
      oneMapConfigured: false,
      ingestionOptIn: true,
      reuseAttested: true,
      sourceRecordEnabled: false,
      sourceIdentityValid: false,
      importAllowed: false,
      liveProviderAcceptance: 'NOT_ESTABLISHED',
    },
  })
  expect(await snapshot()).toEqual(before)
  expect(listPosts).not.toHaveBeenCalled()
  expect(searchLocations).not.toHaveBeenCalled()
})

it('counts exact pending queues and failed posts and projects the newest ten fixed-source runs through the frozen Axios client', async () => {
  const source = await db.importSource.create({ data: { ...MONEYDIGEST_SOURCE, enabled: true } })
  const unrelated = await db.importSource.create({
    data: { ...MONEYDIGEST_SOURCE, externalId: 'unrelated.example', enabled: true },
  })
  for (const status of ['PENDING', 'PENDING', 'APPROVED', 'REJECTED'] as const)
    await db.merchantAccessRequest.create({
      data: {
        userId: member.id,
        venueId: '0123456789abcdef01234567',
        userName: 'Synthetic',
        userEmail: 'synthetic@example.test',
        venueName: 'Synthetic',
        merchantName: 'Synthetic',
        message: 'Synthetic request',
        status,
      },
    })
  const post = await db.importedPost.create({
    data: {
      sourceId: source.id,
      externalId: 'pending',
      url: source.url,
      rawContent: '',
      contentHash: 'a'.repeat(64),
      status: 'NEEDS_REVIEW',
    },
  })
  const otherPost = await db.importedPost.create({
    data: {
      sourceId: unrelated.id,
      externalId: 'pending',
      url: unrelated.url,
      rawContent: '',
      contentHash: 'b'.repeat(64),
      status: 'FAILED',
    },
  })
  for (const externalId of ['failure-a', 'failure-b', 'failure-c'])
    await db.importedPost.create({
      data: {
        sourceId: source.id,
        externalId,
        url: source.url,
        rawContent: '',
        contentHash: 'c'.repeat(64),
        status: 'FAILED',
      },
    })
  for (const variant of [
    'pending-a',
    'pending-b',
    'approved',
    'rejected',
    'deleted',
    'user',
    'unrelated',
    'uncited',
  ]) {
    const deal = await db.deal.create({
      data: {
        title: variant,
        description: '',
        category: 'FOOD',
        offerType: 'BUY_ONE_GET_ONE',
        applicability: 'NO_FIXED_LOCATION',
        origin: variant === 'user' ? 'USER_SUBMITTED' : 'IMPORTED',
        reviewStatus:
          variant === 'approved' ? 'APPROVED' : variant === 'rejected' ? 'REJECTED' : 'PENDING',
        ...(variant === 'deleted' ? { deletedAt: new Date() } : {}),
      },
    })
    if (variant !== 'uncited')
      await db.dealSource.create({
        data: {
          dealId: deal.id,
          importedPostId: variant === 'unrelated' ? otherPost.id : post.id,
          sourceContentHash: 'a'.repeat(64),
          sourceContentSnapshot: '{}',
          sourceUrl: source.url,
        },
      })
  }
  for (let index = 0; index < 12; index++)
    await db.ingestionRun.create({
      data: {
        sourceId: source.id,
        startedAt: new Date('2026-10-09T00:00:00Z'),
        status: index === 0 ? 'FAILED' : index === 1 ? 'PARTIAL' : 'SUCCEEDED',
        failedCount: 99,
        errorCode: index === 0 ? 'UPSTREAM_ERROR' : null,
      },
    })
  await db.ingestionRun.create({
    data: { sourceId: unrelated.id, startedAt: new Date('2026-10-10T00:00:00Z'), status: 'FAILED' },
  })
  runtime.searchLocations = searchLocations
  const before = await snapshot()
  const transport = axios.create({
    baseURL: `${baseURL}/api`,
    adapter: 'http',
    headers: { Cookie: admin.cookie },
  })
  const factory = vi.spyOn(axios, 'create').mockReturnValueOnce(transport)
  const api = createApiClient(`${baseURL}/api`)
  factory.mockRestore()
  const overview = await api.platformAdmin.overview()
  expect(overview.counts).toEqual({
    pendingMerchantRequests: 2,
    pendingImportedDrafts: 2,
    failedImportedPosts: 3,
  })
  expect(overview.recentRuns).toEqual(
    (await http(admin.cookie).get('/api/ingestion/runs?limit=10')).data.items,
  )
  expect(overview.recentRuns).toHaveLength(10)
  const runs = await db.ingestionRun.findMany({
    where: { sourceId: source.id },
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    take: 10,
  })
  expect(overview.recentRuns.map((row) => row.id)).toEqual(runs.map((row) => row.id))
  expect(
    (await http(admin.cookie).get('/api/admin/merchant-requests?status=PENDING')).data.items,
  ).toHaveLength(overview.counts.pendingMerchantRequests)
  expect(
    (await http(admin.cookie).get('/api/ingestion/drafts?status=PENDING')).data.items,
  ).toHaveLength(overview.counts.pendingImportedDrafts)
  expect(overview.readiness).toMatchObject({
    oneMapConfigured: true,
    sourceRecordEnabled: true,
    sourceIdentityValid: true,
    importAllowed: true,
    liveProviderAcceptance: 'NOT_ESTABLISHED',
  })
  expect((await http(admin.cookie).head('/api/admin/overview')).status).toBe(200)
  expect(await snapshot()).toEqual(before)
  expect(listPosts).not.toHaveBeenCalled()
  expect(searchLocations).not.toHaveBeenCalled()
})
it('requires canonical URL, provider and externalId and every independent ingestion gate', async () => {
  const source = await db.importSource.findFirstOrThrow({
    where: { externalId: MONEYDIGEST_SOURCE.externalId },
  })
  const readiness = async () => (await http(admin.cookie).get('/api/admin/overview')).data.readiness
  for (const url of ['https://www.moneydigest.sg/spoof', 'https://evil.example/']) {
    await db.importSource.update({ where: { id: source.id }, data: { url } })
    expect(await readiness()).toMatchObject({
      sourceRecordEnabled: true,
      sourceIdentityValid: false,
      importAllowed: false,
    })
  }
  await db.importSource.update({ where: { id: source.id }, data: { url: MONEYDIGEST_SOURCE.url } })
  for (const data of [{ provider: 'TELEGRAM' as const }, { externalId: 'spoofed.example' }]) {
    await db.importSource.update({ where: { id: source.id }, data })
    expect(await readiness()).toMatchObject({ sourceIdentityValid: false, importAllowed: false })
    await db.importSource.update({
      where: { id: source.id },
      data: { provider: MONEYDIGEST_SOURCE.provider, externalId: MONEYDIGEST_SOURCE.externalId },
    })
  }
  await db.importSource.update({ where: { id: source.id }, data: { enabled: false } })
  expect(await readiness()).toMatchObject({
    sourceRecordEnabled: false,
    sourceIdentityValid: true,
    importAllowed: false,
  })
  await db.importSource.update({ where: { id: source.id }, data: { enabled: true } })
  runtime.enabled = false
  expect(await readiness()).toMatchObject({ ingestionOptIn: false, importAllowed: false })
  runtime.enabled = true
  runtime.reuseApproved = false
  expect(await readiness()).toMatchObject({ reuseAttested: false, importAllowed: false })
  runtime.reuseApproved = true
})
it('checks current role before protected reads, rejects hostile queries and does not mix concurrent cookie identities', async () => {
  const read = vi.spyOn(db.importSource, 'findUnique')
  try {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        http(index % 2 ? member.cookie : '').get('/api/admin/overview'),
      ),
    )
    expect(results.map((row) => row.status)).toEqual([401, 403, 401, 403, 401, 403, 401, 403])
    expect(read).not.toHaveBeenCalled()
    const admitted = await Promise.all([
      http(admin.cookie).get('/api/admin/overview'),
      http(member.cookie).get('/api/admin/overview'),
    ])
    expect(admitted.map((row) => row.status)).toEqual([200, 403])
    read.mockClear()
    await db.user.update({ where: { id: admin.id }, data: { role: 'USER' } })
    const denied = await http(admin.cookie).get('/api/admin/overview?unknown=1')
    expect(denied.status).toBe(403)
    expect(denied.headers['cache-control']).toBe('no-store')
    expect(read).not.toHaveBeenCalled()
    await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
    for (const query of [
      '?unknown=1',
      '?limit=1',
      '?source=other&source=another',
      `?${'&'.repeat(1001)}`,
    ]) {
      expect((await http(admin.cookie).get(`/api/admin/overview${query}`)).status).toBe(400)
      expect((await http().get(`/api/auth-methods${query}`)).status).toBe(400)
    }
    expect(read).not.toHaveBeenCalled()
  } finally {
    read.mockRestore()
  }
})
it('rejects unsupported methods without writes and preserves existing me and trusted-origin body contracts', async () => {
  const before = await snapshot()
  for (const path of ['/api/auth-methods', '/api/admin/overview']) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const response = await http(admin.cookie).request({ method, url: path })
      expect(response.status).toBe(405)
      expect(response.headers.allow).toBe('GET')
    }
    expect(
      (await http(admin.cookie).get(path, { headers: { Origin: 'https://untrusted.example' } }))
        .status,
    ).toBe(200)
    expect(
      (
        await http(admin.cookie).post(path, 'not json', {
          headers: { 'Content-Type': 'text/plain' },
        })
      ).status,
    ).toBe(415)
  }
  expect((await http().get('/api/me')).data).toEqual({ error: 'Unauthorized' })
  expect(await snapshot()).toEqual(before)
})
it('rejects association OPTIONS before CORS without resolving identities or changing records', async () => {
  const before = await snapshot()
  const path = '/api/ingestion/drafts/0123456789abcdef01234567/outlet'
  for (const client of [http(), http(admin.cookie), http(member.cookie)]) {
    const response = await client.options(path, {
      headers: { Origin: origin, 'Access-Control-Request-Method': 'PATCH' },
    })
    expect(response.status).toBe(405)
    expect(response.headers.allow).toBe('PATCH')
  }
  expect(await snapshot()).toEqual(before)
})

it('does not refresh aged native sessions on overview GET or HEAD', async () => {
  await db.session.updateMany({
    where: { userId: admin.id },
    data: {
      expiresAt: new Date(Date.now() + 3600000),
      updatedAt: new Date(Date.now() - 172800000),
    },
  })
  const before = await snapshot()
  expect((await http(admin.cookie).get('/api/admin/overview')).status).toBe(200)
  expect((await http(admin.cookie).head('/api/admin/overview')).status).toBe(200)
  expect(await snapshot()).toEqual(before)
})

it('rejects an expired native cookie on overview GET and HEAD without deleting session evidence', async () => {
  const expired = await signup()
  await db.user.update({ where: { id: expired.id }, data: { role: 'ADMIN' } })
  await db.session.updateMany({
    where: { userId: expired.id },
    data: { expiresAt: new Date(Date.now() - 60000) },
  })
  const before = await snapshot()
  expect((await http(expired.cookie).get('/api/admin/overview')).status).toBe(401)
  expect((await http(expired.cookie).head('/api/admin/overview')).status).toBe(401)
  expect(await snapshot()).toEqual(before)
})

it('surfaces protected query failures safely instead of fabricating zero and rejects revoked native cookies', async () => {
  const before = await snapshot()
  const failure = vi
    .spyOn(db.importedPost, 'count')
    .mockRejectedValueOnce(new Error('Synthetic secret diagnostic'))
  try {
    const response = await http(admin.cookie).get('/api/admin/overview')
    expect(response.status).toBe(500)
    expect(response.data).toEqual({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
    })
    expect(response.headers['cache-control']).toBe('no-store')
    expect(await snapshot()).toEqual(before)
  } finally {
    failure.mockRestore()
  }
  await db.session.deleteMany({ where: { userId: admin.id } })
  expect((await http(admin.cookie).get('/api/admin/overview')).status).toBe(401)
  expect((await http(admin.cookie).get('/api/auth-methods')).status).toBe(200)
})
