import ForgotPasswordPage from '@web/pages/ForgotPasswordPage.vue'
import GettingStartedPage from '@web/pages/GettingStartedPage.vue'
import HomePage from '@web/pages/HomePage.vue'
import IngestionAdminPage from '@web/pages/IngestionAdminPage.vue'
import LoginPage from '@web/pages/LoginPage.vue'
import MerchantAccessPage from '@web/pages/MerchantAccessPage.vue'
import MySubmissionsPage from '@web/pages/MySubmissionsPage.vue'
import NotFoundPage from '@web/pages/NotFoundPage.vue'
import PlatformAdminPage from '@web/pages/PlatformAdminPage.vue'
import ProfilePage from '@web/pages/ProfilePage.vue'
import RegisterPage from '@web/pages/RegisterPage.vue'
import ResetPasswordPage from '@web/pages/ResetPasswordPage.vue'
import SavedDealsPage from '@web/pages/SavedDealsPage.vue'
import type { RouteRecordRaw } from 'vue-router'

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
  { path: '/login', name: 'login', component: LoginPage, meta: { guestOnly: true } },
  { path: '/register', name: 'register', component: RegisterPage, meta: { guestOnly: true } },
  { path: '/saved', name: 'saved', component: SavedDealsPage, meta: { requiresAuth: true } },
  {
    path: '/me/submissions',
    name: 'my-submissions',
    component: MySubmissionsPage,
    meta: { requiresAuth: true },
  },
  {
    path: '/me/merchant-access',
    name: 'merchant-access',
    component: MerchantAccessPage,
    // Staff can't request merchant access; the API enforces this too.
    meta: { requiresAuth: true, roles: ['USER', 'MERCHANT'] },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: ForgotPasswordPage,
    meta: { guestOnly: true },
  },
  { path: '/reset-password', name: 'reset-password', component: ResetPasswordPage },
  { path: '/me/profile', name: 'profile', component: ProfilePage, meta: { requiresAuth: true } },
]

export default routes
