export type SiteNavLink = Readonly<{ label: string; to: string }>

export const SITE_TITLE = 'LoBangers'

export const SITE_MENU_ID = 'site-menu'

export const SITE_NAV_LINKS: readonly SiteNavLink[] = Object.freeze([
  { label: 'Home', to: '/' },
  { label: 'Browse', to: '/browse' },
  { label: 'Getting started', to: '/getting-started' },
  { label: 'Platform admin', to: '/admin/accounts' },
  { label: 'Ingestion admin', to: '/admin/ingestion' },
])
