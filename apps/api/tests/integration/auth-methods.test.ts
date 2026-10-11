import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const origin = 'http://localhost:5173'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let disabledServer: Server | undefined
let baseURL = ''
let disabledURL = ''
let db!: typeof import('@broke-oclock/db').db
let mailFailure = false
// Provider codes exist only in this test process. Never snapshot or log them.
const mail = new Map<string, { otp: string; subject: string }>()
const nativeFetch = globalThis.fetch
let ip = 1
const flow = () => {
  const sourceIp = `192.0.2.${ip++}`
  return (path: string, body?: object, cookie = '', target = baseURL) =>
    nativeFetch(`${target}/api/auth${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        'X-Forwarded-For': sourceIp,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'manual',
    })
}
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
const mailbox = () => `auth-method-${randomUUID()}@example.test`
const code = (email: string) => {
  const sent = mail.get(email)
  if (!sent) throw new Error('Controlled delivery did not capture a code')
  return sent.otp
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`auth_methods_${randomUUID().replaceAll('-', '')}`)
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
    const url = String(input)
    if (url === 'https://api.resend.com/emails') {
      if (mailFailure) return Response.json({ message: 'Controlled rejection' }, { status: 503 })
      const body = JSON.parse(String(init?.body)) as { to: string; text: string; subject: string }
      const otp = body.text.match(/\b[0-9]{6}\b/u)?.[0]
      if (!otp) throw new Error('Controlled provider received no valid code')
      mail.set(body.to, { otp, subject: body.subject })
      return Response.json({ id: randomUUID() })
    }
    // Fail closed for external network access. Only disposable local HTTP is allowed.
    if (!url.startsWith('http://127.0.0.1:'))
      throw new Error('Unexpected external provider request')
    return nativeFetch(input, init)
  })
  const { createApp } = await import('@api/app')
  const start = async (emailEnabled: boolean) => {
    const instance = createServer()
    await new Promise<void>((resolve) => instance.listen(0, '127.0.0.1', resolve))
    const address = instance.address()
    if (!address || typeof address === 'string') throw new Error('No disposable HTTP address')
    const url = `http://127.0.0.1:${address.port}`
    instance.on(
      'request',
      createApp(
        parseConfig({
          DATABASE_URL: databaseUrl,
          BETTER_AUTH_SECRET: 'test-only-shared-secret-at-least-32-characters',
          BETTER_AUTH_URL: url,
          WEB_ORIGIN: origin,
          ...(emailEnabled
            ? { RESEND_API_KEY: 're_test_only', EMAIL_FROM: 'auth@example.test' }
            : {}),
        }),
      ),
    )
    return { instance, url }
  }
  const enabled = await start(true)
  server = enabled.instance
  baseURL = enabled.url
  const disabled = await start(false)
  disabledServer = disabled.instance
  disabledURL = disabled.url
}, 180_000)

