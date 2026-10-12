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
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()))
  server = undefined
})

it.each([
  { google: false, email: false },
  { google: true, email: false },
  { google: false, email: true },
  { google: true, email: true },
])(
  'serves truthful public availability $google/$email without identity or provider calls over real HTTP',
  async (enabled) => {
    const getSession = vi.fn(async () => {
      throw new Error('Must not resolve identity')
    })
    const config = {
      authProviders: {
        ...(enabled.google
          ? { google: { clientId: 'synthetic-client', clientSecret: 'synthetic-secret' } }
          : {}),
        ...(enabled.email
          ? { email: { apiKey: 'synthetic-key', from: 'synthetic@example.test' } }
          : {}),
      },
    } as AppConfig
    const app = express()
    app.use('/api', createRestRouter({ config, auth: { api: { getSession } } as unknown as Auth }))
    app.use(apiErrorMiddleware)
    server = createServer(app)
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing server')
    const url = `http://127.0.0.1:${address.port}/api/auth-methods`
    const client = axios.create({ validateStatus: () => true })
    const response = await client.get(url, { headers: { Cookie: 'invalid=cookie' } })
    expect(response.status).toBe(200)
    expect(response.data).toEqual({
      password: true,
      google: enabled.google,
      emailOtp: enabled.email,
      passwordRecovery: enabled.email,
    })
    expect(response.headers['cache-control']).toBe('no-store')
    expect((await client.head(url)).status).toBe(200)
    expect((await client.get(`${url}?unexpected=1`)).status).toBe(400)
    for (const method of ['POST', 'PATCH', 'DELETE', 'PUT', 'OPTIONS']) {
      const denied = await client.request({ url, method })
      expect(denied.status).toBe(405)
      expect(denied.headers.allow).toBe('GET')
    }
    expect(getSession).not.toHaveBeenCalled()
  },
)
