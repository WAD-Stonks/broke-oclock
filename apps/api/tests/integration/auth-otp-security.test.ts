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
const nativeFetch = globalThis.fetch
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let baseURL = ''
let db!: typeof import('@broke-oclock/db').db
let nextIp = 1
let rejectMail = false
// Mail is the only controlled external boundary. Codes never enter snapshots or logs.
const mail = new Map<string, string>()
const mailbox = () => `otp-security-${randomUUID()}@example.test`
const capture = (email: string) => {
  const otp = mail.get(email)
  if (!otp) throw new Error('Controlled delivery did not capture an OTP')
  return otp
}
const wrongCode = (otp: string) => `${otp[0] === '0' ? '1' : '0'}${otp.slice(1)}`
const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
const flow = () => {
  const ip = `203.0.113.${nextIp++}`
  return (path: string, body?: object, cookie = '') =>
    nativeFetch(`${baseURL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-Forwarded-For': ip,
        Cookie: cookie,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'manual',
    })
}
const send = async (email: string, request = flow(), type = 'sign-in') => {
  const response = await request('/api/auth/email-otp/send-verification-otp', { email, type })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ success: true })
  return capture(email)
}
const redeem = (email: string, otp: string, request = flow()) =>
  request('/api/auth/sign-in/email-otp', { email, otp, role: 'ADMIN' })
const noSession = async (response: Response) => {
  expect(
    response.headers
      .getSetCookie()
      .some((cookie) => cookie.includes('session_token=') && !cookie.includes('Max-Age=0')),
  ).toBe(false)
  const body = (await response.json()) as Record<string, unknown>
  expect(Object.keys(body).sort()).toEqual(['code', 'message'])
  expect(body).not.toHaveProperty('user')
  expect(body).not.toHaveProperty('token')
  expect(body).not.toHaveProperty('email')
  return body
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`native_otp_security_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await promisify(execFile)('pnpm', ['--dir', 'packages/db', 'run', 'push'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    timeout: 60_000,
  })
  db = (await import('@broke-oclock/db')).db
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url === 'https://api.resend.com/emails') {
      if (rejectMail)
        return Response.json({ message: 'Controlled delivery rejected' }, { status: 503 })
      const body = JSON.parse(String(init?.body)) as { to: string; text: string }
      const otp = body.text.match(/\b[0-9]{6}\b/u)?.[0]
      if (!otp) throw new Error('Controlled mail has no six-digit code')
      mail.set(body.to, otp)
      return Response.json({ id: randomUUID() })
    }
    if (!url.startsWith('http://127.0.0.1:'))
      throw new Error('Unexpected external provider request')
    return nativeFetch(input, init)
  })
  const { createApp } = await import('@api/app')
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No disposable HTTP address')
  baseURL = `http://127.0.0.1:${address.port}`
  server.on(
    'request',
    createApp(
      parseConfig({
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
        BETTER_AUTH_URL: baseURL,
        WEB_ORIGIN: origin,
        RESEND_API_KEY: 're_test_only',
        EMAIL_FROM: 'auth@example.test',
      }),
    ),
  )
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
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

