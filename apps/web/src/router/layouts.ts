import type { RouteMeta } from 'vue-router'

// `shell` wraps the page in the shared container with header clearance.
// `canvas` hands the whole viewport to the page so the floating header sits on top of it.
export type SiteLayout = 'shell' | 'canvas'

declare module 'vue-router' {
  interface RouteMeta {
    layout?: SiteLayout
  }
}

export const routeLayout = (route: { readonly meta: RouteMeta }): SiteLayout =>
  route.meta.layout ?? 'shell'
