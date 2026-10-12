import type {
  MerchantRequest,
  MerchantRequestsQuery,
  PlatformAccountResponse,
  PlatformAccountSummary,
  PlatformAccountsQuery,
  PlatformAuditEntry,
  PlatformRole,
  PlatformVenue,
} from '@broke-oclock/contracts/platform-admin'
import { expect, type Page, test } from '@playwright/test'

type RestPage<T> = { items: T[]; nextCursor: string | null }
const date = '2026-01-01T00:00:00Z'
const userA = '777777777777777777777777'
const userB = '888888888888888888888888'
const stallA = '111111111111111111111111'
const stallB = '222222222222222222222222'
const requestA = '333333333333333333333333'
const requestB = '444444444444444444444444'
const grantA = '555555555555555555555555'
const grantB = '666666666666666666666666'

// Explicitly synthetic API boundaries. These verify the real Vue SPA and same-origin
// Axios REST transport, NOT live authentication, database authorization or backend acceptance.
async function syntheticBoundary(page: Page) {
  // Synthetic native identity and method presentation, not connected authentication.
  await page.route('**/api/auth/get-session**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
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
      }),
    }),
  )
  await page.route('**/api/auth-methods', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        password: true,
        google: false,
        emailOtp: false,
        passwordRecovery: false,
      }),
    }),
  )

  const state = {
    access: '',
    accounts: [
      {
        id: userA,
        name: '<img src=x onerror=alert(1)> Alice',
        email: 'alice@example.test',
        role: 'MERCHANT',
        version: 7,
        createdAt: date,
        grants: [
          {
            id: grantA,
            venueId: stallA,
            venueName: 'Stall A',
            merchantName: 'Fixture merchant',
            version: 4,
            createdAt: date,
          },
        ],
      },
      {
        id: userB,
        name: 'Synthetic Bob',
        email: 'bob@example.test',
        role: 'USER',
        version: 2,
        createdAt: date,
        grants: [],
      },
    ] as PlatformAccountResponse[],
    requests: [
      {
        id: requestA,
        userId: userB,
        userName: 'Synthetic Bob',
        userEmail: 'bob@example.test',
        venueId: stallA,
        venueName: 'Stall A',
        merchantName: 'Fixture merchant',
        status: 'PENDING',
        version: 3,
        message: '<script>synthetic claim</script>',
        reviewNote: null,
        createdAt: date,
      },
      {
        id: requestB,
        userId: userB,
        userName: 'Synthetic Bob',
        userEmail: 'bob@example.test',
        venueId: stallB,
        venueName: 'Stall B',
        merchantName: 'Fixture merchant',
        status: 'PENDING',
        version: 9,
        message: 'Synthetic second-stall claim',
        reviewNote: null,
        createdAt: date,
      },
    ] as MerchantRequest[],
    venues: [
      {
        id: stallA,
        name: 'Stall A',
        merchantName: 'Fixture merchant',
        address: 'One fixture road',
      },
      {
        id: stallB,
        name: 'Stall B',
        merchantName: 'Fixture merchant',
        address: 'Two fixture road',
      },
    ] satisfies PlatformVenue[],
    audit: [] as PlatformAuditEntry[],
    calls: [] as { path: string; input: unknown; method: string }[],
    failures: new Map<string, string>(),
    gates: new Map<string, Promise<void>>(),
    requestPages: new Map<string, RestPage<MerchantRequest>>(),
    nextRequestCursor: null as string | null,
    accountPages: new Map<string, RestPage<PlatformAccountSummary>>(),
    nextAccountCursor: null as string | null,
  }
  // Widen fixture literals to browser-safe contract types, not transport-client internals.
  const accounts: PlatformAccountResponse[] = state.accounts
  const audit = (
    action: string,
    targetUserId: string,
    note: string,
    venueId: string | null = null,
    roleBefore: PlatformRole | null = null,
    roleAfter: PlatformRole | null = null,
  ) => {
    state.audit.unshift({
      id: (state.audit.length + 1).toString(16).padStart(24, '0'),
      actorId: '999999999999999999999999',
      actorName: 'Synthetic administrator',
      action,
      targetUserId,
      venueId,
      roleBefore,
      roleAfter,
      note,
      createdAt: date,
    })
  }
  await page.route('**/api/admin/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname
    const method = request.method()
    const query: Record<string, unknown> = Object.fromEntries(url.searchParams.entries())
    if (query.limit) query.limit = Number(query.limit)
    const body: Record<string, unknown> = request.postDataJSON?.() ?? {}
    let path: string
    let input: Record<string, unknown>
    if (pathname === '/api/admin/accounts' && method === 'GET') {
      path = 'platformAdmin.accounts'
      input = query
    } else if (pathname.startsWith('/api/admin/accounts/') && pathname.endsWith('/role')) {
      const userId = pathname.split('/')[4]
      path = 'platformAdmin.changeRole'
      input = { userId, ...body }
    } else if (pathname.startsWith('/api/admin/accounts/') && method === 'GET') {
      path = 'platformAdmin.account'
      input = { userId: pathname.split('/').at(-1) }
    } else if (pathname === '/api/admin/merchant-requests' && method === 'GET') {
      path = 'platformAdmin.requests'
      input = query
    } else if (
      pathname.startsWith('/api/admin/merchant-requests/') &&
      pathname.endsWith('/review')
    ) {
      const requestId = pathname.split('/')[4]
      path = 'platformAdmin.reviewRequest'
      input = { requestId, ...body }
    } else if (pathname === '/api/admin/venues' && method === 'GET') {
      path = 'platformAdmin.venues'
      input = query
    } else if (pathname === '/api/admin/audit' && method === 'GET') {
      path = 'platformAdmin.audit'
      input = query
    } else if (pathname === '/api/admin/stall-grants' && method === 'POST') {
      path = 'platformAdmin.grantStall'
      input = body
    } else if (pathname.startsWith('/api/admin/stall-grants/') && method === 'DELETE') {
      const grantId = pathname.split('/').at(-1)
      path = 'platformAdmin.revokeStall'
      input = { grantId, ...body }
    } else {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Not found' } }),
      })
      return
    }
    state.calls.push({ path, input, method })
    const fail = state.failures.get(path) || state.access
    state.failures.delete(path)
    const gate = state.gates.get(path)
    state.gates.delete(path)
    if (gate) await gate
    if (fail) {
      const status =
        fail === 'UNAUTHORIZED' ? 401 : fail === 'FORBIDDEN' ? 403 : fail === 'CONFLICT' ? 409 : 500
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: fail, message: 'Synthetic boundary error' } }),
      })
      return
    }
    let data: unknown
    switch (path) {
      case 'platformAdmin.accounts': {
        const value = input as PlatformAccountsQuery
        data = (value.cursor ? state.accountPages.get(value.cursor) : undefined) ?? {
          items: accounts
            .filter(
              (item) =>
                (!value.role || item.role === value.role) &&
                (!value.search ||
                  `${item.name} ${item.email}`.toLowerCase().includes(value.search.toLowerCase())),
            )
            .map(({ grants: _grants, ...item }) => item),
          nextCursor: state.nextAccountCursor,
        }
        break
      }
      case 'platformAdmin.account': {
        data = accounts.find((item) => item.id === input.userId)
        if (!data) throw new Error(`Unknown synthetic account ${input.userId}`)
        break
      }
      case 'platformAdmin.requests': {
        const value = input as MerchantRequestsQuery
        data = (value.cursor ? state.requestPages.get(value.cursor) : undefined) ?? {
          items: state.requests.filter((item) => !value.status || item.status === value.status),
          nextCursor: state.nextRequestCursor,
        }
        break
      }
      case 'platformAdmin.venues':
        data = { items: state.venues, nextCursor: null } satisfies RestPage<PlatformVenue>
        break
      case 'platformAdmin.audit': {
        data = {
          items: state.audit.filter((item) => !input.userId || item.targetUserId === input.userId),
          nextCursor: null,
        }
        break
      }
      case 'platformAdmin.changeRole': {
        const value = input as { userId: string; role: PlatformRole; note: string }
        const account = accounts.find((item) => item.id === value.userId)
        if (!account) throw new Error('Unknown synthetic role target')
        audit('ROLE_CHANGED', account.id, value.note, null, account.role, value.role)
        account.role = value.role
        account.version += 1
        if (value.role !== 'MERCHANT') account.grants = []
        data = { id: account.id, version: account.version }
        break
      }
      case 'platformAdmin.grantStall': {
        const value = input as { userId: string; venueId: string; note: string }
        const account = accounts.find((item) => item.id === value.userId)
        const venue = state.venues.find((item) => item.id === value.venueId)
        if (!account || !venue) throw new Error('Unknown synthetic grant target')
        account.grants.push({
          id: grantB,
          venueId: venue.id,
          venueName: venue.name,
          merchantName: venue.merchantName,
          version: 1,
          createdAt: date,
        })
        account.version += 1
        audit('STALL_GRANTED', account.id, value.note, venue.id)
        data = { id: grantB, version: 1 }
        break
      }
      case 'platformAdmin.revokeStall': {
        const value = input as { grantId: string; note: string }
        const account = accounts.find((item) =>
          item.grants.some((grant) => grant.id === value.grantId),
        )
        const grant = account?.grants.find((item) => item.id === value.grantId)
        if (!account || !grant) throw new Error('Unknown synthetic revoke target')
        account.grants = account.grants.filter((item) => item.id !== value.grantId)
        account.version += 1
        audit('STALL_REVOKED', account.id, value.note, grant.venueId)
        data = { id: grant.id, version: grant.version + 1 }
        break
      }
      case 'platformAdmin.reviewRequest': {
        const value = input as { requestId: string; decision: 'APPROVE' | 'REJECT'; note: string }
        const item = state.requests.find((request) => request.id === value.requestId)
        if (!item) throw new Error('Unknown synthetic request target')
        item.status = value.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'
        item.reviewNote = value.note
        item.version += 1
        audit(
          value.decision === 'APPROVE' ? 'REQUEST_APPROVED' : 'REQUEST_REJECTED',
          item.userId,
          value.note,
          item.venueId,
        )
        data = { id: item.id, version: item.version }
        break
      }
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
    })
  })
  return state
}

