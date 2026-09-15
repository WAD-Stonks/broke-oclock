import { createApp } from '@api/app'
import { loadConfig } from '@api/config'

// Vercel owns the HTTP listener and process lifecycle.
const app = createApp(loadConfig())
export default app
