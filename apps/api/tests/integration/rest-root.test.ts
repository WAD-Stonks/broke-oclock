import { createServer, type Server } from 'node:http'
import type { AppConfig } from '@api/config'
import { apiErrorMiddleware } from '@api/errors'
import { createRestRouter } from '@api/rest/root'
import type { Auth } from '@broke-oclock/auth/types'
import axios from 'axios'
import express from 'express'
import { afterEach, expect, it, vi } from 'vitest'

let server: Server | undefined

afterEach(async () => {
  if (!server) return
  server.closeAllConnections()
  await new Promise<void>((resolve) => server?.close(() => resolve()))
  server = undefined
})

it('assembles liveness under the common REST root without consulting auth or database state', async () => {
  const getSession = vi.fn(async () => {
    throw new Error('Liveness must not load a session')
  })
  const app = express()
  app.use(
    '/api',
    createRestRouter({
      config: {} as AppConfig,
      auth: { api: { getSession } } as unknown as Auth,
    }),
  )
  app.use(apiErrorMiddleware)
  server = createServer(app)
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test HTTP address')

  const response = await axios.get(`http://127.0.0.1:${address.port}/api/health`, {
    headers: { Cookie: 'invalid-session=cookie' },
  })

  expect(response.data).toEqual({ ok: true })
  expect(getSession).not.toHaveBeenCalled()
})
