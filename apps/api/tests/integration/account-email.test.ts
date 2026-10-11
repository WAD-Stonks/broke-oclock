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
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let disconnect: (() => Promise<void>) | undefined
let baseURL = ''
let db!: typeof import('@broke-oclock/db').db

type MailInput = { to: string | readonly string[]; subject: string; text?: string }

// Fake email provider: never touches the network, and takes a moment to "deliver" so the tests
// can tell whether Better Auth really waited for the email to be sent.
const mail = vi.hoisted(() => ({
  delayMs: 0,
  delivered: [] as { to: string; subject: string; text: string }[],
}))
vi.mock('@broke-oclock/email/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@broke-oclock/email/server')>()
  const send = async (input: MailInput) => {
    await new Promise((resolve) => setTimeout(resolve, mail.delayMs))
    mail.delivered.push({ to: String(input.to), subject: input.subject, text: input.text ?? '' })
    return { id: 'test-email' }
  }
  return { ...actual, createEmailClient: () => ({ send, sendEmail: send }) }
})

const call = (method: string, path: string, options: { cookie?: string; body?: object } = {}) =>
  fetch(`${baseURL}${path}`, {
    method,
    headers: {
      Origin: origin,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })

const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')

const emailsTo = (email: string) => mail.delivered.filter((message) => message.to === email)

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
        // Email switched on (the fake client above receives everything).
        RESEND_API_KEY: 're_test_key',
        EMAIL_FROM: 'Deals <deals@example.test>',
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

describe('account emails with email switched on', () => {
  it('sends the verification email before sign-up responds, even if slow', async () => {
    mail.delayMs = 300
    const email = `verify-${randomUUID()}@example.test`
    const response = await call('POST', '/api/auth/sign-up/email', {
      body: { name: 'Verify Me', email, password: randomBytes(24).toString('base64url') },
    })
    expect(response.status).toBe(200)
    // If the hook did not wait, the 300 ms delivery would still be running here.
    const sent = emailsTo(email)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.subject).toBe('Verify your email address')
    expect(sent[0]?.text).toContain('/verify-email')
  })

  it('sends the reset email before responding, and a reset signs out old sessions', async () => {
    mail.delayMs = 0
    const email = `reset-${randomUUID()}@example.test`
    const password = randomBytes(24).toString('base64url')
    const signUp = await call('POST', '/api/auth/sign-up/email', {
      body: { name: 'Reset Me', email, password },
    })
    expect(signUp.status).toBe(200)
    // Email verification is required while email is on, so mark this synthetic user verified.
    await db.user.update({ where: { email }, data: { emailVerified: true } })

    const signIn = await call('POST', '/api/auth/sign-in/email', { body: { email, password } })
    expect(signIn.status).toBe(200)
    const oldCookie = cookieFrom(signIn)
    expect((await call('GET', '/api/account/profile', { cookie: oldCookie })).status).toBe(200)

    mail.delayMs = 300
    const requested = await call('POST', '/api/auth/request-password-reset', {
      body: { email, redirectTo: `${origin}/reset-password` },
    })
    expect(requested.status).toBe(200)
    const resetEmail = emailsTo(email).find((message) => message.subject === 'Reset your password')
    // Present already: the request did not return until delivery finished.
    expect(resetEmail).toBeDefined()
    const token = /reset-password\/([^?\s]+)/u.exec(resetEmail?.text ?? '')?.[1]
    expect(token).toBeTruthy()

    const reset = await call('POST', '/api/auth/reset-password', {
      body: { newPassword: randomBytes(24).toString('base64url'), token },
    })
    expect(reset.status).toBe(200)
    // The cookie from before the reset must no longer work (stolen sessions are cut off).
    expect((await call('GET', '/api/account/profile', { cookie: oldCookie })).status).toBe(401)
  })

  it('does not send a reset email for an unknown address', async () => {
    mail.delayMs = 0
    const email = `nobody-${randomUUID()}@example.test`
    const response = await call('POST', '/api/auth/request-password-reset', {
      body: { email, redirectTo: `${origin}/reset-password` },
    })
    expect(response.status).toBe(200)
    expect(emailsTo(email)).toHaveLength(0)
  })
})