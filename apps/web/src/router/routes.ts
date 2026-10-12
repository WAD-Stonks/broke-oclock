import AdminOverviewPage from '@web/pages/AdminOverviewPage.vue'
import BrowsePage from '@web/pages/BrowsePage.vue'
import GettingStartedPage from '@web/pages/GettingStartedPage.vue'
import IngestionAdminPage from '@web/pages/IngestionAdminPage.vue'
import NotFoundPage from '@web/pages/NotFoundPage.vue'
import PlatformAdminPage from '@web/pages/PlatformAdminPage.vue'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/admin', name: 'admin-overview', component: AdminOverviewPage },
  {
    // The deal map is the landing page.
    path: '/',
    name: 'browse',
    component: BrowsePage,
    meta: { layout: 'canvas' },
  },
  {
    // Older links and bookmarks still reach the map.
    path: '/browse',
    redirect: { name: 'browse' },
  },
  {
    path: '/getting-started',
    name: 'getting-started',
    component: GettingStartedPage,
  },
  {
    path: '/admin/ingestion',
    name: 'ingestion-admin',
    component: IngestionAdminPage,
  },
  { path: '/admin/accounts', name: 'platform-admin', component: PlatformAdminPage },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: NotFoundPage,
  },
]

export default routes
