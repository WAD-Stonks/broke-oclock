import { authGuard } from '@web/router/guards'
import routes from '@web/router/routes'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

// Synthetic identity boundary; the actual route assembly and guard run unchanged.
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@web/lib/auth-client', () => ({ authClient: { getSession } }))

beforeEach(() => getSession.mockReset())

function createSubmissionRouter() {
  const router = createRouter({ history: createMemoryHistory(), routes })
  router.beforeEach(authGuard)
  return router
}

describe('protected local submission route', () => {
  it('keeps the current browse map and legacy browse redirect alongside the prototype', () => {
    const router = createSubmissionRouter()
    expect(router.resolve('/').name).toBe('browse')
    expect(router.resolve('/').meta.layout).toBe('canvas')
    expect(router.resolve('/browse').matched[0]?.redirect).toEqual({ name: 'browse' })
    expect(router.resolve('/submit-deal').name).toBe('submit-deal')
    expect(router.resolve('/submit-deal').meta.requiresAuth).toBe(true)
    expect(router.resolve('/submissionform').name).toBe('not-found')
  })

  it('redirects a signed-out submit visitor to login with the exact destination', async () => {
    getSession.mockResolvedValue({ data: null })
    const router = createSubmissionRouter()
    await router.push('/submit-deal')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/submit-deal')
  })

  it('lets a signed-in visitor reach the same protected prototype', async () => {
    getSession.mockResolvedValue({ data: { user: { role: 'USER' } } })
    const router = createSubmissionRouter()
    await router.push('/submit-deal')
    expect(router.currentRoute.value.name).toBe('submit-deal')
    expect(router.currentRoute.value.meta.requiresAuth).toBe(true)
  })
})
