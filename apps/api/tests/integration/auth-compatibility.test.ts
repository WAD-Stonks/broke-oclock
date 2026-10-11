import { execFile } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { createAuth, EmailOTPData } from '@broke-oclock/auth/server'
import type { Verification } from '@broke-oclock/db'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const origin = 'http://localhost:5173'
const nativeFetch = globalThis.fetch
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db!: typeof import('@broke-oclock/db').db
let auth!: ReturnType<typeof createAuth>
let baseURL = ''
let nextIP = 1
let sender: (data: EmailOTPData) => Promise<void> = async () => {}
const mail = new Map<string, string>()
const hash = (value: string) => createHash('sha256').update(value).digest('base64url')
const physicalID = (value: string) =>
  createHash('sha256')
    .update(`broke-oclock:verification-reservation:v1:${value}`)
    .digest('hex')
    .slice(0, 24)
const mailbox = () => `compatibility-${randomUUID()}@example.test`
const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((v) => v.split(';')[0])
    .join('; ')
const request = (path: string, body?: object, cookie = '', method = body ? 'POST' : 'GET') =>
  nativeFetch(`${baseURL}/api/auth${path}`, {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'X-Forwarded-For': `192.0.2.${nextIP++}`,
      Cookie: cookie,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
  })
const send = (email: string) =>
  request('/email-otp/send-verification-otp', { email, type: 'sign-in' })
const redeem = async (email: string) => {
  const otp = mail.get(email)
  if (!otp) throw new Error('No controlled native delivery')
  return request('/sign-in/email-otp', { email, otp })
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseURL = mongo.getUri(`auth_compatibility_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseURL)
  vi.stubEnv('NODE_ENV', 'test')
  await promisify(execFile)(
    'pnpm',
    ['--dir', 'packages/db', 'exec', 'prisma', 'db', 'push', '--skip-generate'],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: databaseURL },
      timeout: 120_000,
      encoding: 'utf8',
    },
  )
  db = (await import('@broke-oclock/db')).db
  const { createAuth: factory } = await import('@broke-oclock/auth/server')
  const { toNodeHandler } = await import('@broke-oclock/auth/node')
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No disposable HTTP address')
  baseURL = `http://127.0.0.1:${address.port}`
  auth = factory({
    baseURL,
    secret: randomBytes(32).toString('hex'),
    trustedOrigin: origin,
    sendEmailOTP: async (data) => {
      await sender(data)
      mail.set(data.email, data.otp)
    },
  })
  server.on('request', toNodeHandler(auth))
}, 180_000)

