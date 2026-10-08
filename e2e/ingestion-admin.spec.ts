import type {
  IngestionDashboardResponse,
  IngestionDraft,
  IngestionDraftsResponse,
  IngestionRunsResponse,
} from '@broke-oclock/contracts/ingestion'
import { expect, type Page, test } from '@playwright/test'

// Explicitly synthetic browser-boundary responses. These exercise the real SPA/Axios REST client,
// not live ingestion, provider delivery, database policies, or real account authentication.
const installSyntheticBoundary = async (page: Page) => {
  const state: {
    access: 'UNAUTHORIZED' | 'FORBIDDEN' | ''
    dashboard: IngestionDashboardResponse
    drafts: IngestionDraft[]
    draftNextCursor: string | null
    draftPages: Map<string, IngestionDraftsResponse>
    requests: { path: string; input: unknown; method: string }[]
    failures: Map<string, string>
    runGate: Promise<void> | undefined
    accountsForbidden: boolean
  } = {
    access: '',
    dashboard: {
      source: {
        name: 'Synthetic source fixture',
        enabled: false,
        reuseApproved: false,
        onemapConfigured: true,
      },
      counts: { pending: 1, approved: 0, rejected: 0, failed: 0 },
    },
    drafts: [
      {
        id: '111111111111111111111111',
        title: '<img src=x onerror=alert(1)> Synthetic draft',
        description: '<script>unsafe()</script>',
        terms: 'Synthetic fixture terms',
        category: 'Food',
        offerType: 'OTHER',
        validFrom: null,
        validUntil: null,
        rawValidityText: 'While stocks last',
        applicability: 'NO_FIXED_LOCATION',
        reviewStatus: 'PENDING',
        contentVersion: 7,
        sourceUrl: 'https://example.test/source/1',
        sourceName: 'Synthetic source fixture',
        reviewNote: null,
        reviewReady: true,
      },
    ],
    draftNextCursor: null,
    draftPages: new Map(),
    requests: [],
    failures: new Map<string, string>(),
    runGate: undefined,
    accountsForbidden: false,
  }
  await page.route('**/api/ingestion/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname
    const method = request.method()
    const query: Record<string, unknown> = Object.fromEntries(url.searchParams.entries())
    if (query.limit) query.limit = Number(query.limit)
    const body: Record<string, unknown> = request.postDataJSON?.() ?? {}
    let path: string
    let input: Record<string, unknown>
    let dealId: string | undefined
    if (pathname === '/api/ingestion/dashboard' && method === 'GET') {
      path = 'ingestion.dashboard'
      input = {}
    } else if (pathname === '/api/ingestion/runs' && method === 'GET') {
      path = 'ingestion.runs'
      input = query
    } else if (pathname === '/api/ingestion/runs' && method === 'POST') {
      path = 'ingestion.run'
      input = {}
    } else if (pathname === '/api/ingestion/drafts' && method === 'GET') {
      path = 'ingestion.queue'
      input = query
    } else if (
      pathname.startsWith('/api/ingestion/drafts/') &&
      pathname.endsWith('/review') &&
      method === 'POST'
    ) {
      dealId = pathname.split('/')[4]
      path = 'ingestion.review'
      input = { dealId, ...body }
    } else if (pathname === '/api/ingestion/locations' && method === 'GET') {
      path = 'ingestion.searchLocations'
      input = query
    } else if (pathname === '/api/ingestion/accounts' && method === 'GET') {
      path = 'ingestion.accounts'
      input = query
    } else {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }),
      })
      return
    }
    state.requests.push({ path, input, method })
    const fail = state.failures.get(path)
    if (fail) state.failures.delete(path)
    const denied =
      state.access || (path === 'ingestion.accounts' && state.accountsForbidden ? 'FORBIDDEN' : '')
    const code = fail || denied
    if (code) {
      const status =
        code === 'UNAUTHORIZED' ? 401 : code === 'FORBIDDEN' ? 403 : code === 'CONFLICT' ? 409 : 500
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code, message: 'Synthetic boundary failure' } }),
      })
      return
    }
    let data: unknown
    switch (path) {
      case 'ingestion.dashboard':
        data = state.dashboard
        break
      case 'ingestion.runs':
        data = { items: [] } satisfies IngestionRunsResponse
        break
      case 'ingestion.queue': {
        const status = typeof input.status === 'string' ? input.status : 'PENDING'
        const cursor = typeof input.cursor === 'string' ? input.cursor : undefined
        data = (cursor ? state.draftPages.get(cursor) : undefined) ?? {
          items: state.drafts.filter((draft) => draft.reviewStatus === status),
          nextCursor: state.draftNextCursor,
        }
        break
      }
      case 'ingestion.review': {
        expect(method).toBe('POST')
        const decision = input.decision
        const reviewStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'
        state.drafts = state.drafts.map((draft) => ({ ...draft, reviewStatus }))
        state.dashboard.counts.pending = 0
        state.dashboard.counts[reviewStatus === 'APPROVED' ? 'approved' : 'rejected'] = 1
        data = { id: dealId, reviewStatus }
        break
      }
      case 'ingestion.run':
        expect(method).toBe('POST')
        if (state.runGate) await state.runGate
        data = {
          runId: 'synthetic-run',
          status: 'COMPLETED',
          fetchedCount: 1,
          createdCount: 1,
          updatedCount: 0,
          failedCount: 0,
        }
        break
      case 'ingestion.searchLocations':
        data = {
          items: [
            {
              searchValue: 'Synthetic plaza',
              address: '123 FIXTURE ROAD',
              postalCode: '123456',
              latitude: 1.3,
              longitude: 103.8,
            },
          ],
        }
        break
      case 'ingestion.accounts':
        data = {
          items: [
            {
              id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
              name: 'Synthetic Admin',
              email: 'synthetic@example.test',
              role: 'ADMIN',
              createdAt: '2026-01-01T00:00:00Z',
            },
          ],
          nextCursor: null,
        }
        break
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
    })
  })
  return state
}

