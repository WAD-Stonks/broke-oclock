import type {
  MerchantRequest,
  PlatformAccountResponse,
  PlatformAccountSummary,
  PlatformAuditEntry,
  PlatformVenue,
} from '@broke-oclock/contracts/platform-admin'
import { flushPromises, mount } from '@vue/test-utils'
import App from '@web/App.vue'

type Page<T> = { items: T[]; nextCursor: string | null }

import { ApiClientError } from '@web/lib/api-client'
import routes from '@web/router/routes'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

// Synthetic REST boundary only: these tests do not prove backend authorization.
const rest = vi.hoisted(() => ({
  accounts: vi.fn(),
  account: vi.fn(),
  requests: vi.fn(),
  venues: vi.fn(),
  audit: vi.fn(),
  changeRole: vi.fn(),
  reviewRequest: vi.fn(),
  grantStall: vi.fn(),
  revokeStall: vi.fn(),
  signIn: vi.fn(),
}))
vi.mock('@web/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
      message: string,
    ) {
      super(message)
    }
  },
  api: {
    platformAdmin: {
      accounts: rest.accounts,
      account: rest.account,
      requests: rest.requests,
      venues: rest.venues,
      audit: rest.audit,
      changeRole: rest.changeRole,
      reviewRequest: rest.reviewRequest,
      grantStall: rest.grantStall,
      revokeStall: rest.revokeStall,
    },
  },
}))
vi.mock('@web/lib/auth-client', () => ({ authClient: { signIn: { email: rest.signIn } } }))
const account = {
  id: 'user-a',
  name: '<img src=x> Alice',
  email: 'alice@example.test',
  role: 'USER',
  version: 7,
  createdAt: '2026-01-01T00:00:00Z',
  grants: [],
} satisfies PlatformAccountResponse
beforeEach(() => {
  vi.resetAllMocks()
  for (const name of ['accounts', 'requests', 'venues', 'audit'] as const)
    rest[name].mockResolvedValue({ items: [], nextCursor: null })
})
async function open() {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/admin/accounts')
  await router.isReady()
  const wrapper = mount(App, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}
it('routes platform administration separately and uses server denial, not a client role', async () => {
  rest.accounts.mockRejectedValueOnce(new ApiClientError('UNAUTHORIZED', 401, 'Sign in required'))
  const wrapper = await open()
  expect(wrapper.get('h1').text()).toBe('Platform admin')
  expect(wrapper.text()).toContain('Sign in to manage accounts')
  expect(wrapper.find('input[type="password"]').exists()).toBe(true)
  expect(wrapper.get('nav a[href="/admin/accounts"]').text()).toBe('Platform admin')
  expect(wrapper.find('nav a[href="/admin/ingestion"]').exists()).toBe(true)
  expect(rest.requests).not.toHaveBeenCalled()
})

it('changes the selected account role only with a note and confirmation, then refreshes evidence', async () => {
  rest.accounts.mockResolvedValue({ items: [account], nextCursor: null })
  rest.account.mockResolvedValue(account)
  let release: (() => void) | undefined
  rest.changeRole.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      }),
  )
  const w = await open()
  await w.get('[data-testid="account-user-a"]').trigger('click')
  await flushPromises()
  expect(w.get('[aria-label="Account details"]').text()).toContain('<img src=x> Alice')
  expect(w.find('[aria-label="Account details"] img').exists()).toBe(false)
  await w.get('#new-role').setValue('MERCHANT')
  await w.get('#account-note').setValue('Approved merchant onboarding')
  await w.get('#account-action-form').trigger('submit')
  expect(rest.changeRole).not.toHaveBeenCalled()
  await w.get('#account-confirm').setValue(true)
  await w.get('#account-action-form').trigger('submit')
  await w.get('#account-action-form').trigger('submit')
  expect(rest.changeRole).toHaveBeenCalledExactlyOnceWith('user-a', {
    expectedVersion: 7,
    role: 'MERCHANT',
    note: 'Approved merchant onboarding',
  })
  expect(w.get('[data-testid="account-user-a"]').attributes('disabled')).toBeDefined()
  rest.account.mockResolvedValue({ ...account, role: 'MERCHANT', version: 8 })
  release?.()
  await flushPromises()
  expect(rest.account).toHaveBeenCalledTimes(2)
  expect(rest.accounts).toHaveBeenCalledTimes(2)
  expect(rest.requests).toHaveBeenCalledTimes(2)
  expect(rest.audit).toHaveBeenCalledTimes(2)
  expect((w.get('#account-note').element as HTMLTextAreaElement).value).toBe('')
  expect((w.get('#account-confirm').element as HTMLInputElement).checked).toBe(false)
  expect(w.text()).toContain(
    'Account deletion is unavailable pending the retention and anonymisation policy.',
  )
})

