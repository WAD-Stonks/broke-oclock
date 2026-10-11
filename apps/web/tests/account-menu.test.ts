import { flushPromises, mount } from '@vue/test-utils'
import AccountMenu from '@web/components/AccountMenu.vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

// Synthetic auth client: these tests check the menu, not real authentication.
const auth = vi.hoisted(() => ({ useSession: vi.fn(), signOut: vi.fn() }))
vi.mock('@web/lib/auth-client', () => ({
  authClient: { useSession: auth.useSession, signOut: auth.signOut },
}))

const mountMenu = async (session: { data: { user: { name: string } } | null; isPending: boolean }) => {
  auth.useSession.mockReturnValue(ref(session))
  const stub = { render: () => h('div') }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/saved', '/login', '/register', '/me/submissions', '/me/merchant-access', '/me/profile'].map(
      (path) => ({ path, component: stub }),
    ),
  })
  await router.push('/saved')
  await router.isReady()
  const wrapper = mount(AccountMenu, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

const links = (wrapper: Awaited<ReturnType<typeof mountMenu>>['wrapper']) =>
  wrapper.findAll('a').map((link) => [link.text(), link.attributes('href')])

beforeEach(() => {
  vi.resetAllMocks()
})

describe('AccountMenu', () => {
  it('shows nothing while the session is loading', async () => {
    const { wrapper } = await mountMenu({ data: null, isPending: true })
    expect(wrapper.findAll('a')).toHaveLength(0)
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('offers Log in and Sign up to a signed-out visitor, and no account links', async () => {
    const { wrapper } = await mountMenu({ data: null, isPending: false })
    expect(links(wrapper)).toEqual([
      ['Log in', '/login'],
      ['Sign up', '/register'],
    ])
    expect(wrapper.find('[data-testid="log-out"]').exists()).toBe(false)
  })

  it('shows the account links, a profile link with the name, and Log out when signed in', async () => {
    const { wrapper } = await mountMenu({ data: { user: { name: 'Alice' } }, isPending: false })
    expect(links(wrapper)).toEqual([
      ['Saved', '/saved'],
      ['My submissions', '/me/submissions'],
      ['Merchant access', '/me/merchant-access'],
      ['Alice', '/me/profile'],
    ])
    expect(wrapper.find('[data-testid="signed-in-name"]').element.tagName).toBe('A')
    expect(wrapper.find('[data-testid="log-out"]').exists()).toBe(true)
  })

  it('renders a hostile name as text, not markup', async () => {
    const { wrapper } = await mountMenu({
      data: { user: { name: '<img src=x onerror=alert(1)>' } },
      isPending: false,
    })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('[data-testid="signed-in-name"]').text()).toBe('<img src=x onerror=alert(1)>')
  })

  it('signs out and goes home when Log out is clicked', async () => {
    auth.signOut.mockResolvedValue({ data: { success: true }, error: null })
    const { wrapper, router } = await mountMenu({ data: { user: { name: 'Alice' } }, isPending: false })
    expect(router.currentRoute.value.fullPath).toBe('/saved')
    await wrapper.find('[data-testid="log-out"]').trigger('click')
    await flushPromises()
    expect(auth.signOut).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.fullPath).toBe('/')
  })
})
