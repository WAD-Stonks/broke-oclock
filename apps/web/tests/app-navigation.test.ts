import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '../src/App.vue'
import routes from '../src/router/routes'

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
    },
  })
  return { router, wrapper }
}

describe('starter navigation', () => {
  it('renders the honest home page copy', async () => {
    const { wrapper } = await mountAt('/')

    expect(wrapper.get('h1').text()).toBe('Student deals, less guesswork.')
    expect(wrapper.text()).toContain('Project starter — deal features are not implemented yet.')
    expect(wrapper.get('main a[href="/getting-started"]').text()).toContain(
      'Read the developer setup',
    )
  })

  it('navigates to the developer setup page from the header', async () => {
    const { router, wrapper } = await mountAt('/')

    await wrapper.get('[data-testid="primary-nav"] a[href="/getting-started"]').trigger('click')
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
