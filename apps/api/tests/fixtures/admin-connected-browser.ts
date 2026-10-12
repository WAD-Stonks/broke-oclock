import { execFile } from 'node:child_process'
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import { MongoMemoryReplSet } from 'mongodb-memory-server'

// Standalone IPC fixture. Synthetic principals/data only. No configured .env is read.
// Retain native auth factory, native HTTP handlers, native Prisma transactions,
// original Vite config/Vue SPA/authClient/Axios. Control only known external URLs.
process.env.DATABASE_URL = 'mongodb://127.0.0.1:1/admin_connected_nonconnecting'
process.env.NODE_ENV = 'test'
const root =
  process.env.ADMIN_CONNECTED_REPO_ROOT ?? fileURLToPath(new URL('../../../../', import.meta.url))
const artifacts = process.env.ADMIN_CONNECTED_ARTIFACTS
if (!artifacts || !process.send)
  throw new Error('Run through the owned connected Playwright fixture')
const nativeFetch = globalThis.fetch
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: typeof import('@broke-oclock/db').db | undefined
let vite: { close: () => Promise<void> } | undefined
let webURL = ''
let apiURL = ''
let stopped = false
const mail = new Map<string, string>()
const grants = new Map<
  string,
  { email: string; verified: boolean; subject: string; challenge: string }
