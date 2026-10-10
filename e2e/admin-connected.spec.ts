import { type ChildProcess, fork } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { expect, type Page, test } from '@playwright/test'

// Connected original SPA -> original native HTTP -> disposable Prisma/Mongo.
// ONLY Google authorization/token/JWKS and Resend delivery are controlled.
// No application/session/REST browser interception, auth-state files or traces.
const root = process.cwd()
const artifacts =
  process.env.ADMIN_CONNECTED_ARTIFACTS ??
  resolve(tmpdir(), 'admin-completion/G-connected-browser', `canonical-${process.pid}`)
test.use({ trace: 'off', screenshot: 'off', video: 'off' })
test.describe.configure({ mode: 'default' })
type Identity = { id: string; email: string; password: string }
let child: ChildProcess
let webURL = ''
let bindings: { apiPort: number; webPort: number; mongoPorts: number[]; pid: number } | undefined
let passwordAdmin: Identity
let otpAdmin: Identity
let pendingId = 0
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>()
const call = (operation: string, data: object = {}) =>
  new Promise<unknown>((resolveCall, reject) => {
    const id = ++pendingId
    pending.set(id, { resolve: resolveCall, reject })
    child.send({ id, operation, ...data })
  })
const observations = new Map<
  Page,
  {
    network: { method: string; path: string; status: number }[]
    console: string[]
    pageErrors: string[]
    resourceErrors: { path: string; status: number }[]
  }
>()
const observe = (page: Page) => {
  const evidence = {
    network: [] as { method: string; path: string; status: number }[],
    console: [] as string[],
    pageErrors: [] as string[],
    resourceErrors: [] as { path: string; status: number }[],
  }
  observations.set(page, evidence)
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname
    if (path.startsWith('/api/'))
      evidence.network.push({
        method: response.request().method(),
        path,
        status: response.status(),
      })
    else if (response.status() >= 400)
      evidence.resourceErrors.push({ path, status: response.status() })
  })
  // Browser diagnostics are actually collected, but never retain raw URL queries/provider payloads.
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type()))
      evidence.console.push(message.text().replace(/https?:\/\/[^\s]+/gu, '[url omitted]'))
  })
  page.on('pageerror', (error) => evidence.pageErrors.push(error.name))
}
const screenshot = async (page: Page, name: string) => {
  for (const selector of [
    '#sign-in-code',
    '#admin-password',
    '#recovery-code',
    '#recovery-password',
  ]) {
    const input = page.locator(selector)
    if (await input.count())
      await input.evaluate((element) => {
        ;(element as HTMLInputElement).value = ''
      })
  }
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
        .map((animation) => animation.finished.catch(() => {})),
    )
  })
  await page.screenshot({ path: resolve(artifacts, `${name}.png`), fullPage: true })
}
const identity = async (page: Page) =>
  page.evaluate(async () => {
    const response = await fetch('/api/auth/get-session?disableCookieCache=true')
    const session = await response.json()
    return session?.user
      ? {
          id: session.user.id as string,
          role: session.user.role as string,
          verified: session.user.emailVerified as boolean,
        }
      : null
  })
