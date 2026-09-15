import type { RouteRecordRaw } from 'vue-router'
import GettingStartedPage from '../pages/GettingStartedPage.vue'
import HomePage from '../pages/HomePage.vue'
import NotFoundPage from '../pages/NotFoundPage.vue'

const routes: RouteRecordRaw[] = [
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
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: NotFoundPage,
  },
]

export default routes