const calls = (state: Awaited<ReturnType<typeof syntheticBoundary>>, path: string) =>
  state.calls.filter((call) => call.path === `platformAdmin.${path}`)
async function accountNote(page: Page, note: string) {
  await page.getByLabel('Account action note (required)').fill(note)
  await page.locator('#account-confirm').check()
}
async function requestNote(page: Page, note: string) {
  await page.getByLabel('Request review note (required)').fill(note)
  await page.locator('#request-confirm').check()
}

for (const width of [320, 390, 1280]) {
  test(`synthetic-boundary account and two-stall journey fits ${width}px`, async ({
    page,
  }, info) => {
    const state = await syntheticBoundary(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 850 })
    await page.goto('/')
    await page.getByRole('link', { name: 'Platform admin', exact: true }).click()
    await expect(page).toHaveURL('/admin/accounts')
    await page.getByTestId(`account-${userA}`).click()
    const details = page.getByRole('region', { name: 'Account details' })
    await expect(details).toContainText('<img src=x onerror=alert(1)> Alice')
    await expect(details.locator('img, script')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /delete/i })).toHaveCount(0)
    await expect(
      page.getByText(
        'Account deletion is unavailable pending the retention and anonymisation policy.',
      ),
    ).toBeVisible()
    await page.getByLabel('Account action', { exact: true }).selectOption('grant')
    await page.getByLabel('Search existing stalls').fill('Fixture merchant')
    await page.getByRole('button', { name: 'Search stalls', exact: true }).click()
    await page.getByLabel('Stall to grant').selectOption(stallB)
    await accountNote(page, 'Verified second outlet only')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await page.screenshot({ path: info.outputPath(`platform-admin-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Grant stall access', exact: true }).click()
    await expect(details).toContainText('Version 8')
    expect(calls(state, 'grantStall')).toEqual([
      {
        path: 'platformAdmin.grantStall',
        method: 'POST',
        input: {
          userId: userA,
          venueId: stallB,
          expectedUserVersion: 7,
          note: 'Verified second outlet only',
        },
      },
    ])
    await page.getByLabel('Account action', { exact: true }).selectOption('revoke')
    await page.getByLabel('Active grant to revoke').selectOption(grantB)
    await accountNote(page, 'Remove second outlet access')
    await page.getByRole('button', { name: 'Revoke stall access', exact: true }).click()
    await expect(
      page.getByLabel('Active grant to revoke').locator(`option[value="${grantB}"]`),
    ).toHaveCount(0)
    await expect(details).toContainText('Stall A')
    expect(calls(state, 'revokeStall')).toEqual([
      {
        path: 'platformAdmin.revokeStall',
        method: 'DELETE',
        input: { grantId: grantB, expectedVersion: 1, note: 'Remove second outlet access' },
      },
    ])
    await page.getByLabel('Account action', { exact: true }).selectOption('role')
    await page.getByLabel('New role').selectOption('USER')
    await accountNote(page, 'End merchant responsibility')
    const reads = Object.fromEntries(
      ['accounts', 'account', 'requests', 'audit'].map((name) => [name, calls(state, name).length]),
    )
    await page.getByRole('button', { name: 'Change role', exact: true }).click()
    await expect(details).toContainText('Version 10')
    await expect(details).toContainText('No active stall grants.')
    for (const [name, count] of Object.entries(reads))
      expect(calls(state, name)).toHaveLength(count + 1)
    expect(calls(state, 'changeRole')).toEqual([
      {
        path: 'platformAdmin.changeRole',
        method: 'PATCH',
        input: {
          userId: userA,
          expectedVersion: 9,
          role: 'USER',
          note: 'End merchant responsibility',
        },
      },
    ])
    await expect(page.getByRole('region', { name: 'Audit history' })).toContainText(
      'MERCHANT → USER',
    )
    await expect(page.getByLabel('Account action note (required)')).toHaveValue('')
    await expect(page.locator('#account-confirm')).not.toBeChecked()
    expect(errors).toEqual([])
  })
}

test('synthetic-boundary request review uses exact request identities and escapes messages', async ({
  page,
}) => {
  const state = await syntheticBoundary(page)
  await page.goto('/admin/accounts')
  await page.getByTestId(`request-${requestA}`).click()
  const details = page.getByRole('article', { name: 'Request details' })
  await expect(details).toContainText('<script>synthetic claim</script>')
  await expect(details.locator('script')).toHaveCount(0)
  await page.getByLabel('Request decision').selectOption('REJECT')
  await requestNote(page, 'No ownership evidence for Stall A')
  await page.getByRole('button', { name: 'Reject request', exact: true }).click()
  await expect(page.getByTestId(`request-${requestA}`)).toHaveCount(0)
  await page.getByTestId(`request-${requestB}`).click()
  await page.getByLabel('Request decision').selectOption('APPROVE')
  await requestNote(page, 'Verified the named second stall')
  await page.getByRole('button', { name: 'Approve request', exact: true }).click()
  await expect(page.getByText('No requests match this status.')).toBeVisible()
  expect(calls(state, 'reviewRequest').map((call) => call.input)).toEqual([
    {
      requestId: requestA,
      expectedVersion: 3,
      decision: 'REJECT',
      note: 'No ownership evidence for Stall A',
    },
    {
      requestId: requestB,
      expectedVersion: 9,
      decision: 'APPROVE',
      note: 'Verified the named second stall',
    },
  ])
  await page.getByLabel('Request status', { exact: true }).selectOption('APPROVED')
  await expect(page.getByTestId(`request-${requestB}`)).toBeVisible()
})

test('synthetic-boundary account conflict survives pagination and forces refreshed version confirmation', async ({
  page,
}) => {
  const state = await syntheticBoundary(page)
  state.nextAccountCursor = userB
  state.accountPages.set(userB, {
    items: [
      {
        id: userB,
        name: 'Later page',
        email: 'later@example.test',
        role: 'USER',
        version: 2,
        createdAt: date,
      },
    ],
    nextCursor: null,
  })
  state.failures.set('platformAdmin.changeRole', 'CONFLICT')
  await page.goto('/admin/accounts')
  await page.getByTestId(`account-${userA}`).click()
  await page.getByLabel('New role').selectOption('USER')
  await accountNote(page, 'Old version')
  await page.getByRole('button', { name: 'Change role', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Reload the account')
  await page.getByRole('button', { name: 'Load more accounts' }).click()
  await expect(page.getByTestId(`account-${userB}`)).toContainText('Later page')
  await accountNote(page, 'Cannot reuse cached version')
  await page.locator('#account-action-form').dispatchEvent('submit')
  expect(calls(state, 'changeRole')).toHaveLength(1)
  const first = state.accounts[0]
  if (!first) throw new Error('Missing synthetic account')
  first.version = 8
  await page.getByRole('button', { name: 'Reload account' }).click()
  await expect(page.getByRole('region', { name: 'Account details' })).toContainText('Version 8')
  await expect(page.getByLabel('Account action note (required)')).toHaveValue('')
  await expect(page.locator('#account-confirm')).not.toBeChecked()
  await page.getByLabel('New role').selectOption('USER')
  await accountNote(page, 'Fresh version')
  await page.getByRole('button', { name: 'Change role', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Account details' })).toContainText('Version 9')
  expect(calls(state, 'changeRole').map((call) => call.input)).toEqual([
    { userId: userA, expectedVersion: 7, role: 'USER', note: 'Old version' },
    { userId: userA, expectedVersion: 8, role: 'USER', note: 'Fresh version' },
  ])
})

test('synthetic-boundary request conflicts are identity-scoped until fetched fresh, not cleared by pagination', async ({
  page,
}) => {
  const state = await syntheticBoundary(page)
  const first = state.requests[0]
  const second = state.requests[1]
  if (!first || !second) throw new Error('Missing request fixtures')
  state.requests.splice(1)
  state.nextRequestCursor = requestB
  state.requestPages.set(requestB, { items: [second], nextCursor: null })
  state.failures.set('platformAdmin.reviewRequest', 'CONFLICT')
  await page.goto('/admin/accounts')
  await page.getByTestId(`request-${requestA}`).click()
  await requestNote(page, 'Review stale claim')
  await page.getByRole('button', { name: 'Approve request', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Reload requests')
  await page.getByRole('button', { name: 'Load more requests' }).click()
  await page.getByTestId(`request-${requestB}`).click()
  await page.getByTestId(`request-${requestA}`).click()
  await requestNote(page, 'Still stale')
  await page.locator('#request-form').dispatchEvent('submit')
  expect(calls(state, 'reviewRequest')).toHaveLength(1)
  first.version = 4
  await page.getByRole('button', { name: 'Reload requests' }).click()
  await expect(page.getByRole('article')).toContainText('Version 4')
  await expect(page.getByLabel('Request review note (required)')).toHaveValue('')
  await expect(page.locator('#request-confirm')).not.toBeChecked()
  await requestNote(page, 'Fresh claim evidence')
  await page.getByRole('button', { name: 'Approve request', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Request reviewed.' })).toBeVisible()
  expect(calls(state, 'reviewRequest').map((call) => call.input)).toEqual([
    { requestId: requestA, expectedVersion: 3, decision: 'APPROVE', note: 'Review stale claim' },
    { requestId: requestA, expectedVersion: 4, decision: 'APPROVE', note: 'Fresh claim evidence' },
  ])
})

test('synthetic-boundary pending writes prevent duplicate submits and target switching', async ({
  page,
}) => {
  const state = await syntheticBoundary(page)
  let release!: () => void
  state.gates.set(
    'platformAdmin.changeRole',
    new Promise<void>((resolve) => {
      release = resolve
    }),
  )
  await page.goto('/admin/accounts')
  await page.getByTestId(`account-${userA}`).click()
  await page.getByLabel('New role').selectOption('USER')
  await accountNote(page, 'Review first identity')
  await page.getByRole('button', { name: 'Change role', exact: true }).click()
  await expect(page.getByTestId(`account-${userB}`)).toBeDisabled()
  await page.getByTestId(`account-${userB}`).dispatchEvent('click')
  await page.locator('#account-action-form').dispatchEvent('submit')
  await expect.poll(() => calls(state, 'changeRole').length).toBe(1)
  expect(calls(state, 'changeRole')[0]?.input).toEqual({
    userId: userA,
    expectedVersion: 7,
    role: 'USER',
    note: 'Review first identity',
  })
  release()
  await expect(page.getByRole('region', { name: 'Account details' })).toContainText(
    'alice@example.test',
  )
  await expect(
    page.getByRole('status').filter({ hasText: 'Account action completed.' }),
  ).toBeVisible()
})

for (const code of ['UNAUTHORIZED', 'FORBIDDEN', 'INTERNAL_SERVER_ERROR']) {
  test(`synthetic-boundary ${code} is distinct and recoverable through a fresh load`, async ({
    page,
  }) => {
    const state = await syntheticBoundary(page)
    state.failures.set('platformAdmin.accounts', code)
    await page.goto('/admin/accounts')
    if (code === 'UNAUTHORIZED') {
      await expect(page.getByRole('heading', { name: 'Sign in to manage accounts' })).toBeVisible()
      await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    } else {
      await expect(page.getByRole('alert')).toContainText(
        code === 'FORBIDDEN'
          ? 'You do not have permission'
          : 'Unable to load platform administration',
      )
      await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0)
    }
    await expect(page.getByRole('region', { name: 'Accounts', exact: true })).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('region', { name: 'Accounts', exact: true })).toBeVisible()
  })
}

test('synthetic-boundary live permission loss removes every administrative panel', async ({
  page,
}) => {
  const state = await syntheticBoundary(page)
  await page.goto('/admin/accounts')
  await page.getByTestId(`account-${userA}`).click()
  await page.getByLabel('New role').selectOption('USER')
  await accountNote(page, 'Recheck server permission')
  // Actual revocation denies both the mutation and the fresh ADMIN-only read.
  state.access = 'FORBIDDEN'
  await page.getByRole('button', { name: 'Change role', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('You do not have permission')
  expect(calls(state, 'accounts')).toHaveLength(2)
  await expect(page.getByRole('region', { name: 'Accounts', exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Account details' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Merchant requests' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Audit history' })).toHaveCount(0)
})

test('synthetic-boundary stale denial cannot overwrite newer search and current errors can be reloaded', async ({
  page,
}) => {
  const state = await syntheticBoundary(page)
  await page.goto('/admin/accounts')
  await expect(page.getByTestId(`account-${userA}`)).toBeVisible()
  let release!: () => void
  state.gates.set(
    'platformAdmin.accounts',
    new Promise<void>((resolve) => {
      release = resolve
    }),
  )
  state.failures.set('platformAdmin.accounts', 'FORBIDDEN')
  await page.getByLabel('Search accounts', { exact: true }).fill('Alice')
  await page.getByRole('button', { name: 'Search accounts', exact: true }).click()
  await expect.poll(() => calls(state, 'accounts').length).toBe(2)
  await page.getByLabel('Search accounts', { exact: true }).fill('Bob')
  await page.getByRole('button', { name: 'Search accounts', exact: true }).click()
  await expect(page.getByTestId(`account-${userB}`)).toBeVisible()
  const lateResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/admin/accounts' && url.searchParams.get('search') === 'Alice'
  })
  release()
  await lateResponse
  await expect(page.getByTestId(`account-${userB}`)).toBeVisible()
  await expect(
    page.getByText('You do not have permission to manage platform accounts.'),
  ).toHaveCount(0)
  state.failures.set('platformAdmin.accounts', 'INTERNAL_SERVER_ERROR')
  await page.getByRole('button', { name: 'Search accounts', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Accounts', exact: true }).getByRole('alert'),
  ).toContainText('Unable to load data.')
  await page.getByRole('button', { name: 'Search accounts', exact: true }).click()
  await expect(page.getByTestId(`account-${userB}`)).toBeVisible()
})

test('synthetic sign-in rechecks platform API access rather than trusting a client role', async ({
  page,
}) => {
  const state = await syntheticBoundary(page)
  state.access = 'UNAUTHORIZED'
  await page.route('**/api/auth/sign-in/email', async (route) => {
    expect(route.request().method()).toBe('POST')
    state.access = ''
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'synthetic-admin',
          name: 'Synthetic stale session',
          email: 'synthetic@example.test',
          emailVerified: false,
          role: 'USER',
          createdAt: date,
          updatedAt: date,
        },
      }),
    })
  })
  await page.goto('/admin/accounts')
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.test')
  await page.getByLabel('Password', { exact: true }).fill('synthetic-not-a-real-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Accounts', exact: true })).toBeVisible()
  expect(calls(state, 'accounts')).toHaveLength(2)
  expect(
    await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } })),
  ).toEqual({ local: {}, session: {} })
})