>()
const googleEmail = `controlled-google-${randomUUID()}@example.test`
const googleSubject = randomUUID()
const clientId = 'disposable-client.apps.googleusercontent.com'
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: 'connected-disposable-google',
  alg: 'RS256',
  use: 'sig',
}
let otpAdmin: { id: string; email: string; password: string; cookie: string }
let ownedRecordId = ''
const request = (path: string, body?: object, cookie = '') =>
  nativeFetch(`${apiURL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Origin: webURL, Cookie: cookie },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
  })
const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ')
const requireDatabase = () => {
  if (!db) throw new Error('Disposable database unavailable')
  return db
}
const stop = async () => {
  if (stopped) return
  stopped = true
  await vite?.close()
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolveClose) => server?.close(() => resolveClose()))
  await db?.$disconnect()
  await mongo?.stop()
  globalThis.fetch = nativeFetch
  mail.clear()
  grants.clear()
}
const controlledProviderFetch: typeof fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input)
  if (url === 'https://api.resend.com/emails') {
    const body = JSON.parse(String(init?.body)) as { to: string; text: string }
    const code = body.text.match(/\b[0-9]{6}\b/u)?.[0]
    if (!code || !body.to.endsWith('@example.test'))
      throw new Error('Controlled delivery rejected malformed fixture mail')
    mail.set(body.to, code)
    return Response.json({ id: randomUUID() })
  }
  if (url === 'https://oauth2.googleapis.com/token') {
    const body = new URLSearchParams(String(init?.body))
    const grant = grants.get(body.get('code') ?? '')
    if (!grant) return Response.json({ error: 'invalid_grant' }, { status: 400 })
    grants.delete(body.get('code') ?? '')
    if (
      body.get('grant_type') !== 'authorization_code' ||
      body.get('redirect_uri') !== `${webURL}/api/auth/callback/google` ||
      createHash('sha256')
        .update(body.get('code_verifier') ?? '')
        .digest('base64url') !== grant.challenge
    )
      throw new Error('Native Google PKCE exchange failed')
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const now = Math.floor(Date.now() / 1000)
    const payload = `${encode({ alg: 'RS256', kid: jwk.kid })}.${encode({ iss: 'https://accounts.google.com', aud: clientId, sub: grant.subject, email: grant.email, email_verified: grant.verified, name: 'Synthetic controlled Google operator', role: 'ADMIN', iat: now, exp: now + 300 })}`
    return Response.json({
      access_token: randomBytes(24).toString('base64url'),
      token_type: 'Bearer',
      expires_in: 300,
      id_token: `${payload}.${sign('RSA-SHA256', Buffer.from(payload), privateKey).toString('base64url')}`,
    })
  }
  if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] })
  if (!url.startsWith('http://127.0.0.1:')) throw new Error('Unexpected external request blocked')
  return nativeFetch(input, init)
}
const seedAdmin = async (label: string) => {
  const email = `connected-${label}-${randomUUID()}@example.test`
  const password = randomBytes(24).toString('base64url')
  const response = await request('/api/auth/sign-up/email', {
    name: `Synthetic ${label} operator`,
    email,
    password,
    role: 'ADMIN',
  })
  if (response.status !== 200) throw new Error(`Native fixture signup failed (${response.status})`)
  const user = await requireDatabase().user.findUniqueOrThrow({ where: { email } })
  if (user.role !== 'USER' || user.emailVerified)
    throw new Error('Native signup accepted forged role or invented verification')
  // Explicit fixture-only DB promotion of an identity produced by native USER signup.
  await requireDatabase().user.update({ where: { id: user.id }, data: { role: 'ADMIN' } })
  return { id: user.id, email, password, cookie: cookieFrom(response) }
}
const initialize = async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
    binary: { checkMD5: true },
  })
  const databaseUrl = mongo.getUri(`connected_browser_${randomUUID().replaceAll('-', '')}`)
  if (!databaseUrl.startsWith('mongodb://127.0.0.1:'))
    throw new Error('Disposable Mongo URI is not loopback')
  process.env.DATABASE_URL = databaseUrl
  await promisify(execFile)(
    'pnpm',
    ['--dir', 'packages/db', 'exec', 'prisma', 'db', 'push', '--skip-generate'],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      timeout: 60_000,
      encoding: 'utf8',
    },
  )
  db = (await import('@broke-oclock/db')).db
  server = createServer()
  await new Promise<void>((resolveListen) => server?.listen(0, '127.0.0.1', resolveListen))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No owned API listener')
  apiURL = `http://127.0.0.1:${address.port}`
  // Resolve Vite through the owning web workspace, not a second installation.
  const webRequire = createRequire(resolve(root, 'apps/web/package.json'))
  const { createServer: createViteServer } = await import(
    pathToFileURL(webRequire.resolve('vite')).href
  )
  // Vite treats port: 0 as its default 5173, not an OS ephemeral allocation.
  // Reserve with Node, release only our own reservation, then bind that exact port
  // with strictPort. A competing listener makes setup fail closed; never kill it.
  const reservation = createServer()
  await new Promise<void>((resolveReservation) =>
    reservation.listen(0, '127.0.0.1', resolveReservation),
  )
  const reserved = reservation.address()
  if (!reserved || typeof reserved === 'string') throw new Error('No owned Vite reservation')
  await new Promise<void>((resolveReservation) => reservation.close(() => resolveReservation()))
  const web = await createViteServer({
    root: resolve(root, 'apps/web'),
    configFile: resolve(root, 'apps/web/vite.config.ts'),
    cacheDir: resolve(artifacts, 'vite-cache'),
    server: {
      host: '127.0.0.1',
      port: reserved.port,
      strictPort: true,
      proxy: { '/api': { target: apiURL, changeOrigin: true } },
    },
  })
  vite = web
  await web.listen()
  const webAddress = web.httpServer?.address()
  if (!webAddress || typeof webAddress === 'string')
    throw new Error('No owned original Vite listener')
  webURL = `http://127.0.0.1:${webAddress.port}`
  globalThis.fetch = controlledProviderFetch
  const { createApp } = await import('@api/app')
  server.on(
    'request',
    createApp(
      parseConfig({
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
        BETTER_AUTH_URL: webURL,
        WEB_ORIGIN: webURL,
        GOOGLE_CLIENT_ID: clientId,
        GOOGLE_CLIENT_SECRET: 'disposable-client-secret',
        RESEND_API_KEY: 're_disposable_test_only',
        EMAIL_FROM: 'fixture@example.test',
      }),
    ),
  )
  const passwordAdmin = await seedAdmin('password')
  // Native logout closes setup's independent signup session. Browser then owns the
  // password identity's only session; OTP setup session deliberately remains for revocation proof.
  if ((await request('/api/auth/sign-out', {}, passwordAdmin.cookie)).status !== 200)
    throw new Error('Native setup logout failed')
  otpAdmin = await seedAdmin('otp')
  const merchant = await db.merchant.create({ data: { name: 'Synthetic connected merchant' } })
  const venue = await db.venue.create({
    data: {
      name: 'Synthetic connected outlet',
      merchantId: merchant.id,
      address: 'Synthetic fixture address',
      latitude: 1.3,
      longitude: 103.8,
    },
  })
  const record = await db.merchantAccessRequest.create({
    data: {
      userId: otpAdmin.id,
      venueId: venue.id,
      userName: 'Synthetic OTP operator',
      userEmail: otpAdmin.email,
      venueName: venue.name,
      merchantName: merchant.name,
      message: 'Synthetic ownership evidence only',
    },
  })
  ownedRecordId = record.id
  process.send?.({
    ready: true,
    webURL,
    bindings: {
      apiPort: address.port,
      webPort: webAddress.port,
      mongoPorts: mongo.servers
        .map((instance) => instance.instanceInfo?.port)
        .filter((port): port is number => typeof port === 'number'),
      pid: process.pid,
    },
    passwordAdmin: {
      id: passwordAdmin.id,
      email: passwordAdmin.email,
      password: passwordAdmin.password,
    },
    otpAdmin: { id: otpAdmin.id, email: otpAdmin.email, password: otpAdmin.password },
  })
}
process.on(
  'message',
  async (message: {
    id: number
    operation: string
    userId?: string
    role?: 'USER' | 'ADMIN'
    email?: string
    cookie?: string
    authorization?: string
    verified?: boolean
  }) => {
    try {
      let value: unknown
      if (message.operation === 'stop') {
        await stop()
        process.send?.({ id: message.id, value: true })
        process.disconnect()
        return
      }
      const database = requireDatabase()
      if (message.operation === 'role') {
        await database.user.update({ where: { id: message.userId }, data: { role: message.role } })
        value =
          (await database.user.findUniqueOrThrow({ where: { id: message.userId } })).role ===
          message.role
      } else if (message.operation === 'ageSession') {
        if ((await database.session.count({ where: { userId: message.userId } })) !== 1)
          throw new Error('Aging requires exactly one native browser session')
        const active = await database.session.findFirstOrThrow({
          where: { userId: message.userId },
        })
        const original = await database.merchantAccessRequest.findUniqueOrThrow({
          where: { id: ownedRecordId },
        })
        const user = await database.user.findUniqueOrThrow({ where: { id: message.userId } })
        const record = await database.merchantAccessRequest.create({
          data: {
            userId: user.id,
            venueId: original.venueId,
            userName: user.name,
            userEmail: user.email,
            venueName: original.venueName,
            merchantName: original.merchantName,
            message: 'Synthetic renewal ownership evidence only',
          },
        })
        const now = Date.now()
        const aged = await database.session.update({
          where: { id: active.id },
          data: {
            createdAt: new Date(now - 2 * 86_400_000),
            updatedAt: new Date(now - 2 * 86_400_000),
            expiresAt: new Date(now + 4 * 86_400_000),
          },
        })
        value = {
          sessionId: aged.id,
          recordId: record.id,
          userId: aged.userId,
          expiresAt: aged.expiresAt.getTime(),
        }
      } else if (message.operation === 'sessionExpiry') {
        const active = await database.session.findFirstOrThrow({
          where: { userId: message.userId },
        })
        const record = await database.merchantAccessRequest.findFirstOrThrow({
          where: { userId: message.userId },
        })
        value = {
          sessionId: active.id,
          recordId: record.id,
          userId: active.userId,
          expiresAt: active.expiresAt.getTime(),
          recordStatus: record.status,
        }
      } else if (message.operation === 'protected')
        value = (await request('/api/admin/overview', undefined, message.cookie)).status
      else if (message.operation === 'sessionCount')
        value = await database.session.count({ where: { userId: message.userId } })
      else if (message.operation === 'otp') {
        value = mail.get(message.email ?? '')
        mail.delete(message.email ?? '')
        if (!value) throw new Error('Controlled Resend captured no OTP')
      } else if (message.operation === 'otpPreserved') {
        const user = await database.user.findUniqueOrThrow({ where: { email: otpAdmin.email } })
        const record = await database.merchantAccessRequest.findUniqueOrThrow({
          where: { id: ownedRecordId },
        })
        value = {
          userPreserved: user.id === otpAdmin.id,
          recordPreserved: record.userId === otpAdmin.id && record.status === 'PENDING',
          oldCookieDenied:
            (await request('/api/admin/overview', undefined, otpAdmin.cookie)).status === 401,
          credentialRemoved:
            (await database.account.count({
              where: { userId: user.id, providerId: 'credential' },
            })) === 0,
          oldPasswordDenied:
            (
              await request('/api/auth/sign-in/email', {
                email: otpAdmin.email,
                password: otpAdmin.password,
              })
            ).status === 401,
        }
      } else if (message.operation === 'googleGrant') {
        const authorization = new URL(message.authorization ?? '')
        if (
          authorization.origin !== 'https://accounts.google.com' ||
          authorization.searchParams.get('redirect_uri') !== `${webURL}/api/auth/callback/google` ||
          authorization.searchParams.get('code_challenge_method') !== 'S256' ||
          !authorization.searchParams.get('state')
        )
          throw new Error('Native Google authorization invariant failed')
        const code = randomBytes(24).toString('base64url')
        grants.set(code, {
          email: googleEmail,
          subject: googleSubject,
          verified: message.verified === true,
          challenge: authorization.searchParams.get('code_challenge') ?? '',
        })
        value = `${webURL}/api/auth/callback/google?${new URLSearchParams({ code, state: authorization.searchParams.get('state') ?? '' })}`
      } else if (message.operation === 'googleCanonical') {
        const user = await database.user.findUniqueOrThrow({ where: { email: googleEmail } })
        const account = await database.account.findFirstOrThrow({
          where: { userId: user.id, providerId: 'google' },
        })
        value =
          user.id === message.userId &&
          account.accountId === googleSubject &&
          user.role === 'USER' &&
          (await database.user.count({ where: { email: googleEmail } })) === 1
      } else throw new Error('Unknown owned fixture operation')
      process.send?.({ id: message.id, value })
    } catch {
      process.send?.({
        id: message.id,
        failure: `Owned fixture operation failed: ${message.operation}`,
      })
    }
  },
)
process.on('disconnect', () => {
  void stop().then(() => process.exit(0))
})
process.on('SIGTERM', () => {
  void stop().then(() => process.exit(0))
})
process.on('SIGINT', () => {
  void stop().then(() => process.exit(0))
})
initialize().catch(async (error: unknown) => {
  // Do not emit provider payloads, connection strings, OTPs, passwords, cookie/state.
  process.send?.({
    failure:
      error instanceof Error &&
      /^(Native fixture signup failed|Native signup accepted|No owned|No owned original|Disposable Mongo URI)/u.test(
        error.message,
      )
        ? error.message
        : `Connected fixture setup failed (${error instanceof Error ? error.name : 'unknown'})`,
  })
  await stop()
  process.exit(1)
})
