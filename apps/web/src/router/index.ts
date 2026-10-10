import { authGuard } from '@web/router/guards'
import routes from '@web/router/routes'
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes,
})
router.beforeEach(authGuard)

export default router
