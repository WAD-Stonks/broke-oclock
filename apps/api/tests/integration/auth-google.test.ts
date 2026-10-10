import { execFile } from 'node:child_process'
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const origin = 'http://localhost:5173'
const destination = `${origin}/admin`
const nativeFetch = globalThis.fetch
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let baseURL = ''
let db!: typeof import('@broke-oclock/db').db
let auth!: ReturnType<typeof import('@api/auth').createAuth>
let admissionObserver: (data: Record<string | symbol, unknown>) => Promise<void> = async () => {}
type Validation = NonNullable<NonNullable<typeof auth.options.user>['validateUserInfo']>
let validationObserver: (...args: Parameters<Validation>) => Promise<void> = async () => {}
vi.mock('@api/auth', async (original) => {
  const module = await original<typeof import('@api/auth')>()
  return {
    ...module,
    createAuth: (...args: Parameters<typeof module.createAuth>) => {
      auth = module.createAuth(...args)
      const userOptions = auth.options.user
      const validate = userOptions?.validateUserInfo
      if (!userOptions || !validate) throw new Error('Missing native validation hook')
      userOptions.validateUserInfo = async (...validationArgs) => {
        const result = await validate(...validationArgs)
        if (!result?.error) await validationObserver(...validationArgs)
        return result
      }
      const creation = auth.options.databaseHooks?.account?.create
      const before = creation?.before
      if (!creation || !before) throw new Error('Missing native admission hook')
      creation.before = async (account, ctx) => {
        const result = await before(account, ctx)
        if (result && typeof result === 'object') await admissionObserver(result.data)
        return result
      }
      return auth
    },
  }
})
let nextIp = 1
let exchanges = 0
const grants = new Map<
  string,
  { email: string; verified: boolean; subject: string; challenge: string }
>()
// Synthetic Google credentials and signed profiles stay process-local. No snapshots of secrets.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: 'disposable-google-key',
  alg: 'RS256',
  use: 'sig',
}
const mailbox = () => `google-${randomUUID()}@example.test`
const googleIdToken = (profile: { email: string; verified: boolean; subject: string }) => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const payload = `${encode({ alg: 'RS256', kid: jwk.kid })}.${encode({
    iss: 'https://accounts.google.com',
    aud: 'disposable-client.apps.googleusercontent.com',
    sub: profile.subject,
    email: profile.email,
    email_verified: profile.verified,
    name: 'Controlled Google ID-token profile',
    iat: now,
    exp: now + 300,
  })}`
  return `${payload}.${sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64url')}`
}

// Observe the supplied transaction without mutating Prisma's generated delegates.
// Never relabel an eager native Promise as PrismaPromise: its inherited tag is
// read-only, so Object.assign throws while the already-started query is orphaned.
const observeTransactionMethod = <T extends object>(
  tx: T,
  model: 'user' | 'session' | 'account',
  operation: 'updateMany' | 'create',
  before: () => void | Promise<void>,
): T =>
  new Proxy(tx, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver)
      if (key !== model) return value
      if (typeof value !== 'object' || value === null)
        throw new Error('Missing native transaction delegate')
      return new Proxy(value, {
        get(delegate, method, delegateReceiver) {
          const original: unknown = Reflect.get(delegate, method, delegateReceiver)
          if (method === operation) {
            if (typeof original !== 'function') throw new Error('Missing native transaction method')
            return async (...args: unknown[]) => {
              await before()
              return Reflect.apply(original, delegate, args)
            }
          }
          return typeof original === 'function' ? original.bind(delegate) : original
        },
      })
    },
  })