const requestA = {
  id: 'request-a',
  userId: 'user-a',
  userName: 'Alice',
  userEmail: 'alice@example.test',
  venueId: 'stall-a',
  venueName: 'Stall A',
  merchantName: 'Merchant',
  status: 'PENDING',
  version: 3,
  message: '<script>claim</script>',
  reviewNote: null,
  createdAt: '2026-01-01T00:00:00Z',
} satisfies MerchantRequest
it('reviews only the selected pending request with its exact identity and version', async () => {
  rest.requests.mockResolvedValue({
    items: [
      requestA,
      { ...requestA, id: 'request-b', venueId: 'stall-b', venueName: 'Stall B', version: 9 },
    ],
    nextCursor: null,
  })
  rest.reviewRequest.mockResolvedValue({ id: 'request-b', version: 10 })
  const w = await open()
  await w.get('[data-testid="request-request-b"]').trigger('click')
  expect(w.get('[aria-label="Request details"]').text()).toContain('Stall B')
  expect(w.find('[aria-label="Request details"] script').exists()).toBe(false)
  await w.get('#request-note').setValue('Verified Stall B ownership')
  await w.get('#request-confirm').setValue(true)
  await w.get('#request-form').trigger('submit')
  await flushPromises()
  expect(rest.reviewRequest).toHaveBeenCalledExactlyOnceWith('request-b', {
    expectedVersion: 9,
    decision: 'APPROVE',
    note: 'Verified Stall B ownership',
  })
  expect((w.get('#request-note').element as HTMLTextAreaElement).value).toBe('')
  await w.get('#request-status').setValue('REJECTED')
  await flushPromises()
  expect(rest.requests).toHaveBeenLastCalledWith({ status: 'REJECTED', limit: 20 })
})

it('grants the picked second stall and revokes only the selected active grant version', async () => {
  rest.accounts.mockResolvedValue({ items: [{ ...account, role: 'MERCHANT' }], nextCursor: null })
  rest.account.mockResolvedValue({
    ...account,
    role: 'MERCHANT',
    grants: [
      {
        id: 'grant-a',
        venueId: 'stall-a',
        venueName: 'Stall A',
        merchantName: 'Merchant',
        version: 4,
        createdAt: account.createdAt,
      },
      {
        id: 'grant-b',
        venueId: 'stall-b',
        venueName: 'Stall B',
        merchantName: 'Merchant',
        version: 8,
        createdAt: account.createdAt,
      },
    ],
  })
  rest.venues.mockResolvedValue({
    items: [
      { id: 'stall-c', name: 'Stall C', merchantName: 'Merchant', address: 'First road' },
      { id: 'stall-d', name: 'Stall D', merchantName: 'Merchant', address: 'Second road' },
    ],
    nextCursor: null,
  })
  rest.grantStall.mockResolvedValue({ id: 'grant-d', version: 1 })
  rest.revokeStall.mockResolvedValue({ id: 'grant-b', version: 9 })
  const w = await open()
  await w.get('[data-testid="account-user-a"]').trigger('click')
  await flushPromises()
  await w.get('#account-action').setValue('grant')
  await w.get('#venue-search').setValue('Stall')
  await w.get('#venue-search-form').trigger('submit')
  await flushPromises()
  await w.get('#venue-choice').setValue('stall-d')
  await w.get('#account-note').setValue('Verified the second outlet')
  await w.get('#account-confirm').setValue(true)
  await w.get('#account-action-form').trigger('submit')
  await flushPromises()
  expect(rest.grantStall).toHaveBeenCalledExactlyOnceWith({
    userId: 'user-a',
    venueId: 'stall-d',
    expectedUserVersion: 7,
    note: 'Verified the second outlet',
  })
  expect(rest.venues).toHaveBeenCalledWith({ search: 'Stall', limit: 20 })
  await w.get('#account-action').setValue('revoke')
  await w.get('#grant-choice').setValue('grant-b')
  await w.get('#account-note').setValue('Access no longer required')
  await w.get('#account-confirm').setValue(true)
  await w.get('#account-action-form').trigger('submit')
  await flushPromises()
  expect(rest.revokeStall).toHaveBeenCalledExactlyOnceWith('grant-b', {
    expectedVersion: 8,
    note: 'Access no longer required',
  })
})

it('searches and paginates accounts and filters immutable audit transitions from server data', async () => {
  rest.accounts
    .mockResolvedValueOnce({ items: [account], nextCursor: 'page-a' })
    .mockResolvedValue({ items: [{ ...account, id: 'user-b', name: 'Bob' }], nextCursor: null })
  rest.audit.mockResolvedValue({
    items: [
      {
        id: 'event-a',
        actorId: 'admin-a',
        actorName: 'Reviewer',
        action: 'ROLE_CHANGED',
        targetUserId: 'user-a',
        venueId: null,
        roleBefore: 'USER',
        roleAfter: 'MERCHANT',
        note: '<img src=x> Reviewed',
        createdAt: account.createdAt,
      },
    ],
    nextCursor: 'event-a',
  })
  const w = await open()
  await w.get('[data-testid="more-accounts"]').trigger('click')
  await flushPromises()
  expect(rest.accounts).toHaveBeenLastCalledWith({ limit: 20, cursor: 'page-a' })
  expect(w.find('[data-testid="account-user-a"]').exists()).toBe(true)
  expect(w.find('[data-testid="account-user-b"]').exists()).toBe(true)
  await w.get('#account-search').setValue('Bob')
  await w.get('#account-role-filter').setValue('MERCHANT')
  await w.get('#account-search-form').trigger('submit')
  await flushPromises()
  expect(rest.accounts).toHaveBeenLastCalledWith({ search: 'Bob', role: 'MERCHANT', limit: 20 })
  expect(w.find('[data-testid="account-user-a"]').exists()).toBe(false)
  await w.get('#audit-user').setValue('user-a')
  await w.get('#audit-filter-form').trigger('submit')
  await flushPromises()
  expect(rest.audit).toHaveBeenLastCalledWith({ userId: 'user-a', limit: 20 })
  expect(w.get('[aria-label="Audit history"]').text()).toContain('USER → MERCHANT')
  expect(w.find('[aria-label="Audit history"] img').exists()).toBe(false)
  await w.get('[data-testid="more-audit"]').trigger('click')
  await flushPromises()
  expect(rest.audit).toHaveBeenLastCalledWith({ userId: 'user-a', cursor: 'event-a', limit: 20 })
})

