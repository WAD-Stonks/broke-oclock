import type { AdminOverviewResponse } from '@broke-oclock/contracts/platform-admin'
import { expect, type Page, test } from '@playwright/test'

// Explicitly synthetic native/REST boundaries. Real SPA/transport/layout only,
// not live authentication, provider delivery, database authorization or acceptance.
const overview: AdminOverviewResponse = {
  generatedAt: '2026-10-10T00:00:00.000Z',
  counts: { pendingMerchantRequests: 2, pendingImportedDrafts: 4, failedImportedPosts: 3 },
  recentRuns: [],
  readiness: {
    googleConfigured: false,
    emailConfigured: false,
    oneMapConfigured: true,
    ingestionOptIn: false,
    reuseAttested: false,
    sourceRecordEnabled: false,
    sourceIdentityValid: true,
    importAllowed: false,
    liveProviderAcceptance: 'NOT_ESTABLISHED',
  },
}
async function boundary(page: Page) {
  const reads: string[] = []
  let signedOut = false
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    reads.push(url.pathname + url.search)
    let body: unknown
    if (url.pathname === '/api/auth/get-session')
      body = signedOut
        ? null
        : {
            user: {
              id: 'synthetic-admin',
              name: 'Synthetic operator',
              email: 'operator@example.test',
              role: 'USER',
            },
            session: {
              id: 'synthetic-session',
              userId: 'synthetic-admin',
              expiresAt: '2099-01-01T00:00:00.000Z',
            },
          }
    else if (url.pathname === '/api/auth/sign-out') {
      signedOut = true
      body = { success: true }
    } else if (url.pathname === '/api/auth-methods')
      body = { password: true, google: false, emailOtp: false, passwordRecovery: false }
    else if (url.pathname === '/api/admin/overview') body = overview
    else if (url.pathname === '/api/ingestion/dashboard')
      body = {
        source: {
          name: 'Synthetic source',
          enabled: false,
          reuseApproved: false,
          onemapConfigured: false,
        },
        counts: { pending: 4, approved: 0, rejected: 0, failed: 3 },
      }
    else if (url.pathname === '/api/ingestion/runs') body = { items: [] }
    else if (
      [
        '/api/admin/accounts',
        '/api/admin/merchant-requests',
        '/api/admin/audit',
        '/api/ingestion/drafts',
      ].includes(url.pathname)
    )
      body = { items: [], nextCursor: null }
    else throw new Error(`Unexpected synthetic boundary: ${url.pathname}`)
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
  return reads
}
for (const width of [320, 390, 1280]) {
  test(`synthetic admin overview and actionable deep links fit ${width}px`, async ({ page }) => {
    const reads = await boundary(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Admin overview', exact: true })).toBeVisible()
    await expect(page.getByText('Live provider acceptance', { exact: true })).toBeVisible()
    await expect(page.getByText('NOT_ESTABLISHED', { exact: true })).toBeVisible()
    const requestLink = page.locator(
      'a[href="/admin/accounts?requestStatus=PENDING#merchant-requests"]',
    )
    await expect(requestLink).toContainText('2')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await requestLink.focus()
    await requestLink.press('Enter')
    await expect(page).toHaveURL('/admin/accounts?requestStatus=PENDING#merchant-requests')
    await expect(page.locator('#request-status')).toHaveValue('PENDING')
    await expect(page.locator('#merchant-requests')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    expect(
      reads.some(
        (url) => url.startsWith('/api/admin/merchant-requests?') && url.includes('status=PENDING'),
      ),
    ).toBe(true)
    await page.goto('/admin')
    await page.locator('a[href="/admin/ingestion?status=PENDING#queue-title"]').click()
    await expect(page.locator('#queue-status')).toHaveValue('PENDING')
    await expect(page.locator('#queue-title')).toBeVisible()
    await page.goto('/admin')
    await page.locator('a[href="/admin/ingestion#runs-title"]').click()
    await expect(page.locator('#runs-title')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    expect(errors).toEqual([])
  })
}
test('synthetic native logout removes operational evidence before sign-in', async ({ page }) => {
  await boundary(page)
  await page.goto('/admin')
  await expect(
    page.locator('a[href="/admin/accounts?requestStatus=PENDING#merchant-requests"]'),
  ).toBeVisible()
  await page.getByTestId('admin-sign-out').click()
  await expect(page.getByRole('heading', { name: 'Sign in to view administration' })).toBeVisible()
  await expect(
    page.locator('a[href="/admin/accounts?requestStatus=PENDING#merchant-requests"]'),
  ).toHaveCount(0)
})
