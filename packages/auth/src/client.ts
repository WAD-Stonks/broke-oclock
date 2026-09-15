import { createAuthClient } from 'better-auth/vue'

// Same-origin browser requests to /api/auth; Vite proxies /api to Express in dev.
// Account screens remain a student-owned workstream.
export const authClient = createAuthClient({ basePath: '/api/auth' })
