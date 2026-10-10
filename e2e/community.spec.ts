import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseConfig } from '@api/config'
import type { PrismaClient } from '@broke-oclock/db'
import { expect, test } from '@playwright/test'
import { MongoMemoryReplSet } from 'mongodb-memory-server'

// Browser -> forwarded HTTP -> real Express/Better Auth -> disposable MongoDB.
// Forwarding substitutes the test API origin, never synthetic response bodies.
const root = fileURLToPath(new URL('../', import.meta.url))
const origin = 'http://127.0.0.1:5180'
const dealId = 'da0000000000000000000001'
const outletDealId = 'da0000000000000000000002'
let mongo: MongoMemoryReplSet | undefined
let server: Server | undefined
let db: PrismaClient | undefined
let apiURL = ''
const password = randomBytes(24).toString('hex')
const emails = [0, 1].map(() => `${randomUUID()}@example.test`)

test.beforeAll(async () => {
  test.setTimeout(180_000)
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger' },
  })
  const databaseURL = mongo.getUri(`community_browser_${randomUUID().replaceAll('-', '')}`)
  process.env.DATABASE_URL = databaseURL
  process.env.NODE_ENV = 'test'
  await promisify(execFile)('pnpm', ['--dir', 'packages/db', 'run', 'push'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseURL },
    timeout: 60_000,
  })
  db = (await import('@broke-oclock/db')).db
  const { createApp } = await import('@api/app')
  server = createServer()
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing API address')
  apiURL = `http://127.0.0.1:${address.port}`
  server.on(
    'request',
    createApp(
      parseConfig({
        DATABASE_URL: databaseURL,
        BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
        BETTER_AUTH_URL: apiURL,
        WEB_ORIGIN: origin,
      }),
    ),
  )
  for (const [index, email] of emails.entries()) {
    const result = await fetch(`${apiURL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Browser voter ${index + 1}`, email, password }),
    })
    expect(result.status).toBe(200)
    await result.json()
  }
  await db.deal.create({
    data: {
      id: dealId,
      title: 'Synthetic browser voting deal',
      description: 'Isolated browser test, not a real promotion.',
      category: 'food',
      offerType: 'OTHER',
      applicability: 'NO_FIXED_LOCATION',
      reviewStatus: 'APPROVED',
      reviewedVersion: 1,
      publishedAt: new Date(),
      validFrom: new Date(Date.now() - 60_000),
      validUntil: new Date(Date.now() + 600_000),
    },
  })
  const merchant = await db.merchant.create({ data: { name: 'Synthetic browser merchant' } })
  const database = db
  const venues = await Promise.all(
    [0, 1].map((index) =>
      database.venue.create({
        data: {
          merchantId: merchant.id,
          name: `Synthetic browser outlet ${index + 1}`,
          address: 'Synthetic test address',
          latitude: 1.3 + index * 0.001,
          longitude: 103.8 + index * 0.001,
        },
      }),
    ),
  )
  await db.deal.create({
    data: {
      id: outletDealId,
      title: 'Synthetic browser outlet deal',
      description: 'Isolated test fixture.',
      category: 'food',
      offerType: 'OTHER',
      applicability: 'SELECTED_OUTLETS',
      merchantId: merchant.id,
      reviewStatus: 'APPROVED',
      reviewedVersion: 1,
      publishedAt: new Date(),
      validFrom: new Date(Date.now() - 60_000),
      validUntil: new Date(Date.now() + 600_000),
    },
  })
  await db.dealVenue.createMany({
    data: venues.map((venue) => ({ dealId: outletDealId, venueId: venue.id })),
  })
})

test.afterAll(async () => {
  if (server) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server?.close(() => resolve()))
  }
  await db?.$disconnect()
  await mongo?.stop()
})

test('two users change persisted votes and reload through real auth/API/database', async ({
  page,
}) => {
  await page.route('**/api/**', async (route) => {
    const original = new URL(route.request().url())
    const response = await route.fetch({
      url: `${apiURL}${original.pathname}${original.search}`,
      headers: { ...route.request().headers(), origin },
    })
    await route.fulfill({ response })
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 850 })
  await page.goto('/community-demo')
  await expect(page.getByRole('heading', { name: 'Synthetic browser voting deal' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Still available', exact: true })).toBeDisabled()
  await page.getByLabel('Email', { exact: true }).fill(emails[0])
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Signed in as')).toContainText('Browser voter 1')
  await page.getByRole('button', { name: 'Still available', exact: true }).click()
  await expect(page.getByText('Your vote:', { exact: false })).toHaveText(
    'Your vote: Still available',
  )
  await page.reload()
  await expect(page.getByText('Your vote:', { exact: false })).toHaveText(
    'Your vote: Still available',
  )
  await page.getByRole('button', { name: 'Ended / unavailable', exact: true }).click()
  await expect(page.getByText('Your vote:', { exact: false })).toHaveText(
    'Your vote: Ended / unavailable',
  )
  await page.getByLabel('Add a comment').fill('Synthetic browser comment')
  await page.getByRole('button', { name: 'Post comment' }).click()
  await expect(page.getByText('Synthetic browser comment')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Synthetic browser comment')).toBeVisible()
  await page.getByRole('button', { name: 'Report', exact: true }).click()
  const commentReport = page.getByRole('form', { name: 'Report comment' })
  await commentReport.getByLabel('Reason').selectOption('SPAM')
  await commentReport.getByRole('button', { name: 'Send report' }).click()
  await expect(commentReport.getByText('Report sent for review.')).toBeVisible()
  expect(await db?.commentReport.count()).toBe(1)
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByText('Synthetic browser comment')).toHaveCount(0)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Still available', exact: true })).toBeDisabled()
  await page.getByLabel('Email', { exact: true }).fill(emails[1])
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Signed in as')).toContainText('Browser voter 2')
  await expect(page.getByText('Your vote:', { exact: false })).toHaveText('Your vote: Not voted')
  await page.getByRole('button', { name: 'Still available', exact: true }).click()
  await page.reload()
  await expect(page.getByText('Your vote:', { exact: false })).toHaveText(
    'Your vote: Still available',
  )
  const votes = await db?.dealVote.findMany({ where: { dealId }, select: { value: true } })
  expect(votes?.map((vote) => vote.value).sort()).toEqual(['ALIVE', 'DEAD'])
  await page.getByRole('button', { name: 'Load synthetic two-outlet deal' }).click()
  await expect(page.getByRole('heading', { name: 'Synthetic browser outlet deal' })).toBeVisible()
  await page.getByLabel('Choose an outlet').selectOption({ label: 'Synthetic browser outlet 1' })
  await page.getByRole('button', { name: 'Available here', exact: true }).click()
  await expect(
    page.getByText('Community status: unverified. Still available: 1. Unavailable: 0.'),
  ).toBeVisible()
  expect(await db?.outletEvidence.count({ where: { dealId: outletDealId } })).toBe(1)
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 850 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  }
  expect(errors).toEqual([])
})
