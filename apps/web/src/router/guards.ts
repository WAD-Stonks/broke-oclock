import { authClient } from '@web/lib/auth-client'
import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** Visitor must be signed in. */
    requiresAuth?: boolean
    /** Signed-in users are bounced away (e.g. the login page). */
    guestOnly?: boolean
    /** If set, the signed-in user's role must be one of these. */
    roles?: readonly string[]
  }
}

// Only same-site paths: blocks https://evil.example and //evil.example open redirects.
export const safeRedirect = (value: unknown): string =>
  typeof value === 'string' &&
  value.startsWith('/') &&
  !value.startsWith('//') &&
  !value.includes('\\')
    ? value
    : '/'

// UX ONLY. The browser can be tampered with; the API (protectedProcedure and the
// database-backed role checks) is what actually enforces access.
export const authGuard = async (to: RouteLocationNormalized): Promise<true | RouteLocationRaw> => {
  const { requiresAuth, guestOnly, roles } = to.meta
  if (!requiresAuth && !guestOnly && !roles) return true

  let session: Awaited<ReturnType<typeof authClient.getSession>>['data'] = null
  try {
    session = (await authClient.getSession()).data
  } catch {
    // Network failure: treat as signed out; the API will still reject real calls.
  }

  if (guestOnly) return session ? safeRedirect(to.query.redirect) : true
  if (!session) return { name: 'login', query: { redirect: to.fullPath } }
  if (roles && !roles.includes(session.user.role)) return '/'
  return true
}