class Browser {
  private readonly jar = new Map<string, string>()
  private readonly ip = `198.51.100.${nextIp++}`
  cookie() {
    return [...this.jar].map(([key, value]) => `${key}=${value}`).join('; ')
  }
  async request(path: string, body?: object, cookie = this.cookie()) {
    const response = await nativeFetch(`${baseURL}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-Forwarded-For': this.ip,
        Cookie: cookie,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'manual',
    })
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(';')[0] ?? ''
      const index = pair.indexOf('=')
      const name = pair.slice(0, index)
      if (/Max-Age=0/iu.test(header)) this.jar.delete(name)
      else this.jar.set(name, pair.slice(index + 1))
    }
    return response
  }
}

const initiate = async (browser: Browser, link = false, extra: object = {}) => {
  const response = await browser.request(`/api/auth/${link ? 'link-social' : 'sign-in/social'}`, {
    provider: 'google',
    callbackURL: destination,
    errorCallbackURL: `${origin}/auth-error`,
    disableRedirect: true,
    ...extra,
  })
  expect(response.status).toBe(200)
  const authorization = new URL((await response.json()).url)
  expect(authorization.origin).toBe('https://accounts.google.com')
  expect(authorization.searchParams.get('redirect_uri')).toBe(`${baseURL}/api/auth/callback/google`)
  expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
  expect(Boolean(authorization.searchParams.get('state'))).toBe(true)
  expect(Boolean(authorization.searchParams.get('code_challenge'))).toBe(true)
  expect(
    response.headers
      .getSetCookie()
      .some((cookie) => cookie.includes('state=') && cookie.includes('HttpOnly')),
  ).toBe(true)
  return authorization
}

const callback = async (
  browser: Browser,
  authorization: URL,
  profile: { email: string; verified: boolean; subject?: string },
  extra: { cookie?: string; state?: string; cancel?: boolean; invalidCode?: boolean } = {},
) => {
  const code = randomBytes(24).toString('base64url')
  const subject = profile.subject ?? randomUUID()
  if (!extra.invalidCode)
    grants.set(code, {
      ...profile,
      subject,
      challenge: authorization.searchParams.get('code_challenge') ?? '',
    })
  const query = new URLSearchParams({
    state: extra.state ?? authorization.searchParams.get('state') ?? '',
  })
  if (extra.cancel) query.set('error', 'access_denied')
  else query.set('code', code)
  return browser.request(`/api/auth/callback/google?${query}`, undefined, extra.cookie)
}

const googleLogin = async (profile: { email: string; verified: boolean; subject?: string }) => {
  const browser = new Browser()
  const authorization = await initiate(browser)
  const response = await callback(browser, authorization, profile)
  expect(response.status).toBe(302)
  expect(response.headers.get('location') === destination).toBe(true)
  expect(
    response.headers
      .getSetCookie()
      .some((cookie) => cookie.includes('session_token=') && cookie.includes('HttpOnly')),
  ).toBe(true)
  const sessionResponse = await browser.request('/api/auth/get-session')
  expect(sessionResponse.status).toBe(200)
  const session = (await sessionResponse.json()) as {
    user: { id: string; role: string; emailVerified: boolean }
  }
  expect(Boolean(session?.user?.id)).toBe(true)
  expect(await db.session.count({ where: { userId: session.user.id } })).toBeGreaterThan(0)
  return { browser, user: session.user }
}

const refused = async (
  browser: Browser,
  response: Response,
  email: string,
  expectedAccounts = 0,
) => {
  expect(response.status).toBe(302)
  const location = new URL(response.headers.get('location') ?? '', baseURL)
  expect([origin, baseURL]).toContain(location.origin)
  expect(Boolean(location.searchParams.get('error'))).toBe(true)
  expect(
    response.headers
      .getSetCookie()
      .some((cookie) => cookie.includes('session_token=') && !cookie.includes('Max-Age=0')),
  ).toBe(false)
  expect(await db.account.count({ where: { providerId: 'google', user: { email } } })).toBe(
    expectedAccounts,
  )
  return browser.request('/api/auth/get-session')
}

const localPasswordIdentity = async (email: string, verified: boolean) => {
  const browser = new Browser()
  const password = randomBytes(24).toString('base64url')
  expect(
    (
      await browser.request('/api/auth/sign-up/email', {
        email,
        password,
        name: 'Isolated link owner',
      })
    ).status,
  ).toBe(200)
  const original = await db.user.findUniqueOrThrow({ where: { email } })
  // Explicit locally verified fixture is required for the verified-link scenario only.
  if (verified) await db.user.update({ where: { id: original.id }, data: { emailVerified: true } })
  return { browser, original }
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`native_google_${randomUUID().replaceAll('-', '')}`)
  vi.stubEnv('DATABASE_URL', databaseUrl)
  vi.stubEnv('NODE_ENV', 'test')
  await promisify(execFile)(
    'pnpm',
    ['--dir', 'packages/db', 'exec', 'prisma', 'db', 'push', '--skip-generate'],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      timeout: 60_000,
    },
  )
  db = (await import('@broke-oclock/db')).db
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url === 'https://oauth2.googleapis.com/token') {
      exchanges++
      const body = new URLSearchParams(String(init?.body))
      const grant = grants.get(body.get('code') ?? '')
      if (!grant) return Response.json({ error: 'invalid_grant' }, { status: 400 })
      grants.delete(body.get('code') ?? '')
      expect(body.get('grant_type')).toBe('authorization_code')
      expect(body.get('redirect_uri')).toBe(`${baseURL}/api/auth/callback/google`)
      expect(
        createHash('sha256')
          .update(body.get('code_verifier') ?? '')
          .digest('base64url') === grant.challenge,
      ).toBe(true)
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
      const now = Math.floor(Date.now() / 1000)
      const payload = `${encode({ alg: 'RS256', kid: jwk.kid })}.${encode({
        iss: 'https://accounts.google.com',
        aud: 'disposable-client.apps.googleusercontent.com',
        sub: grant.subject,
        email: grant.email,
        email_verified: grant.verified,
        name: 'Controlled Google profile',
        role: 'ADMIN',
        hd: 'example.test',
        iat: now,
        exp: now + 300,
      })}`
      const idToken = `${payload}.${sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64url')}`
      return Response.json({
        access_token: randomBytes(24).toString('base64url'),
        token_type: 'Bearer',
        expires_in: 300,
        id_token: idToken,
      })
    }
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] })
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
        GOOGLE_CLIENT_ID: 'disposable-client.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'disposable-client-secret',
      }),
    ),
  )
}, 180_000)