test('admin navigation reaches anonymous sign-in rather than fabricated data', async ({ page }) => {
  const fixture = await installSyntheticBoundary(page)
  fixture.access = 'UNAUTHORIZED'
  await page.goto('/')
  await page.getByRole('link', { name: 'Ingestion admin', exact: true }).click()
  await expect(page).toHaveURL('/admin/ingestion')
  await expect(page.getByRole('heading', { name: 'Sign in to review ingestion' })).toBeVisible()
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Source readiness' })).toHaveCount(0)
})

test('forbidden and recoverable API errors are visibly distinct', async ({ page }) => {
  const fixture = await installSyntheticBoundary(page)
  fixture.access = 'FORBIDDEN'
  await page.goto('/admin/ingestion')
  await expect(page.getByRole('alert')).toContainText('You do not have permission')
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0)
  fixture.access = ''
  fixture.failures.set('ingestion.dashboard', 'INTERNAL_SERVER_ERROR')
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Unable to load ingestion')
  await page.getByRole('button', { name: 'Retry dashboard' }).click()
  await expect(page.getByRole('heading', { name: 'Source readiness' })).toBeVisible()
})

for (const width of [320, 390, 1280]) {
  test(`synthetic-boundary review journey fits ${width}px and escapes imported content`, async ({
    page,
  }, info) => {
    const fixture = await installSyntheticBoundary(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/admin/ingestion')
    await expect(page.getByRole('button', { name: 'Run ingestion', exact: true })).toBeDisabled()
    await expect(page.getByText('Ingestion is disabled', { exact: true })).toBeVisible()
    await expect(page.getByText('Content reuse is not approved', { exact: true })).toBeVisible()
    const details = page.getByRole('button', { name: /View details:/ })
    await details.focus()
    await details.press('Enter')
    const article = page.getByRole('article')
    await expect(article).toContainText('<script>unsafe()</script>')
    await expect(article.locator('script, img')).toHaveCount(0)
    const source = page.getByRole('link', { name: 'Open original source' })
    await expect(source).toHaveAttribute('href', 'https://example.test/source/1')
    await expect(source).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(source).toHaveAttribute('target', '_blank')
    await expect(page.getByRole('button', { name: 'Reject draft' })).toBeDisabled()
    await page
      .getByLabel('Review note (required)')
      .fill('Cannot establish dates from this synthetic fixture')
    await expect(page.getByRole('button', { name: 'Approve draft' })).toBeDisabled()
    await expect(page.getByText(/Approval requires known validity dates/)).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    ).toBe(false)
    await page.screenshot({ path: info.outputPath(`ingestion-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Reject draft' }).focus()
    await page.getByRole('button', { name: 'Reject draft' }).press('Enter')
    await expect(page.getByRole('status').filter({ hasText: 'Draft rejected' })).toBeVisible()
    await expect(page.getByText('No drafts match this status.')).toBeVisible()
    expect(fixture.requests.filter((request) => request.path === 'ingestion.review')).toEqual([
      {
        path: 'ingestion.review',
        method: 'POST',
        input: {
          dealId: '111111111111111111111111',
          expectedContentVersion: 7,
          decision: 'REJECT',
          note: 'Cannot establish dates from this synthetic fixture',
        },
      },
    ])
    await page.getByLabel('Review status', { exact: true }).selectOption('REJECTED')
    await expect(page.getByRole('button', { name: /View details:/ })).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('run trigger prevents duplicates and refreshes reads after the synthetic result', async ({
  page,
}) => {
  const fixture = await installSyntheticBoundary(page)
  fixture.dashboard.source.enabled = true
  fixture.dashboard.source.reuseApproved = true
  let release: (() => void) | undefined
  fixture.runGate = new Promise((resolve) => {
    release = resolve
  })
  await page.goto('/admin/ingestion')
  await page.getByRole('button', { name: 'Run ingestion', exact: true }).click()
  const running = page.getByRole('button', { name: 'Running ingestion…', exact: true })
  await expect(running).toBeDisabled()
  await running.dispatchEvent('click')
  await expect
    .poll(() => fixture.requests.filter((request) => request.path === 'ingestion.run').length)
    .toBe(1)
  release?.()
  await expect(
    page.getByRole('status').filter({ hasText: 'Run synthetic-run: COMPLETED' }),
  ).toBeVisible()
  await expect
    .poll(() => fixture.requests.filter((request) => request.path === 'ingestion.dashboard').length)
    .toBe(2)
  await expect
    .poll(() => fixture.requests.filter((request) => request.path === 'ingestion.runs').length)
    .toBe(2)
  await expect
    .poll(() => fixture.requests.filter((request) => request.path === 'ingestion.queue').length)
    .toBe(2)
})

test('review API error preserves note and permits a subsequent dated approval', async ({
  page,
}) => {
  const fixture = await installSyntheticBoundary(page)
  fixture.drafts = fixture.drafts.map((draft) => ({
    ...draft,
    validFrom: '2099-01-01T00:00:00Z',
    validUntil: '2099-12-01T00:00:00Z',
  }))
  fixture.failures.set('ingestion.review', 'INTERNAL_SERVER_ERROR')
  await page.goto('/admin/ingestion')
  await page.getByRole('button', { name: /View details:/ }).click()
  await page.getByLabel('Review note (required)').fill('Reviewed synthetic dated offer')
  await page.getByRole('button', { name: 'Approve draft', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Unable to review draft')
  await expect(page.getByLabel('Review note (required)')).toHaveValue(
    'Reviewed synthetic dated offer',
  )
  await page.getByRole('button', { name: 'Approve draft', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Draft approved' })).toBeVisible()
  expect(fixture.requests.filter((request) => request.path === 'ingestion.review')).toHaveLength(2)
})

test('pagination preserves stale-review conflict until reloading the current draft version', async ({
  page,
}) => {
  const fixture = await installSyntheticBoundary(page)
  fixture.drafts = fixture.drafts.map((draft) => ({
    ...draft,
    validFrom: '2099-01-01T00:00:00Z',
    validUntil: '2099-12-01T00:00:00Z',
  }))
  fixture.draftNextCursor = '222222222222222222222222'
  fixture.draftPages.set(fixture.draftNextCursor, {
    items: fixture.drafts.map((draft) => ({
      ...draft,
      id: '222222222222222222222222',
      title: 'Second synthetic draft',
    })),
    nextCursor: null,
  })
  fixture.failures.set('ingestion.review', 'CONFLICT')
  await page.goto('/admin/ingestion')
  await page.getByRole('button', { name: /View details:/ }).click()
  const note = page.getByLabel('Review note (required)')
  const approve = page.getByRole('button', { name: 'Approve draft', exact: true })
  const reject = page.getByRole('button', { name: 'Reject draft', exact: true })
  await note.fill('Review of version seven')
  await approve.click()
  await expect(page.getByRole('alert')).toContainText(
    'Content changed. Reload the draft before reviewing again.',
  )
  await page.getByRole('button', { name: 'Load more drafts' }).click()
  await expect(page.getByRole('heading', { name: 'Second synthetic draft' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText(
    'Content changed. Reload the draft before reviewing again.',
  )
  await expect(note).toHaveValue('Review of version seven')
  await expect(approve).toBeDisabled()
  await expect(reject).toBeDisabled()
  await page.getByRole('button', { name: 'View details: Second synthetic draft' }).click()
  await note.fill('Review of other cached draft')
  await expect(approve).toBeEnabled()
  await page.getByTestId('view-111111111111111111111111').click()
  await note.fill('Another stale review')
  await expect(page.getByRole('alert')).toContainText(
    'Content changed. Reload the draft before reviewing again.',
  )
  await expect(approve).toBeDisabled()
  await expect(reject).toBeDisabled()
  await page.getByRole('article').locator('form').dispatchEvent('submit')
  await reject.dispatchEvent('click')
  expect(fixture.requests.filter((request) => request.path === 'ingestion.review')).toHaveLength(1)

  fixture.drafts = fixture.drafts.map((draft) => ({
    ...draft,
    contentVersion: 8,
    description: 'Current synthetic content',
  }))
  fixture.draftNextCursor = null
  await page.getByRole('button', { name: 'Reload draft' }).click()
  await expect(page.getByRole('article')).toContainText('Current synthetic content')
  await expect(page.getByRole('button', { name: 'Reload draft' })).toHaveCount(0)
  await expect(note).toHaveValue('')
  await expect(approve).toBeDisabled()
  await expect(reject).toBeDisabled()
  await note.fill('Review of current version eight')
  await expect(approve).toBeEnabled()
  await expect(reject).toBeEnabled()
  await approve.click()
  await expect(page.getByRole('status').filter({ hasText: 'Draft approved' })).toBeVisible()
  expect(
    fixture.requests
      .filter((request) => request.path === 'ingestion.review')
      .map((request) => request.input),
  ).toEqual([
    {
      dealId: '111111111111111111111111',
      expectedContentVersion: 7,
      decision: 'APPROVE',
      note: 'Review of version seven',
    },
    {
      dealId: '111111111111111111111111',
      expectedContentVersion: 8,
      decision: 'APPROVE',
      note: 'Review of current version eight',
    },
  ])
})

test('reload drops a superseded second-page draft and requires selection of its different-ID replacement', async ({
  page,
}) => {
  const fixture = await installSyntheticBoundary(page)
  const source = fixture.drafts[0]
  if (!source) throw new Error('Missing synthetic draft fixture')
  const old = {
    ...source,
    validFrom: '2099-01-01T00:00:00Z',
    validUntil: '2099-12-01T00:00:00Z',
  }
  const other = { ...old, id: '222222222222222222222222', title: 'First-page draft' }
  const replacement = {
    ...old,
    id: '333333333333333333333333',
    title: 'Replacement draft',
    description: 'Revised source evidence',
    contentVersion: 8,
  }
  fixture.drafts = [other]
  fixture.draftNextCursor = other.id
  fixture.draftPages.set(other.id, { items: [old], nextCursor: null })
  fixture.failures.set('ingestion.review', 'CONFLICT')
  await page.goto('/admin/ingestion')
  await page.getByRole('button', { name: 'Load more drafts' }).click()
  await page.getByTestId(`view-${old.id}`).click()
  await page.getByLabel('Review note (required)').fill('Review of old source revision')
  await page.getByRole('button', { name: 'Approve draft', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Content changed.')
  fixture.drafts = [
    other,
    {
      ...old,
      contentVersion: 8,
      reviewStatus: 'REJECTED',
      reviewNote: 'Superseded by source revision',
    },
  ]
  fixture.draftPages.set(other.id, { items: [replacement], nextCursor: null })
  await page.getByRole('button', { name: 'Reload draft' }).click()
  await expect(page.getByTestId(`view-${old.id}`)).toHaveCount(0)
  await expect(page.getByRole('article')).toHaveCount(0)
  await page.getByRole('button', { name: 'Load more drafts' }).click()
  await expect(page.getByTestId(`view-${replacement.id}`)).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(0)
  expect(fixture.requests.filter((request) => request.path === 'ingestion.review')).toHaveLength(1)
  await page.getByTestId(`view-${replacement.id}`).click()
  const note = page.getByLabel('Review note (required)')
  const approve = page.getByRole('button', { name: 'Approve draft', exact: true })
  const reject = page.getByRole('button', { name: 'Reject draft', exact: true })
  await expect(page.getByRole('article')).toContainText('Revised source evidence')
  await expect(note).toHaveValue('')
  await expect(approve).toBeDisabled()
  await expect(reject).toBeDisabled()
  await page.getByRole('article').locator('form').dispatchEvent('submit')
  await reject.dispatchEvent('click')
  expect(fixture.requests.filter((request) => request.path === 'ingestion.review')).toHaveLength(1)
  await note.fill('Review of replacement source evidence')
  await approve.click()
  await expect(page.getByRole('status').filter({ hasText: 'Draft approved' })).toBeVisible()
  expect(
    fixture.requests
      .filter((request) => request.path === 'ingestion.review')
      .map((request) => request.input),
  ).toEqual([
    {
      dealId: old.id,
      expectedContentVersion: 7,
      decision: 'APPROVE',
      note: 'Review of old source revision',
    },
    {
      dealId: replacement.id,
      expectedContentVersion: 8,
      decision: 'APPROVE',
      note: 'Review of replacement source evidence',
    },
  ])
})

test('OneMap candidates and administrator accounts stay read-only', async ({ page }) => {
  const fixture = await installSyntheticBoundary(page)
  await page.goto('/admin/ingestion')
  await page.getByLabel('Address, building or postal code').fill('fixture plaza')
  await page.getByLabel('Address, building or postal code').press('Enter')
  await expect(page.getByText('123 FIXTURE ROAD', { exact: false })).toBeVisible()
  await expect(page.getByText('Coordinates: 1.3, 103.8')).toBeVisible()
  await expect(page.getByText(/Candidates are not verified merchants or outlets/)).toBeVisible()
  await expect(page.getByText('Data source: OneMap', { exact: false })).toBeVisible()
  const licence = page.getByRole('link', { name: 'Singapore Open Data Licence' })
  await expect(licence).toBeVisible()
  await expect(licence).toHaveAttribute(
    'href',
    'https://www.onemap.gov.sg/legal/opendatalicence.html',
  )
  expect(
    fixture.requests.find((request) => request.path === 'ingestion.searchLocations')?.input,
  ).toEqual({ query: 'fixture plaza' })
  await page.getByRole('button', { name: 'View accounts (read-only)' }).click()
  const accounts = page.getByRole('region', { name: 'Accounts', exact: true })
  await expect(accounts).toContainText('synthetic@example.test')
  await expect(accounts.locator('input, select')).toHaveCount(0)
  await expect(accounts.getByRole('button', { name: /delete|change role/i })).toHaveCount(0)
  fixture.accountsForbidden = true
  await page.getByRole('button', { name: 'Refresh accounts' }).click()
  await expect(accounts.getByRole('alert')).toContainText(
    'Accounts are restricted to administrators',
  )
  await expect(accounts).not.toContainText('synthetic@example.test')
  await expect(page.getByRole('heading', { name: 'Draft review queue' })).toBeVisible()
})

test('shared sign-in UI rechecks server access after a synthetic auth response', async ({
  page,
}) => {
  const fixture = await installSyntheticBoundary(page)
  fixture.access = 'UNAUTHORIZED'
  let signIns = 0
  await page.route('**/api/auth/sign-in/email', async (route) => {
    signIns += 1
    expect(route.request().method()).toBe('POST')
    fixture.access = ''
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'synthetic-admin',
          name: 'Synthetic Admin',
          email: 'synthetic@example.test',
          emailVerified: false,
          role: 'ADMIN',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      }),
    })
  })
  await page.goto('/admin/ingestion')
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.test')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-not-a-real-password')
  await page.getByLabel('Password', { exact: true }).press('Enter')
  await expect(page.getByRole('heading', { name: 'Source readiness' })).toBeVisible()
  expect(signIns).toBe(1)
  expect(fixture.requests.filter((request) => request.path === 'ingestion.dashboard')).toHaveLength(
    2,
  )
  expect(
    await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } })),
  ).toEqual({ local: {}, session: {} })
})
