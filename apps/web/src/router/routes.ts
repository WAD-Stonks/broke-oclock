import AdminOverviewPage from '@web/pages/AdminOverviewPage.vue'
import DealsPage from '@web/pages/DealsPage.vue'
import GettingStartedPage from '@web/pages/GettingStartedPage.vue'
import HomePage from '@web/pages/HomePage.vue'
import IngestionAdminPage from '@web/pages/IngestionAdminPage.vue'
import NotFoundPage from '@web/pages/NotFoundPage.vue'
import PlatformAdminPage from '@web/pages/PlatformAdminPage.vue'
import VenuePage from '@web/pages/VenuePage.vue'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  { path: '/admin', name: 'admin-overview', component: AdminOverviewPage },
  {
    path: '/',
    name: 'home',
    component: HomePage,
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
  { path: '/deals', name: 'deals', component: DealsPage },
  { path: '/venues/:venueId', name: 'venue', component: VenuePage },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: NotFoundPage,
  },
]

export default routes