it('keeps request conflict guards by identity across pagination and selection until fresh evidence', async () => {
  rest.requests
    .mockResolvedValueOnce({ items: [requestA], nextCursor: 'page-b' })
    .mockResolvedValueOnce({
      items: [{ ...requestA, id: 'request-b', venueName: 'Other stall' }],
      nextCursor: null,
    })
    .mockResolvedValue({ items: [{ ...requestA, version: 4 }], nextCursor: null })
  rest.reviewRequest
    .mockRejectedValueOnce(new ApiClientError('CONFLICT', 409, 'Conflict'))
    .mockResolvedValue({ id: 'request-a', version: 5 })
  const w = await open()
  await w.get('[data-testid="request-request-a"]').trigger('click')
  await w.get('#request-note').setValue('Old evidence')
  await w.get('#request-confirm').setValue(true)
  await w.get('#request-form').trigger('submit')
  await flushPromises()
  await w.get('[data-testid="more-requests"]').trigger('click')
  await flushPromises()
  expect(rest.requests).toHaveBeenLastCalledWith({ status: 'PENDING', cursor: 'page-b', limit: 20 })
  await w.get('[data-testid="request-request-b"]').trigger('click')
  await w.get('[data-testid="request-request-a"]').trigger('click')
  await w.get('#request-note').setValue('Cached stale evidence')
  await w.get('#request-confirm').setValue(true)
  await w.get('#request-form').trigger('submit')
  await flushPromises()
  expect(rest.reviewRequest).toHaveBeenCalledTimes(1)
  expect(w.get('[aria-label="Request details"]').text()).toContain('Reload requests')
  await w.get('[data-testid="reload-requests"]').trigger('click')
  await flushPromises()
  expect((w.get('#request-note').element as HTMLTextAreaElement).value).toBe('')
  expect((w.get('#request-confirm').element as HTMLInputElement).checked).toBe(false)
  await w.get('#request-decision').setValue('REJECT')
  await w.get('#request-note').setValue('Current evidence')
  await w.get('#request-confirm').setValue(true)
  await w.get('#request-form').trigger('submit')
  await flushPromises()
  expect(rest.reviewRequest).toHaveBeenLastCalledWith('request-a', {
    expectedVersion: 4,
    decision: 'REJECT',
    note: 'Current evidence',
  })
})

it('does not authorize a cached request after a failed evidence refresh', async () => {
  rest.requests
    .mockResolvedValueOnce({ items: [requestA], nextCursor: null })
    .mockRejectedValueOnce(new Error('synthetic read failure'))
  const w = await open()
  await w.get('[data-testid="request-request-a"]').trigger('click')
  await w.get('[data-testid="reload-requests"]').trigger('click')
  await flushPromises()
  await w.get('#request-note').setValue('Old selected record')
  await w.get('#request-confirm').setValue(true)
  await w.get('#request-form').trigger('submit')
  await flushPromises()
  expect(rest.reviewRequest).not.toHaveBeenCalled()
})

it('paginates venue search without silently choosing a target', async () => {
  rest.accounts.mockResolvedValue({ items: [account], nextCursor: null })
  rest.account.mockResolvedValue({ ...account, role: 'MERCHANT' })
  rest.venues
    .mockResolvedValueOnce({
      items: [{ id: 'stall-a', name: 'First', merchantName: 'M', address: 'A' }],
      nextCursor: 'stall-a',
    })
    .mockResolvedValueOnce({
      items: [{ id: 'stall-b', name: 'Second', merchantName: 'M', address: 'B' }],
      nextCursor: null,
    })
  const w = await open()
  await w.get('[data-testid="account-user-a"]').trigger('click')
  await flushPromises()
  await w.get('#account-action').setValue('grant')
  await w.get('#venue-search').setValue('M')
  await w.get('#venue-search-form').trigger('submit')
  await flushPromises()
  await w.get('[data-testid="more-venues"]').trigger('click')
  await flushPromises()
  expect(rest.venues).toHaveBeenLastCalledWith({ search: 'M', cursor: 'stall-a', limit: 20 })
  expect(w.get('#venue-choice').findAll('option')).toHaveLength(3)
  expect((w.get('#venue-choice').element as HTMLSelectElement).value).toBe('')
})

