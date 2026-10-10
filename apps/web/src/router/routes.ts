import GettingStartedPage from '@web/pages/GettingStartedPage.vue'
import HomePage from '@web/pages/HomePage.vue'
import IngestionAdminPage from '@web/pages/IngestionAdminPage.vue'
import NotFoundPage from '@web/pages/NotFoundPage.vue'
import PlatformAdminPage from '@web/pages/PlatformAdminPage.vue'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  ...(import.meta.env.MODE === 'development'
    ? [
        {
          path: '/community-demo',
          name: 'community-demo',
          component: () => import('@web/pages/CommunityDemoPage.vue'),
        },
      ]
    : []),
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
  {
    path: '/admin/community',
    name: 'community-moderation',
    component: () => import('@web/modules/community/ModerationQueue.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: NotFoundPage,
  },
]

export default routes