const overview = async (page: Page) => {
  await expect(page.getByRole('heading', { name: 'Admin overview', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Work awaiting review' })).toBeVisible()
  await expect(
    page.locator('a[href="/admin/accounts?requestStatus=PENDING#merchant-requests"]'),
  ).toHaveText('Pending merchant requests: 1')
  await expect(page.locator('a[href="/admin/ingestion?status=PENDING#queue-title"]')).toHaveText(
    'Pending imported drafts: 0',
  )
  await expect(page.getByText('NOT_ESTABLISHED', { exact: true })).toBeVisible()
  expect(new URL(page.url()).origin === webURL).toBe(true)
  expect((await page.title()).length > 0).toBe(true)
  expect(await page.locator('body').innerText()).toContain('Admin overview')
  expect(await page.locator('vite-error-overlay').count()).toBe(0)
}
const permissionsAndLogout = async (page: Page, userId: string) => {
  const oldCookie = (await page.context().cookies())
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ')
  await call('role', { userId, role: 'USER' })
  await page.reload()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'You do not have permission to view administration.' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Work awaiting review' })).toHaveCount(0)
  expect((await identity(page))?.role).toBe('USER')
  expect(await call('protected', { cookie: oldCookie })).toBe(403)
  await page.getByTestId('admin-sign-out').click()
  await expect(page.getByRole('heading', { name: 'Sign in to view administration' })).toBeVisible()
  expect(await identity(page)).toBeNull()
  expect(await call('protected', { cookie: oldCookie })).toBe(401)
  expect(await call('sessionCount', { userId })).toBe(0)
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  await mkdir(artifacts, { recursive: true })
  child = fork(
    process.env.ADMIN_CONNECTED_FIXTURE_ENTRY ??
      resolve(root, 'apps/api/tests/fixtures/admin-connected-browser.ts'),
    [],
    {
      cwd: root,
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        NODE_ENV: 'test',
        DATABASE_URL: 'mongodb://127.0.0.1:1/admin_connected_nonconnecting',
        MONGOMS_RUNTIME_DOWNLOAD: 'false',
        ADMIN_CONNECTED_ARTIFACTS: artifacts,
        ADMIN_CONNECTED_REPO_ROOT: root,
      },
    },
  )
  child.stdout?.on('data', () => {})
  child.stderr?.on('data', () => {})
  const ready = new Promise<void>((resolveReady, reject) => {
    child.on('message', (message: unknown) => {
      const result = message as {
        ready?: boolean
        webURL?: string
        bindings?: { apiPort: number; webPort: number; mongoPorts: number[]; pid: number }
        passwordAdmin?: Identity
        otpAdmin?: Identity
        id?: number
        value?: unknown
        failure?: string
      }
      if (result.ready && result.webURL && result.passwordAdmin && result.otpAdmin) {
        webURL = result.webURL
        bindings = result.bindings
        passwordAdmin = result.passwordAdmin
        otpAdmin = result.otpAdmin
        resolveReady()
      } else if (result.id) {
        const waiter = pending.get(result.id)
        pending.delete(result.id)
        if (result.failure) waiter?.reject(new Error(result.failure))
        else waiter?.resolve(result.value)
      } else if (result.failure) reject(new Error(result.failure))
    })
    child.on('exit', (code) => {
      reject(new Error(`Owned fixture exited before readiness (${code})`))
      for (const waiter of pending.values()) waiter.reject(new Error('Owned fixture exited'))
      pending.clear()
    })
  })
  await ready
})
test.afterAll(async () => {
  if (child?.connected) {
    const exited = new Promise<void>((resolveExit) => child.once('exit', () => resolveExit()))
    await call('stop')
    await exited
    if (bindings) {
      const checks = await Promise.all(
        [bindings.apiPort, bindings.webPort, ...bindings.mongoPorts].map(
          (port) =>
            new Promise<{ port: number; closed: boolean }>((resolveCheck) => {
              const socket = createConnection({ host: '127.0.0.1', port })
              socket.once('connect', () => {
                socket.destroy()
                resolveCheck({ port, closed: false })
              })
              socket.once('error', () => {
                socket.destroy()
                resolveCheck({ port, closed: true })
              })
            }),
        ),
      )
      await writeFile(
        resolve(artifacts, 'teardown.json'),
        JSON.stringify({ bindings, exited: true, checks }, null, 2),
      )
      expect(checks.every((check) => check.closed)).toBe(true)
    }
  }
})
test.beforeEach(async ({ page }) => {
  observe(page)
  await page.goto(`${webURL}/admin`)
})
test.afterEach(async ({ page }, info) => {
  await screenshot(page, info.title.replace(/[^a-z0-9]+/giu, '-'))
  const evidence = observations.get(page)
  await writeFile(
    resolve(artifacts, `${info.title.replace(/[^a-z0-9]+/giu, '-')}.json`),
    JSON.stringify({ status: info.status, ...evidence }, null, 2),
  )
  expect(evidence?.pageErrors).toEqual([])
  expect(evidence?.resourceErrors).toEqual([])
  expect(
    evidence?.network.filter(
      (entry) =>
        entry.status >= 400 &&
        !(entry.path === '/api/admin/overview' && [401, 403].includes(entry.status)),
    ),
  ).toEqual([])
  // Expected anonymous/fresh-role HTTP denials are native authorization evidence, not JS errors.
  expect(
    evidence?.console.filter((message) => !message.includes('Failed to load resource')),
  ).toEqual([])
})

test('connected password admin reaches counts and deep links then loses permission and logs out', async ({
  page,
}) => {
  await page.getByLabel('Email', { exact: true }).fill(passwordAdmin.email)
  await page.getByLabel('Password', { exact: true }).fill(passwordAdmin.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await overview(page)
  expect(await identity(page)).toEqual({ id: passwordAdmin.id, role: 'ADMIN', verified: false })
  await page.locator('a[href="/admin/accounts?requestStatus=PENDING#merchant-requests"]').click()
  await expect(page.locator('#request-status')).toHaveValue('PENDING')
  await expect(page.locator('#merchant-requests')).toBeVisible()
  await page.goto(`${webURL}/admin`)
  await overview(page)
  await page.locator('a[href="/admin/ingestion?status=PENDING#queue-title"]').click()
  await expect(page.locator('#queue-status')).toHaveValue('PENDING')
  await expect(page.locator('#queue-title')).toBeVisible()
  await page.goto(`${webURL}/admin`)
  await overview(page)
  await screenshot(page, 'password-admin-settled')
  await permissionsAndLogout(page, passwordAdmin.id)
})

test('connected OTP preserves existing admin identity and records while revoking password and old sessions', async ({
  page,
}) => {
  await page.getByLabel('Email', { exact: true }).fill(otpAdmin.email)
  await page.getByTestId('otp-send').click()
  await expect(page.getByTestId('otp-form')).toBeVisible()
  const code = await call('otp', { email: otpAdmin.email })
  if (typeof code !== 'string')
    throw new Error('Controlled Resend did not return an in-memory code')
  await page.getByLabel('Sign-in code', { exact: true }).fill(code)
  await page.getByRole('button', { name: 'Sign in with code', exact: true }).click()
  await overview(page)
  expect(await identity(page)).toEqual({ id: otpAdmin.id, role: 'ADMIN', verified: true })
  expect(await call('otpPreserved')).toEqual({
    userPreserved: true,
    recordPreserved: true,
    oldCookieDenied: true,
    credentialRemoved: true,
    oldPasswordDenied: true,
  })
  await screenshot(page, 'otp-admin-settled')
  await page.getByTestId('admin-sign-out').click()
  await expect(page.getByRole('heading', { name: 'Sign in to view administration' })).toBeVisible()
  await page.getByTestId('recovery-open').click()
  await page.getByLabel('Email', { exact: true }).fill(otpAdmin.email)
  await page.getByRole('button', { name: 'Send recovery code', exact: true }).click()
  await expect(page.getByTestId('recovery-reset')).toBeVisible()
  const recoveryCode = await call('otp', { email: otpAdmin.email })
  if (typeof recoveryCode !== 'string')
    throw new Error('Controlled Resend captured no recovery code')
  const newPassword = randomBytes(24).toString('base64url')
  await page.getByLabel('Recovery code', { exact: true }).fill(recoveryCode)
  await page.getByLabel('New password (at least 8 characters)', { exact: true }).fill(newPassword)
  await page
    .getByTestId('recovery-reset')
    .getByRole('button', { name: 'Reset password', exact: true })
    .click()
  await expect(
    page.getByText('Password reset. Sign in again with your new password.', { exact: true }),
  ).toBeVisible()
  expect(await identity(page)).toBeNull()
  await page.getByLabel('Email', { exact: true }).fill(otpAdmin.email)
  await page.getByLabel('Password', { exact: true }).fill(newPassword)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await overview(page)
  expect(await identity(page)).toEqual({ id: otpAdmin.id, role: 'ADMIN', verified: true })
  await screenshot(page, 'otp-recovered-password-settled')
  await permissionsAndLogout(page, otpAdmin.id)
})

test('connected controlled Google native callback creates USER ignoring forged role then fresh ADMIN promotion', async ({
  page,
}) => {
  await page.route('https://accounts.google.com/**', async (route) => {
    expect(
      (await page.context().cookies()).some(
        (cookie) => cookie.name.includes('state') && cookie.httpOnly,
      ),
    ).toBe(true)
    const authorization = new URL(route.request().url())
    const callback = await call('googleGrant', {
      authorization: authorization.href,
      verified: true,
    })
    if (typeof callback !== 'string')
      throw new Error('Controlled authorization returned no native callback')
    // Only the external authorization navigation is controlled; browser receives the
    // original native state cookie and follows native callback + native session redirect.
    await route.fulfill({ status: 302, headers: { location: callback }, body: '' })
  })
  await page.getByTestId('google-sign-in').click()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'You do not have permission to view administration.' }),
  ).toBeVisible()
  const user = await identity(page)
  expect(user?.role).toBe('USER')
  expect(user?.verified).toBe(true)
  if (!user) throw new Error('Native Google callback did not produce an identity')
  expect(await call('googleCanonical', { userId: user.id })).toBe(true)
  await call('role', { userId: user.id, role: 'ADMIN' })
  await page.reload()
  await overview(page)
  expect((await identity(page))?.id === user.id).toBe(true)
  await screenshot(page, 'google-admin-settled')
  await permissionsAndLogout(page, user.id)
})

