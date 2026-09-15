import { createServer } from 'node:http'
import { createApp } from '@api/app'
import { loadConfig } from '@api/config'
import { db } from '@broke-oclock/db'

export const startServer = () => {
  const config = loadConfig()
  const server = createServer(createApp(config))
  // Local binding is deliberate. Deploy behind a loopback reverse proxy or review a deployment-specific bind address.
  server.listen(config.port, '127.0.0.1', () => {
    console.info(`Broke O'Clock API listening on http://localhost:${config.port}`)
  })
  return server
}
if (import.meta.main) {
  const server = startServer()
  const shutdown = () => {
    server.close(() => {
      void db.$disconnect().finally(() => process.exit(0))
    })
    server.closeIdleConnections()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}
