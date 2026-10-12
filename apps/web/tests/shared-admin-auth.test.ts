import { flushPromises, mount } from '@vue/test-utils'
import AdminSessionControls from '@web/components/admin/AdminSessionControls.vue'
import AdminShell from '@web/components/admin/AdminShell.vue'
import SharedSignIn from '@web/components/auth/SharedSignIn.vue'
import { createAdminReadFence } from '@web/lib/admin-session'
import AdminSignIn from '@web/modules/ingestion-admin/AdminSignIn.vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

// Synthetic SDK/API boundaries only. No real identity, provider delivery or authorization proof.
const sdk = vi.hoisted(() => ({
  password: vi.fn(),
  social: vi.fn(),
  send: vi.fn(),
  redeem: vi.fn(),
  request: vi.fn(),
  reset: vi.fn(),
  session: vi.fn(),
  signOut: vi.fn(),
  methods: vi.fn(),
  renew: vi.fn(),
  nativeError: null as unknown,
}))
vi.mock('@web/lib/auth-client', () => ({
  authClient: {
    signIn: { email: sdk.password, social: sdk.social, emailOtp: sdk.redeem },
    emailOtp: {
      sendVerificationOtp: sdk.send,
      requestPasswordReset: sdk.request,
      resetPassword: sdk.reset,
    },
    getSession: sdk.session,
    useSession: () => ({
      value: {
        refetch: sdk.renew,
        get error() {
          return sdk.nativeError
        },
      },
    }),
    signOut: sdk.signOut,
  },
}))
vi.mock('@web/lib/api-client', () => ({ api: { infrastructure: { authMethods: sdk.methods } } }))
const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  vi.useRealTimers()
})
beforeEach(() => {
  vi.resetAllMocks()
  sdk.nativeError = null
  sdk.renew.mockResolvedValue(undefined)
  sdk.methods.mockResolvedValue({
    password: true,
    google: false,
    emailOtp: false,
    passwordRecovery: false,
  })
})
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Promise not initialized')
  }
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
it('keeps password usable when auth-method presentation fails and reports optional methods unavailable', async () => {
  sdk.methods.mockRejectedValue(new Error('synthetic unavailable'))
  sdk.password.mockResolvedValue({ error: null })
  const wrapper = mount(AdminSignIn)
  wrappers.push(wrapper)
  await flushPromises()
  expect(wrapper.text()).toContain('Other sign-in methods are unavailable')
  await wrapper.get('#admin-email').setValue('synthetic@example.test')
  await wrapper.get('#admin-password').setValue('synthetic-only-password')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(wrapper.emitted('signedIn')).toHaveLength(1)
  expect(wrapper.get<HTMLInputElement>('#admin-password').element.value).toBe('')
})
it('uses only enabled Google with trusted callback destinations and removes untrusted metadata', async () => {
  sdk.methods.mockResolvedValue({
    password: true,
    google: true,
    emailOtp: false,
    passwordRecovery: false,
  })
  window.history.replaceState(
    null,
    '',
    '/?error=access_denied&error_description=private&token=private&redirect=https://evil.test',
  )
  sdk.social.mockResolvedValue({ error: null })
  const wrapper = mount(SharedSignIn, { props: { destination: 'https://evil.test' } })
  wrappers.push(wrapper)
  await flushPromises()
  expect(wrapper.text()).toContain('Google sign-in could not be completed')
  expect(wrapper.text()).not.toContain('private')
  expect(window.location.search).toBe('')
  await wrapper.get('[data-testid="google-sign-in"]').trigger('click')
  await flushPromises()
  const callback = new URL('/', window.location.origin).href
  expect(sdk.social).toHaveBeenCalledWith({
    provider: 'google',
    callbackURL: callback,
    newUserCallbackURL: callback,
    errorCallbackURL: callback,
  })
  expect(wrapper.emitted('signedIn')).toBeUndefined()
})
it('binds a six digit sign-in code to email and prevents duplicate send and redemption', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  sdk.methods.mockResolvedValue({
    password: true,
    google: false,
    emailOtp: true,
    passwordRecovery: true,
  })
  const send = deferred<{ error: null }>()
  sdk.send.mockReturnValue(send.promise)
  const redeem = deferred<{ error: null }>()
  sdk.redeem.mockReturnValue(redeem.promise)
  const wrapper = mount(SharedSignIn)
  wrappers.push(wrapper)
  await flushPromises()
  await wrapper.get('#admin-email').setValue('synthetic@example.test')
  await wrapper.get('[data-testid="otp-send"]').trigger('click')
  await wrapper.get('[data-testid="otp-send"]').trigger('click')
  expect(sdk.send).toHaveBeenCalledTimes(1)
  expect(sdk.send).toHaveBeenCalledWith({ email: 'synthetic@example.test', type: 'sign-in' })
  send.resolve({ error: null })
  await flushPromises()
  const code = wrapper.get<HTMLInputElement>('[autocomplete="one-time-code"]')
  expect(code.attributes('type')).toBe('text')
  expect(code.attributes('inputmode')).toBe('numeric')
  await code.setValue('012345')
  await wrapper.get('[data-testid="otp-form"]').trigger('submit')
  await wrapper.get('[data-testid="otp-form"]').trigger('submit')
  expect(sdk.redeem).toHaveBeenCalledTimes(1)
  expect(sdk.redeem).toHaveBeenCalledWith({ email: 'synthetic@example.test', otp: '012345' })
  redeem.resolve({ error: null })
  await flushPromises()
  expect(wrapper.emitted('signedIn')).toHaveLength(1)
  expect(code.element.value).toBe('')
})
it('invalidates pending OTP results when email changes and hides disabled methods', async () => {
  sdk.methods.mockResolvedValue({
    password: true,
    google: false,
    emailOtp: true,
    passwordRecovery: false,
  })
  const pending = deferred<{ error: null }>()
  sdk.send.mockReturnValue(pending.promise)
  const wrapper = mount(SharedSignIn)
  wrappers.push(wrapper)
  await flushPromises()
  expect(wrapper.find('[data-testid="google-sign-in"]').exists()).toBe(false)
  await wrapper.get('#admin-email').setValue('first@example.test')
  await wrapper.get('[data-testid="otp-send"]').trigger('click')
  await wrapper.get('#admin-email').setValue('second@example.test')
  pending.resolve({ error: null })
  await flushPromises()
  expect(wrapper.find('[autocomplete="one-time-code"]').exists()).toBe(false)
  expect(wrapper.emitted('signedIn')).toBeUndefined()
})
it('completes native purpose-bound password recovery then returns to sign-in without granting access', async () => {
  sdk.methods.mockResolvedValue({
    password: true,
    google: false,
    emailOtp: true,
    passwordRecovery: true,
  })
  sdk.request.mockResolvedValue({ error: null })
  sdk.reset.mockResolvedValue({ error: null })
  const wrapper = mount(SharedSignIn)
  wrappers.push(wrapper)
  await flushPromises()
  await wrapper.get('[data-testid="recovery-open"]').trigger('click')
  await wrapper.get('#recovery-email').setValue('synthetic@example.test')
  await wrapper.get('[data-testid="recovery-request"]').trigger('submit')
  await flushPromises()
  expect(sdk.request).toHaveBeenCalledWith({ email: 'synthetic@example.test' })
  await wrapper.get('#recovery-code').setValue('012345')
  await wrapper.get('#recovery-password').setValue('synthetic-reset-password')
  await wrapper.get('[data-testid="recovery-reset"]').trigger('submit')
  await flushPromises()
  expect(sdk.reset).toHaveBeenCalledWith({
    email: 'synthetic@example.test',
    otp: '012345',
    password: 'synthetic-reset-password',
  })
  expect(wrapper.text()).toContain('Password reset. Sign in again')
  expect(wrapper.find('#admin-password').exists()).toBe(true)
  expect(wrapper.emitted('signedIn')).toBeUndefined()
})
it('closes synchronously before logout, ignores late session reads and requires deliberate access reload on uncertainty', async () => {
  const helper = await import('@web/lib/admin-session')
  expect('createAdminSession' in helper).toBe(true)
  const closing = vi.fn()
  const signedOut = vi.fn()
  const accessReload = vi.fn()
  const state = helper.createAdminSession({ closing, signedOut, accessReload })
  const old = deferred<{ data: { user: { email: string } }; error: null }>()
  const logout = deferred<{ data: { success: boolean }; error: null }>()
  sdk.session.mockReturnValue(old.promise)
  sdk.signOut.mockReturnValue(logout.promise)
  const read = state.refresh()
  const exiting = state.signOut()
  expect(closing).toHaveBeenCalledTimes(1)
  expect(state.session.value).toBeNull()
  old.resolve({ data: { user: { email: 'late@example.test' } }, error: null })
  await read
  expect(state.session.value).toBeNull()
  logout.resolve({ data: { success: false }, error: null })
  await exiting
  expect(signedOut).not.toHaveBeenCalled()
  expect(accessReload).not.toHaveBeenCalled()
  expect(state.notice.value).toContain('Server sign-out could not be confirmed')
  sdk.session.mockResolvedValue({
    data: { user: { email: 'active@example.test', name: 'Synthetic identity' } },
    error: null,
  })
  await state.refresh()
  expect(state.notice.value).toContain('session is still active')
  expect(accessReload).not.toHaveBeenCalled()
  state.requestAccessReload()
  expect(accessReload).toHaveBeenCalledTimes(1)
  sdk.signOut.mockResolvedValue({ data: { success: true }, error: null })
  await state.signOut()
  expect(signedOut).toHaveBeenCalledTimes(1)
  state.dispose()
})
it('fails closed on unknown session and invalidates callbacks after disposal', async () => {
  const helper = await import('@web/lib/admin-session')
  expect('createAdminSession' in helper).toBe(true)
  const closing = vi.fn()
  const signedOut = vi.fn()
  const accessReload = vi.fn()
  const state = helper.createAdminSession({ closing, signedOut, accessReload })
  sdk.session.mockRejectedValue(new Error('private synthetic SDK details'))
  await state.refresh()
  expect(closing).toHaveBeenCalledTimes(1)
  expect(state.session.value).toBeNull()
  expect(state.notice.value).not.toContain('private')
  const pending = deferred<{ data: { success: boolean }; error: null }>()
  sdk.signOut.mockReturnValue(pending.promise)
  const exiting = state.signOut()
  state.dispose()
  pending.resolve({ data: { success: true }, error: null })
  await exiting
  expect(signedOut).not.toHaveBeenCalled()
})
it('renders the shell slot and native identity even for forbidden content, forwarding logout events', async () => {
  sdk.session.mockResolvedValue({
    data: { user: { name: 'Synthetic staff', email: 'staff@example.test', role: 'USER' } },
    error: null,
  })
  const logout = deferred<{ data: { success: boolean }; error: null }>()
  sdk.signOut.mockReturnValue(logout.promise)
  const wrapper = mount(AdminShell, {
    props: { title: 'Synthetic administration' },
    slots: { default: '<p>Forbidden by server</p>' },
  })
  wrappers.push(wrapper)
  await flushPromises()
  expect(wrapper.get('h1').text()).toBe('Synthetic administration')
  expect(wrapper.text()).toContain('Forbidden by server')
  expect(wrapper.text()).toContain('staff@example.test')
  expect(wrapper.findAll('nav a').map((link) => link.attributes('href'))).toEqual([
    '/admin',
    '/admin/accounts',
    '/admin/ingestion',
  ])
  await wrapper.get('[data-testid="admin-sign-out"]').trigger('click')
  await wrapper.get('[data-testid="admin-sign-out"]').trigger('click')
  expect(sdk.signOut).toHaveBeenCalledTimes(1)
  expect(wrapper.emitted('closing')).toHaveLength(1)
  expect(wrapper.emitted('signedOut')).toBeUndefined()
  logout.resolve({ data: { success: true }, error: null })
  await flushPromises()
  expect(wrapper.emitted('signedOut')).toHaveLength(1)
})
it('fences superseded protected reads and disposal without ever inferring permission', () => {
  const fence = createAdminReadFence()
  const old = fence.begin()
  const fresh = fence.begin()
  expect(fence.current(old)).toBe(false)
  expect(fence.current(fresh)).toBe(true)
  fence.invalidate()
  expect(fence.current(fresh)).toBe(false)
  const disposed = fence.begin()
  fence.dispose()
  expect(fence.current(disposed)).toBe(false)
  expect(fence.current(fence.begin())).toBe(false)
})
it('keeps recovery closed after changing mailbox during the native request', async () => {
  sdk.methods.mockResolvedValue({
    password: true,
    google: false,
    emailOtp: true,
    passwordRecovery: true,
  })
  const request = deferred<{ error: null }>()
  sdk.request.mockReturnValue(request.promise)
  const wrapper = mount(SharedSignIn)
  wrappers.push(wrapper)
  await flushPromises()
  await wrapper.get('[data-testid="recovery-open"]').trigger('click')
  await wrapper.get('#recovery-email').setValue('first@example.test')
  await wrapper.get('[data-testid="recovery-request"]').trigger('submit')
  await wrapper.get('#recovery-email').setValue('second@example.test')
  request.resolve({ error: null })
  await flushPromises()
  expect(wrapper.find('#recovery-code').exists()).toBe(false)
  expect(wrapper.emitted('signedIn')).toBeUndefined()
})
it('characterization: does not emit a late password success after unmount', async () => {
  const pending = deferred<{ error: null }>()
  sdk.password.mockReturnValue(pending.promise)
  const wrapper = mount(AdminSignIn)
  wrappers.push(wrapper)
  await wrapper.get('#admin-email').setValue('synthetic@example.test')
  await wrapper.get('#admin-password').setValue('synthetic-only-password')
  await wrapper.get('form').trigger('submit')
  wrapper.unmount()
  pending.resolve({ error: null })
  await flushPromises()
  expect(wrapper.emitted('signedIn')).toBeUndefined()
})

