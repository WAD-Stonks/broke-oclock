import {
  type IngestionDashboardResponse,
  type IngestionDraft,
  type IngestionOutletAssociationResponse,
  ingestionOutletAssociationRequestSchema,
  ingestionOutletAssociationResponseSchema,
} from '@broke-oclock/contracts/ingestion'
import type { PlatformVenue } from '@broke-oclock/contracts/platform-admin'
import { expect, type Page, type TestInfo, test } from '@playwright/test'

// SYNTHETIC network boundary only: real SPA, Axios and public contract parsing.
// Not live authentication, provider delivery, database authorization or publication proof.
const id = '111111111111111111111111'
const otherId = '222222222222222222222222'
const venue: PlatformVenue = {
  id: '333333333333333333333333',
  name: 'Synthetic active plaza outlet',
  address: '123 SYNTHETIC ROAD',
  merchantName: 'Synthetic merchant',
}
const secondVenue: PlatformVenue = {
  ...venue,
  id: '555555555555555555555555',
  name: 'Synthetic second active outlet',
}
const draft: IngestionDraft = {
  id,
  title: 'Synthetic imported outlet offer',
  description: '<script>unsafe()</script>',
  terms: 'Synthetic terms',
  category: 'FOOD',
  offerType: 'OTHER',
  validFrom: '2099-01-01T00:00:00Z',
  validUntil: '2099-12-01T00:00:00Z',
  rawValidityText: 'Synthetic source dates',
  applicability: 'NO_FIXED_LOCATION',
  merchantId: null,
  outlet: null,
  reviewStatus: 'PENDING',
  contentVersion: 7,
  sourceUrl: 'https://example.test/source/offer#exact-outlet',
  sourceName: 'Named synthetic source',
  reviewNote: null,
  reviewReady: true,
}
const associated: IngestionOutletAssociationResponse = {
  id,
  contentVersion: 8,
  reviewStatus: 'PENDING',
  applicability: 'SELECTED_OUTLETS',
  merchantId: '444444444444444444444444',
  outlet: venue,
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
async function boundary(page: Page) {
  const association = deferred()
  const fresh = deferred()
  const review = deferred()
  const calls: { method: string; path: string; query: Record<string, string>; body: unknown }[] = []
  const events: { event: string; version?: number; code?: string }[] = []
  const consoleMessages: { type: string; text: string }[] = []
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type()))
      consoleMessages.push({ type: message.type(), text: message.text() })
  })
  const state = {
    signedOut: false,
    denied: false,
    failure: '' as '' | 'CONFLICT' | 'FORBIDDEN',
    reads: 0,
    current: { ...draft },
    reviewed: false,
  }
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    const body: unknown = request.postDataJSON()
    calls.push({ method, path, query: Object.fromEntries(url.searchParams), body })
    const reply = (data: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    const fail = (code: string) => {
      events.push({ event: 'synthetic-error', code })
      return reply(
        { error: { code, message: 'Synthetic boundary failure' } },
        code === 'CONFLICT' ? 409 : 403,
      )
    }
    if (path === '/api/auth/get-session')
      return reply(
        state.signedOut
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
            },
      )
    if (path === '/api/auth/sign-out') {
      state.signedOut = true
      return reply({ success: true })
    }
    if (path === '/api/auth-methods')
      return reply({ password: true, google: false, emailOtp: false, passwordRecovery: false })
    if (path === '/api/ingestion/dashboard') {
      if (state.denied) return fail('FORBIDDEN')
      return reply({
        source: {
          name: draft.sourceName,
          enabled: false,
          reuseApproved: false,
          onemapConfigured: false,
        },
        counts: { pending: 2, approved: 0, rejected: 0, failed: 0 },
      } satisfies IngestionDashboardResponse)
    }
    if (path === '/api/ingestion/runs') return reply({ items: [] })
    if (path === '/api/ingestion/accounts') return reply({ items: [], nextCursor: null })
    if (path === '/api/ingestion/drafts' && method === 'GET') {
      state.reads++
      events.push({ event: 'draft-read-start', version: state.current.contentVersion })
      if (state.reads > 1) await fresh.promise
      if (state.denied) return fail('FORBIDDEN')
      const items = state.reviewed
        ? []
        : [state.current, { ...draft, id: otherId, title: 'Synthetic other draft' }]
      events.push({ event: 'draft-read-result', version: state.current.contentVersion })
      return reply({ items, nextCursor: null })
    }
    if (path === '/api/admin/venues')
      return reply({
        items: url.searchParams.has('cursor') ? [secondVenue] : [venue],
        nextCursor: url.searchParams.has('cursor') ? null : otherId,
      })
    if (path === `/api/ingestion/drafts/${id}/outlet` && method === 'PATCH') {
      ingestionOutletAssociationRequestSchema.parse(body)
      events.push({ event: 'association-start', version: 7 })
      await association.promise
      if (state.failure) {
        if (state.failure === 'FORBIDDEN') state.denied = true
        return fail(state.failure)
      }
      state.current = { ...draft, ...associated }
      events.push({ event: 'association-result', version: 8 })
      return reply(ingestionOutletAssociationResponseSchema.parse(associated))
    }
    if (path === `/api/ingestion/drafts/${id}/review` && method === 'POST') {
      events.push({ event: 'review-start', version: state.current.contentVersion })
      await review.promise
      state.reviewed = true
      events.push({ event: 'review-result', version: state.current.contentVersion })
      return reply({ id, reviewStatus: 'REJECTED' })
    }
    return reply({ error: { code: 'NOT_FOUND', message: 'Unmodelled synthetic route' } }, 404)
  })
  return { state, calls, events, consoleMessages, pageErrors, association, fresh, review }
}
type Boundary = Awaited<ReturnType<typeof boundary>>
const writes = (fixture: Boundary) =>
  fixture.calls.filter(
    (call) =>
      ['POST', 'PATCH', 'DELETE'].includes(call.method) && !call.path.startsWith('/api/auth/'),
  )
