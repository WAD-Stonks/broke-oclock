import { mount } from '@vue/test-utils'
import AdminShell from '@web/components/admin/AdminShell.vue'
import { expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

it.each(['/admin', '/admin/accounts', '/admin/ingestion'])(
  'marks only the current admin page at %s',
  async (path) => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/admin', component: AdminShell },
        { path: '/admin/accounts', component: AdminShell },
        { path: '/admin/ingestion', component: AdminShell },
      ],
    })
    await router.push(path)
    const wrapper = mount(AdminShell, {
      props: { title: 'Administration' },
      global: {
        plugins: [router],
        stubs: { AdminSessionControls: true },
      },
      slots: { default: '<p>Protected page content</p>' },
    })
    const current = wrapper.findAll('nav[aria-label="Administration"] a[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0]?.attributes('href')).toBe(path)
    expect(wrapper.get('h1').text()).toBe('Administration')
    expect(wrapper.text()).toContain('Protected page content')
    wrapper.unmount()
  },
)
