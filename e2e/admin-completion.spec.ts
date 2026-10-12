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

for (const width of [320, 768, 1024, 1440]) {
  test(`synthetic restrained admin navigation and sign-in fit ${width}px`, async ({
    page,
  }, info) => {
    await boundary(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/admin', '/admin/accounts', '/admin/ingestion']) {
      await page.goto(path)
      const nav = page.getByRole('navigation', { name: 'Administration', exact: true })
      const active = nav.locator('[aria-current="page"]')
      await expect(active).toHaveCount(1)
      await expect(active).toHaveAttribute('href', path)
      await expect(nav.locator('a')).toHaveText(['Overview', 'Accounts', 'Ingestion'])
      await expect(page.locator('.site-header')).toHaveCSS('position', 'relative')
      await expect(page.locator('.admin-content .card').first()).toBeVisible()
      const styles = await page.evaluate(() => {
        const heading = document.querySelector('.admin-shell h1')
        const activeLink = document.querySelector('.admin-navigation [aria-current="page"]')
        const card = document.querySelector('.admin-content .card')
        if (!heading || !activeLink || !card) throw new Error('Admin surfaces missing')
        return {
          font: getComputedStyle(heading).fontFamily,
          accent: getComputedStyle(activeLink).borderBottomColor,
          navFill: getComputedStyle(activeLink).backgroundColor,
          navWeight: getComputedStyle(activeLink).fontWeight,
          navRows: new Set(
            [...document.querySelectorAll('.admin-navigation a')].map(
              (link) => link.getBoundingClientRect().top,
            ),
          ).size,
          surface: getComputedStyle(card).backgroundColor,
          canvas: getComputedStyle(document.querySelector('.site-layout') ?? document.body)
            .backgroundColor,
          radius: getComputedStyle(card).borderRadius,
          fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          viewport: innerWidth,
        }
      })
      expect(styles).toEqual({
        font: expect.stringContaining('-apple-system'),
        accent: 'rgb(233, 198, 42)',
        navFill: 'rgba(0, 0, 0, 0)',
        navWeight: '700',
        navRows: 1,
        surface: 'rgb(255, 255, 255)',
        canvas: 'rgb(243, 242, 239)',
        radius: '16px',
        fits: true,
        viewport: width,
      })
      await page.screenshot({
        path: info.outputPath(`${path.split('/').at(-1)}-${width}.png`),
        fullPage: true,
      })
    }
    await page.getByTestId('admin-sign-out').click()
    const signIn = page.getByRole('region', { name: 'Sign in to review ingestion' })
    await expect(signIn).toBeVisible()
    await expect(page.getByTestId('admin-sign-out')).toHaveCount(0)
    const submit = signIn.getByRole('button', { name: 'Sign in', exact: true })
    await expect(submit).toHaveCSS('background-color', 'rgb(246, 214, 75)')
    await expect(submit).toHaveCSS('color', 'rgb(27, 27, 31)')
    await page.getByLabel('Email', { exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Password', { exact: true })).toBeFocused()
    await expect(page.getByLabel('Password', { exact: true })).toHaveCSS('outline-style', 'solid')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true)
    await page.screenshot({ path: info.outputPath(`sign-in-${width}.png`), fullPage: true })
    expect(errors).toEqual([])
  })
}