const consent = (page: Page) =>
  page.getByLabel(
    'I checked the original source and it supports this exact outlet for this draft version.',
  )
const reviewForm = (page: Page) =>
  page
    .getByRole('article')
    .locator('form')
    .filter({ has: page.locator('#review-note') })
async function open(page: Page) {
  await page.goto('/admin/ingestion')
  await expect(page).toHaveURL('/admin/ingestion')
  await expect(page).toHaveTitle("Broke O'Clock")
  await expect(page.getByRole('heading', { name: 'Ingestion admin', exact: true })).toBeVisible()
  const details = page.getByRole('button', { name: `View details: ${draft.title}`, exact: true })
  await details.focus()
  await details.press('Enter')
  await expect(page.getByRole('article')).toContainText(draft.description)
  await expect(page.getByRole('article').locator('script, img')).toHaveCount(0)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
  const source = page.getByRole('link', { name: 'Open original source' })
  await expect(source).toHaveAttribute('href', draft.sourceUrl)
  await expect(source).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(source).toHaveAttribute('target', '_blank')
}
async function choose(page: Page) {
  const query = page.getByLabel('Search existing outlets', { exact: true })
  await query.fill('  Synthetic  ')
  await query.press('Enter')
  const choice = page.getByLabel('Existing outlet', { exact: true })
  await expect(choice.locator('option')).toHaveCount(2)
  await expect(choice).toHaveValue('')
  await expect(consent(page)).toBeDisabled()
  await choice.focus()
  await expect(choice).toBeFocused()
  await choice.selectOption(venue.id)
  await expect(choice).toHaveValue(venue.id)
  await expect(page.getByRole('button', { name: 'Associate outlet', exact: true })).toBeDisabled()
  await consent(page).focus()
  await consent(page).press('Space')
  await expect(consent(page)).toBeChecked()
}
async function snapshot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().iterations))
        .map((animation) => animation.finished.catch(() => {})),
    )
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  )
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true })
}
async function receipt(info: TestInfo, fixture: Boundary) {
  await info.attach('synthetic-boundary-receipt', {
    contentType: 'application/json',
    body: JSON.stringify(
      {
        scope: 'Real SPA/Axios, SYNTHETIC network data only',
        calls: fixture.calls,
        events: fixture.events,
        consoleMessages: fixture.consoleMessages,
        pageErrors: fixture.pageErrors,
      },
      null,
      2,
    ),
  })
  expect(fixture.pageErrors).toEqual([])
  // Chromium reports expected HTTP failures as resource errors; retain them in the actual collector.
  const expectedStatuses = fixture.events
    .filter((event) => event.event === 'synthetic-error')
    .map((event) => (event.code === 'CONFLICT' ? '409' : '403'))
  expect(
    fixture.consoleMessages.filter(
      (message) =>
        !(
          message.type === 'error' &&
          message.text.startsWith(
            'Failed to load resource: the server responded with a status of',
          ) &&
          expectedStatuses.some((status) => message.text.includes(status))
        ),
    ),
  ).toEqual([])
}
for (const width of [320, 390, 1280]) {
  test(`SYNTHETIC boundary outlet association and fresh review at ${width}px`, async ({
    page,
  }, info) => {
    const fixture = await boundary(page)
    try {
      await page.setViewportSize({ width, height: 850 })
      await open(page)
      await page.getByLabel('Review note (required)').fill('Old version seven consent')
      await choose(page)
      await page.getByRole('button', { name: 'Load more outlets', exact: true }).click()
      await expect(
        page.getByLabel('Existing outlet', { exact: true }).locator('option'),
      ).toHaveCount(3)
      await expect(page.getByLabel('Existing outlet', { exact: true })).toHaveValue('')
      await expect(consent(page)).not.toBeChecked()
      expect(
        fixture.calls.filter((call) => call.path === '/api/admin/venues').map((call) => call.query),
      ).toEqual([
        { search: 'Synthetic', limit: '20' },
        { search: 'Synthetic', limit: '20', cursor: otherId },
      ])
      expect(writes(fixture)).toEqual([])
      await page.getByLabel('Existing outlet', { exact: true }).selectOption(venue.id)
      await expect(page.getByTestId('associate-outlet')).toBeDisabled()
      await consent(page).check()
      await snapshot(page, info, `picker-${width}-settled`)
      await page.getByTestId('associate-outlet').click()
      await expect(page.getByRole('button', { name: 'Associating…', exact: true })).toBeDisabled()
      await page.getByTestId('outlet-association').dispatchEvent('submit')
      await page.getByTestId('associate-outlet').dispatchEvent('click')
      await page
        .getByRole('button', { name: 'View details: Synthetic other draft', exact: true })
        .dispatchEvent('click')
      for (const control of [
        page.getByLabel('Existing outlet', { exact: true }),
        page.getByLabel('Search existing outlets', { exact: true }),
        page.getByLabel('Review status', { exact: true }),
        page.getByLabel('Review note (required)'),
        consent(page),
      ])
        await expect(control).toBeDisabled()
      await expect(page.getByRole('article')).toContainText(draft.title)
      expect(writes(fixture)).toEqual([
        {
          method: 'PATCH',
          path: `/api/ingestion/drafts/${id}/outlet`,
          query: {},
          body: { expectedContentVersion: 7, venueId: venue.id },
        },
      ])
      fixture.association.resolve()
      await expect
        .poll(() => fixture.events.filter((event) => event.event === 'draft-read-start').length)
        .toBe(2)
      expect(fixture.events.map((event) => event.event)).toEqual([
        'draft-read-start',
        'draft-read-result',
        'association-start',
        'association-result',
        'draft-read-start',
      ])
      await expect(page.getByLabel('Review note (required)')).toHaveValue('')
      await expect(page.getByTestId('reject-draft')).toBeDisabled()
      await reviewForm(page).dispatchEvent('submit')
      await page.getByTestId('reject-draft').dispatchEvent('click')
      expect(writes(fixture)).toHaveLength(1)
      fixture.fresh.resolve()
      await expect(page.getByRole('article')).toContainText('Version 8')
      await expect(page.getByRole('article')).toContainText('SELECTED_OUTLETS')
      await expect(page.getByRole('article')).toContainText(venue.address)
      expect(fixture.state.current).toEqual({ ...draft, ...associated })
      expect(fixture.state.current.reviewStatus).toBe('PENDING')
      await expect(page.getByRole('link', { name: 'Open original source' })).toHaveAttribute(
        'href',
        draft.sourceUrl,
      )
      await expect(page.getByLabel('Review note (required)')).toHaveValue('')
      await expect(page.getByLabel('Existing outlet', { exact: true })).toHaveValue('')
      await expect(consent(page)).not.toBeChecked()
      await expect(page.getByTestId('reject-draft')).toBeDisabled()
      await snapshot(page, info, `fresh-version-${width}-settled`)
      await page
        .getByLabel('Review note (required)')
        .fill('Read version eight and exact associated outlet')
      await page.getByTestId('reject-draft').focus()
      await page.getByTestId('reject-draft').press('Enter')
      await expect(page.getByRole('button', { name: 'Submitting…', exact: true })).toBeDisabled()
      await reviewForm(page).dispatchEvent('submit')
      await page.getByTestId('reject-draft').dispatchEvent('click')
      expect(writes(fixture)).toHaveLength(2)
      expect(writes(fixture)[1]).toEqual({
        method: 'POST',
        path: `/api/ingestion/drafts/${id}/review`,
        query: {},
        body: {
          expectedContentVersion: 8,
          decision: 'REJECT',
          note: 'Read version eight and exact associated outlet',
        },
      })
      expect(fixture.events).toContainEqual({ event: 'draft-read-result', version: 8 })
      expect(fixture.events.findIndex((event) => event.event === 'review-start')).toBeGreaterThan(
        fixture.events.findIndex(
          (event) => event.event === 'draft-read-result' && event.version === 8,
        ),
      )
      fixture.review.resolve()
      await expect(page.getByRole('status').filter({ hasText: 'Draft rejected.' })).toBeVisible()
    } finally {
      fixture.association.resolve()
      fixture.fresh.resolve()
      fixture.review.resolve()
      try {
        await receipt(info, fixture)
      } finally {
        await page.close()
      }
    }
  })
}
for (const outcome of ['CONFLICT', 'FORBIDDEN', 'LOGOUT'] as const) {
  test(`SYNTHETIC pending association ${outcome} cannot reuse protected consent`, async ({
    page,
  }, info) => {
    const fixture = await boundary(page)
    try {
      if (outcome !== 'LOGOUT') fixture.state.failure = outcome
      await open(page)
      await choose(page)
      await page.getByTestId('associate-outlet').click()
      await expect(page.getByRole('button', { name: 'Associating…', exact: true })).toBeDisabled()
      if (outcome === 'LOGOUT') {
        await page.getByTestId('admin-sign-out').click()
        await expect(
          page.getByRole('heading', { name: 'Sign in to review ingestion' }),
        ).toBeVisible()
      }
      fixture.association.resolve()
      if (outcome === 'CONFLICT') {
        await expect(
          page.getByRole('alert').filter({ hasText: 'Unable to confirm the association' }),
        ).toBeVisible()
        await page.getByTestId('outlet-association').dispatchEvent('submit')
        await reviewForm(page).dispatchEvent('submit')
        expect(writes(fixture)).toHaveLength(1)
        await page.getByRole('button', { name: 'Reload draft', exact: true }).click()
        await expect.poll(() => fixture.state.reads).toBe(2)
        fixture.fresh.resolve()
        await expect(page.getByRole('button', { name: 'Reload draft', exact: true })).toHaveCount(0)
        await expect(page.getByLabel('Existing outlet', { exact: true })).toHaveValue('')
        await expect(consent(page)).not.toBeChecked()
        await expect(page.getByLabel('Review note (required)')).toHaveValue('')
        await expect(page.getByTestId('associate-outlet')).toBeDisabled()
      } else {
        await expect
          .poll(() =>
            fixture.events.some(
              (event) =>
                event.event === (outcome === 'LOGOUT' ? 'association-result' : 'synthetic-error'),
            ),
          )
          .toBe(true)
        if (outcome === 'FORBIDDEN')
          await expect(page.getByRole('alert')).toContainText('You do not have permission')
        await expect(page.getByRole('article')).toHaveCount(0)
        await expect(page.getByRole('region', { name: 'Source readiness' })).toHaveCount(0)
        await expect(page.getByLabel('Review note (required)')).toHaveCount(0)
        expect(fixture.state.reads).toBe(1)
      }
      expect(writes(fixture)).toHaveLength(1)
    } finally {
      fixture.association.resolve()
      fixture.fresh.resolve()
      fixture.review.resolve()
      try {
        await receipt(info, fixture)
      } finally {
        await page.close()
      }
    }
  })
}
