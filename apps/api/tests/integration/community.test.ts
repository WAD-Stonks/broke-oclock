import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import { createApiClient } from '@broke-oclock/api-client'
import type { PrismaClient } from '@broke-oclock/db'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const origin = 'http://localhost:5173'
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: PrismaClient
let baseURL = ''
let first: { id: string; cookie: string }
let second: { id: string; cookie: string }
let owner: { id: string; cookie: string }
const request = (
  path: string,
  method = 'GET',
  body?: object,
  cookie = '',
  requestOrigin = origin,
) =>
  fetch(`${baseURL}/api${path}`, {
    method,
    headers: { Origin: requestOrigin, 'Content-Type': 'application/json', Cookie: cookie },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
const clientFor = (cookie = '') => {
  const client = createApiClient(`${baseURL}/api`)
  client.http.defaults.adapter = 'http'
  client.http.defaults.headers.common.Origin = origin
  client.http.defaults.headers.common.Cookie = cookie
  return client
}
const signup = async (name: string) => {
  const response = await request('/auth/sign-up/email', 'POST', {
    name,
    email: `${randomUUID()}@example.test`,
    password: randomBytes(24).toString('hex'),
  })
  expect(response.status).toBe(200)
  return {
    id: (await response.json()).user.id as string,
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; '),
  }
}
type DealOverrides = Partial<
  Pick<
    Awaited<ReturnType<PrismaClient['deal']['create']>>,
    | 'reviewStatus'
    | 'deletedAt'
    | 'publishedAt'
    | 'contentVersion'
    | 'validFrom'
    | 'validUntil'
    | 'submittedById'
  >
>
const createDeal = (overrides: DealOverrides = {}) =>
  db.deal.create({
    data: {
      title: 'Synthetic voting fixture',
      description: 'Not a real promotion',
      category: 'food',
      offerType: 'OTHER',
      applicability: 'NO_FIXED_LOCATION',
      submittedById: owner.id,
      reviewStatus: 'APPROVED',
      reviewedVersion: 1,
      publishedAt: new Date(),
      validFrom: new Date(Date.now() - 60_000),
      validUntil: new Date(Date.now() + 60_000),
      ...overrides,
    },
  })

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const url = mongo.getUri(`community_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', url)
  vi.stubEnv('NODE_ENV', 'test')
  await promisify(execFile)('pnpm', ['--dir', 'packages/db', 'run', 'push'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url },
    timeout: 60_000,
  })
  db = (await import('@broke-oclock/db')).db
  const { createApp } = await import('@api/app')
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing server')
  baseURL = `http://127.0.0.1:${address.port}`
  server.on(
    'request',
    createApp(
      parseConfig({
        DATABASE_URL: url,
        BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
        BETTER_AUTH_URL: baseURL,
        WEB_ORIGIN: origin,
      }),
    ),
  )
  first = await signup('First voter')
  second = await signup('Second voter')
  owner = await signup('Deal owner')
}, 180_000)

afterAll(async () => {
  if (server) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server?.close(() => resolve()))
  }
  await db?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})