it('reloads conflicted account evidence and requires a new confirmation even at the same version', async () => {
  rest.accounts.mockResolvedValue({ items: [account], nextCursor: null })
  rest.account.mockResolvedValue(account)
  rest.changeRole
    .mockRejectedValueOnce(new ApiClientError('CONFLICT', 409, 'Conflict'))
    .mockResolvedValue({ id: account.id, version: 8 })
  const w = await open()
  await w.get('[data-testid="account-user-a"]').trigger('click')
  await flushPromises()
  await w.get('#new-role').setValue('MERCHANT')
  await w.get('#account-note').setValue('Initial evidence')
  await w.get('#account-confirm').setValue(true)
  await w.get('#account-action-form').trigger('submit')
  await flushPromises()
  await w.get('#account-note').setValue('Attempted stale retry')
  await w.get('#account-confirm').setValue(true)
  await w.get('#account-action-form').trigger('submit')
  await flushPromises()
  expect(rest.changeRole).toHaveBeenCalledTimes(1)
  await w.get('[data-testid="reload-account"]').trigger('click')
  await flushPromises()
  expect((w.get('#account-note').element as HTMLTextAreaElement).value).toBe('')
  expect((w.get('#account-confirm').element as HTMLInputElement).checked).toBe(false)
  await w.get('#new-role').setValue('MERCHANT')
  await w.get('#account-note').setValue('Refetched evidence')
  await w.get('#account-confirm').setValue(true)
  await w.get('#account-action-form').trigger('submit')
  await flushPromises()
  expect(rest.changeRole).toHaveBeenCalledTimes(2)
})

it('blocks forced reload and selection events while a request mutation is pending', async () => {
  rest.requests.mockResolvedValue({
    items: [requestA, { ...requestA, id: 'request-b' }],
    nextCursor: null,
  })
  let release: (() => void) | undefined
  rest.reviewRequest.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      }),
  )
  const w = await open()
  await w.get('[data-testid="request-request-a"]').trigger('click')
  await w.get('#request-note').setValue('Review current evidence')
  await w.get('#request-confirm').setValue(true)
  await w.get('#request-form').trigger('submit')
  w.get('[data-testid="reload-requests"]').element.dispatchEvent(new Event('click'))
  w.get('[data-testid="request-request-b"]').element.dispatchEvent(new Event('click'))
  await w.get('#request-form').trigger('submit')
  await flushPromises()
  expect(rest.requests).toHaveBeenCalledTimes(1)
  expect(rest.reviewRequest).toHaveBeenCalledTimes(1)
  release?.()
  await flushPromises()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
for (const staleOutcome of ['response', 'denial'] as const) {
  it(`ignores a stale account-search ${staleOutcome} after a newer filter resolves`, async () => {
    const old = deferred<Page<PlatformAccountSummary>>()
    const w = await open()
    rest.accounts
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ items: [{ ...account, name: 'Current account' }], nextCursor: null })
    await w.get('#account-search').setValue('old')
    await w.get('#account-search-form').trigger('submit')
    await w.get('#account-search').setValue('current')
    await w.get('#account-search-form').trigger('submit')
    await flushPromises()
    if (staleOutcome === 'response')
      old.resolve({ items: [{ ...account, name: 'Superseded account' }], nextCursor: null })
    else old.reject(new ApiClientError('FORBIDDEN', 403, 'Forbidden'))
    await flushPromises()
    expect(w.text()).toContain('Current account')
    expect(w.text()).not.toContain('Superseded account')
    expect(w.text()).not.toContain('You do not have permission')
  })
}
it('ignores a late account-detail denial after another identity is selected', async () => {
  const old = deferred<PlatformAccountResponse>()
  rest.accounts.mockResolvedValue({
    items: [account, { ...account, id: 'user-b', name: 'Bob' }],
    nextCursor: null,
  })
  rest.account
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce({ ...account, id: 'user-b', name: 'Bob', version: 12 })
  const w = await open()
  await w.get('[data-testid="account-user-a"]').trigger('click')
  await w.get('[data-testid="account-user-b"]').trigger('click')
  await flushPromises()
  old.reject(new ApiClientError('FORBIDDEN', 403, 'Forbidden'))
  await flushPromises()
  expect(w.get('[aria-label="Account details"]').text()).toContain('Bob')
  expect(w.get('[aria-label="Account details"]').text()).toContain('Version 12')
})
it('ignores stale request-filter and audit-filter responses', async () => {
  const oldRequests = deferred<Page<MerchantRequest>>()
  const oldAudit = deferred<Page<PlatformAuditEntry>>()
  const w = await open()
  rest.requests.mockReturnValueOnce(oldRequests.promise).mockResolvedValueOnce({
    items: [{ ...requestA, status: 'REJECTED', venueName: 'Current rejected' }],
    nextCursor: null,
  })
  await w.get('#request-status').setValue('APPROVED')
  await w.get('#request-status').setValue('REJECTED')
  await flushPromises()
  rest.audit
    .mockReturnValueOnce(oldAudit.promise)
    .mockResolvedValueOnce({ items: [], nextCursor: null })
  await w.get('#audit-user').setValue('old')
  await w.get('#audit-filter-form').trigger('submit')
  await w.get('#audit-user').setValue('current')
  await w.get('#audit-filter-form').trigger('submit')
  await flushPromises()
  oldRequests.resolve({ items: [{ ...requestA, venueName: 'Old approved' }], nextCursor: null })
  oldAudit.reject(new ApiClientError('FORBIDDEN', 403, 'Forbidden'))
  await flushPromises()
  expect(w.text()).toContain('Current rejected')
  expect(w.text()).not.toContain('Old approved')
  expect(w.text()).toContain('No audit events match this filter.')
})
it('ignores a stale venue search denial after a new search resolves', async () => {
  const old = deferred<Page<PlatformVenue>>()
  rest.accounts.mockResolvedValue({ items: [account], nextCursor: null })
  rest.account.mockResolvedValue({ ...account, role: 'MERCHANT' })
  rest.venues.mockReturnValueOnce(old.promise).mockResolvedValueOnce({
    items: [{ id: 'stall-new', name: 'Current stall', merchantName: 'M', address: 'A' }],
    nextCursor: null,
  })
  const w = await open()
  await w.get('[data-testid="account-user-a"]').trigger('click')
  await flushPromises()
  await w.get('#account-action').setValue('grant')
  await w.get('#venue-search').setValue('old')
  await w.get('#venue-search-form').trigger('submit')
  await w.get('#venue-search').setValue('current')
  await w.get('#venue-search-form').trigger('submit')
  await flushPromises()
  old.reject(new ApiClientError('FORBIDDEN', 403, 'Forbidden'))
  await flushPromises()
  expect(w.get('#venue-choice').text()).toContain('Current stall')
})
it('distinguishes a server permission denial from anonymous and recoverable failures', async () => {
  rest.accounts.mockRejectedValueOnce(new ApiClientError('FORBIDDEN', 403, 'Forbidden'))
  const forbidden = await open()
  expect(forbidden.text()).toContain('You do not have permission')
  expect(forbidden.find('input[type="password"]').exists()).toBe(false)
  forbidden.unmount()
  rest.accounts.mockRejectedValueOnce(new Error('private synthetic error'))
  const failure = await open()
  expect(failure.text()).toContain('Unable to load platform administration')
  expect(failure.text()).not.toContain('private synthetic error')
  await failure.get('main button').trigger('click')
  await flushPromises()
  expect(failure.text()).toContain('No accounts match these filters.')
})
async function prepareForbiddenMutation(kind: 'account' | 'request') {
  rest.accounts.mockResolvedValue({ items: [{ ...account, role: 'ADMIN' }], nextCursor: null })
  rest.account.mockResolvedValue({ ...account, role: 'ADMIN' })
  rest.requests.mockResolvedValue({ items: [requestA], nextCursor: null })
  const mutation = kind === 'account' ? rest.changeRole : rest.reviewRequest
  // The message is deliberately misleading; only a fresh protected read decides access.
  mutation.mockRejectedValue(
    new ApiClientError('FORBIDDEN', 403, 'Your administrator access was revoked'),
  )
  const w = await open()
  await w.get('[data-testid="account-user-a"]').trigger('click')
  await flushPromises()
  await w.get('[data-testid="request-request-a"]').trigger('click')
  await w.get('#new-role').setValue('MERCHANT')
  await w.get('#account-note').setValue('Account mutation evidence')
  await w.get('#account-confirm').setValue(true)
  await w.get('#request-note').setValue('Request mutation evidence')
  await w.get('#request-confirm').setValue(true)
  return { w, mutation, form: kind === 'account' ? '#account-action-form' : '#request-form' }
}

