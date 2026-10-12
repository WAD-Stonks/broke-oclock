export type SiteNavLink = Readonly<{ label: string; to: string }>

export const SITE_MENU_ID = 'site-menu'

export const SITE_NAV_LINKS: readonly SiteNavLink[] = Object.freeze([
  { label: 'Browse', to: '/' },
  { label: 'Deals', to: '/deals' },
  { label: 'Submission Form', to: '/submit-deal' },
  { label: 'Getting started', to: '/getting-started' },
  { label: 'Admin overview', to: '/admin' },
  { label: 'Platform admin', to: '/admin/accounts' },
  { label: 'Ingestion admin', to: '/admin/ingestion' },
])
