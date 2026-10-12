export type SiteNavLink = Readonly<{ label: string; to: string }>

export const SITE_TITLE = 'LoBangers'
// The brand renders as "Lo" plus a highlighted "Bangers"; together they spell SITE_TITLE.
export const SITE_BRAND = { lead: 'Lo', mark: 'Bangers' } as const

export const SITE_MENU_ID = 'site-menu'

export const SITE_NAV_LINKS: readonly SiteNavLink[] = Object.freeze([
  { label: 'Browse', to: '/' },
  { label: 'Getting started', to: '/getting-started' },
  { label: 'Admin overview', to: '/admin' },
  { label: 'Platform admin', to: '/admin/accounts' },
  { label: 'Ingestion admin', to: '/admin/ingestion' },
])
