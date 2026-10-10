import { authGuard, safeRedirect } from '@web/router/guards'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteLocationNormalized } from 'vue-router'

const getSession = vi.hoisted(() => vi.fn())
vi.mock('@web/lib/auth-client', () => ({ authClient: { getSession } }))

const to = (meta: RouteLocationNormalized['meta'], fullPath = '/me/submissions', query = {}) =>
  ({ meta, fullPath, query }) as unknown as RouteLocationNormalized

const signedIn = (role = 'USER') => getSession.mockResolvedValue({ data: { user: { role } } })
const signedOut = () => getSession.mockResolvedValue({ data: null })

describe('authGuard', () => {
  beforeEach(() => getSession.mockReset())

  it('lets public routes through without calling the API', async () => {
    expect(await authGuard(to({}))).toBe(true)
    expect(getSession).not.toHaveBeenCalled()
  })

  it('sends signed-out visitors to login and remembers where they were going', async () => {
    signedOut()
    expect(await authGuard(to({ requiresAuth: true }))).toEqual({
      name: 'login',
      query: { redirect: '/me/submissions' },
    })
  })

  it('treats a failed session lookup as signed out', async () => {
    getSession.mockRejectedValue(new Error('offline'))
    expect(await authGuard(to({ requiresAuth: true }))).toMatchObject({ name: 'login' })
  })

  it('allows signed-in users on protected routes', async () => {
    signedIn()
    expect(await authGuard(to({ requiresAuth: true }))).toBe(true)
  })

  it('blocks users whose role is not listed', async () => {
    signedIn('USER')
    expect(await authGuard(to({ requiresAuth: true, roles: ['ADMIN'] }))).toBe('/')
    signedIn('ADMIN')
    expect(await authGuard(to({ requiresAuth: true, roles: ['ADMIN'] }))).toBe(true)
  })

  it('bounces signed-in users off guest-only pages', async () => {
    signedIn()
    expect(await authGuard(to({ guestOnly: true }, '/login'))).toBe('/')
  })
})

describe('safeRedirect', () => {
  it('keeps same-site paths and rejects everything else', () => {
    expect(safeRedirect('/me/submissions?tab=1')).toBe('/me/submissions?tab=1')
    expect(safeRedirect('//evil.example')).toBe('/')
    expect(safeRedirect('https://evil.example')).toBe('/')
    expect(safeRedirect('/\\evil.example')).toBe('/')
    expect(safeRedirect(undefined)).toBe('/')
  })
})