describe('community votes through real Axios, Better Auth and disposable MongoDB', () => {
  it('excludes owners, stale revisions and old observations from thresholds', async () => {
    const owned = await createDeal()
    await expect(
      clientFor(owner.cookie).community.setVote(owned.id, { value: 'ALIVE', expectedVersion: 1 }),
    ).rejects.toMatchObject({ status: 403 })
    const deal = await createDeal({ submittedById: null })
    const firstClient = clientFor(first.cookie)
    const clients = [firstClient, clientFor(second.cookie), clientFor(owner.cookie)]
    for (const client of clients)
      await client.community.setVote(deal.id, { value: 'ALIVE', expectedVersion: 1 })
    expect(await firstClient.community.get(deal.id)).toMatchObject({
      status: 'CONFIRMED',
      aliveCount: 3,
    })
    await db.dealVote.update({
      where: { userId_dealId: { userId: owner.id, dealId: deal.id } },
      data: { observedAt: new Date(Date.now() - 73 * 60 * 60 * 1000) },
    })
    expect(await firstClient.community.get(deal.id)).toMatchObject({
      status: 'UNVERIFIED',
      aliveCount: 2,
    })
    await db.deal.update({
      where: { id: deal.id },
      data: { priceMinor: 400, contentVersion: 2, reviewedVersion: 2 },
    })
    expect(await firstClient.community.get(deal.id)).toMatchObject({
      status: 'UNVERIFIED',
      aliveCount: 0,
      currentVote: null,
      contentVersion: 2,
    })
    await expect(
      firstClient.community.setVote(deal.id, { value: 'ALIVE', expectedVersion: 1 }),
    ).rejects.toMatchObject({ status: 409 })
    expect(
      await firstClient.community.setVote(deal.id, { value: 'ALIVE', expectedVersion: 2 }),
    ).toMatchObject({ aliveCount: 1 })
    expect(await db.dealVote.count({ where: { dealId: deal.id } })).toBe(3)
  })

  it('keeps outlet evidence separate and excludes only managers of that outlet', async () => {
    const merchant = await db.merchant.create({ data: { name: 'Synthetic merchant' } })
    const venue1 = await db.venue.create({
      data: {
        merchantId: merchant.id,
        name: 'First outlet',
        address: 'Test address',
        latitude: 1.3,
        longitude: 103.8,
      },
    })
    const venue2 = await db.venue.create({
      data: {
        merchantId: merchant.id,
        name: 'Second outlet',
        address: 'Test address',
        latitude: 1.31,
        longitude: 103.81,
      },
    })
    const deal = await createDeal({ submittedById: null })
    await db.deal.update({
      where: { id: deal.id },
      data: { merchantId: merchant.id, applicability: 'SELECTED_OUTLETS' },
    })
    await db.dealVenue.createMany({
      data: [
        { dealId: deal.id, venueId: venue1.id },
        { dealId: deal.id, venueId: venue2.id },
      ],
    })
    await db.stallGrant.create({ data: { userId: first.id, venueId: venue1.id } })
    await expect(
      clientFor(first.cookie).community.setOutletEvidence(deal.id, venue1.id, {
        value: 'ALIVE',
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      clientFor(first.cookie).community.setVote(deal.id, { value: 'ALIVE', expectedVersion: 1 }),
    ).rejects.toMatchObject({ status: 403 })
    const result = await clientFor(first.cookie).community.setOutletEvidence(deal.id, venue2.id, {
      value: 'ALIVE',
      expectedVersion: 1,
    })
    expect(result.outlets.find((outlet) => outlet.venueId === venue2.id)).toMatchObject({
      aliveCount: 1,
    })
    await clientFor(second.cookie).community.setOutletEvidence(deal.id, venue1.id, {
      value: 'DEAD',
      expectedVersion: 1,
    })
    const summary = await clientFor(owner.cookie).community.setOutletEvidence(deal.id, venue1.id, {
      value: 'DEAD',
      expectedVersion: 1,
    })
    expect(summary).toMatchObject({ aliveCount: 0, deadCount: 0, status: 'UNVERIFIED' })
    expect(summary.outlets.find((outlet) => outlet.venueId === venue1.id)).toMatchObject({
      status: 'REPORTED_ENDED',
      deadCount: 2,
    })
    expect(summary.outlets.find((outlet) => outlet.venueId === venue2.id)).toMatchObject({
      status: 'UNVERIFIED',
      aliveCount: 1,
    })
    await expect(
      clientFor(second.cookie).community.setOutletEvidence(deal.id, 'aaaaaaaaaaaaaaaaaaaaaaaa', {
        value: 'DEAD',
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('stops counting evidence when its voter becomes a managing merchant', async () => {
    const merchant = await db.merchant.create({ data: { name: 'Synthetic management change' } })
    const venue = await db.venue.create({
      data: {
        merchantId: merchant.id,
        name: 'Synthetic outlet',
        address: 'Test address',
        latitude: 1.3,
        longitude: 103.8,
      },
    })
    const deal = await createDeal({ submittedById: null })
    await db.deal.update({
      where: { id: deal.id },
      data: { merchantId: merchant.id, applicability: 'SELECTED_OUTLETS' },
    })
    await db.dealVenue.create({ data: { dealId: deal.id, venueId: venue.id } })
    expect(
      await clientFor(first.cookie).community.setVote(deal.id, {
        value: 'ALIVE',
        expectedVersion: 1,
      }),
    ).toMatchObject({ aliveCount: 1 })
    await db.stallGrant.create({ data: { userId: first.id, venueId: venue.id } })
    expect(await clientFor(first.cookie).community.get(deal.id)).toMatchObject({
      aliveCount: 0,
      recordedAliveCount: 1,
      canVote: false,
      voteBlockReason: 'OWNER',
    })
  })

  it('excludes managers from merchant-linked online promotions without outlet evidence', async () => {
    const merchant = await db.merchant.create({ data: { name: 'Synthetic online merchant' } })
    const venue = await db.venue.create({
      data: {
        merchantId: merchant.id,
        name: 'Synthetic online merchant outlet',
        address: 'Test address',
        latitude: 1.3,
        longitude: 103.8,
      },
    })
    const deal = await createDeal({ submittedById: null })
    await db.deal.update({
      where: { id: deal.id },
      data: { merchantId: merchant.id, applicability: 'ONLINE' },
    })
    const client = clientFor(first.cookie)
    expect(
      await client.community.setVote(deal.id, { value: 'ALIVE', expectedVersion: 1 }),
    ).toMatchObject({ aliveCount: 1, outlets: [] })
    await db.stallGrant.create({ data: { userId: first.id, venueId: venue.id } })
    expect(await client.community.get(deal.id)).toMatchObject({
      aliveCount: 0,
      recordedAliveCount: 1,
      canVote: false,
      voteBlockReason: 'OWNER',
      outlets: [],
    })
    await expect(
      client.community.setVote(deal.id, { value: 'DEAD', expectedVersion: 1 }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('shows disputed evidence and returns bounded public card summaries', async () => {
    const deal = await createDeal({ submittedById: null })
    for (const voter of [first, second, owner])
      await clientFor(voter.cookie).community.setVote(deal.id, {
        value: 'ALIVE',
        expectedVersion: 1,
      })
    for (let index = 0; index < 2; index++) {
      const user = await db.user.create({
        data: {
          name: `Synthetic voter ${index}`,
          email: `${randomUUID()}@example.test`,
          emailVerified: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })
      await db.dealVote.create({
        data: {
          userId: user.id,
          dealId: deal.id,
          value: 'DEAD',
          contentVersion: 1,
          observedAt: new Date(),
        },
      })
    }
    expect(await clientFor().community.get(deal.id)).toMatchObject({
      status: 'DISPUTED',
      aliveCount: 3,
      deadCount: 2,
    })
    expect(
      await clientFor().community.summaries([deal.id, 'aaaaaaaaaaaaaaaaaaaaaaaa']),
    ).toMatchObject({ items: [{ dealId: deal.id, status: 'DISPUTED' }] })
    expect(() =>
      clientFor().community.summaries(Array.from({ length: 21 }, () => deal.id)),
    ).toThrow()
  })

  it('allows owner comments, protects deletion, deduplicates reports and requires staff review', async () => {
    const deal = await createDeal()
    const requestKey = randomUUID()
    const comment = await clientFor(owner.cookie).community.addComment(deal.id, {
      body: '  Synthetic discussion  ',
      requestKey,
    })
    expect(comment.body).toBe('Synthetic discussion')
    expect(
      (
        await clientFor(owner.cookie).community.addComment(deal.id, {
          body: 'Synthetic discussion',
          requestKey,
        })
      ).id,
    ).toBe(comment.id)
    expect((await clientFor().community.comments(deal.id)).items).toHaveLength(1)
    await expect(
      clientFor(second.cookie).community.deleteComment(deal.id, comment.id),
    ).rejects.toMatchObject({ status: 403 })
    const report = await clientFor(first.cookie).community.reportComment(deal.id, comment.id, {
      reason: 'INAPPROPRIATE',
    })
    expect(
      (
        await clientFor(first.cookie).community.reportComment(deal.id, comment.id, {
          reason: 'SPAM',
        })
      ).id,
    ).toBe(report.id)
    await expect(clientFor(first.cookie).community.reports()).rejects.toMatchObject({ status: 403 })
    await db.user.update({ where: { id: owner.id }, data: { role: 'MODERATOR' } })
    expect(
      (await clientFor(owner.cookie).community.reports()).items.some(
        (item) => item.id === report.id,
      ),
    ).toBe(true)
    await clientFor(owner.cookie).community.reviewReport('COMMENT', report.id, {
      status: 'RESOLVED',
      note: 'Reviewed synthetic report',
      hide: true,
    })
    expect((await clientFor().community.comments(deal.id)).items).toHaveLength(0)
    expect(await db.communityModerationAudit.count({ where: { targetId: comment.id } })).toBe(1)
    await expect(
      clientFor(owner.cookie).community.reviewReport('COMMENT', report.id, {
        status: 'DISMISSED',
        note: 'Retry',
        hide: false,
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('keeps one comment and one report under concurrent retries', async () => {
    const deal = await createDeal()
    const input = { body: 'Concurrent synthetic comment', requestKey: randomUUID() }
    const comments = await Promise.all(
      Array.from({ length: 3 }, () => clientFor(owner.cookie).community.addComment(deal.id, input)),
    )
    expect(new Set(comments.map((comment) => comment.id)).size).toBe(1)
    expect(await db.comment.count({ where: { dealId: deal.id } })).toBe(1)
    const reports = await Promise.all(
      Array.from({ length: 3 }, () =>
        clientFor(first.cookie).community.reportDeal(deal.id, { reason: 'MISLEADING' }),
      ),
    )
    expect(new Set(reports.map((report) => report.id)).size).toBe(1)
    expect(await db.dealReport.count({ where: { dealId: deal.id } })).toBe(1)
  })
  it('keeps report dismissal separate from an explicit deal hide', async () => {
    const deal = await createDeal()
    await db.user.update({ where: { id: owner.id }, data: { role: 'MODERATOR' } })
    const firstReport = await clientFor(first.cookie).community.reportDeal(deal.id, {
      reason: 'MISLEADING',
    })
    await expect(
      clientFor(owner.cookie).community.reviewReport('DEAL', firstReport.id, {
        status: 'DISMISSED',
        note: 'Invalid report',
        hide: true,
      }),
    ).rejects.toMatchObject({ status: 400 })
    await clientFor(owner.cookie).community.reviewReport('DEAL', firstReport.id, {
      status: 'DISMISSED',
      note: 'Invalid report',
      hide: false,
    })
    expect(await clientFor().community.get(deal.id)).toMatchObject({ dealId: deal.id })
    const secondReport = await clientFor(second.cookie).community.reportDeal(deal.id, {
      reason: 'SPAM',
    })
    await clientFor(owner.cookie).community.reviewReport('DEAL', secondReport.id, {
      status: 'RESOLVED',
      note: 'Hide synthetic deal',
      hide: true,
    })
    await expect(clientFor().community.get(deal.id)).rejects.toMatchObject({ status: 404 })
    expect(await db.communityModerationAudit.count({ where: { targetId: deal.id } })).toBe(2)
  })
  it('persists independent identities and replaces votes without inflating counts or refreshing repeats', async () => {
    const deal = await createDeal()
    const a = clientFor(first.cookie)
    const b = clientFor(second.cookie)
    expect(await clientFor().community.get(deal.id)).toMatchObject({
      aliveCount: 0,
      deadCount: 0,
      currentVote: null,
      canVote: false,
    })
    const initial = await a.community.setVote(deal.id, { value: 'ALIVE', expectedVersion: 1 })
    expect(initial).toMatchObject({ aliveCount: 1, deadCount: 0, currentVote: 'ALIVE' })
    expect(
      await a.community.setVote(deal.id, { value: 'ALIVE', expectedVersion: 1 }),
    ).toMatchObject({
      aliveCount: 1,
      lastConfirmedAt: initial.lastConfirmedAt,
    })
    await b.community.setVote(deal.id, { value: 'ALIVE', expectedVersion: 1 })
    expect(await a.community.setVote(deal.id, { value: 'DEAD', expectedVersion: 1 })).toMatchObject(
      {
        aliveCount: 1,
        deadCount: 1,
        currentVote: 'DEAD',
      },
    )
    expect(await clientFor(first.cookie).community.get(deal.id)).toMatchObject({
      currentVote: 'DEAD',
      aliveCount: 1,
      deadCount: 1,
    })
    expect(await b.community.get(deal.id)).toMatchObject({ currentVote: 'ALIVE' })
    expect(await clientFor().community.get(deal.id)).toMatchObject({ currentVote: null })
    expect(await db.dealVote.count({ where: { dealId: deal.id } })).toBe(2)
    expect(await db.deal.findUnique({ where: { id: deal.id } })).toMatchObject({
      reviewStatus: 'APPROVED',
      validUntil: deal.validUntil,
      contentVersion: 1,
    })
  })

  it('keeps one row under concurrent creation and changes', async () => {
    const deal = await createDeal()
    const a = clientFor(first.cookie)
    await Promise.all(
      Array.from({ length: 4 }, () =>
        a.community.setVote(deal.id, { value: 'ALIVE', expectedVersion: 1 }),
      ),
    )
    await Promise.all(
      ['ALIVE', 'DEAD', 'ALIVE', 'DEAD'].map((value) =>
        a.community.setVote(deal.id, {
          value: value === 'ALIVE' ? 'ALIVE' : 'DEAD',
          expectedVersion: 1,
        }),
      ),
    )
    const summary = await a.community.get(deal.id)
    expect(summary.aliveCount + summary.deadCount).toBe(1)
    expect(await db.dealVote.count({ where: { dealId: deal.id } })).toBe(1)
  })

  it('rejects logged-out writes, wrong origins and client-selected authors', async () => {
    const deal = await createDeal()
    expect(
      (await request(`/deals/${deal.id}/vote`, 'PUT', { value: 'ALIVE', expectedVersion: 1 }))
        .status,
    ).toBe(401)
    expect(
      (
        await request(
          `/deals/${deal.id}/vote`,
          'PUT',
          { value: 'ALIVE', expectedVersion: 1 },
          first.cookie,
          'https://other.example',
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await request(
          `/deals/${deal.id}/vote`,
          'PUT',
          { value: 'ALIVE', expectedVersion: 1, userId: second.id },
          first.cookie,
        )
      ).status,
    ).toBe(400)
    expect(
      (await request(`/deals/${deal.id}/vote`, 'PUT', { value: 'INVALID' }, first.cookie)).status,
    ).toBe(400)
    expect(await db.dealVote.count({ where: { dealId: deal.id } })).toBe(0)
  })

  it('validates IDs, query input, missing deals and method allowlists', async () => {
    expect((await request('/deals/invalid/community')).status).toBe(400)
    expect((await request('/deals/aaaaaaaaaaaaaaaaaaaaaaaa/community')).status).toBe(404)
    const deal = await createDeal()
    expect((await request(`/deals/${deal.id}/community?userId=${first.id}`)).status).toBe(400)
    for (const method of ['GET', 'HEAD', 'POST', 'DELETE']) {
      const response = await request(`/deals/${deal.id}/vote`, method, undefined, first.cookie)
      expect(response.status).toBe(405)
      expect(response.headers.get('Allow')).toBe('PUT')
    }
    expect(await db.dealVote.count({ where: { dealId: deal.id } })).toBe(0)
  })

  it('keeps unpublished, hidden, deleted and stale approvals inaccessible', async () => {
    for (const overrides of [
      { reviewStatus: 'PENDING' as const },
      { reviewStatus: 'HIDDEN' as const },
      { deletedAt: new Date() },
      { publishedAt: null },
      { contentVersion: 2 },
    ]) {
      const deal = await createDeal(overrides)
      expect((await request(`/deals/${deal.id}/community`)).status).toBe(404)
      expect(
        (
          await request(
            `/deals/${deal.id}/vote`,
            'PUT',
            { value: 'ALIVE', expectedVersion: 1 },
            first.cookie,
          )
        ).status,
      ).toBe(404)
    }
  })

  it('keeps expiry and unknown validity distinct from community evidence', async () => {
    const expired = await createDeal({ validUntil: new Date(Date.now() - 1000) })
    expect(await clientFor(first.cookie).community.get(expired.id)).toMatchObject({
      validity: 'EXPIRED',
      canVote: false,
    })
    await expect(
      clientFor(first.cookie).community.setVote(expired.id, { value: 'ALIVE', expectedVersion: 1 }),
    ).rejects.toMatchObject({ status: 409 })
    const future = await createDeal({ validFrom: new Date(Date.now() + 10_000) })
    await expect(
      clientFor(first.cookie).community.setVote(future.id, { value: 'ALIVE', expectedVersion: 1 }),
    ).rejects.toMatchObject({ status: 409 })
    const unknown = await createDeal({ validFrom: null, validUntil: null })
    expect(
      await clientFor(first.cookie).community.setVote(unknown.id, {
        value: 'ALIVE',
        expectedVersion: 1,
      }),
    ).toMatchObject({ validity: 'UNKNOWN', validUntil: null })
  })
})
