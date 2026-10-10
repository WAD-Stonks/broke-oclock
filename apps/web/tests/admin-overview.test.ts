import { flushPromises, mount } from '@vue/test-utils'
import App from '@web/App.vue'
import { ApiClientError } from '@web/lib/api-client'
import routes from '@web/router/routes'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

// Synthetic REST/native boundaries: SPA projection and races, not live authentication.
const rest = vi.hoisted(() => ({
  overview: vi.fn(),
  session: vi.fn(),
  signOut: vi.fn(),
  methods: vi.fn(),
}))
vi.mock('@web/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  },
  api: {
    platformAdmin: { overview: rest.overview },
    infrastructure: { authMethods: rest.methods },
  },
}))
vi.mock('@web/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ value: { refetch: async () => {}, error: null } }),
    getSession: rest.session,
    signOut: rest.signOut,
  },
}))
const overview = {
  generatedAt: '2026-10-10T00:00:00Z',
  counts: { pendingMerchantRequests: 3, pendingImportedDrafts: 5, failedImportedPosts: 7 },
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
beforeEach(() => {
  vi.resetAllMocks()
  rest.overview.mockResolvedValue(overview)
  rest.session.mockResolvedValue({
    data: { user: { name: 'Synthetic operator', email: 'operator@example.test', role: 'USER' } },
    error: null,
  })
  rest.signOut.mockResolvedValue({ data: { success: true }, error: null })
  rest.methods.mockResolvedValue({
    password: true,
    google: false,
    emailOtp: false,
    passwordRecovery: false,
  })
})
async function open() {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/admin')
  const w = mount(App, { global: { plugins: [router] } })
  await flushPromises()
  return w
}
it('renders protected operational counts and exact actionable links without live-readiness claims', async () => {
  const w = await open()
  expect(w.get('h1').text()).toBe('Admin overview')
  expect(
    w.get('a[href="/admin/accounts?requestStatus=PENDING#merchant-requests"]').text(),
  ).toContain('3')
  expect(w.get('a[href="/admin/ingestion?status=PENDING#queue-title"]').text()).toContain('5')
  expect(w.find('a[href="/admin/ingestion#runs-title"]').exists()).toBe(true)
  expect(w.text()).toContain('Failed imported posts: 7')
  expect(w.text()).toContain('NOT_ESTABLISHED')
  expect(w.text()).toContain('not publisher permission')
  expect(w.text()).toContain('No ingestion runs yet')
  w.unmount()
})
it('shows sign-in on confirmed absent native identity without a protected read', async () => {
  rest.session.mockResolvedValue({ data: null, error: null })
  const w = await open()
  expect(w.text()).toContain('Sign in to view administration')
  expect(rest.overview).not.toHaveBeenCalled()
  w.unmount()
})
it('keeps failed logout closed and fences an old overview read', async () => {
  let release!: (value: typeof overview) => void
  rest.overview.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  rest.signOut.mockRejectedValueOnce(new Error('synthetic timeout'))
  const w = await open()
  await w.get('[data-testid="admin-sign-out"]').trigger('click')
  await flushPromises()
  release(overview)
  await flushPromises()
  expect(w.text()).toContain('Server sign-out could not be confirmed')
  expect(w.find('a[href="/admin/accounts?requestStatus=PENDING#merchant-requests"]').exists()).toBe(
    false,
  )
  expect(w.find('input[type="password"]').exists()).toBe(false)
  w.unmount()
})

it('shows safe read errors without fallback zero counts and recovers only through a fresh read', async () => {
  rest.overview.mockRejectedValueOnce(new Error('private provider fixture'))
  const w = await open()
  expect(w.text()).toContain('Counts are unavailable')
  expect(w.text()).not.toContain('private provider fixture')
  expect(w.find('a[href="/admin/accounts?requestStatus=PENDING#merchant-requests"]').exists()).toBe(
    false,
  )
  await w.get('button.btn-outline-primary').trigger('click')
  await flushPromises()
  expect(rest.overview).toHaveBeenCalledTimes(2)
  expect(w.text()).toContain('Pending merchant requests: 3')
  w.unmount()
})
it('keeps native identity and logout visible in a protected forbidden state', async () => {
  rest.overview.mockRejectedValueOnce(new ApiClientError('FORBIDDEN', 403, 'Forbidden'))
  const w = await open()
  expect(w.text()).toContain('You do not have permission')
  expect(w.text()).toContain('operator@example.test')
  expect(w.find('[data-testid="admin-sign-out"]').exists()).toBe(true)
  expect(w.find('input[type="password"]').exists()).toBe(false)
  w.unmount()
})
it('requires deliberate fresh-session and protected-read reload after an uncertain logout', async () => {
  rest.signOut.mockRejectedValueOnce(new Error('synthetic timeout'))
  const w = await open()
  await w.get('[data-testid="admin-sign-out"]').trigger('click')
  await flushPromises()
  expect(w.find('a[href="/admin/accounts?requestStatus=PENDING#merchant-requests"]').exists()).toBe(
    false,
  )
  const recheck = w.findAll('button').find((button) => button.text() === 'Recheck session')
  if (!recheck) throw new Error('Missing deliberate session recheck control')
  await recheck.trigger('click')
  await flushPromises()
  expect(rest.overview).toHaveBeenCalledTimes(1)
  expect(w.text()).toContain('Access remains closed')
  await w.get('[data-testid="admin-access-reload"]').trigger('click')
  await flushPromises()
  expect(rest.overview).toHaveBeenCalledTimes(2)
  expect(rest.session).toHaveBeenLastCalledWith({ query: { disableCookieCache: true } })
  expect(rest.signOut).toHaveBeenCalledTimes(1)
  w.unmount()
})
