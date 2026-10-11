import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import { requireMerchantStall } from '@api/modules/platform-admin/capability'
import { revokeStall } from '@api/modules/platform-admin/grants'
import { submitMerchantAccessRequest } from '@api/modules/platform-admin/requests'
import { changeRole } from '@api/modules/platform-admin/roles'
import { createApiClient } from '@broke-oclock/api-client'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const origin = 'http://localhost:5173'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db
let competingDb: typeof db
let baseURL = ''
let user: { id: string; cookie: string }
let admin: typeof user
let otherUser: typeof user
const clientFor = (cookie: string, requestOrigin = origin) => {
  const client = createApiClient(`${baseURL}/api`)
  Object.assign(client.http.defaults.headers.common, { Cookie: cookie, Origin: requestOrigin })
  return client
}
const signUp = async (name: string) => {
  const response = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      name,
      email: `lane-e-${randomUUID()}@example.test`,
      password: randomBytes(24).toString('base64url'),
    }),
  })
  expect(response.status).toBe(200)
  const body = await response.json()
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  expect(cookie).not.toBe('')
  return { id: body.user.id as string, cookie }
}
const freshIdentity = async (cookie: string) => {
  // /me intentionally projects no role. Use its actual authorization, then read
  // the native session for fresh role evidence rather than inventing /me fields.
  const identity = (await clientFor(cookie).infrastructure.me()).user
  const response = await fetch(`${baseURL}/api/auth/get-session`, {
    headers: { Cookie: cookie, Origin: origin },
  })
  expect(response.status).toBe(200)
  const session = await response.json()
  expect(session?.user?.id).toBe(identity.id)
  expect(['USER', 'MERCHANT', 'MODERATOR', 'ADMIN']).toContain(session?.user?.role)
  return { ...identity, role: session.user.role as string }
}
const venueFixture = async (name: string) => {
  const merchant = await db.merchant.create({ data: { name: `Lane E merchant ${name}` } })
  const venue = await db.venue.create({
    data: {
      merchantId: merchant.id,
      name: `Lane E outlet ${name}`,
      address: 'Synthetic address',
      latitude: 1.3,
      longitude: 103.8,
    },
  })
  return { merchant, venue }
}
// Test-only nonproduct witness. The random namespace is never an auth identifier.
// There is no merchant endpoint or product mutation hidden in this harness.
const witness = async (
  cookie: string,
  venueId: string,
  identifier = `lane-e-witness:${randomUUID()}`,
) => {
  const identity = await freshIdentity(cookie)
  return db.$transaction(async (tx) => {
    await requireMerchantStall(tx, identity.id, venueId)
    const now = new Date()
    return tx.verification.create({
      data: {
        identifier,
        value: 'test-only-capability-witness',
        expiresAt: now,
        createdAt: now,
        updatedAt: now,
      },
    })
  })
}
const deniedWitness = async (cookie: string, venueId: string, code: string, status?: number) => {
  const identifier = `lane-e-witness:${randomUUID()}`
  await expect(witness(cookie, venueId, identifier)).rejects.toMatchObject({
    code,
    ...(status ? { status } : {}),
  })
  expect(await db.verification.count({ where: { identifier } })).toBe(0)
}
const approvedFixture = async (name: string) => {
  await db.user.update({ where: { id: user.id }, data: { role: 'USER' } })
  const fixture = await venueFixture(name)
  const identity = await freshIdentity(user.cookie)
  const request = await submitMerchantAccessRequest(db, identity.id, {
    venueId: fixture.venue.id,
    message: 'Synthetic ownership request',
  })
  await clientFor(admin.cookie).platformAdmin.reviewRequest(request.id, {
    expectedVersion: request.version,
    decision: 'APPROVE',
    note: 'Synthetic approval',
  })
  const grant = await db.stallGrant.findUniqueOrThrow({
    where: { userId_venueId: { userId: identity.id, venueId: fixture.venue.id } },
  })
  return { ...fixture, request, grant }
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`lane_e_handoff_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await promisify(execFile)('pnpm', ['--dir', 'packages/db', 'run', 'push'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    timeout: 60_000,
  })
  const database = await import('@broke-oclock/db')
  db = database.db
  competingDb = new database.PrismaClient({ datasourceUrl: databaseUrl })
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
    ),
  )
  user = await signUp('Lane E native user')
  admin = await signUp('Lane E independent native admin')
  otherUser = await signUp('Lane E independent native user two')
  await db.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
}, 180_000)
afterAll(async () => {
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  await db?.$disconnect()
  await competingDb?.$disconnect()
  await mongo?.stop()
  vi.unstubAllEnvs()
})

describe('connected native identity -> internal request -> actual admin Axios HTTP -> transactional capability', () => {
  it('approves only outlet A, records exact review/version/audit state and revokes through actual HTTP', async () => {
    const a = await venueFixture('A')
    const b = await venueFixture('B')
    const identity = await freshIdentity(user.cookie)
    const independent = await freshIdentity(admin.cookie)
    expect(identity).toMatchObject({ id: user.id, role: 'USER' })
    expect(independent).toMatchObject({ id: admin.id, role: 'ADMIN' })
    expect(user.cookie).not.toBe(admin.cookie)
    const before = await db.user.findUniqueOrThrow({ where: { id: identity.id } })
    const request = await submitMerchantAccessRequest(db, identity.id, {
      venueId: a.venue.id,
      message: 'Synthetic outlet A request',
    })
    expect(request.status).toBe('PENDING')
    await deniedWitness(user.cookie, a.venue.id, 'FORBIDDEN')
    const input = {
      expectedVersion: request.version,
      decision: 'APPROVE' as const,
      note: 'Synthetic verified outlet A approval',
    }
    const client = clientFor(admin.cookie)
    const sent: { method?: string; url?: string; body: unknown; origin: unknown }[] = []
    client.http.interceptors.request.use((config) => {
      sent.push({
        method: config.method,
        url: config.url,
        body: config.data,
        origin: config.headers.get('Origin'),
      })
      return config
    })
    await expect(
      clientFor(user.cookie).platformAdmin.reviewRequest(request.id, input),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
    await expect(
      clientFor(admin.cookie, 'https://untrusted.example').platformAdmin.reviewRequest(
        request.id,
        input,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
    expect(await client.platformAdmin.reviewRequest(request.id, input)).toEqual({
      id: request.id,
      version: request.version + 1,
    })
    expect(sent).toEqual([
      { method: 'post', url: `/admin/merchant-requests/${request.id}/review`, body: input, origin },
    ])
    const stored = await db.merchantAccessRequest.findUniqueOrThrow({ where: { id: request.id } })
    expect(stored).toMatchObject({
      userId: identity.id,
      venueId: a.venue.id,
      status: 'APPROVED',
      version: request.version + 1,
      reviewedById: admin.id,
      reviewNote: input.note,
    })
    expect(stored.reviewedAt).toBeInstanceOf(Date)
    const grant = await db.stallGrant.findUniqueOrThrow({
      where: { userId_venueId: { userId: identity.id, venueId: a.venue.id } },
    })
    expect(grant).toMatchObject({ revokedAt: null, version: 1 })
    expect(await db.user.findUniqueOrThrow({ where: { id: identity.id } })).toMatchObject({
      role: 'MERCHANT',
      platformVersion: (before.platformVersion ?? 0) + 1,
    })
    expect(
      await db.platformAudit.findMany({
        where: { targetUserId: identity.id, venueId: a.venue.id },
        orderBy: { createdAt: 'asc' },
      }),
    ).toMatchObject([
      { action: 'REQUEST_SUBMITTED', actorId: identity.id },
      {
        action: 'REQUEST_APPROVED',
        actorId: admin.id,
        note: input.note,
        roleBefore: 'USER',
        roleAfter: 'MERCHANT',
      },
    ])
    expect(await freshIdentity(user.cookie)).toMatchObject({ id: identity.id, role: 'MERCHANT' })
    const written = await witness(user.cookie, a.venue.id)
    expect(await db.verification.findUniqueOrThrow({ where: { id: written.id } })).toEqual(written)
    await deniedWitness(user.cookie, b.venue.id, 'FORBIDDEN')
    await deniedWitness(otherUser.cookie, a.venue.id, 'FORBIDDEN')
    await expect(client.platformAdmin.reviewRequest(request.id, input)).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    })
    expect(sent.filter((entry) => entry.url?.endsWith('/review'))).toHaveLength(2)
    expect(
      await db.platformAudit.count({
        where: { action: 'REQUEST_APPROVED', targetUserId: identity.id, venueId: a.venue.id },
      }),
    ).toBe(1)
    expect(
      await client.platformAdmin.revokeStall(grant.id, {
        expectedVersion: grant.version,
        note: 'Synthetic HTTP revocation',
      }),
    ).toEqual({ id: grant.id, version: grant.version + 1 })
    expect(await db.stallGrant.findUniqueOrThrow({ where: { id: grant.id } })).toMatchObject({
      version: grant.version + 1,
      revokedAt: expect.any(Date),
    })
    expect(await db.user.findUniqueOrThrow({ where: { id: identity.id } })).toMatchObject({
      role: 'MERCHANT',
      platformVersion: (before.platformVersion ?? 0) + 2,
    })
    expect(
      await db.platformAudit.count({
        where: { action: 'STALL_REVOKED', targetUserId: identity.id, venueId: a.venue.id },
      }),
    ).toBe(1)
    await deniedWitness(user.cookie, a.venue.id, 'FORBIDDEN')
  })

  it('does not turn a rejected request into capability', async () => {
    const { venue } = await venueFixture('rejected')
    const identity = await freshIdentity(otherUser.cookie)
    const request = await submitMerchantAccessRequest(db, identity.id, {
      venueId: venue.id,
      message: 'Synthetic rejected request',
    })
    await deniedWitness(otherUser.cookie, venue.id, 'FORBIDDEN')
    await clientFor(admin.cookie).platformAdmin.reviewRequest(request.id, {
      expectedVersion: request.version,
      decision: 'REJECT',
      note: 'Synthetic rejection',
    })
    expect(
      await db.merchantAccessRequest.findUniqueOrThrow({ where: { id: request.id } }),
    ).toMatchObject({ status: 'REJECTED', version: request.version + 1 })
    expect(await db.stallGrant.count({ where: { userId: identity.id, venueId: venue.id } })).toBe(0)
    await deniedWitness(otherUser.cookie, venue.id, 'FORBIDDEN')
  })

  it.each(['outlet', 'merchant'] as const)(
    'rejects a deleted %s after native-cookie approval without a witness',
    async (kind) => {
      const fixture = await approvedFixture(`deleted-${kind}`)
      if (kind === 'outlet')
        await db.venue.update({ where: { id: fixture.venue.id }, data: { deletedAt: new Date() } })
      else
        await db.merchant.update({
          where: { id: fixture.merchant.id },
          data: { deletedAt: new Date() },
        })
      await deniedWitness(user.cookie, fixture.venue.id, 'PRECONDITION_FAILED')
    },
  )

  it('honors real HTTP demotion with the original native cookie', async () => {
    const { venue, grant } = await approvedFixture('demotion')
    const current = await db.user.findUniqueOrThrow({ where: { id: user.id } })
    await clientFor(admin.cookie).platformAdmin.changeRole(user.id, {
      expectedVersion: current.platformVersion ?? 0,
      role: 'USER',
      note: 'Synthetic demotion',
    })
    expect(await freshIdentity(user.cookie)).toMatchObject({ role: 'USER' })
    expect(await db.stallGrant.findUniqueOrThrow({ where: { id: grant.id } })).toMatchObject({
      revokedAt: expect.any(Date),
      version: grant.version + 1,
    })
    await deniedWitness(user.cookie, venue.id, 'FORBIDDEN')
  })

  it.each(['revoke', 'demote'] as const)(
    'conflicts with a separately pooled %s transaction before commit, with no write retry',
    async (kind) => {
      const { venue, grant } = await approvedFixture(`race-${kind}`)
      const current = await db.user.findUniqueOrThrow({ where: { id: user.id } })
      let signal = () => {}
      let release = () => {}
      const held = new Promise<void>((resolve) => {
        signal = resolve
      })
      const resume = new Promise<void>((resolve) => {
        release = resolve
      })
      const transact = competingDb.$transaction.bind(competingDb)
      const spy = vi.spyOn(competingDb, '$transaction').mockImplementation((operation, options) =>
        transact(async (tx) => {
          const result = await operation(tx)
          signal()
          await resume
          return result
        }, options),
      )
      const changing = (
        kind === 'revoke'
          ? revokeStall(competingDb, admin.id, {
              grantId: grant.id,
              expectedVersion: grant.version,
              note: 'Synthetic concurrent revoke',
            })
          : changeRole(competingDb, admin.id, {
              userId: user.id,
              expectedVersion: current.platformVersion ?? 0,
              role: 'USER',
              note: 'Synthetic concurrent demotion',
            })
      ).then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      )
      const identifier = `lane-e-witness:${randomUUID()}`
      const witnessTransaction = vi.spyOn(db, '$transaction')
      try {
        await Promise.race([
          held,
          changing.then(() => {
            throw new Error('Permission writer missed precommit barrier')
          }),
        ])
        await expect(witness(user.cookie, venue.id, identifier)).rejects.toMatchObject({
          code: 'P2034',
        })
        expect(witnessTransaction).toHaveBeenCalledTimes(1)
        expect(await db.verification.count({ where: { identifier } })).toBe(0)
        release()
        expect(await changing).toHaveProperty('value')
        expect(await db.stallGrant.findUniqueOrThrow({ where: { id: grant.id } })).toMatchObject({
          revokedAt: expect.any(Date),
          version: grant.version + 1,
        })
        await deniedWitness(user.cookie, venue.id, 'FORBIDDEN')
      } finally {
        release()
        await changing
        spy.mockRestore()
        witnessTransaction.mockRestore()
      }
    },
  )

  it('rejects a revoked native session before entering the witness transaction', async () => {
    const { venue } = await approvedFixture('session-revoked')
    const response = await fetch(`${baseURL}/api/auth/sign-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: user.cookie },
      body: '{}',
    })
    expect(response.status).toBe(200)
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0)
    const transactions = vi.spyOn(db, '$transaction')
    try {
      await deniedWitness(user.cookie, venue.id, 'UNAUTHORIZED', 401)
      expect(transactions).not.toHaveBeenCalled()
    } finally {
      transactions.mockRestore()
    }
  })
})
