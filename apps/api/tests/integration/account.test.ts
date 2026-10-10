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
const unknownId = '507f1f77bcf86cd799439011'
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let disconnect: (() => Promise<void>) | undefined
let baseURL = ''
let db!: typeof import('@broke-oclock/db').db

type Account = { id: string; email: string; cookies: string }
type Page<Item> = { items: Item[]; nextCursor: string | null }
type CallOptions = { cookie?: string; body?: object; origin?: string | null }

const call = (method: string, path: string, options: CallOptions = {}) =>
  fetch(`${baseURL}${path}`, {
    method,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.origin === null ? {} : { Origin: options.origin ?? origin }),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })

const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')

const signUp = async (): Promise<Account> => {
  const email = `account-${randomUUID()}@example.test`
  const response = await call('POST', '/api/auth/sign-up/email', {
    body: { name: 'Account Test', email, password: randomBytes(24).toString('base64url') },
  })
  expect(response.status).toBe(200)
  const body = (await response.json()) as { user: { id: string } }
  return { id: body.user.id, email, cookies: cookieFrom(response) }
}

const dealBase = {
  description: 'Synthetic deal',
  category: 'food',
  offerType: 'OTHER',
  applicability: 'NO_FIXED_LOCATION',
} as const

const publicDeal = (title: string) =>
  db.deal.create({
    data: {
      ...dealBase,
      title,
      reviewStatus: 'APPROVED',
      publishedAt: new Date(),
      reviewedVersion: 1,
    },
  })
const pendingDeal = (title: string, submittedById?: string) =>
  db.deal.create({ data: { ...dealBase, title, ...(submittedById ? { submittedById } : {}) } })
