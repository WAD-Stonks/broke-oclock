import { flushPromises, mount } from '@vue/test-utils'
import App from '@web/App.vue'
import routes from '@web/router/routes'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const NAV = '[data-testid="primary-nav"]'
const TOGGLE = '[data-testid="nav-toggle"]'
const MENU = '[data-testid="nav-menu"]'

async function mountAt(path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, {
    attachTo: document.body,
    global: { plugins: [router], stubs: { DealMap: true } },
  })
  return { router, wrapper }
}

describe('site header pill', () => {
  it('shows the LoBangers title linking home and keeps the menu collapsed', async () => {
    const { wrapper } = await mountAt('/browse')

    const brand = wrapper.get(`${NAV} a[href="/"]`)
    expect(brand.text()).toBe('LoBangers')

    const toggle = wrapper.get(TOGGLE)
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('aria-controls')).toBe('site-menu')
    expect(toggle.attributes('aria-label')).toBe('Open menu')
    expect(wrapper.find(MENU).exists()).toBe(false)
    wrapper.unmount()
  })

  it('reveals every destination behind the hamburger', async () => {
    const { wrapper } = await mountAt('/')

    await wrapper.get(TOGGLE).trigger('click')

    const toggle = wrapper.get(TOGGLE)
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.attributes('aria-label')).toBe('Close menu')
    const menu = wrapper.get(MENU)
    expect(menu.attributes('id')).toBe('site-menu')
    const hrefs = menu.findAll('a').map((link) => link.attributes('href'))
    expect(hrefs).toEqual([
      '/',
      '/browse',
      '/getting-started',
      '/admin',
      '/admin/accounts',
      '/admin/ingestion',
    ])
    expect(menu.get('a[href="/"]').attributes('aria-current')).toBe('page')
    wrapper.unmount()
  })

  it('navigates from a menu link and collapses afterwards', async () => {
    const { router, wrapper } = await mountAt('/')

    await wrapper.get(TOGGLE).trigger('click')
    await wrapper.get(`${MENU} a[href="/browse"]`).trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/browse')
    expect(wrapper.find(MENU).exists()).toBe(false)
    expect(wrapper.get(TOGGLE).attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('closes on Escape and returns focus to the toggle', async () => {
    const { wrapper } = await mountAt('/')

    await wrapper.get(TOGGLE).trigger('click')
    expect(wrapper.find(MENU).exists()).toBe(true)

    await wrapper.get(MENU).trigger('keydown', { key: 'Escape' })

    expect(wrapper.find(MENU).exists()).toBe(false)
    expect(document.activeElement).toBe(wrapper.get(TOGGLE).element)
    wrapper.unmount()
  })

  it('closes when clicking outside the pill', async () => {
    const { wrapper } = await mountAt('/')

    await wrapper.get(TOGGLE).trigger('click')
    expect(wrapper.find(MENU).exists()).toBe(true)

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await flushPromises()

    expect(wrapper.find(MENU).exists()).toBe(false)
    wrapper.unmount()
  })
})