it.each(['account', 'request'] as const)(
  'rechecks server access after a %s mutation refusal and restores authorized administration',
  async (kind) => {
    const { w, mutation, form } = await prepareForbiddenMutation(kind)
    const recheck = deferred<Page<PlatformAccountSummary>>()
    rest.accounts.mockReturnValueOnce(recheck.promise)
    await w.get(form).trigger('submit')
    await flushPromises()
    expect(rest.accounts).toHaveBeenCalledTimes(2)
    for (const panel of [
      'Accounts',
      'Account details',
      'Merchant requests',
      'Request details',
      'Audit history',
    ])
      expect(w.find(`[aria-label="${panel}"]`).exists()).toBe(false)
    expect(w.text()).toContain('Loading accounts')
    expect(w.text()).not.toContain('You do not have permission')
    // A successful ADMIN-only query authorizes even an empty filtered result.
    recheck.resolve({ items: [], nextCursor: null })
    await flushPromises()
    expect(w.find('[aria-label="Accounts"]').exists()).toBe(true)
    expect(w.find('[aria-label="Merchant requests"]').exists()).toBe(true)
    expect(w.find('[aria-label="Audit history"]').exists()).toBe(true)
    expect(w.find('[aria-label="Account details"]').exists()).toBe(false)
    expect(w.find('[aria-label="Request details"]').exists()).toBe(false)
    expect(w.text()).toContain(
      kind === 'account' ? 'Account action was refused' : 'Request review was refused',
    )
    expect(w.text()).not.toContain('Your administrator access was revoked')
    expect(w.text()).not.toContain('completed')
    expect(mutation).toHaveBeenCalledTimes(1)
    await w.get('[data-testid="request-request-a"]').trigger('click')
    expect((w.get('#request-note').element as HTMLTextAreaElement).value).toBe('')
    expect((w.get('#request-confirm').element as HTMLInputElement).checked).toBe(false)
  },
)