afterAll(async () => {
  for (const instance of [server, disabledServer]) {
    if (!instance) continue
    instance.closeAllConnections()
    await new Promise<void>((resolve) => instance.close(() => resolve()))
  }
  await db?.$disconnect()
  await mongo?.stop()
  mail.clear()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('native email OTP over real HTTP, adapter and cookies', () => {
  it('does not report delivery success when controlled Resend rejects the one-shot send', async () => {
    const email = mailbox()
    mailFailure = true
    try {
      expect(
        (await flow()('/email-otp/send-verification-otp', { email, type: 'sign-in' })).status,
      ).toBe(500)
      expect(mail.has(email)).toBe(false)
      expect(await db.user.count({ where: { email } })).toBe(0)
    } finally {
      mailFailure = false
    }
  })
  it('rotates codes and rejects expired and cross-purpose redemption', async () => {
    const request = flow()
    const email = mailbox()
    expect(
      (await request('/email-otp/send-verification-otp', { email, type: 'sign-in' })).status,
    ).toBe(200)
    const first = code(email)
    expect(
      (await request('/email-otp/send-verification-otp', { email, type: 'sign-in' })).status,
    ).toBe(200)
    const second = code(email)
    expect(first === second).toBe(false)
    expect((await request('/sign-in/email-otp', { email, otp: first })).status).toBe(400)
    expect((await request('/email-otp/verify-email', { email, otp: second })).status).toBe(400)
    await db.verification.updateMany({
      where: { identifier: { contains: email } },
      data: { expiresAt: new Date(0) },
    })
    expect((await request('/sign-in/email-otp', { email, otp: second })).status).toBe(400)
  })
  it('consumes an OTP once under concurrent real HTTP redemption', async () => {
    const email = mailbox()
    expect(
      (await flow()('/email-otp/send-verification-otp', { email, type: 'sign-in' })).status,
    ).toBe(200)
    const otp = code(email)
    const results = await Promise.all([
      flow()('/sign-in/email-otp', { email, otp }),
      flow()('/sign-in/email-otp', { email, otp }),
    ])
    expect(results.filter((response) => response.status === 200).length).toBe(1)
    expect(await db.user.count({ where: { email } })).toBe(1)
  })
  it('rejects every disabled native OTP path before creating or consuming an outstanding code', async () => {
    const request = flow()
    const email = mailbox()
    expect(
      (await request('/email-otp/send-verification-otp', { email, type: 'sign-in' })).status,
    ).toBe(200)
    const otp = code(email)
    const paths = [
      '/sign-in/email-otp',
      '/email-otp/send-verification-otp',
      '/email-otp/check-verification-otp',
      '/email-otp/verify-email',
      '/email-otp/request-password-reset',
      '/email-otp/reset-password',
      '/forget-password/email-otp',
      '/email-otp/request-email-change',
      '/email-otp/change-email',
    ]
    for (const path of paths) {
      const response = await flow()(
        path,
        {
          email,
          otp,
          type: 'sign-in',
          password: randomBytes(24).toString('base64url'),
          newEmail: mailbox(),
        },
        '',
        disabledURL,
      )
      expect(response.status).toBe(503)
    }
    expect((await request('/sign-in/email-otp', { email, otp })).status).toBe(200)
  })
  it('restores password access after first-OTP cleanup without changing identity or owned records', async () => {
    const request = flow()
    const email = mailbox()
    const password = randomBytes(24).toString('base64url')
    const signup = await request('/sign-up/email', { email, password, name: 'Recovery test' })
    expect(signup.status).toBe(200)
    const original = await db.user.findUniqueOrThrow({ where: { email } })
    const merchant = await db.merchant.create({ data: { name: 'Isolated recovery merchant' } })
    const venue = await db.venue.create({
      data: {
        merchantId: merchant.id,
        name: 'Isolated recovery outlet',
        address: 'Test-only address',
        latitude: 1.3,
        longitude: 103.8,
      },
    })
    const owned = await db.merchantAccessRequest.create({
      data: {
        userId: original.id,
        venueId: venue.id,
        userName: original.name,
        userEmail: email,
        venueName: venue.name,
        merchantName: merchant.name,
        message: 'Isolated recovery ownership witness',
      },
    })
    expect(
      (await request('/email-otp/send-verification-otp', { email, type: 'sign-in' })).status,
    ).toBe(200)
    const login = await request('/sign-in/email-otp', { email, otp: code(email) })
    expect(login.status).toBe(200)
    expect(
      await db.account.count({ where: { userId: original.id, providerId: 'credential' } }),
    ).toBe(0)
    expect(await (await request('/get-session', undefined, cookies(signup))).json()).toBeNull()
    expect((await request('/sign-in/email', { email, password })).status).toBe(401)
    expect((await request('/email-otp/request-password-reset', { email })).status).toBe(200)
    expect(mail.get(email)?.subject).toBe('Your password reset code')
    const replacement = randomBytes(24).toString('base64url')
    expect(
      (
        await request('/email-otp/reset-password', {
          email,
          otp: code(email),
          password: replacement,
        })
      ).status,
    ).toBe(200)
    expect(await (await request('/get-session', undefined, cookies(login))).json()).toBeNull()
    expect((await request('/sign-in/email', { email, password: replacement })).status).toBe(200)
    expect((await db.user.findUniqueOrThrow({ where: { email } })).id).toBe(original.id)
    expect(
      (await db.merchantAccessRequest.findUniqueOrThrow({ where: { id: owned.id } })).userId,
    ).toBe(original.id)
  })
  it('delivers through one-shot Resend and creates a verified USER ignoring role injection', async () => {
    const request = flow()
    const email = mailbox()
    expect(
      (await request('/email-otp/send-verification-otp', { email, type: 'sign-in' })).status,
    ).toBe(200)
    const otp = code(email)
    expect(/^[0-9]{6}$/u.test(otp)).toBe(true)
    const stored = await db.verification.findFirstOrThrow({
      where: { identifier: { contains: email } },
    })
    expect(stored.value.includes(otp)).toBe(false)
    const signedIn = await request('/sign-in/email-otp', { email, otp, role: 'ADMIN' })
    expect(signedIn.status).toBe(200)
    const session = await request('/get-session', undefined, cookies(signedIn))
    const user = (await session.json()).user
    expect(user.role).toBe('USER')
    expect(user.emailVerified).toBe(true)
    expect((await db.user.findUniqueOrThrow({ where: { email } })).id).toBe(user.id)
    expect((await request('/sign-in/email-otp', { email, otp })).status).not.toBe(200)
  })
})