test('connected Google refuses an unverified provider profile without a native session', async ({
  page,
}) => {
  await page.route('https://accounts.google.com/**', async (route) => {
    const callback = await call('googleGrant', {
      authorization: route.request().url(),
      verified: false,
    })
    if (typeof callback !== 'string')
      throw new Error('Controlled Google returned no native callback')
    await route.fulfill({ status: 302, headers: { location: callback }, body: '' })
  })
  await page.getByTestId('google-sign-in').click()
  await expect(
    page.getByRole('alert').filter({ hasText: 'Google sign-in could not be completed.' }),
  ).toBeVisible()
  expect(await identity(page)).toBeNull()
  await expect(page.getByRole('heading', { name: 'Work awaiting review' })).toHaveCount(0)
  expect(await page.evaluate(async () => (await fetch('/api/admin/overview')).status)).toBe(401)
})

test('connected aged admin UI renews native session without replacing identity or owned records', async ({
  page,
}) => {
  // A separate native Google sign-in avoids exhausting the unchanged password
  // endpoint's per-IP budget after the preceding password/recovery proofs.
  await page.route('https://accounts.google.com/**', async (route) => {
    const callback = await call('googleGrant', {
      authorization: route.request().url(),
      verified: true,
    })
    if (typeof callback !== 'string') throw new Error('Controlled Google returned no callback')
    await route.fulfill({ status: 302, headers: { location: callback }, body: '' })
  })
  await page.getByTestId('google-sign-in').click()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'You do not have permission to view administration.' }),
  ).toBeVisible()
  const user = await identity(page)
  if (!user) throw new Error('Native Google sign-in did not produce an identity')
  await call('role', { userId: user.id, role: 'ADMIN' })
  await page.reload()
  await overview(page)
  type Expiry = {
    sessionId: string
    recordId: string
    userId: string
    expiresAt: number
    recordStatus?: string
  }
  const before = (await call('ageSession', { userId: user.id })) as Expiry
  const start = observations.get(page)?.network.length ?? 0
  // Original component mount, not a standalone atom or a manually posted renewal.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Work awaiting review' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Admin session' })).toHaveAttribute(
    'aria-busy',
    'false',
  )
  const after = (await call('sessionExpiry', { userId: user.id })) as Expiry
  const native =
    observations
      .get(page)
      ?.network.slice(start)
      .filter((entry) => entry.path === '/api/auth/get-session') ?? []
  await writeFile(
    resolve(artifacts, 'aged-session-renewal.json'),
    JSON.stringify({ before, after, native }, null, 2),
  )
  expect(native.some((entry) => entry.method === 'POST' && entry.status === 200)).toBe(true)
  expect(after.expiresAt).toBeGreaterThan(before.expiresAt)
  expect(after).toEqual({ ...before, expiresAt: after.expiresAt, recordStatus: 'PENDING' })
  expect(await identity(page)).toEqual({ id: user.id, role: 'ADMIN', verified: true })
  await permissionsAndLogout(page, user.id)
})