const syntheticVenue = async (name = 'Synthetic stall') => {
  const merchant = await db.merchant.create({ data: { name: 'Synthetic merchant' } })
  return db.venue.create({
    data: {
      merchantId: merchant.id,
      name,
      address: 'Synthetic address',
      latitude: 1.3,
      longitude: 103.8,
    },
  })
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  // Always a fresh disposable replica set; never a configured DATABASE_URL.
  const databaseUrl = mongo.getUri(`integration_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await promisify(execFile)('pnpm', ['--dir', 'packages/db', 'run', 'push'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    timeout: 60_000,
  })
  db = (await import('@broke-oclock/db')).db
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

describe('account endpoints: authentication', () => {
  it('rejects every account route for anonymous visitors', async () => {
    for (const path of [
      '/api/account/profile',
      '/api/account/bookmarks',
      '/api/account/submissions',
      '/api/account/venues',
      '/api/account/merchant-requests',
    ]) {
      expect((await call('GET', path)).status, path).toBe(401)
    }
    expect((await call('PUT', `/api/account/bookmarks/${unknownId}`)).status).toBe(401)
    expect((await call('DELETE', `/api/account/bookmarks/${unknownId}`)).status).toBe(401)
    expect(
      (
        await call('POST', '/api/account/merchant-requests', {
          body: { venueId: unknownId, message: 'Hi' },
        })
      ).status,
    ).toBe(401)
  })

  it('refuses writes from an untrusted or missing Origin, even when logged in', async () => {
    const user = await signUp()
    const deal = await publicDeal('Origin test deal')
    for (const requestOrigin of ['http://evil.example', null]) {
      const save = await call('PUT', `/api/account/bookmarks/${deal.id}`, {
        cookie: user.cookies,
        origin: requestOrigin,
      })
      expect(save.status).toBe(403)
      const request = await call('POST', '/api/account/merchant-requests', {
        cookie: user.cookies,
        origin: requestOrigin,
        body: { venueId: unknownId, message: 'Hi' },
      })
      expect(request.status).toBe(403)
    }
    expect(await db.bookmark.count({ where: { userId: user.id } })).toBe(0)
  })

  it('returns only the current user in the profile, with the role read from the database', async () => {
    const first = await signUp()
    const second = await signUp()
    const read = async (account: Account) =>
      (await (await call('GET', '/api/account/profile', { cookie: account.cookies })).json()) as {
        id: string
        email: string
        role: string
      }
    expect(await read(first)).toMatchObject({ id: first.id, email: first.email, role: 'USER' })
    expect(await read(second)).toMatchObject({ id: second.id, email: second.email })
    await db.user.update({ where: { id: first.id }, data: { role: 'MODERATOR' } })
    expect((await read(first)).role).toBe('MODERATOR')
  })
})

describe('account endpoints: saved deals', () => {
  it('saves a public deal once, and lists it', async () => {
    const user = await signUp()
    const deal = await publicDeal('Saved deal')
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const save = await call('PUT', `/api/account/bookmarks/${deal.id}`, { cookie: user.cookies })
      expect(save.status).toBe(200)
      expect(await save.json()).toEqual({ saved: true })
    }
    expect(await db.bookmark.count({ where: { userId: user.id, dealId: deal.id } })).toBe(1)
    const list = await call('GET', '/api/account/bookmarks', { cookie: user.cookies })
    const body = (await list.json()) as Page<{ dealId: string; deal: { title: string } | null }>
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({ dealId: deal.id, deal: { title: 'Saved deal' } })
  })

  it('treats pending, missing and malformed deal ids without revealing hidden deals', async () => {
    const user = await signUp()
    const pending = await pendingDeal('Not public yet')
    const pendingSave = await call('PUT', `/api/account/bookmarks/${pending.id}`, {
      cookie: user.cookies,
    })
    const missingSave = await call('PUT', `/api/account/bookmarks/${unknownId}`, {
      cookie: user.cookies,
    })
    expect(pendingSave.status).toBe(404)
    expect(missingSave.status).toBe(404)
    expect(await pendingSave.json()).toEqual(await missingSave.json())
    expect(
      (await call('PUT', '/api/account/bookmarks/not-an-id', { cookie: user.cookies })).status,
    ).toBe(400)
    expect(await db.bookmark.count({ where: { userId: user.id } })).toBe(0)
  })

  it("never shows or deletes another user's bookmarks", async () => {
    const owner = await signUp()
    const stranger = await signUp()
    const deal = await publicDeal('Owner only')
    await call('PUT', `/api/account/bookmarks/${deal.id}`, { cookie: owner.cookies })

    const strangerList = await call('GET', '/api/account/bookmarks', { cookie: stranger.cookies })
    expect(((await strangerList.json()) as Page<unknown>).items).toHaveLength(0)

    const strangerDelete = await call('DELETE', `/api/account/bookmarks/${deal.id}`, {
      cookie: stranger.cookies,
    })
    expect(strangerDelete.status).toBe(200)
    expect(await db.bookmark.count({ where: { userId: owner.id, dealId: deal.id } })).toBe(1)

    await call('DELETE', `/api/account/bookmarks/${deal.id}`, { cookie: owner.cookies })
    expect(await db.bookmark.count({ where: { userId: owner.id, dealId: deal.id } })).toBe(0)
  })

  it('hides the details of a saved deal once it is no longer public', async () => {
    const user = await signUp()
    const deal = await publicDeal('Soon hidden')
    await call('PUT', `/api/account/bookmarks/${deal.id}`, { cookie: user.cookies })
    await db.deal.update({ where: { id: deal.id }, data: { reviewStatus: 'HIDDEN' } })
    const list = await call('GET', '/api/account/bookmarks', { cookie: user.cookies })
    const body = (await list.json()) as Page<{ dealId: string; deal: unknown }>
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({ dealId: deal.id, deal: null })
    expect(JSON.stringify(body)).not.toContain('Soon hidden')
  })
})

describe('account endpoints: my submissions', () => {
  it("lists the user's own submissions in any state and nobody else's", async () => {
    const author = await signUp()
    const other = await signUp()
    await pendingDeal('Mine, pending', author.id)
    await pendingDeal('Someone else', other.id)
    const removed = await pendingDeal('Mine, removed', author.id)
    await db.deal.update({ where: { id: removed.id }, data: { deletedAt: new Date() } })

    const mine = await call('GET', '/api/account/submissions', { cookie: author.cookies })
    const body = (await mine.json()) as Page<{ title: string; reviewStatus: string }>
    expect(body.items.map((item) => item.title)).toEqual(['Mine, pending'])
    expect(body.items[0]?.reviewStatus).toBe('PENDING')
  })
})

describe('account endpoints: merchant access requests', () => {
  it('creates a pending request without granting any merchant privileges', async () => {
    const user = await signUp()
    const venue = await syntheticVenue()
    const response = await call('POST', '/api/account/merchant-requests', {
      cookie: user.cookies,
      body: { venueId: venue.id, message: 'I run this stall' },
    })
    expect(response.status).toBe(201)

    const stored = await db.merchantAccessRequest.findFirstOrThrow({ where: { userId: user.id } })
    expect(stored.status).toBe('PENDING')
    // A pending merchant is still a regular user with no stall access.
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('USER')
    expect(await db.stallGrant.count({ where: { userId: user.id } })).toBe(0)

    const mine = await call('GET', '/api/account/merchant-requests', { cookie: user.cookies })
    const body = (await mine.json()) as Page<{ status: string; venueName: string }>
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({ status: 'PENDING', venueName: venue.name })
  })

  it('rejects a second pending request for the same stall', async () => {
    const user = await signUp()
    const venue = await syntheticVenue()
    const send = () =>
      call('POST', '/api/account/merchant-requests', {
        cookie: user.cookies,
        body: { venueId: venue.id, message: 'Please approve' },
      })
    expect((await send()).status).toBe(201)
    expect((await send()).status).toBe(409)
    expect(await db.merchantAccessRequest.count({ where: { userId: user.id } })).toBe(1)
  })

  it('ignores identity and role fields smuggled into the request', async () => {
    const user = await signUp()
    const victim = await signUp()
    const venue = await syntheticVenue()
    for (const extra of [{ userId: victim.id }, { role: 'ADMIN' }, { status: 'APPROVED' }]) {
      const response = await call('POST', '/api/account/merchant-requests', {
        cookie: user.cookies,
        body: { venueId: venue.id, message: 'Sneaky', ...extra },
      })
      expect(response.status).toBe(400)
    }
    expect(
      await db.merchantAccessRequest.count({ where: { userId: { in: [user.id, victim.id] } } }),
    ).toBe(0)
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('USER')
  })

  it('refuses staff accounts and inactive or unknown stalls', async () => {
    const staff = await signUp()
    const user = await signUp()
    const venue = await syntheticVenue()
    await db.user.update({ where: { id: staff.id }, data: { role: 'ADMIN' } })
    const asStaff = await call('POST', '/api/account/merchant-requests', {
      cookie: staff.cookies,
      body: { venueId: venue.id, message: 'Staff request' },
    })
    expect(asStaff.status).toBe(412)

    await db.venue.update({ where: { id: venue.id }, data: { deletedAt: new Date() } })
    const inactive = await call('POST', '/api/account/merchant-requests', {
      cookie: user.cookies,
      body: { venueId: venue.id, message: 'Closed stall' },
    })
    expect(inactive.status).toBe(412)
    const unknown = await call('POST', '/api/account/merchant-requests', {
      cookie: user.cookies,
      body: { venueId: unknownId, message: 'No such stall' },
    })
    expect(unknown.status).toBe(412)
  })

  it("lists only the caller's own requests", async () => {
    const first = await signUp()
    const second = await signUp()
    const venue = await syntheticVenue()
    await call('POST', '/api/account/merchant-requests', {
      cookie: first.cookies,
      body: { venueId: venue.id, message: 'First applicant' },
    })
    const list = await call('GET', '/api/account/merchant-requests', { cookie: second.cookies })
    expect(((await list.json()) as Page<unknown>).items).toHaveLength(0)
  })
})