describe('native OTP abuse controls with real HTTP, disposable Prisma and native cookies', () => {
  it('uses six-digit hashed codes with a native 300-second lifetime and never creates a session on send', async () => {
    const email = mailbox()
    const start = Date.now()
    const otp = await send(email)
    expect(/^[0-9]{6}$/u.test(otp)).toBe(true)
    const record = await db.verification.findFirstOrThrow({
      where: { identifier: { contains: email } },
    })
    expect(record.value.includes(otp)).toBe(false)
    expect(record.expiresAt.getTime() - start).toBeGreaterThanOrEqual(299_000)
    expect(record.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(300_000)
    expect(await db.user.count({ where: { email } })).toBe(0)
    const login = await redeem(email, otp)
    expect(login.status).toBe(200)
    const cookie = cookieFrom(login)
    expect(Boolean(cookie)).toBe(true)
    expect(login.headers.getSetCookie().some((value) => value.includes('HttpOnly'))).toBe(true)
    const session = await (await flow()('/api/auth/get-session', undefined, cookie)).json()
    expect(session.user.role).toBe('USER')
    expect(session.user.emailVerified).toBe(true)
    expect(
      await db.account.count({ where: { userId: session.user.id, providerId: 'credential' } }),
    ).toBe(0)
    expect(await db.session.count({ where: { userId: session.user.id } })).toBe(1)
  })

  it('enforces three native wrong-code attempts independent of the IP request budget', async () => {
    const email = mailbox()
    const otp = await send(email)
    // Independent documented test IPs isolate the account-bound attempt counter from request quota.
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await redeem(email, wrongCode(otp))
      expect(response.status).toBe(400)
      expect((await noSession(response)).code).toBe('INVALID_OTP')
    }
    const exhausted = await redeem(email, otp)
    expect(exhausted.status).toBe(403)
    expect((await noSession(exhausted)).code).toBe('TOO_MANY_ATTEMPTS')
    expect(await db.user.count({ where: { email } })).toBe(0)
    expect(await db.verification.count({ where: { identifier: { contains: email } } })).toBe(0)
  })

  it('shares the native three-per-60-second send quota across recipients on one IP and opens at the exact clock boundary', async () => {
    const request = flow()
    const start = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start)
    try {
      for (let index = 0; index < 3; index++) await send(mailbox(), request)
      const deniedEmail = mailbox()
      const denied = await request('/api/auth/email-otp/send-verification-otp', {
        email: deniedEmail,
        type: 'sign-in',
      })
      expect(denied.status).toBe(429)
      expect(denied.headers.get('x-retry-after')).toBe('60')
      expect(mail.has(deniedEmail)).toBe(false)
      expect(
        await db.verification.count({ where: { identifier: { contains: deniedEmail } } }),
      ).toBe(0)
      clock.mockReturnValue(start + 59_999)
      expect(
        (
          await request('/api/auth/email-otp/send-verification-otp', {
            email: deniedEmail,
            type: 'sign-in',
          })
        ).status,
      ).toBe(429)
      clock.mockReturnValue(start + 60_000)
      await send(deniedEmail, request)
      // A separate IP has its own native bucket; this is not a distributed recipient limit claim.
      await send(mailbox(), flow())
    } finally {
      clock.mockRestore()
    }
  })

  it('atomically rejects the fourth concurrent native send on one IP', async () => {
    const request = flow()
    const emails = Array.from({ length: 4 }, mailbox)
    const responses = await Promise.all(
      emails.map((email) =>
        request('/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' }),
      ),
    )
    expect(responses.filter((response) => response.status === 200).length).toBe(3)
    expect(responses.filter((response) => response.status === 429).length).toBe(1)
    expect(emails.filter((email) => mail.has(email)).length).toBe(3)
  })

  it('rotates native codes and denies wrong email, cross-purpose verification/reset and consumed replay without sessions', async () => {
    const email = mailbox()
    const request = flow()
    const old = await send(email, request)
    const current = await send(email, request)
    expect(old === current).toBe(false)
    const wrongEmail = mailbox()
    for (const response of [
      await redeem(email, old),
      await redeem(wrongEmail, current),
      await flow()('/api/auth/email-otp/verify-email', { email, otp: current }),
      await flow()('/api/auth/email-otp/reset-password', {
        email,
        otp: current,
        password: randomBytes(24).toString('base64url'),
      }),
    ]) {
      expect(response.status).toBe(400)
      expect((await noSession(response)).code).toBe('INVALID_OTP')
    }
    const login = await redeem(email, current)
    expect(login.status).toBe(200)
    const replay = await redeem(email, current)
    expect(replay.status).toBe(400)
    expect((await noSession(replay)).code).toBe('INVALID_OTP')
    expect(await db.user.count({ where: { email: wrongEmail } })).toBe(0)
    const user = await db.user.findUniqueOrThrow({ where: { email } })
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1)
  })

  it.each([299_999, 300_001])(
    'enforces native expiry at elapsed %i milliseconds without editing verification records',
    async (elapsed) => {
      const start = new Date()
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(start)
      try {
        const email = mailbox()
        const otp = await send(email)
        vi.setSystemTime(start.getTime() + elapsed)
        const response = await redeem(email, otp)
        expect(response.status).toBe(elapsed < 300_000 ? 200 : 400)
        if (elapsed > 300_000) {
          expect((await noSession(response)).code).toBe('OTP_EXPIRED')
          expect(await db.user.count({ where: { email } })).toBe(0)
        }
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it('permits only one native winner under concurrent OTP redemption and cookie replay cannot consume again', async () => {
    const email = mailbox()
    const otp = await send(email)
    const responses = await Promise.all([redeem(email, otp), redeem(email, otp)])
    expect(responses.filter((response) => response.status === 200).length).toBe(1)
    expect(responses.filter((response) => response.status === 400).length).toBe(1)
    const user = await db.user.findUniqueOrThrow({ where: { email } })
    expect(await db.user.count({ where: { email } })).toBe(1)
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1)
    expect(await db.verification.count({ where: { identifier: { contains: email } } })).toBe(0)
    const winner = responses.find((response) => response.status === 200)
    if (!winner) throw new Error('No native redemption winner')
    expect((await flow()('/api/me', undefined, cookieFrom(winner))).status).toBe(200)
    expect((await redeem(email, otp)).status).toBe(400)
  })

  it('uses generic wrong-code failures and recovery-send responses for existing and unknown identities', async () => {
    const known = mailbox()
    const login = await redeem(known, await send(known))
    expect(login.status).toBe(200)
    const unknown = mailbox()
    const otp = await send(known)
    const existingFailure = await redeem(known, wrongCode(otp))
    const unknownFailure = await redeem(unknown, wrongCode(otp))
    expect(existingFailure.status).toBe(400)
    expect(unknownFailure.status).toBe(400)
    const knownError = await noSession(existingFailure)
    const unknownError = await noSession(unknownFailure)
    expect(knownError).toEqual(unknownError)
    for (const email of [known, unknown]) {
      const response = await flow()('/api/auth/email-otp/request-password-reset', { email })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ success: true })
    }
    expect(mail.has(unknown)).toBe(false)
  })

  it('retains the pinned failed-mail regression: native send must not falsely return delivery success', async () => {
    const email = mailbox()
    rejectMail = true
    try {
      const response = await flow()('/api/auth/email-otp/send-verification-otp', {
        email,
        type: 'sign-in',
      })
      expect(response.status).toBe(500)
      expect(mail.has(email)).toBe(false)
      expect(await db.user.count({ where: { email } })).toBe(0)
    } finally {
      rejectMail = false
    }
  })

  it('retains the pinned first-OTP reservation regression for an unverified password identity without bypassing cleanup', async () => {
    const email = mailbox()
    const password = randomBytes(24).toString('base64url')
    const signup = await flow()('/api/auth/sign-up/email', {
      email,
      password,
      name: 'Unverified cleanup witness',
    })
    expect(signup.status).toBe(200)
    const original = await db.user.findUniqueOrThrow({ where: { email } })
    expect(original.emailVerified).toBe(false)
    const login = await redeem(email, await send(email))
    expect(login.status).toBe(200)
    expect((await db.user.findUniqueOrThrow({ where: { email } })).id).toBe(original.id)
    expect(
      await db.account.count({ where: { userId: original.id, providerId: 'credential' } }),
    ).toBe(0)
    expect(
      await (await flow()('/api/auth/get-session', undefined, cookieFrom(signup))).json(),
    ).toBeNull()
    expect((await flow()('/api/auth/sign-in/email', { email, password })).status).toBe(401)
  })
})