it.each(['account', 'request'] as const)(
  'keeps a failed %s permission recheck closed until an explicit successful retry',
  async (kind) => {
    const { w, mutation, form } = await prepareForbiddenMutation(kind)
    rest.accounts.mockRejectedValueOnce(new Error('Synthetic private recheck failure'))
    await w.get(form).trigger('submit')
    await flushPromises()
    expect(w.text()).toContain('Unable to load platform administration')
    expect(w.text()).not.toContain('Synthetic private recheck failure')
    for (const panel of [
      'Accounts',
      'Account details',
      'Merchant requests',
      'Request details',
      'Audit history',
    ])
      expect(w.find(`[aria-label="${panel}"]`).exists()).toBe(false)
    expect(rest.requests).toHaveBeenCalledTimes(1)
    expect(rest.audit).toHaveBeenCalledTimes(1)
    const retry = deferred<Page<PlatformAccountSummary>>()
    rest.accounts.mockReturnValueOnce(retry.promise)
    await w.get('main button').trigger('click')
    await flushPromises()
    expect(w.find('[aria-label="Accounts"]').exists()).toBe(false)
    retry.resolve({ items: [account], nextCursor: null })
    await flushPromises()
    expect(w.find('[aria-label="Accounts"]').exists()).toBe(true)
    expect(w.find('[aria-label="Account details"]').exists()).toBe(false)
    expect(w.find('[aria-label="Request details"]').exists()).toBe(false)
    expect(mutation).toHaveBeenCalledTimes(1)
    await w.get('[data-testid="account-user-a"]').trigger('click')
    await flushPromises()
    expect((w.get('#account-note').element as HTMLTextAreaElement).value).toBe('')
    expect((w.get('#account-confirm').element as HTMLInputElement).checked).toBe(false)
  },
)

for (const code of ['FORBIDDEN', 'UNAUTHORIZED'] as const) {
  it.each(['account', 'request'] as const)(
    `preserves global ${code} after a %s mutation recheck denies access`,
    async (kind) => {
      const { w, mutation, form } = await prepareForbiddenMutation(kind)
      rest.accounts.mockRejectedValueOnce(
        new ApiClientError(code, code === 'FORBIDDEN' ? 403 : 401, code),
      )
      await w.get(form).trigger('submit')
      await flushPromises()
      expect(rest.accounts).toHaveBeenCalledTimes(2)
      expect(w.text()).toContain(
        code === 'FORBIDDEN' ? 'You do not have permission' : 'Sign in to manage accounts',
      )
      for (const panel of [
        'Accounts',
        'Account details',
        'Merchant requests',
        'Request details',
        'Audit history',
      ])
        expect(w.find(`[aria-label="${panel}"]`).exists()).toBe(false)
      expect(rest.requests).toHaveBeenCalledTimes(1)
      expect(rest.audit).toHaveBeenCalledTimes(1)
      expect(mutation).toHaveBeenCalledTimes(1)
    },
  )
}

it('removes all authorized panels after a mutation permission denial', async () => {
  rest.accounts.mockResolvedValue({ items: [account], nextCursor: null })
  rest.account.mockResolvedValue(account)
  rest.changeRole.mockRejectedValue(new ApiClientError('FORBIDDEN', 403, 'Forbidden'))
  const w = await open()
  await w.get('[data-testid="account-user-a"]').trigger('click')
  await flushPromises()
  await w.get('#new-role').setValue('ADMIN')
  await w.get('#account-note').setValue('Server must authorize')
  await w.get('#account-confirm').setValue(true)
  rest.accounts.mockRejectedValueOnce(new ApiClientError('FORBIDDEN', 403, 'Forbidden'))
  await w.get('#account-action-form').trigger('submit')
  await flushPromises()
  expect(w.text()).toContain('You do not have permission')
  expect(w.find('[aria-label="Accounts"]').exists()).toBe(false)
  expect(w.find('[aria-label="Merchant requests"]').exists()).toBe(false)
  expect(w.find('[aria-label="Audit history"]').exists()).toBe(false)
})

it('matches server note and search bounds and rejects a programmatically overlong action note', async () => {
  rest.accounts.mockResolvedValue({ items: [account], nextCursor: null })
  rest.account.mockResolvedValue(account)
  const w = await open()
  expect(w.get('#account-search').attributes('maxlength')).toBe('100')
  await w.get('[data-testid="account-user-a"]').trigger('click')
  await flushPromises()
  expect(w.get('#account-note').attributes('maxlength')).toBe('500')
  await w.get('#new-role').setValue('MERCHANT')
  await w.get('#account-note').setValue('x'.repeat(501))
  await w.get('#account-confirm').setValue(true)
  await w.get('#account-action-form').trigger('submit')
  await flushPromises()
  expect(rest.changeRole).not.toHaveBeenCalled()
})

it('reports a completed write separately from a failed follow-up read without claiming all views refreshed', async () => {
  rest.accounts.mockResolvedValue({ items: [account], nextCursor: null })
  rest.account
    .mockResolvedValueOnce(account)
    .mockRejectedValueOnce(new Error('synthetic reload failure'))
  rest.changeRole.mockResolvedValue({ id: account.id, version: 8 })
  const w = await open()
  await w.get('[data-testid="account-user-a"]').trigger('click')
  await flushPromises()
  await w.get('#new-role').setValue('MERCHANT')
  await w.get('#account-note').setValue('Approved')
  await w.get('#account-confirm').setValue(true)
  await w.get('#account-action-form').trigger('submit')
  await flushPromises()
  expect(w.text()).toContain('Account action completed.')
  expect(w.text()).toContain('Unable to load data.')
  expect(w.text()).not.toContain('Views refreshed from the server.')
  expect(w.find('#account-action-form').exists()).toBe(false)
})

it('exposes the selected account identity and filters its audit without manual ID transcription', async () => {
  rest.accounts.mockResolvedValue({ items: [account], nextCursor: null })
  rest.account.mockResolvedValue(account)
  const w = await open()
  await w.get('[data-testid="account-user-a"]').trigger('click')
  await flushPromises()
  expect(w.get('[aria-label="Account details"]').text()).toContain('Account ID: user-a')
  await w.get('[data-testid="account-audit"]').trigger('click')
  await flushPromises()
  expect(rest.audit).toHaveBeenLastCalledWith({ userId: account.id, limit: 20 })
  expect((w.get('#audit-user').element as HTMLInputElement).value).toBe(account.id)
})