it('native renewal completes before the fresh identity probe on component mount', async () => {
  const renewal = deferred<void>()
  sdk.renew.mockReturnValue(renewal.promise)
  sdk.session.mockResolvedValue({
    data: { user: { name: 'Fresh identity', email: 'fresh@example.test' } },
    error: null,
  })
  const wrapper = mount(AdminSessionControls)
  wrappers.push(wrapper)
  expect(sdk.renew).toHaveBeenCalledWith({ query: { disableCookieCache: true } })
  expect(sdk.session).not.toHaveBeenCalled()
  renewal.resolve(undefined)
  await flushPromises()
  expect(sdk.session).toHaveBeenCalledTimes(1)
  expect(wrapper.text()).toContain('fresh@example.test')
})
it('native renewal completion after confirmed logout cannot probe or reopen identity', async () => {
  const renewal = deferred<void>()
  sdk.renew.mockReturnValue(renewal.promise)
  sdk.signOut.mockResolvedValue({ data: { success: true }, error: null })
  sdk.session.mockResolvedValue({ data: { user: { email: 'late@example.test' } }, error: null })
  const wrapper = mount(AdminSessionControls)
  wrappers.push(wrapper)
  await wrapper.get('[data-testid="admin-sign-out"]').trigger('click')
  await flushPromises()
  expect(wrapper.emitted('closing')).toHaveLength(1)
  expect(wrapper.emitted('signedOut')).toHaveLength(1)
  renewal.resolve(undefined)
  await flushPromises()
  expect(sdk.session).not.toHaveBeenCalled()
  expect(wrapper.text()).not.toContain('late@example.test')
})
it('native renewal completion after unmount cannot start a fresh identity probe', async () => {
  const renewal = deferred<void>()
  sdk.renew.mockReturnValue(renewal.promise)
  sdk.session.mockResolvedValue({ data: { user: { email: 'late@example.test' } }, error: null })
  const wrapper = mount(AdminSessionControls)
  wrapper.unmount()
  renewal.resolve(undefined)
  await flushPromises()
  expect(sdk.session).not.toHaveBeenCalled()
})
it('native confirmed absence forwards anonymous after closing protected evidence', async () => {
  sdk.session.mockResolvedValue({ data: null, error: null })
  const wrapper = mount(AdminSessionControls)
  wrappers.push(wrapper)
  await flushPromises()
  expect(wrapper.emitted('closing')).toHaveLength(1)
  expect(wrapper.emitted('signedOut')).toHaveLength(1)
})
it('native atom error fails closed even when refetch resolves void', async () => {
  sdk.renew.mockImplementation(async () => {
    sdk.nativeError = new Error('private native failure')
  })
  sdk.session.mockResolvedValue({
    data: { user: { email: 'not-confirmed@example.test' } },
    error: null,
  })
  const wrapper = mount(AdminSessionControls)
  wrappers.push(wrapper)
  await flushPromises()
  expect(wrapper.emitted('closing')).toHaveLength(1)
  expect(sdk.session).not.toHaveBeenCalled()
  expect(wrapper.text()).toContain('Access remains closed')
  expect(wrapper.text()).not.toContain('private native failure')
  expect(wrapper.text()).not.toContain('not-confirmed@example.test')
})