afterAll(async () => {
  if (server) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server?.close(() => resolve()))
  }
  await db?.$disconnect()
  await mongo?.stop()
  grants.clear()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('native Google authorization code callback through Express and disposable Prisma', () => {
  it('creates a verified USER from actual state, PKCE exchange and native session cookie, ignoring profile role/domain', async () => {
    const email = mailbox()
    const { browser, user } = await googleLogin({ email, verified: true })
    expect(user.role).toBe('USER')
    expect(user.emailVerified).toBe(true)
    expect(await db.user.count({ where: { email } })).toBe(1)
    expect(await db.account.count({ where: { userId: user.id, providerId: 'google' } })).toBe(1)
    for (const path of ['/api/admin/overview', '/api/admin/accounts', '/api/ingestion/dashboard']) {
      expect((await browser.request(path)).status).toBe(403)
    }
  })

  it('preserves canonical user and domain ownership for returning Google', async () => {
    const email = mailbox()
    const subject = randomUUID()
    const first = await googleLogin({ email, verified: true, subject })
    const merchant = await db.merchant.create({ data: { name: 'Google ownership witness' } })
    const venue = await db.venue.create({
      data: {
        merchantId: merchant.id,
        name: 'Disposable outlet',
        address: 'Test address',
        latitude: 1.3,
        longitude: 103.8,
      },
    })
    const owned = await db.merchantAccessRequest.create({
      data: {
        userId: first.user.id,
        venueId: venue.id,
        userName: 'Ownership witness',
        userEmail: email,
        venueName: venue.name,
        merchantName: merchant.name,
        message: 'Isolated native Google ownership',
      },
    })
    const returning = await googleLogin({ email, verified: true, subject })
    expect(returning.user.id).toBe(first.user.id)
    expect(await db.user.count({ where: { email } })).toBe(1)
    expect(await db.account.count({ where: { userId: first.user.id, providerId: 'google' } })).toBe(
      1,
    )
    expect(
      (await db.merchantAccessRequest.findUniqueOrThrow({ where: { id: owned.id } })).userId,
    ).toBe(first.user.id)
  })

  it('refuses an unverified Google email before new user/account/session creation', async () => {
    const email = mailbox()
    const browser = new Browser()
    const response = await callback(browser, await initiate(browser), { email, verified: false })
    expect(await (await refused(browser, response, email)).json()).toBeNull()
    expect(await db.user.count({ where: { email } })).toBe(0)
  })

  it('refuses returning Google when the provider now reports an unverified email', async () => {
    const email = mailbox()
    const subject = randomUUID()
    const original = await googleLogin({ email, verified: true, subject })
    const browser = new Browser()
    const response = await callback(browser, await initiate(browser), {
      email,
      verified: false,
      subject,
    })
    expect(await (await refused(browser, response, email, 1)).json()).toBeNull()
    expect(await db.session.count({ where: { userId: original.user.id } })).toBe(1)
  })

  it('links same verified Google email to a locally verified password identity and preserves both native methods', async () => {
    const email = mailbox()
    const local = await localPasswordIdentity(email, true)
    const response = await callback(local.browser, await initiate(local.browser, true), {
      email,
      verified: true,
    })
    expect(response.status).toBe(302)
    expect(response.headers.get('location') === destination).toBe(true)
    expect(await db.account.count({ where: { userId: local.original.id } })).toBe(2)
    const returning = await googleLogin({
      email,
      verified: true,
      subject: (
        await db.account.findFirstOrThrow({
          where: { userId: local.original.id, providerId: 'google' },
        })
      ).accountId,
    })
    expect(returning.user.id).toBe(local.original.id)
    expect(returning.user.role).toBe('USER')
  })

  it('does not let returning native sign-in validation supply account-admission proof', async () => {
    const email = mailbox()
    const subject = randomUUID()
    const first = await googleLogin({ email, verified: true, subject })
    const account = await db.account.findFirstOrThrow({
      where: { userId: first.user.id, providerId: 'google' },
    })
    const admit = auth.options.databaseHooks?.account?.create?.before
    if (!admit) throw new Error('Missing native admission hook')
    let observed = false
    let admitted = false
    validationObserver = async ({ source }, ctx) => {
      if (source.action !== 'sign-in' || source.oauth?.providerId !== 'google') return
      if (!ctx?.request) throw new Error('Missing real native sign-in context')
      observed = true
      try {
        const result = await admit({ ...account, accountId: randomUUID() }, ctx)
        admitted = Boolean(result)
      } catch {
        // The narrow hook boundary must fail closed; no adapter create is attempted here.
      }
    }
    try {
      const returning = await googleLogin({ email, verified: true, subject })
      expect(returning.user.id).toBe(first.user.id)
    } finally {
      validationObserver = async () => {}
    }
    expect(observed).toBe(true)
    expect(admitted).toBe(false)
    expect(await db.account.count({ where: { userId: first.user.id, providerId: 'google' } })).toBe(
      1,
    )
  })

  it('preserves native explicit Google ID-token linking with verified provider proof and canonical session', async () => {
    const email = mailbox()
    const local = await localPasswordIdentity(email, true)
    const subject = randomUUID()
    const sessions = await db.session.count({ where: { userId: local.original.id } })
    const response = await local.browser.request('/api/auth/link-social', {
      provider: 'google',
      idToken: { token: googleIdToken({ email, verified: true, subject }) },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: true, redirect: false })
    expect(
      await db.account.count({
        where: { userId: local.original.id, providerId: 'google', accountId: subject },
      }),
    ).toBe(1)
    expect(await db.session.count({ where: { userId: local.original.id } })).toBe(sessions)
    expect((await (await local.browser.request('/api/auth/get-session')).json()).user.id).toBe(
      local.original.id,
    )
  })

  it('refuses a different still-verified authoritative email before native provider validation without authorization touches', async () => {
    const email = mailbox()
    const local = await localPasswordIdentity(email, true)
    const authorization = await initiate(local.browser, true)
    const changedEmail = mailbox()
    const owner = await db.user.update({
      where: { id: local.original.id },
      data: { email: changedEmail, emailVerified: true },
    })
    const sessions = await db.session.findMany({
      where: { userId: owner.id },
      select: { id: true, userId: true, createdAt: true, updatedAt: true, expiresAt: true },
    })
    const response = await callback(local.browser, authorization, { email, verified: true })
    expect(response.headers.get('location') === destination).toBe(false)
    await refused(local.browser, response, changedEmail)
    expect(await db.account.count({ where: { userId: owner.id, providerId: 'google' } })).toBe(0)
    expect(await db.user.findUniqueOrThrow({ where: { id: owner.id } })).toEqual(owner)
    expect(
      await db.session.findMany({
        where: { userId: owner.id },
        select: { id: true, userId: true, createdAt: true, updatedAt: true, expiresAt: true },
      }),
    ).toEqual(sessions)
  })

  it('refuses a different still-verified authoritative email between native validation and account hook without authorization touches', async () => {
    const email = mailbox()
    const local = await localPasswordIdentity(email, true)
    const authorization = await initiate(local.browser, true)
    let observed = false
    let owner = await db.user.findUniqueOrThrow({ where: { id: local.original.id } })
    const sessions = await db.session.findMany({
      where: { userId: owner.id },
      select: { id: true, userId: true, createdAt: true, updatedAt: true, expiresAt: true },
    })
    validationObserver = async ({ source }) => {
      if (source.action !== 'link-account' || source.oauth?.providerId !== 'google') return
      observed = true
      owner = await db.user.update({
        where: { id: local.original.id },
        data: { email: mailbox(), emailVerified: true },
      })
    }
    try {
      const response = await callback(local.browser, authorization, { email, verified: true })
      expect(observed).toBe(true)
      expect(response.headers.get('location') === destination).toBe(false)
      expect(response.status).toBe(403)
      expect((await response.json()).code).toBe('LOCAL_EMAIL_NOT_VERIFIED')
      expect(await db.account.count({ where: { userId: owner.id, providerId: 'google' } })).toBe(0)
      expect(await db.user.findUniqueOrThrow({ where: { id: owner.id } })).toEqual(owner)
      expect(
        await db.session.findMany({
          where: { userId: owner.id },
          select: { id: true, userId: true, createdAt: true, updatedAt: true, expiresAt: true },
        }),
      ).toEqual(sessions)
    } finally {
      validationObserver = async () => {}
    }
  })

  it.each(['missing-request', 'cross-request'] as const)(
    'rejects %s email-proof transport at the live native hook boundary without consuming the valid request proof',
    async (scenario) => {
      const email = mailbox()
      const local = await localPasswordIdentity(email, true)
      const subject = randomUUID()
      const admit = auth.options.databaseHooks?.account?.create?.before
      if (!admit) throw new Error('Missing native admission hook')
      let observed = false
      let admitted = false
      validationObserver = async ({ source }, ctx) => {
        if (source.action !== 'link-account' || source.oauth?.providerId !== 'google') return
        if (!ctx?.request) throw new Error('Missing real native callback request')
        observed = true
        const owner = await db.user.findUniqueOrThrow({ where: { id: local.original.id } })
        const sessions = await db.session.findMany({
          where: { userId: owner.id },
          select: { id: true, userId: true, createdAt: true, updatedAt: true, expiresAt: true },
        })
        try {
          const result = await admit(
            {
              id: randomUUID(),
              providerId: 'google',
              accountId: subject,
              userId: owner.id,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            {
              ...ctx,
              request: scenario === 'cross-request' ? new Request(ctx.request) : undefined,
            },
          )
          admitted = Boolean(result)
        } catch (error) {
          expect(error).toMatchObject({ body: { code: 'LOCAL_EMAIL_NOT_VERIFIED' } })
        }
        expect(await db.user.findUniqueOrThrow({ where: { id: owner.id } })).toEqual(owner)
        expect(
          await db.session.findMany({
            where: { userId: owner.id },
            select: { id: true, userId: true, createdAt: true, updatedAt: true, expiresAt: true },
          }),
        ).toEqual(sessions)
        expect(await db.account.count({ where: { userId: owner.id, providerId: 'google' } })).toBe(
          0,
        )
      }
      try {
        const response = await callback(local.browser, await initiate(local.browser, true), {
          email,
          verified: true,
          subject,
        })
        expect(response.headers.get('location') === destination).toBe(true)
        expect(observed).toBe(true)
        expect(admitted).toBe(false)
        expect(
          await db.account.count({
            where: { userId: local.original.id, providerId: 'google', accountId: subject },
          }),
        ).toBe(1)
      } finally {
        validationObserver = async () => {}
      }
    },
  )

  it('keeps concurrent native Google callback email proofs isolated while a different callback completes first', async () => {
    const firstEmail = mailbox()
    const secondEmail = mailbox()
    const first = await localPasswordIdentity(firstEmail, true)
    const second = await localPasswordIdentity(secondEmail, true)
    const firstAuthorization = await initiate(first.browser, true)
    const secondAuthorization = await initiate(second.browser, true)
    const firstSubject = randomUUID()
    const secondSubject = randomUUID()
    const barrier = () => {
      let resolve: () => void = () => {
        throw new Error('Barrier not initialized')
      }
      const promise = new Promise<void>((done) => {
        resolve = done
      })
      return { promise, resolve: () => resolve() }
    }
    const reached = barrier()
    const release = barrier()
    const requests = new Map<string, Request>()
    validationObserver = async ({ user, source }, ctx) => {
      if (source.action !== 'link-account' || source.oauth?.providerId !== 'google') return
      if (typeof user.id !== 'string' || !ctx?.request)
        throw new Error('Missing native owner/request')
      requests.set(user.id, ctx.request)
      if (user.id === first.original.id) {
        reached.resolve()
        await release.promise
      }
    }
    const pending = callback(first.browser, firstAuthorization, {
      email: firstEmail,
      verified: true,
      subject: firstSubject,
    })
    try {
      await reached.promise
      const other = await callback(second.browser, secondAuthorization, {
        email: secondEmail,
        verified: true,
        subject: secondSubject,
      })
      expect(other.headers.get('location') === destination).toBe(true)
      release.resolve()
      expect((await pending).headers.get('location') === destination).toBe(true)
      expect(requests.size).toBe(2)
      expect(requests.get(first.original.id)).not.toBe(requests.get(second.original.id))
      for (const [owner, subject] of [
        [first.original.id, firstSubject],
        [second.original.id, secondSubject],
      ])
        expect(
          await db.account.count({
            where: { userId: owner, accountId: subject, providerId: 'google' },
          }),
        ).toBe(1)
      expect((await (await first.browser.request('/api/auth/get-session')).json()).user.id).toBe(
        first.original.id,
      )
      expect((await (await second.browser.request('/api/auth/get-session')).json()).user.id).toBe(
        second.original.id,
      )
    } finally {
      release.resolve()
      await pending
      validationObserver = async () => {}
    }
  })

  it.each(['redirect', 'id-token'] as const)(
    'preserves pinned case-only email normalization for explicit %s admission',
    async (transport) => {
      const email = mailbox()
      const local = await localPasswordIdentity(email, true)
      await db.user.update({
        where: { id: local.original.id },
        data: { email: email.toUpperCase() },
      })
      const subject = randomUUID()
      const response =
        transport === 'redirect'
          ? await callback(local.browser, await initiate(local.browser, true), {
              email,
              verified: true,
              subject,
            })
          : await local.browser.request('/api/auth/link-social', {
              provider: 'google',
              idToken: { token: googleIdToken({ email, verified: true, subject }) },
            })
      if (transport === 'redirect')
        expect(response.headers.get('location') === destination).toBe(true)
      else expect(response.status).toBe(200)
      expect(
        await db.account.count({
          where: { userId: local.original.id, providerId: 'google', accountId: subject },
        }),
      ).toBe(1)
      expect((await db.user.findUniqueOrThrow({ where: { id: local.original.id } })).email).toBe(
        email.toUpperCase(),
      )
    },
  )

  it.each(['unverified', 'different-email', 'whitespace-email', 'invalid-signature'] as const)(
    'refuses native Google ID-token linking with %s without User/Session authorization touches',
    async (scenario) => {
      const email = mailbox()
      const local = await localPasswordIdentity(email, true)
      const owner = await db.user.findUniqueOrThrow({ where: { id: local.original.id } })
      const sessions = await db.session.findMany({
        where: { userId: owner.id },
        select: { id: true, userId: true, createdAt: true, updatedAt: true, expiresAt: true },
      })
      let token = googleIdToken({
        email:
          scenario === 'different-email'
            ? mailbox()
            : scenario === 'whitespace-email'
              ? ` ${email} `
              : email,
        verified: scenario !== 'unverified',
        subject: randomUUID(),
      })
      if (scenario === 'invalid-signature')
        token = `${token.split('.').slice(0, 2).join('.')}.invalid-signature`
      const response = await local.browser.request('/api/auth/link-social', {
        provider: 'google',
        idToken: { token },
      })
      expect(response.status).toBe(scenario === 'invalid-signature' ? 401 : 403)
      expect(await db.account.count({ where: { userId: owner.id, providerId: 'google' } })).toBe(0)
      expect(await db.user.findUniqueOrThrow({ where: { id: owner.id } })).toEqual(owner)
      expect(
        await db.session.findMany({
          where: { userId: owner.id },
          select: { id: true, userId: true, createdAt: true, updatedAt: true, expiresAt: true },
        }),
      ).toEqual(sessions)
    },
  )

  it('binds the valid native explicit insertion to meaningful owner and exact-session writes in one transaction', async () => {
    const email = mailbox()
    const local = await localPasswordIdentity(email, true)
    const session = await db.session.findFirstOrThrow({ where: { userId: local.original.id } })
    const owner = await db.user.findUniqueOrThrow({ where: { id: local.original.id } })
    const transaction = db.$transaction.bind(db)
    let transactions = 0
    const writes: string[] = []
    const spy = vi.spyOn(db, '$transaction').mockImplementation(async (callback) => {
      if (typeof callback !== 'function') throw new Error('Expected native callback transaction')
      transactions++
      return transaction((tx) => {
        const ownerObserved = observeTransactionMethod(tx, 'user', 'updateMany', () => {
          writes.push('user')
        })
        const sessionObserved = observeTransactionMethod(
          ownerObserved,
          'session',
          'updateMany',
          () => {
            writes.push('session')
          },
        )
        return callback(sessionObserved)
      })
    })
    try {
      const response = await callback(local.browser, await initiate(local.browser, true), {
        email,
        verified: true,
      })
      expect(response.headers.get('location') === destination).toBe(true)
      expect(transactions).toBe(1)
      expect(writes).toEqual(['user', 'session'])
    } finally {
      spy.mockRestore()
    }
    const afterUser = await db.user.findUniqueOrThrow({ where: { id: owner.id } })
    const afterSession = await db.session.findUniqueOrThrow({ where: { id: session.id } })
    expect(afterUser.updatedAt.getTime()).toBeGreaterThan(owner.updatedAt.getTime())
    expect(afterUser.platformVersion).toBe(owner.platformVersion)
    expect(afterUser.role).toBe(owner.role)
    expect(afterSession.updatedAt.getTime()).toBeGreaterThan(session.updatedAt.getTime())
    expect(afterSession.expiresAt).toEqual(session.expiresAt)
    expect(afterSession.createdAt).toEqual(session.createdAt)
  })

  it.each([
    'proof-lost',
    'email-changed',
    'session-missing',
    'session-expired',
    'wrong-session-owner',
  ] as const)(
    'rechecks %s at the real insertion transaction boundary and rolls back its touches',
    async (scenario) => {
      const email = mailbox()
      const local = await localPasswordIdentity(email, true)
      const session = await db.session.findFirstOrThrow({ where: { userId: local.original.id } })
      let observed = false
      let ownerBeforeInsert = await db.user.findUniqueOrThrow({ where: { id: local.original.id } })
      admissionObserver = async () => {
        observed = true
        if (scenario === 'proof-lost')
          await db.user.update({ where: { id: local.original.id }, data: { emailVerified: false } })
        if (scenario === 'email-changed')
          await db.user.update({
            where: { id: local.original.id },
            data: { email: mailbox(), emailVerified: true },
          })
        if (scenario === 'session-missing') await db.session.delete({ where: { id: session.id } })
        if (scenario === 'session-expired')
          await db.session.update({ where: { id: session.id }, data: { expiresAt: new Date(0) } })
        if (scenario === 'wrong-session-owner') {
          const foreign = await db.user.create({
            data: {
              email: mailbox(),
              name: 'Other fixture',
              emailVerified: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          })
          await db.session.update({ where: { id: session.id }, data: { userId: foreign.id } })
        }
        ownerBeforeInsert = await db.user.findUniqueOrThrow({ where: { id: local.original.id } })
      }
      try {
        const response = await callback(local.browser, await initiate(local.browser, true), {
          email,
          verified: true,
        })
        expect(response.status).toBe(403)
        const error = await response.json()
        expect(error.code).toBe('LOCAL_EMAIL_NOT_VERIFIED')
        expect(
          await db.account.count({ where: { userId: local.original.id, providerId: 'google' } }),
        ).toBe(0)
        expect(observed).toBe(true)
        expect(
          (await db.user.findUniqueOrThrow({ where: { id: local.original.id } })).updatedAt,
        ).toEqual(ownerBeforeInsert.updatedAt)
      } finally {
        admissionObserver = async () => {}
      }
    },
  )

  it.each(['user-proof', 'session-deletion', 'session-expiry'] as const)(
    'rolls back a real Mongo conditional-write conflict for %s without retrying insertion',
    async (scenario) => {
      const email = mailbox()
      const local = await localPasswordIdentity(email, true)
      const user = await db.user.findUniqueOrThrow({ where: { id: local.original.id } })
      const session = await db.session.findFirstOrThrow({ where: { userId: user.id } })
      const transaction = db.$transaction.bind(db)
      let attempts = 0
      let boundaryObserved = false
      let conflict: unknown
      const spy = vi.spyOn(db, '$transaction').mockImplementation(async (work) => {
        if (typeof work !== 'function') throw new Error('Expected native transaction')
        attempts++
        return transaction((tx) =>
          work(
            observeTransactionMethod(
              tx,
              scenario === 'user-proof' ? 'user' : 'session',
              'updateMany',
              async () => {
                boundaryObserved = true
                if (scenario === 'user-proof')
                  await db.user.update({ where: { id: user.id }, data: { emailVerified: false } })
                else if (scenario === 'session-deletion')
                  await db.session.delete({ where: { id: session.id } })
                else
                  await db.session.update({
                    where: { id: session.id },
                    data: { expiresAt: new Date(0) },
                  })
              },
            ),
          ),
        ).catch((error: unknown) => {
          conflict = error
          throw error
        })
      })
      try {
        const response = await callback(local.browser, await initiate(local.browser, true), {
          email,
          verified: true,
        })
        expect(response.status).toBe(500)
        expect(conflict).toMatchObject({ code: 'P2034' })
        expect(attempts).toBe(1)
        expect(boundaryObserved).toBe(true)
        expect(await db.account.count({ where: { userId: user.id, providerId: 'google' } })).toBe(0)
        if (scenario !== 'user-proof')
          expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).updatedAt).toEqual(
            user.updatedAt,
          )
      } finally {
        spy.mockRestore()
      }
    },
  )

  it.each(['explicit', 'first-google'] as const)(
    'rolls back %s owner/session touches when the actual account create fails',
    async (scenario) => {
      const email = mailbox()
      const local = scenario === 'explicit' ? await localPasswordIdentity(email, true) : null
      const user = local
        ? await db.user.findUniqueOrThrow({ where: { id: local.original.id } })
        : null
      const session = local
        ? await db.session.findFirstOrThrow({ where: { userId: local.original.id } })
        : null
      const browser = local?.browser ?? new Browser()
      const authorization = await initiate(browser, Boolean(local))
      const transaction = db.$transaction.bind(db)
      let attempted = false
      const spy = vi.spyOn(db, '$transaction').mockImplementation(async (work) => {
        if (typeof work !== 'function') throw new Error('Expected native transaction')
        return transaction((tx) =>
          work(
            observeTransactionMethod(tx, 'account', 'create', () => {
              attempted = true
              throw new Error('Controlled account-create failure')
            }),
          ),
        )
      })
      try {
        const response = await callback(browser, authorization, { email, verified: true })
        expect([302, 500]).toContain(response.status)
        expect(response.headers.get('location') === destination).toBe(false)
        expect(attempted).toBe(true)
        expect(await db.account.count({ where: { providerId: 'google', user: { email } } })).toBe(0)
        if (user && session) {
          expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(user)
          expect(await db.session.findUniqueOrThrow({ where: { id: session.id } })).toEqual(session)
        } else expect(await db.user.count({ where: { email } })).toBe(0)
      } finally {
        spy.mockRestore()
      }
    },
  )

  it('rejects stripped, forged and consumed native stamps without a second account publication', async () => {
    const email = mailbox()
    const local = await localPasswordIdentity(email, true)
    let stamped: Record<string | symbol, unknown> = {}
    admissionObserver = async (data) => {
      stamped = { ...data }
    }
    try {
      const response = await callback(local.browser, await initiate(local.browser, true), {
        email,
        verified: true,
      })
      expect(response.headers.get('location') === destination).toBe(true)
    } finally {
      admissionObserver = async () => {}
    }
    const symbols = Object.getOwnPropertySymbols(stamped)
    expect(symbols.length).toBe(1)
    const key = symbols[0]
    if (!key) throw new Error('Missing private native admission stamp')
    const plain = JSON.parse(JSON.stringify(stamped)) as Record<string, unknown>
    const forged = { ...plain, [key]: { ...Object(stamped[key]) } }
    const adapter = (await auth.$context).adapter
    for (const data of [plain, forged, stamped]) {
      await expect(adapter.create({ model: 'account', data })).rejects.toThrow()
    }
    expect(
      await db.account.count({ where: { userId: local.original.id, providerId: 'google' } }),
    ).toBe(1)
    const stored = await db.account.findFirstOrThrow({
      where: { userId: local.original.id, providerId: 'google' },
    })
    expect(Object.getOwnPropertySymbols(stored)).toEqual([])
  })

  it.each(['unverified-provider', 'different-email'] as const)(
    'refuses explicit link with %s without changing the password identity',
    async (scenario) => {
      const email = mailbox()
      const local = await localPasswordIdentity(email, true)
      const providerEmail = scenario === 'different-email' ? mailbox() : email
      const response = await callback(local.browser, await initiate(local.browser, true), {
        email: providerEmail,
        verified: scenario !== 'unverified-provider',
      })
      await refused(local.browser, response, email)
      expect(await db.account.count({ where: { userId: local.original.id } })).toBe(1)
      expect((await db.user.findUniqueOrThrow({ where: { email } })).id).toBe(local.original.id)
    },
  )

  it('refuses implicit linking to an existing locally unverified password identity without trust bypass', async () => {
    const email = mailbox()
    const local = await localPasswordIdentity(email, false)
    const browser = new Browser()
    const response = await callback(browser, await initiate(browser), { email, verified: true })
    expect(await (await refused(browser, response, email)).json()).toBeNull()
    expect((await db.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBe(false)
    expect(await db.account.count({ where: { userId: local.original.id } })).toBe(1)
  })

  it('refuses explicit Google linking from a locally unverified password identity without treating its unproven session as ownership', async () => {
    const email = mailbox()
    const local = await localPasswordIdentity(email, false)
    const before = await db.verification.count()
    const response = await local.browser.request('/api/auth/link-social', {
      provider: 'google',
      callbackURL: destination,
      disableRedirect: true,
    })
    expect(response.status).toBe(403)
    expect(await db.verification.count()).toBe(before)
    expect(response.headers.getSetCookie().length).toBe(0)
    expect(
      await db.account.count({ where: { userId: local.original.id, providerId: 'google' } }),
    ).toBe(0)
    expect((await db.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBe(false)
    expect(await db.account.count({ where: { userId: local.original.id } })).toBe(1)
  })

  it.each(['proof-lost', 'session-revoked', 'wrong-session'] as const)(
    'refuses explicit linking when %s after verified initiation',
    async (scenario) => {
      const email = mailbox()
      const local = await localPasswordIdentity(email, true)
      const authorization = await initiate(local.browser, true)
      let cookie: string | undefined
      if (scenario === 'proof-lost')
        await db.user.update({ where: { id: local.original.id }, data: { emailVerified: false } })
      if (scenario === 'session-revoked')
        await db.session.deleteMany({ where: { userId: local.original.id } })
      if (scenario === 'wrong-session') {
        const foreign = await localPasswordIdentity(mailbox(), true)
        cookie = [
          local.browser
            .cookie()
            .split('; ')
            .filter((part) => !part.includes('session_token='))
            .join('; '),
          foreign.browser
            .cookie()
            .split('; ')
            .find((part) => part.includes('session_token=')),
        ]
          .filter(Boolean)
          .join('; ')
      }
      const response = await callback(
        local.browser,
        authorization,
        { email, verified: true },
        { cookie },
      )
      await refused(local.browser, response, email)
      expect(await db.account.count({ where: { userId: local.original.id } })).toBe(1)
      expect((await db.user.findUniqueOrThrow({ where: { email } })).id).toBe(local.original.id)
    },
  )

  it('implicitly links only a matching verified Google email to a locally verified password owner', async () => {
    const email = mailbox()
    const local = await localPasswordIdentity(email, true)
    const result = await googleLogin({ email, verified: true })
    expect(result.user.id).toBe(local.original.id)
    expect(await db.user.count({ where: { email } })).toBe(1)
    expect(await db.account.count({ where: { userId: local.original.id } })).toBe(2)
  })

  it('preserves independent Google account switching from an unverified password session', async () => {
    const profile = { email: mailbox(), verified: true, subject: randomUUID() }
    const google = await googleLogin(profile)
    const local = await localPasswordIdentity(mailbox(), false)
    const response = await callback(local.browser, await initiate(local.browser), profile)
    expect(response.status).toBe(302)
    expect(response.headers.get('location') === destination).toBe(true)
    const session = await (await local.browser.request('/api/auth/get-session')).json()
    expect(session.user.id).toBe(google.user.id)
    expect(
      await db.account.count({ where: { userId: local.original.id, providerId: 'google' } }),
    ).toBe(0)
  })

  it('refuses a provider subject already attached to another canonical user', async () => {
    const subject = randomUUID()
    const original = await googleLogin({ email: mailbox(), verified: true, subject })
    const email = mailbox()
    const local = await localPasswordIdentity(email, true)
    const response = await callback(local.browser, await initiate(local.browser, true), {
      email,
      verified: true,
      subject,
    })
    await refused(local.browser, response, email)
    expect(
      (await db.account.findFirstOrThrow({ where: { providerId: 'google', accountId: subject } }))
        .userId,
    ).toBe(original.user.id)
    expect(await db.account.count({ where: { userId: local.original.id } })).toBe(1)
  })

  it('refuses an expired native OAuth state before token exchange', async () => {
    const email = mailbox()
    const browser = new Browser()
    const authorization = await initiate(browser)
    const before = exchanges
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 600_001)
    try {
      const response = await callback(browser, authorization, { email, verified: true })
      expect(await (await refused(browser, response, email)).json()).toBeNull()
      expect(exchanges).toBe(before)
      expect(await db.user.count({ where: { email } })).toBe(0)
    } finally {
      clock.mockRestore()
    }
  })

  it.each([
    'missing-cookie',
    'tampered-state',
    'other-browser-cookie',
    'cancelled',
    'invalid-code',
  ] as const)('fails safely on %s without minting identity/session', async (scenario) => {
    const email = mailbox()
    const browser = new Browser()
    const authorization = await initiate(browser)
    const before = exchanges
    const foreign = new Browser()
    if (scenario === 'other-browser-cookie') await initiate(foreign)
    const response = await callback(
      browser,
      authorization,
      { email, verified: true },
      {
        ...(scenario === 'missing-cookie' ? { cookie: '' } : {}),
        ...(scenario === 'other-browser-cookie' ? { cookie: foreign.cookie() } : {}),
        ...(scenario === 'tampered-state' ? { state: randomBytes(24).toString('base64url') } : {}),
        cancel: scenario === 'cancelled',
        invalidCode: scenario === 'invalid-code',
      },
    )
    expect(await (await refused(browser, response, email)).json()).toBeNull()
    expect(await db.user.count({ where: { email } })).toBe(0)
    expect(exchanges - before).toBe(scenario === 'invalid-code' ? 1 : 0)
  })

  it.each([
    ['callbackURL', 'https://hostile.example/admin'],
    ['callbackURL', '//hostile.example/admin'],
    ['errorCallbackURL', 'https://hostile.example/admin'],
    ['errorCallbackURL', '//hostile.example/admin'],
    ['newUserCallbackURL', 'https://hostile.example/admin'],
    ['newUserCallbackURL', '//hostile.example/admin'],
  ])('refuses hostile %s destination %s before OAuth state creation', async (field, target) => {
    const browser = new Browser()
    const before = await db.verification.count()
    const response = await browser.request('/api/auth/sign-in/social', {
      provider: 'google',
      callbackURL: destination,
      [field]: target,
      disableRedirect: true,
    })
    expect(response.status).toBe(403)
    expect(await db.verification.count()).toBe(before)
    expect(response.headers.getSetCookie().length).toBe(0)
  })

  it('rejects callback replay after native state consumption', async () => {
    const email = mailbox()
    const browser = new Browser()
    const authorization = await initiate(browser)
    const originalCookie = browser.cookie()
    const first = await callback(browser, authorization, { email, verified: true })
    expect(first.headers.get('location') === destination).toBe(true)
    const user = await db.user.findUniqueOrThrow({ where: { email } })
    const replay = new Browser()
    const before = exchanges
    const response = await callback(
      replay,
      authorization,
      { email, verified: true },
      { cookie: originalCookie },
    )
    await refused(replay, response, email, 1)
    expect(exchanges).toBe(before)
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1)
  })

  it('uses the same fresh ADMIN policy for Google cookies on overview, accounts and ingestion, then rejects demotion/revocation/signout reuse', async () => {
    const email = mailbox()
    const subject = randomUUID()
    const { browser, user } = await googleLogin({ email, verified: true, subject })
    const paths = ['/api/admin/overview', '/api/admin/accounts', '/api/ingestion/dashboard']
    await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } })
    for (const path of paths) expect((await browser.request(path)).status).toBe(200)
    await db.user.update({ where: { id: user.id }, data: { role: 'USER' } })
    for (const path of paths) expect((await browser.request(path)).status).toBe(403)
    await db.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } })
    const revokedCookie = browser.cookie()
    await db.session.deleteMany({ where: { userId: user.id } })
    for (const path of paths)
      expect((await browser.request(path, undefined, revokedCookie)).status).toBe(401)
    const fresh = await googleLogin({ email, verified: true, subject })
    const oldCookie = fresh.browser.cookie()
    const logout = await fresh.browser.request('/api/auth/sign-out', {})
    expect(logout.status).toBe(200)
    expect(
      logout.headers
        .getSetCookie()
        .some((cookie) => cookie.includes('session_token=') && cookie.includes('Max-Age=0')),
    ).toBe(true)
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0)
    for (const path of paths)
      expect((await fresh.browser.request(path, undefined, oldCookie)).status).toBe(401)
  })
})
