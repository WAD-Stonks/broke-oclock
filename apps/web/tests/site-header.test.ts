import { flushPromises, mount } from '@vue/test-utils'
import SiteHeader from '@web/components/SiteHeader.vue'
import { expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mocks = vi.hoisted(() => ({ useSession: vi.fn() }))
vi.mock('@web/lib/auth-client', () => ({ authClient: mocks }))

it('shows community reports only for authenticated staff and removes it on sign-out', async () => {
  const session = ref<{
    data: { user: { role: string } } | null
    isPending: boolean
    error: object | null
  }>({ data: null, isPending: true, error: null })
  mocks.useSession.mockReturnValue(session)
  const wrapper = mount(SiteHeader, {
    global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } },
  })
  const link = () => wrapper.find('a[href="/admin/community"]')
  expect(link().exists()).toBe(false)
  for (const role of ['USER', 'MERCHANT', 'MODERATOR', 'ADMIN']) {
    session.value = { data: { user: { role } }, isPending: false, error: null }
    await flushPromises()
    expect(link().exists()).toBe(role === 'MODERATOR' || role === 'ADMIN')
  }
  session.value = { data: { user: { role: 'ADMIN' } }, isPending: false, error: { status: 401 } }
  await flushPromises()
  expect(link().exists()).toBe(false)
  session.value = { data: null, isPending: false, error: null }
  await flushPromises()
  expect(link().exists()).toBe(false)
  wrapper.unmount()
})