describe('native primary password and OTP cookies share the same fresh ADMIN guard', () => {
  it.each(['password', 'email-otp'] as const)(
    '%s permits only current ADMIN and rejects ordinary USER, server demotion, revoked-session reuse and native signout reuse',
    async (method) => {
      const email = mailbox()
      const password = randomBytes(24).toString('base64url')
      let login: Response
      if (method === 'password') {
        expect(
          (
            await flow()('/api/auth/sign-up/email', {
              email,
              password,
              name: 'Primary password witness',
            })
          ).status,
        ).toBe(200)
        login = await flow()('/api/auth/sign-in/email', { email, password })
      } else login = await redeem(email, await send(email))
      expect(login.status).toBe(200)
      const user = await db.user.findUniqueOrThrow({ where: { email } })
      expect(user.role).toBe('USER')
      const cookie = cookieFrom(login)
      expect(Boolean(cookie)).toBe(true)
      const paths = ['/api/admin/overview', '/api/admin/accounts', '/api/ingestion/dashboard']
      for (const path of paths) expect((await flow()(path, undefined, cookie)).status).toBe(403)
      await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } })
      for (const path of paths) expect((await flow()(path, undefined, cookie)).status).toBe(200)
      await db.user.update({ where: { id: user.id }, data: { role: 'USER' } })
      for (const path of paths) expect((await flow()(path, undefined, cookie)).status).toBe(403)
      await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } })
      await db.session.deleteMany({ where: { userId: user.id } })
      for (const path of paths) expect((await flow()(path, undefined, cookie)).status).toBe(401)
      const fresh =
        method === 'password'
          ? await flow()('/api/auth/sign-in/email', { email, password })
          : await redeem(email, await send(email))
      expect(fresh.status).toBe(200)
      const freshCookie = cookieFrom(fresh)
      for (const path of paths)
        expect((await flow()(path, undefined, freshCookie)).status).toBe(200)
      const logout = await flow()('/api/auth/sign-out', {}, freshCookie)
      expect(logout.status).toBe(200)
      expect(
        logout.headers
          .getSetCookie()
          .some((value) => value.includes('session_token=') && value.includes('Max-Age=0')),
      ).toBe(true)
      expect(await db.session.count({ where: { userId: user.id } })).toBe(0)
      for (const path of paths)
        expect((await flow()(path, undefined, freshCookie)).status).toBe(401)
    },
  )
})