it('discards confirmation entered while selected venue evidence is being refreshed', async () => {
  const pending = deferred<Page<PlatformVenue>>()
  rest.accounts.mockResolvedValue({ items: [account], nextCursor: null })
  rest.account.mockResolvedValue({ ...account, role: 'MERCHANT' })
  rest.venues
    .mockResolvedValueOnce({
      items: [{ id: 'stall-a', name: 'Original stall', merchantName: 'M', address: 'A' }],
      nextCursor: 'next-page',
    })
    .mockReturnValueOnce(pending.promise)
  const w = await open()
  await w.get('[data-testid="account-user-a"]').trigger('click')
  await flushPromises()
  await w.get('#account-action').setValue('grant')
  await w.get('#venue-search-form').trigger('submit')
  await flushPromises()
  await w.get('#venue-choice').setValue('stall-a')
  await w.get('[data-testid="more-venues"]').trigger('click')
  await w.get('#account-note').setValue('Note against old address')
  await w.get('#account-confirm').setValue(true)
  pending.resolve({
    items: [{ id: 'stall-a', name: 'Updated stall', merchantName: 'M', address: 'B' }],
    nextCursor: null,
  })
  await flushPromises()
  expect((w.get('#account-note').element as HTMLTextAreaElement).value).toBe('')
  expect((w.get('#account-confirm').element as HTMLInputElement).checked).toBe(false)
})

it('does not resurrect a previous session request after sign-in and a failed request reload', async () => {
  rest.requests
    .mockResolvedValueOnce({ items: [requestA], nextCursor: null })
    .mockRejectedValue(new Error('Synthetic reload failure'))
  rest.reviewRequest.mockRejectedValueOnce(
    new ApiClientError('UNAUTHORIZED', 401, 'Sign in required'),
  )
  rest.signIn.mockResolvedValue({ error: null })
  const w = await open()
  await w.get('[data-testid="request-request-a"]').trigger('click')
  await w.get('#request-note').setValue('Old session evidence')
  await w.get('#request-confirm').setValue(true)
  await w.get('#request-form').trigger('submit')
  await flushPromises()
  await w.get('#admin-email').setValue('synthetic@example.test')
  await w.get('#admin-password').setValue('synthetic-not-a-real-password')
  await w.get('main form').trigger('submit')
  await flushPromises()
  expect(w.text()).toContain('Unable to load data.')
  expect(w.find('[aria-label="Request details"]').exists()).toBe(false)
})

it.each(['list', 'detail'] as const)(
  'remembers highest %s versions across account pagination and filter transitions',
  async (source) => {
    const newer = { ...account, version: 8 }
    const other = { ...account, id: 'user-b', name: 'Bob' }
    rest.accounts.mockResolvedValueOnce({
      items: [source === 'list' ? newer : account, other],
      nextCursor: 'next-page',
    })
    rest.account
      .mockResolvedValueOnce(source === 'detail' ? newer : account)
      .mockImplementation(({ userId }) => Promise.resolve(userId === other.id ? other : account))
    const w = await open()
    await w.get('[data-testid="account-user-a"]').trigger('click')
    await flushPromises()
    await w.get('[data-testid="account-user-b"]').trigger('click')
    await flushPromises()
    rest.accounts.mockResolvedValueOnce({ items: [account], nextCursor: null })
    await w.get('[data-testid="more-accounts"]').trigger('click')
    await flushPromises()
    await w.get('[data-testid="account-user-a"]').trigger('click')
    await flushPromises()
    await w.get('#new-role').setValue('MERCHANT')
    await w.get('#account-note').setValue('Older paginated account')
    await w.get('#account-confirm').setValue(true)
    await w.get('#account-action-form').trigger('submit')
    expect(rest.changeRole).not.toHaveBeenCalled()
    rest.accounts.mockResolvedValueOnce({ items: [other], nextCursor: null })
    await w.get('#account-search').setValue('Bob')
    await w.get('#account-search-form').trigger('submit')
    await flushPromises()
    await w.get('[data-testid="account-user-b"]').trigger('click')
    await flushPromises()
    rest.accounts.mockResolvedValueOnce({ items: [account], nextCursor: null })
    await w.get('#account-search').setValue('Alice')
    await w.get('#account-search-form').trigger('submit')
    await flushPromises()
    await w.get('[data-testid="account-user-a"]').trigger('click')
    await flushPromises()
    await w.get('#new-role').setValue('MERCHANT')
    await w.get('#account-note').setValue('Older filtered account')
    await w.get('#account-confirm').setValue(true)
    expect(w.get('#account-action-form button[type="submit"]').attributes('disabled')).toBeDefined()
    await w.get('#account-action-form').trigger('submit')
    expect(rest.changeRole).not.toHaveBeenCalled()
  },
)

