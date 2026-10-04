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

const origin = 'http://localhost:5173'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
let concurrentDb: typeof db
let baseURL = ''
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
const signUp = async (name: string, hostileFields: Record<string, unknown> = {}) => {
  const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      name,
      email: `synthetic-${randomUUID()}@example.test`,
      password: randomBytes(24).toString('base64url'),
      ...hostileFields,
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
  const databaseUrl = mongo.getUri(`platform_admin_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await promisify(execFile)('bun', ['run', '--cwd', 'packages/db', 'push'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    timeout: 60_000,
  })
  const database = await import('@broke-oclock/db')
  db = database.db
  // A separate pool, explicitly pinned to this disposable replica, for out-of-band writes.
  concurrentDb = new database.PrismaClient({ datasources: { db: { url: databaseUrl } } })
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
    ),
  )
  admin = await signUp('Synthetic admin')
  member = await signUp('Synthetic member', { role: 'MERCHANT', platformVersion: 999 })
  moderator = await signUp('Synthetic moderator')
  await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
  await db.user.update({ where: { id: moderator.id }, data: { role: 'MODERATOR' } })
}, 180_000)
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await concurrentDb?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})
const syntheticUser = (role: 'USER' | 'MERCHANT' | 'MODERATOR' | 'ADMIN' = 'USER') =>
  db.user.create({
    data: {
      name: 'Synthetic target',
      email: `synthetic-${randomUUID()}@example.test`,
      emailVerified: false,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })

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

// Timing-only instrumentation: every delegate still performs its real Mongo read.
const pauseUserRead = (userId: string) => {
  let signalRead = () => {}
  let resume = () => {}
  let paused = false
  const read = new Promise<void>((resolve) => {
    signalRead = resolve
  })
  const release = new Promise<void>((resolve) => {
    resume = resolve
  })
  const transact = db.$transaction.bind(db)
  const spy = vi.spyOn(db, '$transaction').mockImplementation((operation, options) =>
    transact(async (tx) => {
      const instrumented = new Proxy(tx, {
        get(target, property, receiver) {
          if (property !== 'user') return Reflect.get(target, property, receiver)
          return new Proxy(target.user, {
            get(delegate, method, delegateReceiver) {
              if (method !== 'findUnique') return Reflect.get(delegate, method, delegateReceiver)
              return async (...args: Parameters<typeof delegate.findUnique>) => {
                const row = await delegate.findUnique(...args)
                if (row?.id === userId && !paused) {
                  paused = true
                  signalRead()
                  await release
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
  return { read, resume, restore: () => spy.mockRestore() }
}
// Pause only after the selected delegate has read the real active record.
const pauseActiveRecordRead = (model: 'venue' | 'merchant', id: string) => {
  let signalRead = () => {}
  let resume = () => {}
  let paused = false
  const read = new Promise<void>((resolve) => {
    signalRead = resolve
  })
  const release = new Promise<void>((resolve) => {
    resume = resolve
  })
  const afterRead = async (row: { id: string } | null) => {
    if (row?.id === id && !paused) {
      paused = true
      signalRead()
      await release
    }
  }
  const transact = db.$transaction.bind(db)
  const spy = vi.spyOn(db, '$transaction').mockImplementation((operation, options) =>
    transact(
      async (tx) =>
        operation(
          new Proxy(tx, {
            get(target, property, receiver) {
              if (property === model && property === 'venue')
                return new Proxy(target.venue, {
                  get(delegate, method, delegateReceiver) {
                    if (method !== 'findUnique')
                      return Reflect.get(delegate, method, delegateReceiver)
                    return async (...args: Parameters<typeof delegate.findUnique>) => {
                      const row = await delegate.findUnique(...args)
                      await afterRead(row)
                      return row
                    }
                  },
                })
              if (property === model && property === 'merchant')
                return new Proxy(target.merchant, {
                  get(delegate, method, delegateReceiver) {
                    if (method !== 'findUnique')
                      return Reflect.get(delegate, method, delegateReceiver)
                    return async (...args: Parameters<typeof delegate.findUnique>) => {
                      const row = await delegate.findUnique(...args)
                      await afterRead(row)
                      return row
                    }
                  },
                })
              return Reflect.get(target, property, receiver)
            },
          }),
        ),
      options,
    ),
  )
  return { read, resume, restore: () => spy.mockRestore() }
}
const outcome = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ status: 'fulfilled' as const, value }),
    (reason: unknown) => ({ status: 'rejected' as const, reason }),
  )

describe('platform administration: real HTTP/cookies/disposable replica', () => {
  it('submits internally then atomically approves only the named stall and promotes USER without an implicit staff downgrade', async () => {
    const client = clientFor(admin.cookie).platformAdmin
    expect((await client.requests.query({ status: 'PENDING' })).items).toEqual([])
    const { submitMerchantAccessRequest } = await import('@api/modules/platform-admin/requests')
    const target = await syntheticUser()
    const venue = await syntheticVenue()
    const request = await submitMerchantAccessRequest(db, target.id, {
      venueId: venue.id,
      message: 'Synthetic operator proof',
    })
    expect(request).toMatchObject({ version: 1, status: 'PENDING' })
    const list = await client.requests.query({ status: 'PENDING' })
    expect(list.items).toMatchObject([
      {
        id: request.id,
        userId: target.id,
        userName: target.name,
        userEmail: target.email,
        venueId: venue.id,
        venueName: venue.name,
        merchantName: 'Synthetic merchant',
        message: 'Synthetic operator proof',
        reviewNote: null,
        version: 1,
      },
    ])
    await expect(
      submitMerchantAccessRequest(db, target.id, { venueId: venue.id, message: 'Duplicate' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(
      await client.reviewRequest.mutate({
        requestId: request.id,
        expectedVersion: 1,
        decision: 'APPROVE',
        note: 'Verified operator',
      }),
    ).toEqual({ id: request.id, version: 2 })
    const account = await client.account.query({ userId: target.id })
    expect(account).toMatchObject({ role: 'MERCHANT', version: 1, grants: [{ venueId: venue.id }] })
    const history = await client.audit.query({ userId: target.id })
    expect(history.items[0]).toMatchObject({
      action: 'REQUEST_APPROVED',
      roleBefore: 'USER',
      roleAfter: 'MERCHANT',
      note: 'Verified operator',
    })
    await expect(
      client.reviewRequest.mutate({
        requestId: request.id,
        expectedVersion: 2,
        decision: 'APPROVE',
        note: 'Repeat',
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } })
    expect((await client.requests.query({ status: 'APPROVED' })).items).toMatchObject([
      { id: request.id, reviewNote: 'Verified operator', status: 'APPROVED', version: 2 },
    ])
    expect(await client.audit.query({ userId: target.id })).toEqual(history)
    const secondVenue = await syntheticVenue()
    const rejected = await submitMerchantAccessRequest(db, target.id, {
      venueId: secondVenue.id,
      message: 'Other outlet',
    })
    await client.reviewRequest.mutate({
      requestId: rejected.id,
      expectedVersion: 1,
      decision: 'REJECT',
      note: 'No proof for this outlet',
    })
    expect((await client.account.query({ userId: target.id })).grants).toHaveLength(1)
    expect((await client.audit.query({ userId: target.id })).items[0]).toMatchObject({
      action: 'REQUEST_REJECTED',
      roleBefore: null,
      roleAfter: null,
    })
    const staff = await syntheticUser('MODERATOR')
    await expect(
      submitMerchantAccessRequest(db, staff.id, { venueId: venue.id, message: 'No downgrade' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
  })
  it('revokes access immediately, preserves grant identity and requires deliberate versioned regrant', async () => {
    const target = await syntheticUser('MERCHANT')
    const venue = await syntheticVenue()
    const client = clientFor(admin.cookie).platformAdmin
    const { requireMerchantStall } = await import('@api/modules/platform-admin/capability')
    const grant = await client.grantStall.mutate({
      userId: target.id,
      venueId: venue.id,
      expectedUserVersion: 0,
      note: 'Grant',
    })
    await expect(
      client.revokeStall.mutate({ grantId: grant.id, expectedVersion: 0, note: 'Stale revoke' }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } })
    expect(
      await client.revokeStall.mutate({ grantId: grant.id, expectedVersion: 1, note: 'Revoke' }),
    ).toEqual({ id: grant.id, version: 2 })
    await expect(
      db.$transaction((tx) => requireMerchantStall(tx, target.id, venue.id)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect((await client.account.query({ userId: target.id })).grants).toEqual([])
    await expect(
      client.revokeStall.mutate({ grantId: grant.id, expectedVersion: 2, note: 'Repeat' }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } })
    expect(
      await client.grantStall.mutate({
        userId: target.id,
        venueId: venue.id,
        expectedUserVersion: 2,
        note: 'Regrant',
      }),
    ).toEqual({ id: grant.id, version: 3 })
    await client.changeRole.mutate({
      userId: target.id,
      expectedVersion: 3,
      role: 'USER',
      note: 'Remove merchant authority',
    })
    expect((await db.stallGrant.findUniqueOrThrow({ where: { id: grant.id } })).version).toBe(4)
    expect((await client.account.query({ userId: target.id })).grants).toEqual([])
    await expect(
      db.$transaction((tx) => requireMerchantStall(tx, target.id, venue.id)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await client.changeRole.mutate({
      userId: target.id,
      expectedVersion: 4,
      role: 'MERCHANT',
      note: 'Role alone is not stall access',
    })
    await expect(
      db.$transaction((tx) => requireMerchantStall(tx, target.id, venue.id)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(await db.stallGrant.count({ where: { userId: target.id } })).toBe(1)
    expect((await client.audit.query({ userId: target.id })).items.map((x) => x.action)).toEqual([
      'ROLE_CHANGED',
      'ROLE_CHANGED',
      'STALL_REVOKED',
      'STALL_GRANTED',
      'STALL_REVOKED',
      'STALL_GRANTED',
    ])
  })
  it('revokes only the second of two active sibling-stall grants held by the same MERCHANT', async () => {
    const { requireMerchantStall } = await import('@api/modules/platform-admin/capability')
    const target = await syntheticUser('MERCHANT')
    const firstVenue = await syntheticVenue('First synthetic sibling stall')
    const secondVenue = await db.venue.create({
      data: {
        merchantId: firstVenue.merchantId,
        name: 'Second synthetic sibling stall',
        address: 'Synthetic sibling address',
        latitude: 1.31,
        longitude: 103.81,
      },
    })
    const c = clientFor(admin.cookie).platformAdmin
    const firstGrant = await c.grantStall.mutate({
      userId: target.id,
      venueId: firstVenue.id,
      expectedUserVersion: 0,
      note: 'First sibling access',
    })
    const secondGrant = await c.grantStall.mutate({
      userId: target.id,
      venueId: secondVenue.id,
      expectedUserVersion: 1,
      note: 'Second sibling access',
    })
    expect(firstGrant.version).toBe(1)
    expect(secondGrant.version).toBe(1)
    const firstCapability = await db.$transaction((tx) =>
      requireMerchantStall(tx, target.id, firstVenue.id),
    )
    expect(firstCapability).toEqual({
      userId: target.id,
      venueId: firstVenue.id,
      grantId: firstGrant.id,
      grantVersion: 1,
    })
    await expect(
      db.$transaction((tx) => requireMerchantStall(tx, target.id, secondVenue.id)),
    ).resolves.toEqual({
      userId: target.id,
      venueId: secondVenue.id,
      grantId: secondGrant.id,
      grantVersion: 1,
    })
    const firstBefore = await db.stallGrant.findUniqueOrThrow({ where: { id: firstGrant.id } })
    const secondBefore = await db.stallGrant.findUniqueOrThrow({ where: { id: secondGrant.id } })
    const historyBefore = await c.audit.query({ userId: target.id })
    const accountBefore = await c.account.query({ userId: target.id })
    expect(accountBefore).toMatchObject({ role: 'MERCHANT', version: 2 })
    expect(accountBefore.grants).toHaveLength(2)
    expect(firstBefore.revokedAt).toBeNull()
    expect(secondBefore.revokedAt).toBeNull()

    expect(
      await c.revokeStall.mutate({
        grantId: secondGrant.id,
        expectedVersion: secondGrant.version,
        note: 'Revoke only second sibling',
      }),
    ).toEqual({ id: secondGrant.id, version: 2 })
    await expect(
      db.$transaction((tx) => requireMerchantStall(tx, target.id, firstVenue.id)),
    ).resolves.toEqual(firstCapability)
    await expect(
      db.$transaction((tx) => requireMerchantStall(tx, target.id, secondVenue.id)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(await db.stallGrant.findUniqueOrThrow({ where: { id: firstGrant.id } })).toEqual(
      firstBefore,
    )
    expect(await db.stallGrant.findUniqueOrThrow({ where: { id: secondGrant.id } })).toEqual({
      ...secondBefore,
      version: 2,
      revokedAt: expect.any(Date),
      updatedAt: expect.any(Date),
    })
    expect(await db.stallGrant.count({ where: { userId: target.id } })).toBe(2)
    const accountAfter = await c.account.query({ userId: target.id })
    expect(accountAfter).toMatchObject({ id: target.id, role: 'MERCHANT', version: 3 })
    expect(accountAfter.grants).toEqual(
      accountBefore.grants.filter((grant) => grant.id === firstGrant.id),
    )
    expect(await db.user.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({
      role: 'MERCHANT',
      platformVersion: 3,
    })
    const historyAfter = await c.audit.query({ userId: target.id })
    expect(historyAfter.items).toHaveLength(3)
    expect(historyAfter.items.slice(1)).toEqual(historyBefore.items)
    expect(historyAfter.items[0]).toMatchObject({
      actorId: admin.id,
      targetUserId: target.id,
      venueId: secondVenue.id,
      action: 'STALL_REVOKED',
      roleBefore: null,
      roleAfter: null,
      note: 'Revoke only second sibling',
    })
  })
  it('invalidates pending requests on role changes and revocation, preventing stale reapproval', async () => {
    const { submitMerchantAccessRequest } = await import('@api/modules/platform-admin/requests')
    const target = await syntheticUser()
    const venue = await syntheticVenue()
    const client = clientFor(admin.cookie).platformAdmin
    const pending = await submitMerchantAccessRequest(db, target.id, {
      venueId: venue.id,
      message: 'Before role change',
    })
    await client.changeRole.mutate({
      userId: target.id,
      expectedVersion: 0,
      role: 'MERCHANT',
      note: 'Reviewed separately',
    })
    await expect(
      client.reviewRequest.mutate({
        requestId: pending.id,
        expectedVersion: 1,
        decision: 'APPROVE',
        note: 'Stale role context',
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } })
    expect(
      await db.merchantAccessRequest.findUniqueOrThrow({ where: { id: pending.id } }),
    ).toMatchObject({ status: 'REJECTED', version: 2 })
    const fresh = await submitMerchantAccessRequest(db, target.id, {
      venueId: venue.id,
      message: 'Fresh request',
    })
    const grant = await client.grantStall.mutate({
      userId: target.id,
      venueId: venue.id,
      expectedUserVersion: 1,
      note: 'Direct grant',
    })
    await client.revokeStall.mutate({
      grantId: grant.id,
      expectedVersion: 1,
      note: 'Revoke invalidates pending request',
    })
    await expect(
      client.reviewRequest.mutate({
        requestId: fresh.id,
        expectedVersion: 1,
        decision: 'APPROVE',
        note: 'Must not undo revocation',
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } })
    expect((await client.account.query({ userId: target.id })).grants).toEqual([])
    expect(
      (await client.audit.query({ userId: target.id })).items.filter(
        (x) => x.action === 'REQUEST_REJECTED',
      ),
    ).toHaveLength(2)
  })
  it('rejects an actor demoted after the real transactional authorization read without any target/audit writes', async () => {
    const target = await syntheticUser()
    const client = clientFor(admin.cookie).platformAdmin
    const barrier = pauseUserRead(admin.id)
    const mutation = outcome(
      client.changeRole.mutate({
        userId: target.id,
        expectedVersion: 0,
        role: 'MERCHANT',
        note: 'Paused actor check',
      }),
    )
    try {
      await Promise.race([
        barrier.read,
        mutation.then(() => {
          throw new Error('Mutation missed authorization barrier')
        }),
      ])
      await db.user.update({ where: { id: admin.id }, data: { role: 'USER' } })
      barrier.resume()
      expect(await mutation).toMatchObject({
        status: 'rejected',
        reason: { data: { code: 'CONFLICT' } },
      })
      expect(await db.user.findUniqueOrThrow({ where: { id: target.id } })).toEqual(target)
      expect(await db.platformAudit.count({ where: { targetUserId: target.id } })).toBe(0)
    } finally {
      barrier.resume()
      await mutation
      barrier.restore()
      await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
    }
  })
  it('denies every procedure to anonymous, USER, MERCHANT and MODERATOR callers', async () => {
    const id = '000000000000000000000001'
    const calls = (cookie: string) => {
      const c = clientFor(cookie).platformAdmin
      return [
        () => c.accounts.query({}),
        () => c.account.query({ userId: id }),
        () => c.requests.query({}),
        () => c.venues.query({}),
        () => c.audit.query({}),
        () =>
          c.changeRole.mutate({ userId: id, expectedVersion: 0, role: 'ADMIN', note: 'Denied' }),
        () =>
          c.grantStall.mutate({ userId: id, venueId: id, expectedUserVersion: 0, note: 'Denied' }),
        () => c.revokeStall.mutate({ grantId: id, expectedVersion: 0, note: 'Denied' }),
        () =>
          c.reviewRequest.mutate({
            requestId: id,
            expectedVersion: 0,
            decision: 'APPROVE',
            note: 'Denied',
          }),
      ]
    }
    for (const call of calls(''))
      await expect(call()).rejects.toMatchObject({ data: { code: 'UNAUTHORIZED' } })
    try {
      for (const role of ['USER', 'MERCHANT', 'MODERATOR'] as const) {
        await db.user.update({ where: { id: member.id }, data: { role } })
        for (const call of calls(member.cookie))
          await expect(call()).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } })
      }
    } finally {
      await db.user.update({ where: { id: member.id }, data: { role: 'USER' } })
    }
  })
  it('denies every mutation without a trusted exact origin and rejects forged/oversized inputs', async () => {
    const target = await syntheticUser('MERCHANT')
    const venue = await syntheticVenue()
    for (const origin of ['', 'https://untrusted.example', 'http://localhost:5173.evil.test']) {
      const c = clientFor(admin.cookie, origin).platformAdmin
      const actions = [
        c.changeRole.mutate({
          userId: target.id,
          expectedVersion: 0,
          role: 'USER',
          note: 'Denied',
        }),
        c.grantStall.mutate({
          userId: target.id,
          venueId: venue.id,
          expectedUserVersion: 0,
          note: 'Denied',
        }),
        c.revokeStall.mutate({ grantId: venue.id, expectedVersion: 0, note: 'Denied' }),
        c.reviewRequest.mutate({
          requestId: venue.id,
          expectedVersion: 0,
          decision: 'REJECT',
          note: 'Denied',
        }),
      ]
      for (const result of await Promise.allSettled(actions))
        expect(result).toMatchObject({
          status: 'rejected',
          reason: { data: { code: 'FORBIDDEN' } },
        })
    }
    const c = clientFor(admin.cookie).platformAdmin
    for (const note of ['', '   ', 'x'.repeat(501)])
      await expect(
        c.changeRole.mutate({ userId: target.id, expectedVersion: 0, role: 'USER', note }),
      ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } })
    await expect(
      c.changeRole.mutate({
        userId: target.id,
        expectedVersion: -1,
        role: 'USER',
        note: 'Invalid version',
      }),
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } })
    await expect(
      c.changeRole.mutate({
        userId: 'not-an-id',
        expectedVersion: 0,
        role: 'USER',
        note: 'Bad id',
      }),
    ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } })
    const forged = {
      userId: target.id,
      expectedVersion: 0,
      role: 'USER' as const,
      note: 'Forged audit',
      actorId: target.id,
      roleBefore: 'ADMIN',
    }
    await expect(c.changeRole.mutate(forged)).rejects.toMatchObject({
      data: { code: 'BAD_REQUEST' },
    })
    for (const input of [
      { limit: 0 },
      { limit: 101 },
      { search: 'x'.repeat(101) },
      { cursor: 'bad' },
    ])
      await expect(c.accounts.query(input)).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } })
    expect(await db.user.findUniqueOrThrow({ where: { id: target.id } })).toEqual(target)
    expect(await db.platformAudit.count({ where: { targetUserId: target.id } })).toBe(0)
  })
  it('keeps MERCHANT and platform version server-owned through actual signup/profile endpoints', async () => {
    // This account was signed up with hostile fields in beforeAll; reuse its real
    // cookie instead of exhausting Better Auth's deliberate signup limiter.
    const user = await db.user.findUniqueOrThrow({ where: { id: member.id } })
    expect(user).toMatchObject({ role: 'USER', platformVersion: null })
    const cookie = member.cookie
    const edited = await fetch(`${baseURL}/api/auth/update-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie },
      body: JSON.stringify({
        name: 'Legitimate profile edit',
        role: 'MERCHANT',
        platformVersion: 999,
      }),
    })
    expect(edited.status).toBe(400)
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      name: user.name,
      role: 'USER',
      platformVersion: null,
    })
    const legitimate = await fetch(`${baseURL}/api/auth/update-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie },
      body: JSON.stringify({ name: 'Synthetic legitimate profile edit' }),
    })
    expect(legitimate.status).toBe(200)
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      name: 'Synthetic legitimate profile edit',
      role: 'USER',
      platformVersion: null,
    })
  })
  it('permits only one concurrent request submission and one approval, retaining exactly one grant and decision audit', async () => {
    const { submitMerchantAccessRequest } = await import('@api/modules/platform-admin/requests')
    const target = await syntheticUser()
    const venue = await syntheticVenue()
    const submissions = await Promise.allSettled([
      submitMerchantAccessRequest(db, target.id, { venueId: venue.id, message: 'First' }),
      submitMerchantAccessRequest(db, target.id, { venueId: venue.id, message: 'Second' }),
    ])
    expect(submissions.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(submissions.find((x) => x.status === 'rejected')).toMatchObject({
      reason: { code: 'CONFLICT' },
    })
    const request = await db.merchantAccessRequest.findFirstOrThrow({
      where: { userId: target.id },
    })
    const approvals = await Promise.allSettled(
      [1, 2].map(() =>
        clientFor(admin.cookie).platformAdmin.reviewRequest.mutate({
          requestId: request.id,
          expectedVersion: 1,
          decision: 'APPROVE',
          note: 'Concurrent approval',
        }),
      ),
    )
    expect(approvals.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(approvals.find((x) => x.status === 'rejected')).toMatchObject({
      reason: { data: { code: 'CONFLICT' } },
    })
    expect(await db.stallGrant.count({ where: { userId: target.id } })).toBe(1)
    expect(
      await db.platformAudit.count({
        where: { targetUserId: target.id, action: 'REQUEST_APPROVED' },
      }),
    ).toBe(1)
  })
  it('permits only one concurrent direct grant and one concurrent revocation', async () => {
    const target = await syntheticUser('MERCHANT')
    const venue = await syntheticVenue()
    const c = clientFor(admin.cookie).platformAdmin
    const grants = await Promise.allSettled(
      [1, 2].map(() =>
        c.grantStall.mutate({
          userId: target.id,
          venueId: venue.id,
          expectedUserVersion: 0,
          note: 'Concurrent grant',
        }),
      ),
    )
    expect(grants.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(grants.find((x) => x.status === 'rejected')).toMatchObject({
      reason: { data: { code: 'CONFLICT' } },
    })
    const grant = await db.stallGrant.findFirstOrThrow({ where: { userId: target.id } })
    const revocations = await Promise.allSettled(
      [1, 2].map(() =>
        c.revokeStall.mutate({ grantId: grant.id, expectedVersion: 1, note: 'Concurrent revoke' }),
      ),
    )
    expect(revocations.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(revocations.find((x) => x.status === 'rejected')).toMatchObject({
      reason: { data: { code: 'CONFLICT' } },
    })
    expect(await db.platformAudit.count({ where: { targetUserId: target.id } })).toBe(2)
    expect(await db.stallGrant.findUniqueOrThrow({ where: { id: grant.id } })).toMatchObject({
      version: 2,
      revokedAt: expect.any(Date),
    })
  })
  it('serializes mutually demoting ADMIN actors and always retains an authorized administrator', async () => {
    await db.user.update({ where: { id: moderator.id }, data: { role: 'ADMIN' } })
    expect(await db.user.count({ where: { role: 'ADMIN' } })).toBe(2)
    const a = await db.user.findUniqueOrThrow({ where: { id: admin.id } })
    const b = await db.user.findUniqueOrThrow({ where: { id: moderator.id } })
    try {
      const results = await Promise.allSettled([
        clientFor(admin.cookie).platformAdmin.changeRole.mutate({
          userId: b.id,
          expectedVersion: b.platformVersion ?? 0,
          role: 'USER',
          note: 'Demote B',
        }),
        clientFor(moderator.cookie).platformAdmin.changeRole.mutate({
          userId: a.id,
          expectedVersion: a.platformVersion ?? 0,
          role: 'USER',
          note: 'Demote A',
        }),
      ])
      expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
      const rejected = results.find((x) => x.status === 'rejected')
      expect(rejected?.status === 'rejected' && rejected.reason.data.code).toMatch(
        /CONFLICT|FORBIDDEN/,
      )
      expect(await db.user.count({ where: { role: 'ADMIN' } })).toBe(1)
      const remaining = await db.user.findFirstOrThrow({ where: { role: 'ADMIN' } })
      const cookie = remaining.id === a.id ? admin.cookie : moderator.cookie
      await expect(
        clientFor(cookie).platformAdmin.changeRole.mutate({
          userId: remaining.id,
          expectedVersion: remaining.platformVersion ?? 0,
          role: 'USER',
          note: 'Final admin cannot remove self',
        }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } })
      expect(await db.user.count({ where: { role: 'ADMIN' } })).toBe(1)
    } finally {
      await db.user.update({
        where: { id: admin.id },
        data: { role: 'ADMIN', platformVersion: a.platformVersion },
      })
      await db.user.update({
        where: { id: moderator.id },
        data: { role: 'MODERATOR', platformVersion: b.platformVersion },
      })
    }
  })
  it('fails closed for missing, inactive and privileged grant/review targets without partial writes', async () => {
    const { submitMerchantAccessRequest } = await import('@api/modules/platform-admin/requests')
    const c = clientFor(admin.cookie).platformAdmin
    const venue = await syntheticVenue()
    const missing = '000000000000000000000001'
    await expect(c.account.query({ userId: missing })).rejects.toMatchObject({
      data: { code: 'NOT_FOUND' },
    })
    await expect(
      c.changeRole.mutate({ userId: missing, expectedVersion: 0, role: 'USER', note: 'Missing' }),
    ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } })
    await expect(
      c.grantStall.mutate({
        userId: admin.id,
        venueId: venue.id,
        expectedUserVersion: 0,
        note: 'Self',
      }),
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } })
    for (const role of ['USER', 'MODERATOR', 'ADMIN'] as const) {
      const target = await syntheticUser(role)
      await expect(
        c.grantStall.mutate({
          userId: target.id,
          venueId: venue.id,
          expectedUserVersion: 0,
          note: 'Cannot implicitly change role',
        }),
      ).rejects.toMatchObject({ data: { code: 'PRECONDITION_FAILED' } })
      expect(await db.platformAudit.count({ where: { targetUserId: target.id } })).toBe(0)
      if (role === 'ADMIN')
        await db.user.update({ where: { id: target.id }, data: { role: 'USER' } })
    }
    const user = await syntheticUser()
    const request = await submitMerchantAccessRequest(db, user.id, {
      venueId: venue.id,
      message: 'Application before independent staff promotion',
    })
    await db.user.update({ where: { id: user.id }, data: { role: 'MODERATOR' } })
    await expect(
      c.reviewRequest.mutate({
        requestId: request.id,
        expectedVersion: 1,
        decision: 'APPROVE',
        note: 'Do not downgrade staff',
      }),
    ).rejects.toMatchObject({ data: { code: 'PRECONDITION_FAILED' } })
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('MODERATOR')
    expect(await db.stallGrant.count({ where: { userId: user.id } })).toBe(0)
    expect(
      (await db.merchantAccessRequest.findUniqueOrThrow({ where: { id: request.id } })).status,
    ).toBe('PENDING')
    await c.reviewRequest.mutate({
      requestId: request.id,
      expectedVersion: 1,
      decision: 'REJECT',
      note: 'Staff identity is ineligible',
    })
    const target = await syntheticUser('MERCHANT')
    await expect(
      c.grantStall.mutate({
        userId: target.id,
        venueId: missing,
        expectedUserVersion: 0,
        note: 'Missing stall',
      }),
    ).rejects.toMatchObject({ data: { code: 'PRECONDITION_FAILED' } })
    await db.venue.update({ where: { id: venue.id }, data: { deletedAt: new Date() } })
    await expect(
      c.grantStall.mutate({
        userId: target.id,
        venueId: venue.id,
        expectedUserVersion: 0,
        note: 'Inactive stall',
      }),
    ).rejects.toMatchObject({ data: { code: 'PRECONDITION_FAILED' } })
    await db.venue.update({ where: { id: venue.id }, data: { deletedAt: null } })
    await db.merchant.update({ where: { id: venue.merchantId }, data: { deletedAt: new Date() } })
    await expect(
      c.grantStall.mutate({
        userId: target.id,
        venueId: venue.id,
        expectedUserVersion: 0,
        note: 'Inactive merchant',
      }),
    ).rejects.toMatchObject({ data: { code: 'PRECONDITION_FAILED' } })
    await expect(
      submitMerchantAccessRequest(db, target.id, {
        venueId: venue.id,
        message: 'Inactive merchant',
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
    expect(await db.user.findUniqueOrThrow({ where: { id: target.id } })).toEqual(target)
    expect(await db.platformAudit.count({ where: { targetUserId: target.id } })).toBe(0)
  })
  it.each([
    { action: 'grant', model: 'venue' },
    { action: 'grant', model: 'merchant' },
    { action: 'approve', model: 'venue' },
    { action: 'approve', model: 'merchant' },
  ] as const)(
    'rolls back $action when $model is soft-deleted after its real transactional read',
    async ({ action, model }) => {
      const { submitMerchantAccessRequest } = await import('@api/modules/platform-admin/requests')
      const target = await syntheticUser(action === 'grant' ? 'MERCHANT' : 'USER')
      const venue = await syntheticVenue()
      const c = clientFor(admin.cookie).platformAdmin
      const request = await submitMerchantAccessRequest(db, target.id, {
        venueId: venue.id,
        message: 'Pending before out-of-band soft delete',
      })
      const snapshot = async () => ({
        target: await db.user.findUniqueOrThrow({ where: { id: target.id } }),
        actor: await db.user.findUniqueOrThrow({ where: { id: admin.id } }),
        grants: await db.stallGrant.findMany({
          where: { userId: target.id },
          orderBy: { id: 'asc' },
        }),
        requests: await db.merchantAccessRequest.findMany({
          where: { userId: target.id },
          orderBy: { id: 'asc' },
        }),
        audit: await db.platformAudit.findMany({
          where: { targetUserId: target.id },
          orderBy: { id: 'asc' },
        }),
        venue: await db.venue.findUniqueOrThrow({ where: { id: venue.id } }),
        merchant: await db.merchant.findUniqueOrThrow({ where: { id: venue.merchantId } }),
        fence: await db.platformAccessFence.findUnique({ where: { id: 'platform-access' } }),
      })
      const before = await snapshot()
      expect(before.grants).toEqual([])
      expect(before.requests).toMatchObject([{ id: request.id, status: 'PENDING', version: 1 }])
      expect(before.audit).toMatchObject([{ action: 'REQUEST_SUBMITTED' }])
      expect(before.venue.deletedAt).toBeNull()
      expect(before.merchant.deletedAt).toBeNull()
      const barrier = pauseActiveRecordRead(model, model === 'venue' ? venue.id : venue.merchantId)
      const mutation = outcome(
        action === 'grant'
          ? c.grantStall.mutate({
              userId: target.id,
              venueId: venue.id,
              expectedUserVersion: 0,
              note: 'Grant racing soft delete',
            })
          : c.reviewRequest.mutate({
              requestId: request.id,
              expectedVersion: request.version,
              decision: 'APPROVE',
              note: 'Approval racing soft delete',
            }),
      )
      try {
        await Promise.race([
          barrier.read,
          mutation.then(() => {
            throw new Error('Mutation missed active-record-read barrier')
          }),
        ])
        const deletedAt = new Date()
        const deleted =
          model === 'venue'
            ? await concurrentDb.venue.update({ where: { id: venue.id }, data: { deletedAt } })
            : await concurrentDb.merchant.update({
                where: { id: venue.merchantId },
                data: { deletedAt },
              })
        // The separate connection commits and reads back its deletion before release.
        expect(
          model === 'venue'
            ? await concurrentDb.venue.findUniqueOrThrow({ where: { id: venue.id } })
            : await concurrentDb.merchant.findUniqueOrThrow({ where: { id: venue.merchantId } }),
        ).toEqual(deleted)
        expect(deleted.deletedAt).toEqual(deletedAt)
        barrier.resume()
        expect(await mutation).toMatchObject({
          status: 'rejected',
          reason: { data: { code: 'CONFLICT' } },
        })
        // Only the independent deletion survives: request, grant, audit, identity,
        // activity timestamps on the other record and shared fence all roll back.
        expect(await snapshot()).toEqual({ ...before, [model]: deleted })
        const account = await c.account.query({ userId: target.id })
        expect(account).toMatchObject({ role: target.role, version: 0, grants: [] })
      } finally {
        barrier.resume()
        await mutation
        barrier.restore()
      }
    },
  )
  it('handles absent/null legacy activity fields and checks current venue and merchant activity for capabilities', async () => {
    const { requireMerchantStall } = await import('@api/modules/platform-admin/capability')
    const target = await syntheticUser('MERCHANT')
    const venue = await syntheticVenue('Legacy synthetic stall')
    const c = clientFor(admin.cookie).platformAdmin
    // Typed unset, never raw Mongo fixtures: exercise isSet and explicit-null paths.
    await db.user.update({ where: { id: target.id }, data: { platformVersion: { unset: true } } })
    await db.venue.update({ where: { id: venue.id }, data: { deletedAt: { unset: true } } })
    await db.merchant.update({
      where: { id: venue.merchantId },
      data: { deletedAt: { unset: true } },
    })
    expect(
      (await c.venues.query({ search: 'Legacy synthetic stall' })).items.map((v) => v.id),
    ).toContain(venue.id)
    const grant = await c.grantStall.mutate({
      userId: target.id,
      venueId: venue.id,
      expectedUserVersion: 0,
      note: 'Legacy missing fields',
    })
    await db.stallGrant.update({ where: { id: grant.id }, data: { revokedAt: { unset: true } } })
    expect((await c.account.query({ userId: target.id })).grants).toHaveLength(1)
    await expect(
      db.$transaction((tx) => requireMerchantStall(tx, target.id, venue.id)),
    ).resolves.toMatchObject({ grantId: grant.id })
    await db.venue.update({ where: { id: venue.id }, data: { deletedAt: new Date() } })
    expect((await c.venues.query({ search: 'Legacy synthetic stall' })).items).toEqual([])
    await expect(
      db.$transaction((tx) => requireMerchantStall(tx, target.id, venue.id)),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
    await db.venue.update({ where: { id: venue.id }, data: { deletedAt: null } })
    await db.merchant.update({ where: { id: venue.merchantId }, data: { deletedAt: new Date() } })
    expect((await c.venues.query({ search: 'Legacy synthetic stall' })).items).toEqual([])
    await expect(
      db.$transaction((tx) => requireMerchantStall(tx, target.id, venue.id)),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
    await db.merchant.update({ where: { id: venue.merchantId }, data: { deletedAt: null } })
    expect((await c.venues.query({ search: 'Legacy synthetic stall' })).items).toHaveLength(1)
    await expect(
      db.stallGrant.create({ data: { userId: target.id, venueId: venue.id } }),
    ).rejects.toMatchObject({ code: 'P2002' })
    await c.revokeStall.mutate({ grantId: grant.id, expectedVersion: 1, note: 'Legacy revoke' })
    expect((await c.account.query({ userId: target.id })).grants).toEqual([])
  })
  it('rejects forged internal submission fields and never exposes an unrelated public submission endpoint', async () => {
    const { submitMerchantAccessRequest } = await import('@api/modules/platform-admin/requests')
    const target = await syntheticUser()
    const venue = await syntheticVenue()
    const forged = {
      venueId: venue.id,
      message: 'Forged',
      userId: admin.id,
      role: 'ADMIN',
      status: 'APPROVED',
    }
    await expect(submitMerchantAccessRequest(db, target.id, forged)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
    for (const message of ['', ' '.repeat(5), 'x'.repeat(1001)])
      await expect(
        submitMerchantAccessRequest(db, target.id, { venueId: venue.id, message }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(
      submitMerchantAccessRequest(db, '000000000000000000000001', {
        venueId: venue.id,
        message: 'Missing identity',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    const response = await fetch(`${baseURL}/api/trpc/platformAdmin.submitRequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: member.cookie },
      body: JSON.stringify({ venueId: venue.id, message: 'No unrelated public UI' }),
    })
    expect(response.status).toBe(404)
    expect(await db.merchantAccessRequest.count({ where: { userId: target.id } })).toBe(0)
  })
  it.each(['role', 'grant', 'revoke', 'approve', 'reject', 'submit'] as const)(
    'rolls back every write including a real audit insertion when %s audit persistence fails',
    async (action) => {
      const { submitMerchantAccessRequest } = await import('@api/modules/platform-admin/requests')
      const target = await syntheticUser(
        action === 'grant' || action === 'revoke' ? 'MERCHANT' : 'USER',
      )
      const venue = await syntheticVenue()
      const c = clientFor(admin.cookie).platformAdmin
      const grant =
        action === 'revoke'
          ? await c.grantStall.mutate({
              userId: target.id,
              venueId: venue.id,
              expectedUserVersion: 0,
              note: 'Setup',
            })
          : null
      const request =
        action === 'approve' || action === 'reject'
          ? await submitMerchantAccessRequest(db, target.id, {
              venueId: venue.id,
              message: 'Setup',
            })
          : null
      const snapshot = async () => ({
        target: await db.user.findUniqueOrThrow({ where: { id: target.id } }),
        actor: await db.user.findUniqueOrThrow({ where: { id: admin.id } }),
        grants: await db.stallGrant.findMany({ where: { userId: target.id } }),
        requests: await db.merchantAccessRequest.findMany({ where: { userId: target.id } }),
        audit: await db.platformAudit.findMany({ where: { targetUserId: target.id } }),
        venue: await db.venue.findUniqueOrThrow({ where: { id: venue.id } }),
        merchant: await db.merchant.findUniqueOrThrow({ where: { id: venue.merchantId } }),
        fence: await db.platformAccessFence.findUnique({ where: { id: 'platform-access' } }),
      })
      const before = await snapshot()
      const transact = db.$transaction.bind(db)
      let insertedAudit = false
      const spy = vi.spyOn(db, '$transaction').mockImplementation((operation, options) =>
        transact(
          async (tx) =>
            operation(
              new Proxy(tx, {
                get(transaction, property, receiver) {
                  if (property !== 'platformAudit')
                    return Reflect.get(transaction, property, receiver)
                  return new Proxy(transaction.platformAudit, {
                    get(delegate, method, delegateReceiver) {
                      if (method !== 'create')
                        return Reflect.get(delegate, method, delegateReceiver)
                      return async (...args: Parameters<typeof delegate.create>) => {
                        await delegate.create(...args)
                        insertedAudit = true
                        throw new Error('Synthetic forced audit failure with private detail')
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
        const mutation =
          action === 'role'
            ? c.changeRole.mutate({
                userId: target.id,
                expectedVersion: 0,
                role: 'MERCHANT',
                note: 'Rollback',
              })
            : action === 'grant'
              ? c.grantStall.mutate({
                  userId: target.id,
                  venueId: venue.id,
                  expectedUserVersion: 0,
                  note: 'Rollback',
                })
              : action === 'revoke' && grant
                ? c.revokeStall.mutate({
                    grantId: grant.id,
                    expectedVersion: grant.version,
                    note: 'Rollback',
                  })
                : (action === 'approve' || action === 'reject') && request
                  ? c.reviewRequest.mutate({
                      requestId: request.id,
                      expectedVersion: 1,
                      decision: action === 'approve' ? 'APPROVE' : 'REJECT',
                      note: 'Rollback',
                    })
                  : submitMerchantAccessRequest(db, target.id, {
                      venueId: venue.id,
                      message: 'Rollback',
                    })
        if (action === 'submit')
          await expect(mutation).rejects.toThrow('Synthetic forced audit failure')
        else
          await expect(mutation).rejects.toMatchObject({
            message: 'Internal server error',
            data: { code: 'INTERNAL_SERVER_ERROR' },
          })
        expect(insertedAudit).toBe(true)
      } finally {
        spy.mockRestore()
      }
      expect(await snapshot()).toEqual(before)
    },
  )
  it.each(['grant', 'approve', 'submit'] as const)(
    'serializes %s decisions with role changes using the shared transaction fence',
    async (action) => {
      const { submitMerchantAccessRequest } = await import('@api/modules/platform-admin/requests')
      const target = await syntheticUser(action === 'grant' ? 'MERCHANT' : 'USER')
      const venue = await syntheticVenue()
      const c = clientFor(admin.cookie).platformAdmin
      const request =
        action === 'approve'
          ? await submitMerchantAccessRequest(db, target.id, {
              venueId: venue.id,
              message: 'Before competing role change',
            })
          : null
      const barrier = pauseUserRead(target.id)
      const first = outcome(
        action === 'grant'
          ? c.grantStall.mutate({
              userId: target.id,
              venueId: venue.id,
              expectedUserVersion: 0,
              note: 'Concurrent grant',
            })
          : action === 'approve' && request
            ? c.reviewRequest.mutate({
                requestId: request.id,
                expectedVersion: 1,
                decision: 'APPROVE',
                note: 'Concurrent approval',
              })
            : submitMerchantAccessRequest(db, target.id, {
                venueId: venue.id,
                message: 'Concurrent submission',
              }),
      )
      try {
        await Promise.race([
          barrier.read,
          first.then(() => {
            throw new Error('Decision missed target-read barrier')
          }),
        ])
        await expect(
          c.changeRole.mutate({
            userId: target.id,
            expectedVersion: 0,
            role: 'MODERATOR',
            note: 'Competing role change',
          }),
        ).rejects.toMatchObject({ data: { code: 'CONFLICT' } })
        barrier.resume()
        expect(await first).toMatchObject({ status: 'fulfilled' })
      } finally {
        barrier.resume()
        await first
        barrier.restore()
      }
      const detail = await c.account.query({ userId: target.id })
      await c.changeRole.mutate({
        userId: target.id,
        expectedVersion: detail.version,
        role: 'MODERATOR',
        note: 'Fresh deliberate role change',
      })
      expect((await c.account.query({ userId: target.id })).grants).toEqual([])
      expect(
        await db.merchantAccessRequest.count({ where: { userId: target.id, status: 'PENDING' } }),
      ).toBe(0)
    },
  )
  it('keeps a merchant write and capability check in the same transaction against a competing revocation', async () => {
    const { requireMerchantStall } = await import('@api/modules/platform-admin/capability')
    const target = await syntheticUser('MERCHANT')
    const venue = await syntheticVenue()
    const c = clientFor(admin.cookie).platformAdmin
    const grant = await c.grantStall.mutate({
      userId: target.id,
      venueId: venue.id,
      expectedUserVersion: 0,
      note: 'Setup capability race',
    })
    const barrier = pauseUserRead(target.id)
    const write = outcome(
      db.$transaction(async (tx) => {
        await requireMerchantStall(tx, target.id, venue.id)
        return tx.venue.update({
          where: { id: venue.id },
          data: { name: 'Authorized synthetic transaction write' },
        })
      }),
    )
    try {
      await Promise.race([
        barrier.read,
        write.then(() => {
          throw new Error('Capability missed identity-read barrier')
        }),
      ])
      await expect(
        c.revokeStall.mutate({
          grantId: grant.id,
          expectedVersion: 1,
          note: 'Competing revocation',
        }),
      ).rejects.toMatchObject({ data: { code: 'CONFLICT' } })
      barrier.resume()
      expect(await write).toMatchObject({
        status: 'fulfilled',
        value: { name: 'Authorized synthetic transaction write' },
      })
    } finally {
      barrier.resume()
      await write
      barrier.restore()
    }
    await c.revokeStall.mutate({
      grantId: grant.id,
      expectedVersion: 1,
      note: 'Revocation after committed write',
    })
    await expect(
      db.$transaction(async (tx) => {
        await requireMerchantStall(tx, target.id, venue.id)
        return tx.venue.update({ where: { id: venue.id }, data: { name: 'Forbidden write' } })
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect((await db.venue.findUniqueOrThrow({ where: { id: venue.id } })).name).toBe(
      'Authorized synthetic transaction write',
    )
  })
  it('paginates request/venue/audit lists deterministically and retains immutable role/name snapshots', async () => {
    const { submitMerchantAccessRequest } = await import('@api/modules/platform-admin/requests')
    const c = clientFor(admin.cookie).platformAdmin
    const target = await syntheticUser()
    const prefix = `Synthetic pagination ${randomUUID()}`
    const venues = [
      await syntheticVenue(`${prefix} A`),
      await syntheticVenue(`${prefix} B`),
      await syntheticVenue(`${prefix} C`),
    ]
    for (const venue of venues)
      await submitMerchantAccessRequest(db, target.id, {
        venueId: venue.id,
        message: 'Synthetic bounded request',
      })
    const venuePage = await c.venues.query({ search: prefix, limit: 2 })
    expect(venuePage.items).toHaveLength(2)
    const lastVenues = await c.venues.query({
      search: prefix,
      limit: 2,
      cursor: venuePage.nextCursor ?? undefined,
    })
    expect(lastVenues.items).toHaveLength(1)
    expect(lastVenues.nextCursor).toBeNull()
    expect(new Set([...venuePage.items, ...lastVenues.items].map((v) => v.id)).size).toBe(3)
    const requestPage = await c.requests.query({ status: 'PENDING', limit: 1 })
    const nextRequests = await c.requests.query({
      status: 'PENDING',
      limit: 1,
      cursor: requestPage.nextCursor ?? undefined,
    })
    expect(requestPage.items[0]?.id).not.toBe(nextRequests.items[0]?.id)
    await c.changeRole.mutate({
      userId: target.id,
      expectedVersion: 0,
      role: 'MERCHANT',
      note: 'Immutable before/after',
    })
    const snapshot = await c.audit.query({ userId: target.id, limit: 100 })
    await db.user.update({ where: { id: target.id }, data: { name: 'Renamed synthetic target' } })
    await db.user.update({ where: { id: admin.id }, data: { name: 'Renamed synthetic admin' } })
    expect(await c.audit.query({ userId: target.id, limit: 100 })).toEqual(snapshot)
    const firstAudit = await c.audit.query({ userId: target.id, limit: 2 })
    const nextAudit = await c.audit.query({
      userId: target.id,
      limit: 100,
      cursor: firstAudit.nextCursor ?? undefined,
    })
    expect([...firstAudit.items, ...nextAudit.items]).toEqual(snapshot.items)
    const merchantAccounts = await c.accounts.query({ role: 'MERCHANT', search: target.email })
    expect(merchantAccounts.items.map((x) => x.id)).toEqual([target.id])
    await db.user.update({ where: { id: admin.id }, data: { name: 'Synthetic admin' } })
  })
  it('preserves ingestion account DTOs when MERCHANT accounts exist', async () => {
    const merchant = await syntheticUser('MERCHANT')
    const rows = await clientFor(admin.cookie).ingestion.accounts.query({ limit: 50 })
    expect(rows.items.find((row) => row.id === merchant.id)?.role).toBe('MERCHANT')
  })
  it('grants exactly one active stall to a MERCHANT and isolates all other stalls', async () => {
    const target = await syntheticUser('MERCHANT')
    const venue = await syntheticVenue()
    const other = await db.venue.create({
      data: {
        merchantId: venue.merchantId,
        name: 'Other synthetic stall of the same merchant',
        address: 'Other address',
        latitude: 1.31,
        longitude: 103.81,
      },
    })
    const client = clientFor(admin.cookie).platformAdmin
    const venues = await client.venues.query({ search: 'Synthetic stall' })
    expect(venues.items.map((v) => v.id)).toContain(venue.id)
    expect(venues.items[0]).toMatchObject({
      merchantName: 'Synthetic merchant',
      address: 'Synthetic address',
    })
    const grant = await client.grantStall.mutate({
      userId: target.id,
      venueId: venue.id,
      expectedUserVersion: 0,
      note: 'Verified outlet authority',
    })
    expect(grant.version).toBe(1)
    const detail = await client.account.query({ userId: target.id })
    expect(detail).toMatchObject({
      id: target.id,
      role: 'MERCHANT',
      version: 1,
      grants: [{ id: grant.id, venueId: venue.id, version: 1 }],
    })
    await expect(
      client.grantStall.mutate({
        userId: target.id,
        venueId: venue.id,
        expectedUserVersion: 1,
        note: 'Duplicate',
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } })
    const { requireMerchantStall } = await import('@api/modules/platform-admin/capability')
    await expect(
      db.$transaction((tx) => requireMerchantStall(tx, target.id, venue.id)),
    ).resolves.toMatchObject({ userId: target.id, venueId: venue.id, grantId: grant.id })
    await expect(
      db.$transaction((tx) => requireMerchantStall(tx, target.id, other.id)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect((await client.audit.query({ userId: target.id })).items).toMatchObject([
      { action: 'STALL_GRANTED', roleBefore: null, roleAfter: null },
    ])
  })
  it('changes a legacy account role once with atomic immutable audit and optimistic version', async () => {
    const target = await syntheticUser()
    const client = clientFor(admin.cookie).platformAdmin
    await expect(
      clientFor(admin.cookie, 'https://untrusted.example').platformAdmin.changeRole.mutate({
        userId: target.id,
        expectedVersion: 0,
        role: 'MERCHANT',
        note: 'Verified synthetic business',
      }),
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } })
    const changed = await client.changeRole.mutate({
      userId: target.id,
      expectedVersion: 0,
      role: 'MERCHANT',
      note: 'Verified synthetic business',
    })
    expect(changed).toEqual({ id: target.id, version: 1 })
    expect((await db.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe('MERCHANT')
    const history = await client.audit.query({ userId: target.id })
    expect(history.items).toHaveLength(1)
    expect(history.items[0]).toMatchObject({
      actorId: admin.id,
      action: 'ROLE_CHANGED',
      roleBefore: 'USER',
      roleAfter: 'MERCHANT',
      targetUserId: target.id,
      venueId: null,
      note: 'Verified synthetic business',
    })
    expect(Object.keys(history.items[0] ?? {}).sort()).toEqual([
      'action',
      'actorId',
      'actorName',
      'createdAt',
      'id',
      'note',
      'roleAfter',
      'roleBefore',
      'targetUserId',
      'venueId',
    ])
    await expect(
      client.changeRole.mutate({
        userId: target.id,
        expectedVersion: 0,
        role: 'ADMIN',
        note: 'Stale',
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } })
    await expect(
      client.changeRole.mutate({
        userId: target.id,
        expectedVersion: 1,
        role: 'MERCHANT',
        note: 'No change',
      }),
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } })
    await expect(
      client.changeRole.mutate({
        userId: admin.id,
        expectedVersion: 0,
        role: 'USER',
        note: 'Self',
      }),
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } })
    expect(await client.audit.query({ userId: target.id })).toEqual(history)
  })
  it('exposes allowlisted versioned accounts only to fresh ADMIN identities', async () => {
    const client = clientFor(admin.cookie)
    await expect(clientFor().platformAdmin.accounts.query({})).rejects.toMatchObject({
      data: { code: 'UNAUTHORIZED' },
    })
    for (const account of [member, moderator]) {
      await expect(
        clientFor(account.cookie).platformAdmin.accounts.query({}),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } })
    }
    const page = await client.platformAdmin.accounts.query({ search: 'Synthetic', limit: 1 })
    expect(page.items).toHaveLength(1)
    expect(Object.keys(page.items[0] ?? {}).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
      'role',
      'version',
    ])
    expect(page.items[0]?.version).toBe(0)
    expect(page.nextCursor).toMatch(/^[a-f0-9]{24}$/)
    const next = await client.platformAdmin.accounts.query({
      search: 'Synthetic',
      cursor: page.nextCursor ?? undefined,
      limit: 1,
    })
    expect(next.items[0]?.id).not.toBe(page.items[0]?.id)
    await db.user.update({ where: { id: admin.id }, data: { role: 'USER' } })
    await expect(client.platformAdmin.accounts.query({})).rejects.toMatchObject({
      data: { code: 'FORBIDDEN' },
    })
    await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
  })
})
