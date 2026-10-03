import { execFile } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import type { IngestionRuntime } from '@api/modules/ingestion/runtime'
import { MONEYDIGEST_SOURCE, sourceWhere } from '@api/modules/ingestion/source'
import type { AppRouter } from '@api/trpc/root'
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const origin = 'http://localhost:5173'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
let baseURL = ''
let clock = new Date('2026-10-03T00:00:00.000Z')
const syntheticPost = (
  id = 101,
  content = 'Singapore pizza 1-for-1. Valid from 1 October 2026 until 31 December 2026.',
) => ({
  id,
  link: `https://www.moneydigest.sg/synthetic-${id}/`,
  date: '2026-10-01T12:00:00',
  title: { rendered: 'Synthetic Pizza' },
  content: { rendered: content },
  excerpt: { rendered: '' },
})
const listPosts = vi.fn<IngestionRuntime['listPosts']>().mockResolvedValue([syntheticPost()])
const runtime: IngestionRuntime = {
  enabled: false,
  reuseApproved: false,
  now: () => clock,
  listPosts,
}

let admin: { id: string; cookie: string }
let member: { id: string; cookie: string }
let moderator: { id: string; cookie: string }
const clientFor = (cookie = '', requestOrigin = origin) =>
  createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseURL}/api/trpc`,
        fetch: (input, init) => {
          const headers = new Headers(init?.headers)
          headers.set('Origin', requestOrigin)
          if (cookie) headers.set('Cookie', cookie)
          return fetch(input, { ...init, headers })
        },
      }),
    ],
  })
const signUp = async (name: string) => {
  const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      name,
      email: `synthetic-${randomUUID()}@example.test`,
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
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`ingestion_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await promisify(execFile)('bun', ['run', '--cwd', 'packages/db', 'push'], {
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
  admin = await signUp('Synthetic admin')
  member = await signUp('Synthetic member')
  moderator = await signUp('Synthetic moderator')
  await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
  await db.user.update({ where: { id: moderator.id }, data: { role: 'MODERATOR' } })
}, 180_000)
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})
describe('ingestion admin real HTTP/session/disposable Mongo', () => {
  it('rejects anonymous, USER and MODERATOR and rechecks demoted admins using the same cookie', async () => {
    await expect(clientFor().ingestion.dashboard.query()).rejects.toMatchObject({
      data: { code: 'UNAUTHORIZED' },
    })
    for (const account of [member, moderator])
      await expect(clientFor(account.cookie).ingestion.dashboard.query()).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
      })
    await expect(clientFor(admin.cookie).ingestion.dashboard.query()).resolves.toMatchObject({
      source: {
        name: 'MoneyDigest',
        enabled: false,
        reuseApproved: false,
        onemapConfigured: false,
      },
      counts: { pending: 0, approved: 0, rejected: 0, failed: 0 },
    })
    await db.user.update({ where: { id: admin.id }, data: { role: 'USER' } })
    await expect(clientFor(admin.cookie).ingestion.dashboard.query()).rejects.toMatchObject({
      data: { code: 'FORBIDDEN' },
    })
    await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
  })
  it('fails closed at each gate without provider calls and bootstraps a disabled fixed source', async () => {
    const client = clientFor(admin.cookie)
    await expect(client.ingestion.run.mutate()).rejects.toMatchObject({
      data: { code: 'PRECONDITION_FAILED' },
    })
    runtime.enabled = true
    await expect(client.ingestion.run.mutate()).rejects.toMatchObject({
      data: { code: 'PRECONDITION_FAILED' },
    })
    runtime.reuseApproved = true
    await expect(client.ingestion.run.mutate()).rejects.toMatchObject({
      data: { code: 'PRECONDITION_FAILED' },
    })
    const source = await db.importSource.findUniqueOrThrow({
      where: { provider_externalId: { provider: 'WORDPRESS', externalId: 'moneydigest.sg' } },
    })
    expect(source).toMatchObject({ enabled: false, url: 'https://www.moneydigest.sg/' })
    expect(listPosts).not.toHaveBeenCalled()
    await db.importSource.update({ where: { id: source.id }, data: { enabled: true } })
  })
  it('imports one bounded page atomically and is idempotent after a durable cooldown', async () => {
    const client = clientFor(admin.cookie)
    const run = await client.ingestion.run.mutate()
    expect(run).toMatchObject({
      status: 'SUCCEEDED',
      fetchedCount: 1,
      createdCount: 1,
      updatedCount: 0,
      failedCount: 0,
    })
    expect(listPosts).toHaveBeenCalledWith({ page: 1, perPage: 20 })
    const imported = await db.importedPost.findFirstOrThrow({
      where: { externalId: '101' },
      include: { deals: { include: { deal: true } } },
    })
    expect(imported).toMatchObject({
      status: 'NEEDS_REVIEW',
      processedContentHash: imported.contentHash,
    })
    expect(imported.deals[0]?.deal).toMatchObject({
      reviewStatus: 'PENDING',
      contentVersion: 1,
      applicability: 'NO_FIXED_LOCATION',
      merchantId: null,
      publishedAt: null,
    })
    expect(imported.deals[0]?.sourceContentHash).toBe(imported.contentHash)
    expect(
      createHash('sha256')
        .update(imported.deals[0]?.sourceContentSnapshot ?? '')
        .digest('hex'),
    ).toBe(imported.contentHash)
    const source = await db.importSource.findUniqueOrThrow({ where: { id: imported.sourceId } })
    expect(source.leaseToken).toBeNull()
    await expect(client.ingestion.run.mutate()).rejects.toMatchObject({
      data: { code: 'TOO_MANY_REQUESTS' },
    })
    clock = new Date(clock.getTime() + 30_000)
    expect(await client.ingestion.run.mutate()).toMatchObject({ createdCount: 0, updatedCount: 0 })
    expect(await db.deal.count()).toBe(1)
    expect(await db.ingestionRun.count()).toBe(2)
  })
  it('lists bounded explicit queue/run/account DTOs and approves exactly the reviewed version', async () => {
    const client = clientFor(admin.cookie)
    const queue = await client.ingestion.queue.query({ limit: 1, status: 'PENDING' })
    expect(queue.items).toHaveLength(1)
    const deal = queue.items[0]
    if (!deal) throw new Error('Missing imported draft')
    expect(deal).toMatchObject({
      title: 'Synthetic Pizza',
      sourceName: 'MoneyDigest',
      sourceUrl: 'https://www.moneydigest.sg/synthetic-101/',
      reviewReady: true,
      contentVersion: 1,
    })
    expect(deal).not.toHaveProperty('rawContent')
    await expect(
      clientFor(admin.cookie, 'https://hostile.test').ingestion.review.mutate({
        dealId: deal.id,
        expectedContentVersion: 1,
        decision: 'APPROVE',
        note: 'Synthetic evidence checked',
      }),
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } })
    await expect(
      client.ingestion.review.mutate({
        dealId: deal.id,
        expectedContentVersion: 2,
        decision: 'APPROVE',
        note: 'Synthetic evidence checked',
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } })
    expect(
      await client.ingestion.review.mutate({
        dealId: deal.id,
        expectedContentVersion: 1,
        decision: 'APPROVE',
        note: 'Synthetic evidence checked',
      }),
    ).toEqual({ id: deal.id, reviewStatus: 'APPROVED' })
    const stored = await db.deal.findUniqueOrThrow({ where: { id: deal.id } })
    expect(stored).toMatchObject({
      reviewedVersion: 1,
      reviewedById: admin.id,
      reviewNote: 'Synthetic evidence checked',
      publishedAt: expect.any(Date),
    })
    await expect(
      client.ingestion.review.mutate({
        dealId: deal.id,
        expectedContentVersion: 1,
        decision: 'REJECT',
        note: 'Duplicate review',
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } })
    const runs = await client.ingestion.runs.query({ limit: 1 })
    expect(runs.items).toHaveLength(1)
    expect(runs.items[0]).toMatchObject({
      sourceName: 'MoneyDigest',
      status: 'SUCCEEDED',
      startedAt: expect.any(String),
      finishedAt: expect.any(String),
    })
    const accounts = await client.ingestion.accounts.query({ limit: 2 })
    expect(accounts.items).toHaveLength(2)
    expect(accounts.nextCursor).toBe(accounts.items[1]?.id)
    expect(Object.keys(accounts.items[0] ?? {}).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
      'role',
    ])
    expect(
      (
        await client.ingestion.accounts.query({
          limit: 2,
          cursor: accounts.nextCursor ?? undefined,
        })
      ).items,
    ).toHaveLength(1)
    for (const limit of [0, 51])
      await expect(client.ingestion.accounts.query({ limit })).rejects.toMatchObject({
        data: { code: 'BAD_REQUEST' },
      })
    await expect(clientFor(moderator.cookie).ingestion.accounts.query()).rejects.toMatchObject({
      data: { code: 'FORBIDDEN' },
    })
    await expect(
      client.ingestion.searchLocations.query({ query: 'Synthetic place' }),
    ).rejects.toMatchObject({ data: { code: 'PRECONDITION_FAILED' } })
    const search = vi.fn().mockResolvedValue([
      {
        searchValue: 'Synthetic place',
        address: 'Synthetic address',
        postalCode: '123456',
        latitude: 1.3,
        longitude: 103.8,
      },
    ])
    runtime.searchLocations = search
    expect(
      (await client.ingestion.searchLocations.query({ query: ' Synthetic place ' })).items,
    ).toHaveLength(1)
    expect(search).toHaveBeenCalledWith('Synthetic place')
    expect((await client.ingestion.dashboard.query()).counts).toMatchObject({
      pending: 0,
      approved: 1,
    })
  })

  it('isolates malformed posts and preserves approved content and immutable snapshots on source edits', async () => {
    const client = clientFor(admin.cookie)
    const original = await db.deal.findFirstOrThrow({
      where: { reviewStatus: 'APPROVED' },
      include: { sources: true },
    })
    clock = new Date(clock.getTime() + 30_000)
    listPosts.mockResolvedValueOnce([
      syntheticPost(101, 'Singapore pizza 50% off. Valid until 31 December 2026.'),
      { ...syntheticPost(102), content: { rendered: 'x'.repeat(100_001) } },
      syntheticPost(103, 'Singapore coffee 1-for-1. Valid until 31 December.'),
      syntheticPost(104),
    ])
    expect(await client.ingestion.run.mutate()).toMatchObject({
      status: 'PARTIAL',
      fetchedCount: 4,
      createdCount: 2,
      updatedCount: 0,
      failedCount: 1,
    })
    expect(
      await db.deal.findUniqueOrThrow({ where: { id: original.id }, include: { sources: true } }),
    ).toEqual(original)
    expect(await db.importedPost.findFirstOrThrow({ where: { externalId: '101' } })).toMatchObject({
      status: 'NEEDS_REVIEW',
      errorCode: 'SOURCE_CHANGED',
    })
    expect(await db.importedPost.findFirstOrThrow({ where: { externalId: '102' } })).toMatchObject({
      status: 'FAILED',
      errorCode: 'MALFORMED_POST',
      rawContent: '',
    })
    const unknown = (await client.ingestion.queue.query()).items.find((item) =>
      item.sourceUrl.endsWith('/synthetic-103/'),
    )
    if (!unknown) throw new Error('Missing unknown-validity draft')
    expect(unknown).toMatchObject({ validUntil: null, reviewReady: false })
    await expect(
      client.ingestion.review.mutate({
        dealId: unknown.id,
        expectedContentVersion: unknown.contentVersion,
        decision: 'APPROVE',
        note: 'Unclear expiry',
      }),
    ).rejects.toMatchObject({ data: { code: 'PRECONDITION_FAILED' } })
    expect(
      await client.ingestion.review.mutate({
        dealId: unknown.id,
        expectedContentVersion: unknown.contentVersion,
        decision: 'REJECT',
        note: 'Unclear expiry',
      }),
    ).toEqual({ id: unknown.id, reviewStatus: 'REJECTED' })
    expect((await client.ingestion.dashboard.query()).counts).toMatchObject({
      pending: 1,
      approved: 1,
      rejected: 1,
      failed: 1,
    })
  })
  it('records safe provider failures and releases its lease without exposing the provider message', async () => {
    clock = new Date(clock.getTime() + 30_000)
    listPosts.mockRejectedValueOnce(
      Object.assign(new Error('private body credential-secret'), { code: 'TIMEOUT' }),
    )
    const result = await clientFor(admin.cookie).ingestion.run.mutate()
    expect(result).toMatchObject({ status: 'FAILED', fetchedCount: 0, failedCount: 0 })
    const run = await db.ingestionRun.findUniqueOrThrow({ where: { id: result.runId } })
    expect(run.errorCode).toBe('TIMEOUT')
    expect(JSON.stringify(await clientFor(admin.cookie).ingestion.runs.query())).not.toContain(
      'credential-secret',
    )
    expect(
      (await db.importSource.findUniqueOrThrow({ where: { id: run.sourceId } })).leaseToken,
    ).toBeNull()
  })
  it('fences expired lease ownership and owner-token releases', async () => {
    const { acquireLease, releaseLease } = await import('@api/modules/ingestion/service')
    clock = new Date(clock.getTime() + 30_000)
    const first = await acquireLease(db, clock)
    await expect(acquireLease(db, clock)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect((await releaseLease(db, first.sourceId, 'not-the-owner')).count).toBe(0)
    clock = new Date(clock.getTime() + 120_000)
    const replacement = await acquireLease(db, clock)
    expect((await releaseLease(db, first.sourceId, first.token)).count).toBe(0)
    expect(
      (await db.importSource.findUniqueOrThrow({ where: { id: first.sourceId } })).leaseToken,
    ).toBe(replacement.token)
    await releaseLease(db, replacement.sourceId, replacement.token)
  })

  it('atomically awards only one lease to simultaneous acquire attempts', async () => {
    const { acquireLease, releaseLease } = await import('@api/modules/ingestion/service')
    clock = new Date(clock.getTime() + 30_000)
    const outcomes = await Promise.allSettled([acquireLease(db, clock), acquireLease(db, clock)])
    const winners = outcomes.filter((outcome) => outcome.status === 'fulfilled')
    expect(winners).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')[0]).toMatchObject({
      reason: { code: 'CONFLICT' },
    })
    const winner = winners[0]
    if (winner?.status === 'fulfilled')
      await releaseLease(db, winner.value.sourceId, winner.value.token)
  })

  it('supersedes changed pending drafts without rewriting their pinned source snapshot', async () => {
    const old = await db.deal.findFirstOrThrow({
      where: { reviewStatus: 'PENDING' },
      include: { sources: true },
    })
    clock = new Date(clock.getTime() + 30_000)
    listPosts.mockResolvedValueOnce([
      syntheticPost(
        104,
        'Singapore pizza 1-for-1. Valid from 1 October 2026 until 30 December 2026.',
      ),
    ])
    expect(await clientFor(admin.cookie).ingestion.run.mutate()).toMatchObject({
      createdCount: 0,
      updatedCount: 1,
    })
    const superseded = await db.deal.findUniqueOrThrow({
      where: { id: old.id },
      include: { sources: true },
    })
    expect(superseded).toMatchObject({
      reviewStatus: 'REJECTED',
      contentVersion: old.contentVersion + 1,
      reviewedVersion: null,
      reviewedById: null,
      publishedAt: null,
    })
    expect(superseded.sources).toEqual(old.sources)
    const replacement = (await clientFor(admin.cookie).ingestion.queue.query()).items[0]
    expect(replacement).toMatchObject({ contentVersion: old.contentVersion + 1, reviewReady: true })
    expect(replacement?.id).not.toBe(old.id)
    await expect(
      clientFor(admin.cookie).ingestion.review.mutate({
        dealId: old.id,
        expectedContentVersion: old.contentVersion,
        decision: 'APPROVE',
        note: 'Stale content',
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } })
  })
  it('allows only one concurrent review decision for the same content version', async () => {
    const draft = (await clientFor(admin.cookie).ingestion.queue.query()).items[0]
    if (!draft) throw new Error('Missing pending revision')
    const results = await Promise.allSettled(
      ['APPROVE', 'REJECT'].map((decision) =>
        clientFor(admin.cookie).ingestion.review.mutate({
          dealId: draft.id,
          expectedContentVersion: draft.contentVersion,
          decision: decision as 'APPROVE' | 'REJECT',
          note: 'Synthetic concurrent decision',
        }),
      ),
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')[0]).toMatchObject({
      reason: { data: { code: 'CONFLICT' } },
    })
  })
  it('permits only one concurrent HTTP source request and fences stale post writes after expiry', async () => {
    clock = new Date(clock.getTime() + 30_000)
    let settle: (posts: readonly unknown[]) => void = () => {
      throw new Error('Missing request barrier')
    }
    let requestStarted: () => void = () => {
      throw new Error('Missing request barrier')
    }
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve
    })
    listPosts.mockImplementationOnce(() => {
      requestStarted()
      return new Promise((resolve) => {
        settle = resolve
      })
    })
    const first = clientFor(admin.cookie).ingestion.run.mutate()
    await started
    await expect(clientFor(admin.cookie).ingestion.run.mutate()).rejects.toMatchObject({
      data: { code: 'CONFLICT' },
    })
    clock = new Date(clock.getTime() + 120_000)
    listPosts.mockResolvedValueOnce([syntheticPost(105)])
    expect(await clientFor(admin.cookie).ingestion.run.mutate()).toMatchObject({
      status: 'SUCCEEDED',
      createdCount: 1,
    })
    settle([syntheticPost(106)])
    expect(await first).toMatchObject({ status: 'FAILED', failedCount: 1 })
    expect(await db.importedPost.count({ where: { externalId: '106' } })).toBe(0)
  })

  it('retains changed approved citations across an identical reimport and recovers failed posts', async () => {
    clock = new Date(clock.getTime() + 30_000)
    listPosts.mockResolvedValueOnce([
      syntheticPost(101, 'Singapore pizza 50% off. Valid until 31 December 2026.'),
      syntheticPost(102),
    ])
    expect(await clientFor(admin.cookie).ingestion.run.mutate()).toMatchObject({
      status: 'SUCCEEDED',
      createdCount: 1,
    })
    expect(await db.importedPost.findFirstOrThrow({ where: { externalId: '101' } })).toMatchObject({
      status: 'NEEDS_REVIEW',
      errorCode: 'SOURCE_CHANGED',
    })
    expect(await db.importedPost.findFirstOrThrow({ where: { externalId: '102' } })).toMatchObject({
      status: 'NEEDS_REVIEW',
      errorCode: null,
      processedContentHash: expect.any(String),
    })
    const queue = await clientFor(admin.cookie).ingestion.queue.query({ limit: 1 })
    expect(queue.items).toHaveLength(1)
    expect(queue.nextCursor).toBe(queue.items[0]?.id)
    expect(
      (
        await clientFor(admin.cookie).ingestion.queue.query({
          cursor: queue.nextCursor ?? undefined,
        })
      ).items,
    ).toHaveLength(1)
    expect(
      (await clientFor(admin.cookie).ingestion.queue.query({ status: 'APPROVED' })).items.find(
        (row) => row.sourceUrl.endsWith('/synthetic-101/'),
      )?.reviewReady,
    ).toBe(false)
    for (const account of [member, moderator]) {
      await expect(clientFor(account.cookie).ingestion.run.mutate()).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
      })
      await expect(clientFor(account.cookie).ingestion.queue.query()).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
      })
      await expect(
        clientFor(account.cookie).ingestion.searchLocations.query({ query: 'Synthetic place' }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } })
    }
    await expect(
      clientFor(admin.cookie).ingestion.queue.query({ limit: 51 }),
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } })
    await expect(
      clientFor(admin.cookie).ingestion.queue.query({ cursor: 'not-an-object-id' }),
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } })
    const lookup = vi.fn().mockRejectedValue(new Error('provider password=synthetic-secret'))
    runtime.searchLocations = lookup
    await expect(
      clientFor(admin.cookie).ingestion.searchLocations.query({ query: 'Synthetic place' }),
    ).rejects.toMatchObject({
      message: 'Location provider unavailable',
      data: { code: 'BAD_GATEWAY' },
    })
    expect(await db.venue.count()).toBe(0)
  })

  it.each([
    ['withdrawal', 201],
    ['failed-post update', 202],
  ] as const)(
    'blocks approval when concurrent source %s commits after the evidence read',
    async (change, id) => {
      runtime.enabled = true
      runtime.reuseApproved = true
      await db.importSource.upsert({
        where: sourceWhere,
        create: { ...MONEYDIGEST_SOURCE, enabled: true },
        update: { enabled: true },
      })
      const client = clientFor(admin.cookie)
      clock = new Date(clock.getTime() + 30_000)
      listPosts.mockResolvedValueOnce([syntheticPost(id), syntheticPost(id + 10)])
      expect(await client.ingestion.run.mutate()).toMatchObject({ createdCount: 2 })
      const pending = await db.deal.findFirstOrThrow({
        where: { sources: { some: { importedPost: { externalId: String(id) } } } },
        include: { sources: true },
      })
      const protectedDeal = await db.deal.findFirstOrThrow({
        where: { sources: { some: { importedPost: { externalId: String(id + 10) } } } },
      })
      await client.ingestion.review.mutate({
        dealId: protectedDeal.id,
        expectedContentVersion: protectedDeal.contentVersion,
        decision: 'APPROVE',
        note: 'Synthetic approved snapshot to preserve',
      })
      const approved = await db.deal.findUniqueOrThrow({
        where: { id: protectedDeal.id },
        include: { sources: true },
      })

      let signalRead = () => {}
      let resumeReview = () => {}
      const evidenceRead = new Promise<void>((resolve) => {
        signalRead = resolve
      })
      const resume = new Promise<void>((resolve) => {
        resumeReview = resolve
      })
      const transact = db.$transaction.bind(db)
      let paused = false
      // Only insert a barrier after the real Prisma evidence read. All queries,
      // writes, sessions and HTTP/tRPC calls still execute against the replica.
      const transactionSpy = vi.spyOn(db, '$transaction').mockImplementation((operation, options) =>
        transact(async (tx) => {
          const instrumented = new Proxy(tx, {
            get(target, property, receiver) {
              if (property !== 'deal') return Reflect.get(target, property, receiver)
              return new Proxy(target.deal, {
                get(delegate, method, delegateReceiver) {
                  if (method !== 'findFirst') return Reflect.get(delegate, method, delegateReceiver)
                  return async (...args: Parameters<typeof delegate.findFirst>) => {
                    const row = await delegate.findFirst(...args)
                    if (row?.id === pending.id && !paused) {
                      paused = true
                      signalRead()
                      await resume
                    }
                    return row
                  }
                },
              })
            },
          })
          return operation(instrumented)
        }, options),
      )
      const approval = client.ingestion.review
        .mutate({
          dealId: pending.id,
          expectedContentVersion: pending.contentVersion,
          decision: 'APPROVE',
          note: 'Synthetic evidence read before concurrent change',
        })
        .then(
          (value) => ({ status: 'fulfilled' as const, value }),
          (reason: unknown) => ({ status: 'rejected' as const, reason }),
        )
      try {
        await Promise.race([
          evidenceRead,
          approval.then(() => {
            throw new Error('Review completed before reaching the evidence-read barrier')
          }),
        ])
        clock = new Date(clock.getTime() + 30_000)
        const changedPost = (postId: number) =>
          syntheticPost(
            postId,
            change === 'withdrawal'
              ? 'Singapore pizza restaurant opening news; no promotion remains.'
              : 'x'.repeat(100_001),
          )
        listPosts.mockResolvedValueOnce([changedPost(id), changedPost(id + 10)])
        expect(await client.ingestion.run.mutate()).toMatchObject({
          status: change === 'withdrawal' ? 'SUCCEEDED' : 'FAILED',
          createdCount: 0,
          updatedCount: 0,
          failedCount: change === 'withdrawal' ? 0 : 2,
        })
        // The ingestion transaction has committed, without writing either Deal.
        expect(
          await db.importedPost.findFirstOrThrow({ where: { externalId: String(id) } }),
        ).toMatchObject({
          status: change === 'withdrawal' ? 'NEEDS_REVIEW' : 'FAILED',
          errorCode: change === 'withdrawal' ? 'SOURCE_CHANGED' : 'MALFORMED_POST',
        })
        expect(
          await db.deal.findUniqueOrThrow({
            where: { id: pending.id },
            include: { sources: true },
          }),
        ).toEqual(pending)
        resumeReview()
        expect(await approval).toMatchObject({
          status: 'rejected',
          reason: { data: { code: 'CONFLICT' } },
        })
        expect(
          await db.deal.findUniqueOrThrow({
            where: { id: pending.id },
            include: { sources: true },
          }),
        ).toEqual(pending)
        expect(
          await db.deal.findUniqueOrThrow({
            where: { id: approved.id },
            include: { sources: true },
          }),
        ).toEqual(approved)
        const queue = await client.ingestion.queue.query({ limit: 50 })
        expect(queue.items.find((item) => item.id === pending.id)?.reviewReady).toBe(false)
        await expect(
          client.ingestion.review.mutate({
            dealId: pending.id,
            expectedContentVersion: pending.contentVersion,
            decision: 'APPROVE',
            note: 'Retry after evidence change',
          }),
        ).rejects.toMatchObject({ data: { code: 'PRECONDITION_FAILED' } })
      } finally {
        resumeReview()
        await approval
        transactionSpy.mockRestore()
      }
    },
  )
  it.each([
    [301, 'Singapore pizza promotion S$5.50 or S$ 6.5', true],
    [302, 'Singapore pizza promotion S$5.50 or S$ 6.50', false],
    [303, 'Singapore pizza 50% off or 2.50 % off', true],
    [304, 'Singapore chicken buy one, get one 50% off', true],
  ] as const)(
    'blocks parser bypass %i through real ingestion, queue and review',
    async (id, offer, ignored) => {
      runtime.enabled = true
      runtime.reuseApproved = true
      await db.importSource.upsert({
        where: sourceWhere,
        create: { ...MONEYDIGEST_SOURCE, enabled: true },
        update: { enabled: true },
      })
      clock = new Date(clock.getTime() + 30_000)
      listPosts.mockResolvedValueOnce([
        syntheticPost(id, `${offer}. Valid from 1 October 2026 until 31 December 2026.`),
      ])
      const client = clientFor(admin.cookie)
      expect(await client.ingestion.run.mutate()).toMatchObject({
        status: 'SUCCEEDED',
        fetchedCount: 1,
        failedCount: 0,
      })
      const imported = await db.importedPost.findFirstOrThrow({
        where: { externalId: String(id) },
        include: { deals: { include: { deal: { include: { sources: true } } } } },
      })
      const queue = await client.ingestion.queue.query({ limit: 50 })
      const draft = imported.deals[0]?.deal
      if (draft) {
        // On RED these concrete offers reach APPROVED through the real procedure.
        // On GREEN only the supported conflicting prices retain an unready draft.
        await expect(
          client.ingestion.review.mutate({
            dealId: draft.id,
            expectedContentVersion: draft.contentVersion,
            decision: 'APPROVE',
            note: 'Synthetic parser bypass must not publish',
          }),
        ).rejects.toMatchObject({ data: { code: 'PRECONDITION_FAILED' } })
        expect(queue.items.find((item) => item.id === draft.id)).toMatchObject({
          reviewReady: false,
        })
        // Amounts are intentionally not exposed in the queue DTO; assert them
        // against the real persisted draft rather than inventing response fields.
        expect(draft).toMatchObject({ priceMinor: null, discountPercent: null })
        expect(
          await db.deal.findUniqueOrThrow({ where: { id: draft.id }, include: { sources: true } }),
        ).toEqual(draft)
      }
      expect(imported.status).toBe(ignored ? 'IGNORED' : 'NEEDS_REVIEW')
      expect(imported.deals).toHaveLength(ignored ? 0 : 1)
      if (ignored)
        expect(queue.items.some((item) => item.sourceUrl.endsWith(`/synthetic-${id}/`))).toBe(false)
      expect(
        await db.deal.count({
          where: {
            sources: { some: { importedPost: { externalId: String(id) } } },
            reviewStatus: 'APPROVED',
          },
        }),
      ).toBe(0)
    },
  )
  it.each([
    [311, 'Singapore pizza promotion S$5.50', 'FIXED_PRICE', 550, null],
    [312, 'Singapore pizza 50% off', 'PERCENT_OFF', null, 50],
    [313, 'Singapore chicken buy one get one free', 'BUY_ONE_GET_ONE', null, null],
    [314, 'Singapore pizza promotion S$&#160;5.50', 'FIXED_PRICE', 550, null],
    [315, 'Singapore pizza 50<br>% off', 'PERCENT_OFF', null, 50],
    [316, 'Singapore chicken buy one,\nget one free', 'BUY_ONE_GET_ONE', null, null],
    [317, 'Singapore pizza 1-for-1', 'BUY_ONE_GET_ONE', null, null],
    [318, 'Singapore pizza one-for-one', 'BUY_ONE_GET_ONE', null, null],
    [319, 'Singapore pizza 50% off. One forecast available', 'PERCENT_OFF', null, 50],
  ] as const)(
    'still approves known-valid parser offer %i through real HTTP and Prisma',
    async (id, offer, offerType, priceMinor, discountPercent) => {
      runtime.enabled = true
      runtime.reuseApproved = true
      await db.importSource.upsert({
        where: sourceWhere,
        create: { ...MONEYDIGEST_SOURCE, enabled: true },
        update: { enabled: true },
      })
      clock = new Date(clock.getTime() + 30_000)
      listPosts.mockResolvedValueOnce([
        syntheticPost(id, `${offer}. Valid from 1 October 2026 until 31 December 2026.`),
      ])
      const client = clientFor(admin.cookie)
      expect(await client.ingestion.run.mutate()).toMatchObject({
        status: 'SUCCEEDED',
        createdCount: 1,
        failedCount: 0,
      })
      const draft = await db.deal.findFirstOrThrow({
        where: { sources: { some: { importedPost: { externalId: String(id) } } } },
        include: { sources: true },
      })
      expect(draft).toMatchObject({
        reviewStatus: 'PENDING',
        publishedAt: null,
        offerType,
        priceMinor,
        discountPercent,
      })
      const queue = await client.ingestion.queue.query({ limit: 50 })
      expect(queue.items.find((item) => item.id === draft.id)?.reviewReady).toBe(true)
      expect(
        await client.ingestion.review.mutate({
          dealId: draft.id,
          expectedContentVersion: draft.contentVersion,
          decision: 'APPROVE',
          note: 'Synthetic supported offer remains exact',
        }),
      ).toEqual({ id: draft.id, reviewStatus: 'APPROVED' })
      const approved = await db.deal.findUniqueOrThrow({
        where: { id: draft.id },
        include: { sources: true },
      })
      expect(approved).toMatchObject({
        reviewStatus: 'APPROVED',
        reviewedVersion: draft.contentVersion,
        reviewedById: admin.id,
        publishedAt: clock,
        offerType,
        priceMinor,
        discountPercent,
      })
      expect(approved.sources).toEqual(draft.sources)
    },
  )
  it.each([
    [401, 'Singapore pizza 50% off or 25. % off'],
    [402, 'Singapore pizza 50% off or 25.. % off'],
    [403, 'Singapore pizza 50% off or 25, % discount'],
    [404, 'Singapore chicken buy one, get one'],
  ] as const)(
    'never approves strict-parser reproduction %i through HTTP and Prisma',
    async (id, offer) => {
      runtime.enabled = true
      runtime.reuseApproved = true
      await db.importSource.upsert({
        where: sourceWhere,
        create: { ...MONEYDIGEST_SOURCE, enabled: true },
        update: { enabled: true },
      })
      clock = new Date(clock.getTime() + 30_000)
      const content = `${offer}. Valid from 1 October 2026 until 31 December 2026.${id === 404 ? ' Second item at half price.' : ''}`
      listPosts.mockResolvedValueOnce([syntheticPost(id, content)])
      const client = clientFor(admin.cookie)
      expect(await client.ingestion.run.mutate()).toMatchObject({
        status: 'SUCCEEDED',
        fetchedCount: 1,
        failedCount: 0,
      })
      const imported = await db.importedPost.findFirstOrThrow({
        where: { externalId: String(id) },
        include: { deals: { include: { deal: true } } },
      })
      const queue = await client.ingestion.queue.query({ limit: 50 })
      // Invoke the real review even on RED so the reproduction proves publication,
      // rather than merely assuming reviewReady necessarily means APPROVED.
      for (const { deal } of imported.deals) {
        const outcome = await client.ingestion.review
          .mutate({
            dealId: deal.id,
            expectedContentVersion: deal.contentVersion,
            decision: 'APPROVE',
            note: 'Synthetic strict-parser reproduction must not publish',
          })
          .then(
            (value) => ({ value }),
            (error) => ({ error }),
          )
        expect(outcome).toMatchObject({ error: { data: { code: 'PRECONDITION_FAILED' } } })
        expect(queue.items.find((item) => item.id === deal.id)?.reviewReady).toBe(false)
      }
      expect(imported).toMatchObject({ status: 'IGNORED', rawContent: content, deals: [] })
      expect(queue.items.some((item) => item.sourceUrl.endsWith(`/synthetic-${id}/`))).toBe(false)
      expect(
        await db.deal.count({
          where: {
            sources: { some: { importedPost: { externalId: String(id) } } },
            reviewStatus: 'APPROVED',
          },
        }),
      ).toBe(0)
    },
  )
  it.each([
    [421, 'before-validity'],
    [422, 'after-validity'],
    [423, 'title'],
    [424, 'excerpt'],
  ] as const)(
    'rejects paid second-item qualification in %s/%s without publishing',
    async (id, position) => {
      runtime.enabled = true
      runtime.reuseApproved = true
      await db.importSource.upsert({
        where: sourceWhere,
        create: { ...MONEYDIGEST_SOURCE, enabled: true },
        update: { enabled: true },
      })
      clock = new Date(clock.getTime() + 30_000)
      const qualification = 'Second item at half price.'
      const validity = 'Valid from 1 October 2026 until 31 December 2026.'
      const offer = 'Singapore chicken buy one, get one free.'
      const content =
        position === 'before-validity'
          ? `${offer} ${qualification} ${validity}`
          : `${offer} ${validity}${position === 'after-validity' ? ` ${qualification}` : ''}`
      const post = syntheticPost(id, content)
      if (position === 'title' || position === 'excerpt') post[position].rendered = qualification
      listPosts.mockResolvedValueOnce([post])
      const client = clientFor(admin.cookie)
      expect(await client.ingestion.run.mutate()).toMatchObject({
        status: 'SUCCEEDED',
        createdCount: 0,
        failedCount: 0,
      })
      expect(
        await db.importedPost.findFirstOrThrow({
          where: { externalId: String(id) },
          include: { deals: true },
        }),
      ).toMatchObject({
        status: 'IGNORED',
        rawContent: content,
        contentHash: createHash('sha256').update(JSON.stringify(post)).digest('hex'),
        deals: [],
      })
      expect(
        (await client.ingestion.queue.query({ limit: 50 })).items.some((item) =>
          item.sourceUrl.endsWith(`/synthetic-${id}/`),
        ),
      ).toBe(false)
      expect(
        await db.deal.count({
          where: { sources: { some: { importedPost: { externalId: String(id) } } } },
        }),
      ).toBe(0)
    },
  )
  it('persists unknown BOGO continuations as unready and rejects real approval without mutations', async () => {
    runtime.enabled = true
    runtime.reuseApproved = true
    await db.importSource.upsert({
      where: sourceWhere,
      create: { ...MONEYDIGEST_SOURCE, enabled: true },
      update: { enabled: true },
    })
    clock = new Date(clock.getTime() + 30_000)
    const content =
      'Singapore chicken buy one, get one. Valid from 1 October 2026 until 31 December 2026. Members only.'
    listPosts.mockResolvedValueOnce([syntheticPost(425, content)])
    const client = clientFor(admin.cookie)
    expect(await client.ingestion.run.mutate()).toMatchObject({ createdCount: 1, failedCount: 0 })
    const draft = await db.deal.findFirstOrThrow({
      where: { sources: { some: { importedPost: { externalId: '425' } } } },
      include: { sources: true },
    })
    expect(draft).toMatchObject({
      reviewStatus: 'PENDING',
      publishedAt: null,
      validFrom: null,
      validUntil: null,
      priceMinor: null,
      discountPercent: null,
      rawValidityText: 'Valid from 1 October 2026 until 31 December 2026',
    })
    expect(
      (await client.ingestion.queue.query({ limit: 50 })).items.find(
        (item) => item.id === draft.id,
      ),
    ).toMatchObject({ reviewReady: false })
    await expect(
      client.ingestion.review.mutate({
        dealId: draft.id,
        expectedContentVersion: draft.contentVersion,
        decision: 'APPROVE',
        note: 'Synthetic unknown continuation must remain unready',
      }),
    ).rejects.toMatchObject({ data: { code: 'PRECONDITION_FAILED' } })
    expect(
      await db.deal.findUniqueOrThrow({ where: { id: draft.id }, include: { sources: true } }),
    ).toEqual(draft)
  })
  it.each([
    [501, 'Singapore pizza 50% off or xSGD5.500 only', 'content'],
    [502, 'Singapore pizza promotion S$5.50 or xSGD6.50 only', 'content'],
    [503, 'Singapore pizza 1e1-for-1', 'content'],
    [504, 'Singapore pizza 0.1-for-1', 'content'],
    [505, 'Singapore pizza 50% off2.50', 'content'],
    [506, 'Singapore pizza 50% off or 2e 50 % off', 'content'],
    [507, 'Singapore pizza +one-for-one', 'content'],
    ...['one-forone', '1-forone', 'onefor-1', '1-forx'].flatMap((mutation, mutationIndex) =>
      (['title', 'content', 'excerpt'] as const).flatMap((field, fieldIndex) =>
        [false, true].map(
          (truncated, variant) =>
            [
              900 + mutationIndex * 6 + fieldIndex * 2 + variant,
              `${truncated ? 'Synthetic text. '.repeat(field === 'title' ? 90 : 140) : ''}${mutation}`,
              field,
            ] as const,
        ),
      ),
    ),
    ...(['title', 'content', 'excerpt'] as const).flatMap((field, fieldIndex) =>
      [
        'xSGD6.50 only',
        'SGD6.50x only',
        'xS$6.50 only',
        '$6.50x only',
        '+1-for-1',
        '1-for-−1',
        '1.0-for-1',
        '1-for-0.1',
        'one-for-onex',
        '50% off2.50',
        '50% off.2.50',
        '50% xdiscount',
        '2 e 50 % off',
        '2<br>e<br>50 % off',
        'SGD2&nbsp;E&nbsp;+50 only',
      ].map((offer, index) => [600 + fieldIndex * 20 + index, offer, field] as const),
    ),
  ] as const)(
    'never approves lexical-boundary reproduction %i/%s/%s through actual HTTP and Prisma',
    async (id, offer, field) => {
      runtime.enabled = true
      runtime.reuseApproved = true
      await db.importSource.upsert({
        where: sourceWhere,
        create: { ...MONEYDIGEST_SOURCE, enabled: true },
        update: { enabled: true },
      })
      clock = new Date(clock.getTime() + 30_000)
      const input = syntheticPost(id, `${offer}. Valid from 1 October 2026 until 31 December 2026.`)
      if (id >= 600) {
        input.content.rendered =
          'Singapore pizza 50% off. Valid from 1 October 2026 until 31 December 2026.'
        input[field].rendered =
          field === 'content'
            ? `Singapore pizza 50% off or ${offer}. Valid from 1 October 2026 until 31 December 2026.`
            : `Synthetic pizza ${offer}`
      }
      if (id >= 900) input.content.rendered += ' Singapore pizza 50% off.'
      listPosts.mockResolvedValueOnce([input])
      const client = clientFor(admin.cookie)
      expect(await client.ingestion.run.mutate()).toMatchObject({
        status: 'SUCCEEDED',
        fetchedCount: 1,
        failedCount: 0,
      })
      const imported = await db.importedPost.findFirstOrThrow({
        where: { externalId: String(id) },
        include: { deals: { include: { deal: { include: { sources: true } } } } },
      })
      const queue = await client.ingestion.queue.query({ limit: 50 })
      const outcomes = []
      for (const { deal } of imported.deals) {
        const outcome = await client.ingestion.review
          .mutate({
            dealId: deal.id,
            expectedContentVersion: deal.contentVersion,
            decision: 'APPROVE',
            note: 'Synthetic lexical-boundary evidence must not publish',
          })
          .then(
            (value) => ({ value }),
            (error) => ({ error }),
          )
        outcomes.push(outcome)
        const stored = await db.deal.findUniqueOrThrow({
          where: { id: deal.id },
          include: { sources: true },
        })
        expect(stored.sources[0]?.sourceContentSnapshot).toBe(JSON.stringify(input))
      }
      // Count after attempting the real approval: RED proves actual publication.
      expect(
        await db.deal.count({
          where: {
            sources: { some: { importedPost: { externalId: String(id) } } },
            reviewStatus: 'APPROVED',
          },
        }),
      ).toBe(0)
      for (const outcome of outcomes)
        expect(outcome).toMatchObject({ error: { data: { code: 'PRECONDITION_FAILED' } } })
      expect(imported).toMatchObject({
        status: 'IGNORED',
        rawContent: input.content.rendered,
        contentHash: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
        deals: [],
      })
      expect(queue.items.some((item) => item.sourceUrl === input.link)).toBe(false)
    },
  )
  it('does not send a provider request when its lease expires before the request boundary', async () => {
    clock = new Date(clock.getTime() + 30_000)
    let reads = 0
    runtime.now = () => new Date(clock.getTime() + (reads++ ? 120_000 : 0))
    const callsBefore = listPosts.mock.calls.length
    const result = await clientFor(admin.cookie).ingestion.run.mutate()
    expect(result).toMatchObject({ status: 'FAILED', fetchedCount: 0, failedCount: 0 })
    expect(listPosts.mock.calls.length).toBe(callsBefore)
    runtime.now = () => clock
    clock = new Date(clock.getTime() + 120_000)
  })
})