it('ignores version evidence from a superseded account filter response', async () => {
  const superseded = deferred<Page<PlatformAccountSummary>>()
  rest.accounts.mockResolvedValue({ items: [account], nextCursor: null })
  rest.account.mockResolvedValue({ ...account, version: 8 })
  const w = await open()
  rest.accounts
    .mockReturnValueOnce(superseded.promise)
    .mockResolvedValueOnce({ items: [{ ...account, version: 8 }], nextCursor: null })
  await w.get('#account-search').setValue('old')
  await w.get('#account-search-form').trigger('submit')
  await w.get('#account-search').setValue('current')
  await w.get('#account-search-form').trigger('submit')
  await flushPromises()
  superseded.resolve({ items: [{ ...account, version: 99 }], nextCursor: null })
  await flushPromises()
  await w.get('[data-testid="account-user-a"]').trigger('click')
  await flushPromises()
  await w.get('#new-role').setValue('MERCHANT')
  await w.get('#account-note').setValue('Current accepted evidence')
  await w.get('#account-confirm').setValue(true)
  await w.get('#account-action-form').trigger('submit')
  expect(rest.changeRole).toHaveBeenCalledExactlyOnceWith(account.id, {
    expectedVersion: 8,
    role: 'MERCHANT',
    note: 'Current accepted evidence',
  })
})

it('does not let a late older list invalidate newer reviewed detail', async () => {
  rest.accounts.mockResolvedValue({ items: [account], nextCursor: null })
  rest.account.mockResolvedValue({ ...account, version: 8, role: 'MERCHANT' })
  const w = await open()
  await w.get('[data-testid="account-user-a"]').trigger('click')
  await flushPromises()
  const late = deferred<Page<PlatformAccountSummary>>()
  rest.accounts.mockReturnValueOnce(late.promise)
  await w.get('#account-search-form').trigger('submit')
  await w.get('[data-testid="reload-account"]').trigger('click')
  await flushPromises()
  await w.get('#new-role').setValue('MODERATOR')
  await w.get('#account-note').setValue('Reviewed version eight')
  await w.get('#account-confirm').setValue(true)
  late.resolve({ items: [account], nextCursor: null })
  await flushPromises()
  expect((w.get('#account-note').element as HTMLTextAreaElement).value).toBe(
    'Reviewed version eight',
  )
  expect(w.get('#account-action-form button[type="submit"]').attributes('disabled')).toBeUndefined()
  await w.get('#account-action-form').trigger('submit')
  expect(rest.changeRole).toHaveBeenCalledExactlyOnceWith(account.id, {
    expectedVersion: 8,
    role: 'MODERATOR',
    note: 'Reviewed version eight',
  })
})

it('keeps a deferred old detail locked after a newer account list arrives', async () => {
  const old = deferred<PlatformAccountResponse>()
  rest.accounts.mockResolvedValue({ items: [account], nextCursor: null })
  rest.account.mockResolvedValueOnce(account).mockReturnValueOnce(old.promise)
  const w = await open()
  await w.get('[data-testid="account-user-a"]').trigger('click')
  await flushPromises()
  await w.get('[data-testid="reload-account"]').trigger('click')
  rest.accounts.mockResolvedValue({ items: [{ ...account, version: 8 }], nextCursor: null })
  await w.get('#account-search-form').trigger('submit')
  await flushPromises()
  old.resolve(account)
  await flushPromises()
  await w.get('#new-role').setValue('MERCHANT')
  await w.get('#account-note').setValue('Old version returned after newer list')
  await w.get('#account-confirm').setValue(true)
  expect(w.get('#account-action-form button[type="submit"]').attributes('disabled')).toBeDefined()
  await w.get('#account-action-form').trigger('submit')
  expect(rest.changeRole).not.toHaveBeenCalled()
  expect(w.get('[aria-label="Account details"]').text()).toContain('Reload the account')

  rest.account.mockResolvedValue({ ...account, version: 8 })
  await w.get('[data-testid="reload-account"]').trigger('click')
  await flushPromises()
  expect((w.get('#account-note').element as HTMLTextAreaElement).value).toBe('')
  expect((w.get('#account-confirm').element as HTMLInputElement).checked).toBe(false)
  await w.get('#new-role').setValue('MERCHANT')
  await w.get('#account-note').setValue('Reviewed current detail')
  await w.get('#account-confirm').setValue(true)
  await w.get('#account-action-form').trigger('submit')
  await flushPromises()
  expect(rest.changeRole).toHaveBeenCalledExactlyOnceWith(account.id, {
    expectedVersion: 8,
    role: 'MERCHANT',
    note: 'Reviewed current detail',
  })
})

it('invalidates selected account actions when a list fetch reveals changed version evidence', async () => {
  rest.accounts
    .mockResolvedValueOnce({ items: [account], nextCursor: null })
    .mockResolvedValue({ items: [{ ...account, version: 8 }], nextCursor: null })
  rest.account.mockResolvedValue(account)
  const w = await open()
  await w.get('[data-testid="account-user-a"]').trigger('click')
  await flushPromises()
  await w.get('#new-role').setValue('MERCHANT')
  await w.get('#account-note').setValue('Old detail evidence')
  await w.get('#account-confirm').setValue(true)
  await w.get('#account-search-form').trigger('submit')
  await flushPromises()
  expect((w.get('#account-note').element as HTMLTextAreaElement).value).toBe('')
  expect((w.get('#account-confirm').element as HTMLInputElement).checked).toBe(false)
  await w.get('#account-note').setValue('Cannot reuse old detail')
  await w.get('#account-confirm').setValue(true)
  await w.get('#account-action-form').trigger('submit')
  await flushPromises()
  expect(rest.changeRole).not.toHaveBeenCalled()
})
