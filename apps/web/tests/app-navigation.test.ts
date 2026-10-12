import { flushPromises, mount } from '@vue/test-utils'
import App from '@web/App.vue'
import routes from '@web/router/routes'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

const rest = vi.hoisted(() => ({ list: vi.fn().mockResolvedValue({ items: [], categories: [] }) }))
vi.mock('@web/lib/api-client', () => ({ api: { deals: { list: rest.list } } }))

// Synthetic signed-out session: these tests cover the shell, not authentication.
vi.mock('@web/lib/auth-client', () => ({
  authClient: { useSession: () => ref({ data: null, isPending: false }), signOut: vi.fn() },
}))

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes,
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, {
    global: {
      plugins: [router],
      // Leaflet needs a real layout engine; the map component is covered by the browser suite.
      stubs: { DealMap: true },
    },
  })
  return { router, wrapper }
}

describe('starter navigation', () => {
  it('lands on the full-bleed browse map', async () => {
    const { wrapper } = await mountAt('/')

    expect(wrapper.find('.site-canvas').exists()).toBe(true)
    expect(wrapper.find('[data-testid="browse-canvas"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="panel-toggle"]').text()).toBe('Show list')
  })

  it('navigates to the developer setup page from the header', async () => {
    const { router, wrapper } = await mountAt('/')

    await wrapper.get('[data-testid="nav-toggle"]').trigger('click')
    await wrapper.get('[data-testid="nav-menu"] a[href="/getting-started"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/getting-started')
    expect(wrapper.get('h1').text()).toBe('Getting started')
  })

  it('renders a useful 404 page for unknown routes', async () => {
    const { wrapper } = await mountAt('/not-a-real-page')

    expect(wrapper.get('h1').text()).toBe('Page not found')
    expect(wrapper.text()).toContain('The page you requested does not exist.')
    expect(wrapper.get('main a[href="/"]').text()).toContain('Return home')
  })
})
