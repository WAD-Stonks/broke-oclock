import type { Auth } from '@auth/types'
import { inferAdditionalFields } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue'

// Same-origin browser requests to /api/auth; Vite proxies /api to Express in dev.
// Account screens remain a student-owned workstream.
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [inferAdditionalFields<Auth>()],
})