afterAll(async () => {
  if (server) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server?.close(() => resolve()))
  }
  await db?.$disconnect()
  await mongo?.stop()
  mail.clear()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('Google insertion data-layer admission', () => {
  it('refuses Google insertion without a trusted native admission stamp even for a verified owner', async () => {
    const user = await db.user.create({
      data: {
        name: 'Fence fixture',
        email: mailbox(),
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })
    const adapter = (await auth.$context).adapter
    await expect(
      adapter.create({
        model: 'account',
        data: {
          providerId: 'google',
          accountId: randomUUID(),
          userId: user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow()
    expect(await db.account.count({ where: { userId: user.id, providerId: 'google' } })).toBe(0)
  })
})

describe('pinned native Mongo verification compatibility', () => {
  it('has one deterministic reservation winner under native concurrent creation', async () => {
    const ctx = await auth.$context
    const identifier = `revoke-unproven-account-access:${randomBytes(12).toString('hex')}`
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        ctx.internalAdapter.reserveVerificationValue({
          identifier,
          value: 'controlled-lock',
          expiresAt: new Date(Date.now() + 60_000),
        }),
      ),
    )
    expect(results.filter(Boolean).length).toBe(1)
    const row = await db.verification.findFirstOrThrow({ where: { identifier } })
    expect(row.id === physicalID(hash(`reserve:${identifier}`))).toBe(true)
    expect(await db.verification.count({ where: { identifier } })).toBe(1)
  })

  it('retains typed native CRUD, count, consume, increment, transactions and rollback', async () => {
    const adapter = (await auth.$context).adapter
    const identifier = `revoke-unproven-account-access:${randomBytes(12).toString('hex')}`
    const logical = hash(`reserve:${identifier}`)
    const where = [{ field: 'id', value: logical }]
    const create = (target: Pick<typeof adapter, 'create'>) =>
      target.create({
        model: 'verification',
        forceAllowId: true,
        data: {
          id: logical,
          identifier,
          value: 'before',
          expiresAt: new Date(Date.now() + 60_000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })
    await create(adapter)
    await adapter.transaction(async (tx) => {
      expect(Boolean(await tx.findOne<Verification>({ model: 'verification', where }))).toBe(true)
      expect(
        (await tx.findMany<Verification>({ model: 'verification', where, limit: 2 })).length,
      ).toBe(1)
      expect(await tx.count({ model: 'verification', where })).toBe(1)
      expect(
        Boolean(await tx.update({ model: 'verification', where, update: { value: 'updated' } })),
      ).toBe(true)
      expect(await tx.updateMany({ model: 'verification', where, update: { value: 'bulk' } })).toBe(
        1,
      )
      expect(
        Boolean(
          await tx.incrementOne({
            model: 'verification',
            where,
            increment: {},
            set: { value: 'incremented' },
          }),
        ),
      ).toBe(true)
    })
    await expect(
      adapter.transaction(async (tx) => {
        await tx.delete({ model: 'verification', where })
        await create(tx)
        throw new Error('Controlled rollback')
      }),
    ).rejects.toThrow('Controlled rollback')
    expect((await db.verification.findFirstOrThrow({ where: { identifier } })).value).toBe(
      'incremented',
    )
    expect(Boolean(await adapter.consumeOne({ model: 'verification', where }))).toBe(true)
    await create(adapter)
    expect(await adapter.deleteMany({ model: 'verification', where })).toBe(1)
    const ordinary = await db.verification.create({
      data: {
        identifier: mailbox(),
        value: 'ordinary',
        expiresAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })
    expect(
      (
        await adapter.findOne<Verification>({
          model: 'verification',
          where: [{ field: 'id', value: ordinary.id }],
        })
      )?.id,
    ).toBe(ordinary.id)
    await adapter.delete({ model: 'verification', where: [{ field: 'id', value: ordinary.id }] })
  })

  it.each(['ordinary', 'old-sentinel'] as const)(
    'fails closed on forced physical collision with %s, never reading/deleting/locking the alias',
    async (scenario) => {
      const ctx = await auth.$context
      const identifier = `revoke-unproven-account-access:${randomBytes(12).toString('hex')}`
      const logical = hash(`reserve:${identifier}`)
      const row = await db.verification.create({
        data: {
          id: physicalID(logical),
          identifier: scenario === 'old-sentinel' ? `invalid-reservation:${logical}` : mailbox(),
          value: 'collision-witness',
          createdAt: new Date(),
          updatedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        },
      })
      const args = { model: 'verification', where: [{ field: 'id', value: logical }] }
      for (const operation of [
        () => ctx.adapter.findOne(args),
        () => ctx.adapter.findMany(args),
        () => ctx.adapter.count(args),
        () => ctx.adapter.delete(args),
        () => ctx.adapter.deleteMany(args),
        () => ctx.adapter.consumeOne(args),
        () => ctx.adapter.update({ ...args, update: { value: 'changed' } }),
        () => ctx.adapter.updateMany({ ...args, update: { value: 'changed' } }),
        () => ctx.adapter.incrementOne({ ...args, increment: {}, set: { value: 'changed' } }),
        () =>
          ctx.internalAdapter.reserveVerificationValue({
            identifier,
            value: 'lock',
            expiresAt: new Date(Date.now() + 60_000),
          }),
      ])
        await expect(operation()).rejects.toThrow()
      expect(await db.verification.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row)
    },
  )

  it('rejects unsupported logical OR, array, inequality and every verification ID mutation', async () => {
    const adapter = (await auth.$context).adapter
    const logical = hash('controlled-unsupported')
    for (const where of [
      [{ field: 'id', value: logical, connector: 'OR' as const }],
      [{ field: 'id', value: [logical], operator: 'in' as const }],
      [{ field: 'id', value: logical, operator: 'ne' as const }],
    ])
      await expect(adapter.count({ model: 'verification', where })).rejects.toThrow('Unsupported')
    const args = {
      model: 'verification',
      where: [{ field: 'id', value: randomBytes(12).toString('hex') }],
    }
    await expect(
      adapter.update({ ...args, update: { id: randomBytes(12).toString('hex') } }),
    ).rejects.toThrow('immutable')
    await expect(
      adapter.incrementOne({
        ...args,
        increment: {},
        set: { id: randomBytes(12).toString('hex') },
      }),
    ).rejects.toThrow('immutable')
  })
})

describe('native delivery and session compatibility', () => {
  it('sanitizes native adapter failures and does not revoke pre-proof access when the cleanup ID collides', async () => {
    const email = mailbox()
    const signup = await request('/sign-up/email', {
      email,
      password: randomBytes(24).toString('base64url'),
      name: 'Collision owner',
    })
    expect(signup.status).toBe(200)
    const user = await db.user.findUniqueOrThrow({ where: { email } })
    const logical = hash(`reserve:revoke-unproven-account-access:${user.id}`)
    const row = await db.verification.create({
      data: {
        id: physicalID(logical),
        identifier: `invalid-reservation:${logical}`,
        value: 'ordinary-collision',
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })
    expect((await send(email)).status).toBe(200)
    const failure = await redeem(email)
    expect(failure.status).toBe(500)
    const text = await failure.text()
    expect(text.includes(logical) || text.includes(row.id) || text.includes(email)).toBe(false)
    expect(await db.verification.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row)
    expect(await db.account.count({ where: { userId: user.id, providerId: 'credential' } })).toBe(1)
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1)
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).toBe(false)
  })

  it('removes only the exact failed challenge and sanitizes native HTTP errors', async () => {
    const email = mailbox()
    sender = async () => {
      throw new Error('controlled-provider-secret')
    }
    try {
      const response = await send(email)
      expect(response.status).toBe(500)
      const text = await response.text()
      expect(text.includes(email) || text.includes('controlled-provider-secret')).toBe(false)
      expect(await db.verification.count({ where: { identifier: `sign-in-otp-${email}` } })).toBe(0)
      expect(mail.has(email)).toBe(false)
    } finally {
      sender = async () => {}
    }
  })

  it('preserves same-recipient later successful native send and independent concurrent recipient', async () => {
    const email = mailbox()
    let release!: () => void
    let entered!: () => void
    const waiting = new Promise<void>((resolve) => {
      release = resolve
    })
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    let first = true
    sender = async (data) => {
      if (data.email === email && first) {
        first = false
        entered()
        await waiting
        throw new Error('Controlled old send failure')
      }
    }
    try {
      const old = send(email)
      await started
      const other = mailbox()
      expect((await send(email)).status).toBe(200)
      expect((await send(other)).status).toBe(200)
      const successful = await db.verification.findFirstOrThrow({
        where: { identifier: `sign-in-otp-${email}`, value: `${hash(mail.get(email) ?? '')}:0` },
      })
      release()
      expect((await old).status).toBe(500)
      expect(await db.verification.findUniqueOrThrow({ where: { id: successful.id } })).toEqual(
        successful,
      )
      expect((await redeem(email)).status).toBe(200)
      expect((await redeem(other)).status).toBe(200)
    } finally {
      release()
      sender = async () => {}
    }
  })

  it('removes all pre-proof accounts and sessions on first OTP while retaining identity', async () => {
    const email = mailbox()
    const signup = await request('/sign-up/email', {
      email,
      password: randomBytes(24).toString('base64url'),
      name: 'Native cleanup owner',
    })
    expect(signup.status).toBe(200)
    const user = await db.user.findUniqueOrThrow({ where: { email } })
    await db.account.create({
      data: {
        userId: user.id,
        providerId: 'google',
        accountId: randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })
    expect((await send(email)).status).toBe(200)
    const login = await redeem(email)
    expect(login.status).toBe(200)
    expect((await db.user.findUniqueOrThrow({ where: { email } })).id).toBe(user.id)
    expect(await db.account.count({ where: { userId: user.id } })).toBe(0)
    expect(await (await request('/get-session', undefined, cookieFrom(signup))).json()).toBeNull()
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1)
  })

  it('keeps GET and direct native expired-session reads DB-read-only and native POST performs cleanup', async () => {
    const email = mailbox()
    expect((await send(email)).status).toBe(200)
    const login = await redeem(email)
    const cookie = cookieFrom(login)
    const user = await db.user.findUniqueOrThrow({ where: { email } })
    const record = await db.session.findFirstOrThrow({ where: { userId: user.id } })
    await db.session.update({ where: { id: record.id }, data: { expiresAt: new Date(0) } })
    const before = await db.session.findUniqueOrThrow({ where: { id: record.id } })
    expect(await (await request('/get-session', undefined, cookie)).json()).toBeNull()
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull()
    expect(await db.session.findUniqueOrThrow({ where: { id: record.id } })).toEqual(before)
    expect((await request('/get-session', undefined, cookie, 'POST')).status).toBe(200)
    expect(await db.session.findUnique({ where: { id: record.id } })).toBeNull()
  })

  it('uses the actual native Vue session atom for automatic trusted GET to POST sliding renewal', async () => {
    const email = mailbox()
    expect((await send(email)).status).toBe(200)
    const cookie = cookieFrom(await redeem(email))
    const user = await db.user.findUniqueOrThrow({ where: { email } })
    const record = await db.session.findFirstOrThrow({ where: { userId: user.id } })
    await db.session.update({
      where: { id: record.id },
      data: { expiresAt: new Date(Date.now() + 60_000), updatedAt: new Date(0) },
    })
    const before = await db.session.findUniqueOrThrow({ where: { id: record.id } })
    const trace: string[] = []
    // Transport only supplies the disposable socket and browser headers; responses remain real native HTTP.
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), baseURL)
      const headers = new Headers(init?.headers)
      headers.set('Origin', origin)
      headers.set('Cookie', cookie)
      trace.push(init?.method ?? 'GET')
      return nativeFetch(`${baseURL}${url.pathname}${url.search}`, { ...init, headers })
    })
    try {
      const { authClient } = await import('@broke-oclock/auth/client')
      const state = authClient.useSession()
      await state.value.refetch()
      expect(state.value.error).toBeNull()
      expect(state.value.data?.user.id).toBe(user.id)
      expect(trace).toEqual(['GET', 'POST'])
      expect(
        (await db.session.findUniqueOrThrow({ where: { id: record.id } })).expiresAt >
          before.expiresAt,
      ).toBe(true)
      expect(
        (
          await nativeFetch(`${baseURL}/api/auth/get-session`, {
            method: 'POST',
            headers: { Origin: 'https://hostile.example', Cookie: cookie },
          })
        ).status,
      ).toBe(403)
    } finally {
      spy.mockRestore()
    }
  })

  it('retains native error audit level without raw state or incoming payload leakage', async () => {
    const state = randomBytes(32).toString('base64url')
    const logs: unknown[][] = []
    const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      logs.push(args)
    })
    try {
      const response = await request(`/callback/google?state=${state}&code=controlled`, undefined)
      expect(response.status).toBe(302)
      expect(logs.length).toBeGreaterThan(0)
      expect(JSON.stringify(logs).includes(state)).toBe(false)
      expect(
        logs.every(
          (args) =>
            args.length === 1 &&
            typeof args[0] === 'string' &&
            args[0] === JSON.stringify({ event: 'native-auth-diagnostic', level: 'error' }),
        ),
      ).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })
})
