import { execFile } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import type { IngestionRuntime } from '@api/modules/ingestion/runtime'
import { MONEYDIGEST_SOURCE, sourceWhere } from '@api/modules/ingestion/source'
import axios from 'axios'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const origin = 'http://localhost:5173'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
let baseURL = ''
let fixtureDatabaseUrl = ''
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
  fixtureDatabaseUrl = databaseUrl
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
  await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
}, 180_000)
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})

const http = (cookie = admin.cookie, requestOrigin: string | undefined = origin) =>
  axios.create({
    baseURL,
    validateStatus: () => true,
    headers: {
      ...(requestOrigin ? { Origin: requestOrigin } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
  })
const fixture = async () => {
  const source = await db.importSource.upsert({
    where: sourceWhere,
    create: { ...MONEYDIGEST_SOURCE, enabled: true },
    update: { enabled: true },
  })
  const snapshot = JSON.stringify(syntheticPost())
  const hash = createHash('sha256').update(snapshot).digest('hex')
  const post = await db.importedPost.create({
    data: {
      sourceId: source.id,
      externalId: randomUUID(),
      url: syntheticPost().link,
      rawContent: snapshot,
      contentHash: hash,
      processedContentHash: hash,
      status: 'NEEDS_REVIEW',
    },
  })
  const deal = await db.deal.create({
    data: {
      title: 'Synthetic Pizza',
      description: 'Immutable description',
      terms: 'Immutable terms',
      category: 'FOOD',
      offerType: 'BUY_ONE_GET_ONE',
      origin: 'IMPORTED',
      applicability: 'NO_FIXED_LOCATION',
      validFrom: new Date('2026-10-01'),
      validUntil: new Date('2027-01-01'),
      sources: {
        create: {
          importedPostId: post.id,
          sourceContentHash: hash,
          sourceContentSnapshot: snapshot,
          sourceUrl: post.url,
        },
      },
    },
  })
  const merchant = await db.merchant.create({ data: { name: 'Synthetic merchant' } })
  const venue = await db.venue.create({
    data: {
      merchantId: merchant.id,
      name: 'Existing outlet',
      address: 'Existing address',
      latitude: 1.3,
      longitude: 103.8,
    },
  })
  return { deal, post, venue, merchant, source }
}
const associate = (f: Awaited<ReturnType<typeof fixture>>, version = 1, venueId = f.venue.id) =>
  http().patch(`/api/ingestion/drafts/${f.deal.id}/outlet`, {
    expectedContentVersion: version,
    venueId,
  })
const review = (f: Awaited<ReturnType<typeof fixture>>, version = 1, decision = 'APPROVE') =>
  http().post(`/api/ingestion/drafts/${f.deal.id}/review`, {
    expectedContentVersion: version,
    decision,
    note: 'Synthetic evidence checked',
  })
const stored = (id: string) =>
  db.deal.findUniqueOrThrow({ where: { id }, include: { sources: true, venues: true } })

describe('existing outlet association real native HTTP and disposable Mongo', () => {
  it('conflicts with real changed-content reimport and never carries the selected outlet to new evidence', async () => {
    const f = await fixture()
    const id = 90001
    runtime.enabled = true
    runtime.reuseApproved = true
    clock = new Date(clock.getTime() + 30_000)
    listPosts.mockResolvedValue([syntheticPost(id)])
    expect((await http().post('/api/ingestion/runs')).status).toBe(200)
    const initial = await db.deal.findFirstOrThrow({
      where: { sources: { some: { importedPost: { externalId: String(id) } } } },
    })
    const selected = { ...f, deal: initial }
    expect((await associate(selected)).status).toBe(200)
    const before = await stored(initial.id)
    clock = new Date(clock.getTime() + 30_000)
    listPosts.mockResolvedValue([
      syntheticPost(
        id,
        'Singapore pizza 1-for-1. Valid from 2 October 2026 until 31 December 2026.',
      ),
    ])
    const transact = db.$transaction.bind(db)
    let armed = true
    const spy = vi.spyOn(db, '$transaction').mockImplementation((operation, options) =>
      transact(
        async (tx) =>
          operation(
            new Proxy(tx, {
              get(target, property, receiver) {
                if (property !== 'deal') return Reflect.get(target, property, receiver)
                return new Proxy(target.deal, {
                  get(delegate, method, receiver) {
                    if (method !== 'findFirst') return Reflect.get(delegate, method, receiver)
                    return async (...args: Parameters<typeof delegate.findFirst>) => {
                      const result = await delegate.findFirst(...args)
                      if (armed && args[0]?.where?.id === initial.id) {
                        armed = false
                        expect((await http().post('/api/ingestion/runs')).status).toBe(200)
                      }
                      return result
                    }
                  },
                })
              },
            }),
          ),
        options,
      ),
    )
    const next = await fixture()
    try {
      expect((await associate(selected, 2, next.venue.id)).status).toBe(409)
    } finally {
      spy.mockRestore()
    }
    const historical = await stored(initial.id)
    expect(historical.sources).toEqual(before.sources)
    expect(historical).toMatchObject({
      reviewStatus: 'REJECTED',
      merchantId: f.merchant.id,
      publishedAt: null,
    })
    expect(historical.venues).toEqual(before.venues)
    const replacement = await db.deal.findFirstOrThrow({
      where: {
        reviewStatus: 'PENDING',
        sources: { some: { importedPost: { externalId: String(id) } } },
      },
      include: { venues: true },
    })
    expect(replacement).toMatchObject({
      contentVersion: 3,
      applicability: 'NO_FIXED_LOCATION',
      merchantId: null,
      publishedAt: null,
      venues: [],
    })
  })

  it('validates role, origin, strict input and read-only methods without any mutation', async () => {
    const f = await fixture()
    const path = `/api/ingestion/drafts/${f.deal.id}/outlet`
    const body = { expectedContentVersion: 1, venueId: f.venue.id }
    const before = await stored(f.deal.id)
    expect((await http('').patch(path, body)).status).toBe(401)
    expect((await http(member.cookie).patch(path, body)).status).toBe(403)
    expect((await http(admin.cookie, 'https://hostile.test').patch(path, body)).status).toBe(403)
    expect((await http(admin.cookie, '').patch(path, body)).status).toBe(403)
    for (const invalid of [
      { ...body, merchantId: f.merchant.id },
      { ...body, expectedContentVersion: 0 },
      { ...body, expectedContentVersion: 2147483647 },
      { ...body, venueId: f.venue.id.toUpperCase() },
    ])
      expect((await http().patch(path, invalid)).status).toBe(400)
    expect((await http().patch('/api/ingestion/drafts/INVALID/outlet', body)).status).toBe(400)
    for (const method of ['get', 'head', 'post', 'put', 'delete']) {
      const r = await http().request({ method, url: path })
      expect(r.status).toBe(405)
      expect(r.headers.allow).toBe('PATCH')
    }
    expect(await stored(f.deal.id)).toEqual(before)
  })
  it('refuses stale, reviewed, unsupported, inconsistent, inactive and mismatched evidence states', async () => {
    for (const state of [
      'stale',
      'reviewed',
      'deleted',
      'native',
      'online',
      'all',
      'missing',
      'inactive',
      'merchant',
      'source',
      'hash',
      'failed',
      'multi',
    ]) {
      const f = await fixture()
      let status = 412
      if (state === 'stale') status = 409
      if (state === 'reviewed') {
        await db.deal.update({ where: { id: f.deal.id }, data: { reviewStatus: 'REJECTED' } })
        status = 409
      }
      if (state === 'deleted') {
        await db.deal.update({ where: { id: f.deal.id }, data: { deletedAt: new Date() } })
        status = 404
      }
      if (state === 'native') {
        await db.deal.update({ where: { id: f.deal.id }, data: { origin: 'USER_SUBMITTED' } })
        status = 404
      }
      if (state === 'online' || state === 'all')
        await db.deal.update({
          where: { id: f.deal.id },
          data: { applicability: state === 'online' ? 'ONLINE' : 'ALL_MERCHANT_OUTLETS' },
        })
      if (state === 'inactive')
        await db.venue.update({ where: { id: f.venue.id }, data: { deletedAt: new Date() } })
      if (state === 'merchant')
        await db.merchant.update({ where: { id: f.merchant.id }, data: { deletedAt: new Date() } })
      if (state === 'source')
        await db.importSource.update({ where: { id: f.source.id }, data: { enabled: false } })
      if (state === 'hash' || state === 'failed')
        await db.importedPost.update({
          where: { id: f.post.id },
          data:
            state === 'hash'
              ? { contentHash: 'changed' }
              : { status: 'FAILED', errorCode: 'POST_FAILED' },
        })
      if (state === 'multi')
        await db.dealVenue.create({ data: { dealId: f.deal.id, venueId: f.venue.id } })
      const before = await stored(f.deal.id)
      expect(
        (
          await associate(
            f,
            state === 'stale' ? 2 : 1,
            state === 'missing' ? '000000000000000000000001' : f.venue.id,
          )
        ).status,
        state,
      ).toBe(status)
      expect(await stored(f.deal.id)).toEqual(before)
    }
  })
  it('reassociates exactly one outlet at a new version and refuses an unchanged selection', async () => {
    const f = await fixture(),
      next = await fixture()
    expect((await associate(f)).status).toBe(200)
    expect((await associate(f, 2)).status).toBe(412)
    expect((await associate(f, 2, next.venue.id)).status).toBe(200)
    const after = await stored(f.deal.id)
    expect(after).toMatchObject({
      merchantId: next.merchant.id,
      contentVersion: 3,
      reviewStatus: 'PENDING',
      publishedAt: null,
    })
    expect(after.venues.map((v) => v.venueId)).toEqual([next.venue.id])
  })
  it('serializes simultaneous review and association so changed content is never approved', async () => {
    const f = await fixture()
    const results = await Promise.all([associate(f), review(f)])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    const after = await stored(f.deal.id)
    if (after.reviewStatus === 'APPROVED')
      expect(after).toMatchObject({ contentVersion: 1, reviewedVersion: 1, merchantId: null })
    else
      expect(after).toMatchObject({
        reviewStatus: 'PENDING',
        contentVersion: 2,
        publishedAt: null,
        reviewedVersion: null,
      })
  })
  it('conflicts on committed source, outlet, merchant and actor changes after transaction reads', async () => {
    const { PrismaClient } = await import('@broke-oclock/db')
    const concurrent = new PrismaClient({ datasourceUrl: fixtureDatabaseUrl })
    for (const target of ['deal', 'venue', 'merchant', 'user', 'importSource'] as const) {
      const f = await fixture()
      const transact = db.$transaction.bind(db)
      let armed = true
      const spy = vi.spyOn(db, '$transaction').mockImplementation((operation, options) =>
        transact(
          async (tx) =>
            operation(
              new Proxy(tx, {
                get(transaction, property, receiver) {
                  if (property !== target) return Reflect.get(transaction, property, receiver)
                  return new Proxy(transaction[target], {
                    get(delegate, method, receiver) {
                      if (method !== (target === 'deal' ? 'findFirst' : 'findUnique'))
                        return Reflect.get(delegate, method, receiver)
                      return async (...args: unknown[]) => {
                        const value = await Reflect.apply(
                          Reflect.get(delegate, method),
                          delegate,
                          args,
                        )
                        if (armed) {
                          armed = false
                          if (target === 'deal')
                            await concurrent.importedPost.update({
                              where: { id: f.post.id },
                              data: { contentHash: 'concurrent-change' },
                            })
                          if (target === 'venue')
                            await concurrent.venue.update({
                              where: { id: f.venue.id },
                              data: { deletedAt: new Date() },
                            })
                          if (target === 'merchant')
                            await concurrent.merchant.update({
                              where: { id: f.merchant.id },
                              data: { deletedAt: new Date() },
                            })
                          if (target === 'user')
                            await concurrent.user.update({
                              where: { id: admin.id },
                              data: { role: 'USER' },
                            })
                          if (target === 'importSource')
                            await concurrent.importSource.update({
                              where: { id: f.source.id },
                              data: { enabled: false },
                            })
                        }
                        return value
                      }
                    },
                  })
                },
              }),
            ),
          options,
        ),
      )
      try {
        expect((await associate(f)).status, target).toBe(409)
        expect(await stored(f.deal.id)).toMatchObject({
          contentVersion: 1,
          merchantId: null,
          reviewStatus: 'PENDING',
          publishedAt: null,
        })
      } finally {
        spy.mockRestore()
        await concurrent.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
      }
    }
    await concurrent.$disconnect()
  })
  it('rolls back all fences and draft edits when link creation fails and returns a sanitized 500', async () => {
    const f = await fixture()
    const before = await stored(f.deal.id),
      post = await db.importedPost.findUniqueOrThrow({ where: { id: f.post.id } }),
      actor = await db.user.findUniqueOrThrow({ where: { id: admin.id } })
    const transact = db.$transaction.bind(db)
    const spy = vi.spyOn(db, '$transaction').mockImplementation((operation, options) =>
      transact(
        async (tx) =>
          operation(
            new Proxy(tx, {
              get(target, property, receiver) {
                if (property !== 'dealVenue') return Reflect.get(target, property, receiver)
                return new Proxy(target.dealVenue, {
                  get(delegate, method, receiver) {
                    if (method === 'create')
                      return () => {
                        throw new Error('private injected diagnostics')
                      }
                    return Reflect.get(delegate, method, receiver)
                  },
                })
              },
            }),
          ),
        options,
      ),
    )
    try {
      const result = await associate(f)
      expect(result.status).toBe(500)
      expect(result.data).toEqual({
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
      })
      expect(await stored(f.deal.id)).toEqual(before)
      expect(await db.importedPost.findUniqueOrThrow({ where: { id: f.post.id } })).toEqual(post)
      expect(await db.user.findUniqueOrThrow({ where: { id: admin.id } })).toEqual(actor)
    } finally {
      spy.mockRestore()
    }
  })

  it('refuses approval when the associated outlet or merchant is inactive, but preserves rejection', async () => {
    for (const target of ['venue', 'merchant'] as const) {
      const f = await fixture()
      expect((await associate(f)).status).toBe(200)
      if (target === 'venue')
        await db.venue.update({ where: { id: f.venue.id }, data: { deletedAt: new Date() } })
      else
        await db.merchant.update({ where: { id: f.merchant.id }, data: { deletedAt: new Date() } })
      expect((await review(f, 2)).status).toBe(412)
      expect((await stored(f.deal.id)).publishedAt).toBeNull()
      expect((await review(f, 2, 'REJECT')).status).toBe(200)
    }
  })
  it('conflicts if the ADMIN is demoted after its transaction role read, leaving no review write', async () => {
    const f = await fixture()
    const { PrismaClient } = await import('@broke-oclock/db')
    const concurrent = new PrismaClient({ datasourceUrl: fixtureDatabaseUrl })
    const transact = db.$transaction.bind(db)
    let armed = true
    const spy = vi.spyOn(db, '$transaction').mockImplementation((operation, options) =>
      transact(async (tx) => {
        const proxy = new Proxy(tx, {
          get(target, property, receiver) {
            if (property !== 'user') return Reflect.get(target, property, receiver)
            return new Proxy(target.user, {
              get(delegate, method, receiver) {
                if (method !== 'findUnique') return Reflect.get(delegate, method, receiver)
                return async (...args: Parameters<typeof delegate.findUnique>) => {
                  const result = await delegate.findUnique(...args)
                  if (armed && args[0]?.where.id === admin.id) {
                    armed = false
                    await concurrent.user.update({
                      where: { id: admin.id },
                      data: { role: 'USER' },
                    })
                  }
                  return result
                }
              },
            })
          },
        })
        return operation(proxy)
      }, options),
    )
    try {
      expect((await review(f)).status).toBe(409)
      expect(await stored(f.deal.id)).toMatchObject({ reviewStatus: 'PENDING', publishedAt: null })
    } finally {
      spy.mockRestore()
      await concurrent.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
      await concurrent.$disconnect()
    }
  })
  it('associates without provisioning or changing citation bytes and projects the selected outlet', async () => {
    const f = await fixture()
    const before = await stored(f.deal.id)
    const counts = await Promise.all([db.merchant.count(), db.venue.count()])
    const response = await associate(f)
    expect(response.status).toBe(200)
    expect(response.data).toEqual({
      id: f.deal.id,
      contentVersion: 2,
      reviewStatus: 'PENDING',
      applicability: 'SELECTED_OUTLETS',
      merchantId: f.merchant.id,
      outlet: {
        id: f.venue.id,
        name: f.venue.name,
        address: f.venue.address,
        merchantName: f.merchant.name,
      },
    })
    const after = await stored(f.deal.id)
    expect(after.sources).toEqual(before.sources)
    expect(after).toMatchObject({
      ...f.deal,
      updatedAt: after.updatedAt,
      merchantId: f.merchant.id,
      applicability: 'SELECTED_OUTLETS',
      contentVersion: 2,
      reviewedVersion: null,
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
      publishedAt: null,
    })
    expect(after.venues.map((v) => v.venueId)).toEqual([f.venue.id])
    expect(await Promise.all([db.merchant.count(), db.venue.count()])).toEqual(counts)
    const queue = await http().get('/api/ingestion/drafts?limit=50')
    expect(queue.data.items.find((d: { id: string }) => d.id === f.deal.id)).toMatchObject({
      merchantId: f.merchant.id,
      outlet: response.data.outlet,
      reviewReady: true,
    })
    expect((await review(f, 1)).status).toBe(409)
    expect((await review(f, 2)).status).toBe(200)
  })
})
