import { createServer, type Server } from 'node:http'
import { apiErrorMiddleware } from '@api/errors'
import { createApiClient } from '@broke-oclock/api-client'
import { ingestionDraftsResponseSchema } from '@broke-oclock/contracts/ingestion'
import axios from 'axios'
import express from 'express'
import { afterEach, expect, it } from 'vitest'

let server: Server | undefined

afterEach(async () => {
  if (!server) return
  server.closeAllConnections()
  await new Promise<void>((resolve) => server?.close(() => resolve()))
  server = undefined
})

it('redacts unexpected errors over real Express HTTP as a REST JSON error', async () => {
  const app = express()
  app.get('/broken', (_request, _response, next) => next(new Error('private provider detail')))
  app.use(apiErrorMiddleware)
  server = createServer(app)
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test HTTP address')

  await expect(axios.get(`http://127.0.0.1:${address.port}/broken`)).rejects.toMatchObject({
    response: {
      status: 500,
      data: { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } },
    },
  })
  try {
    await axios.get(`http://127.0.0.1:${address.port}/broken`)
  } catch (error) {
    expect(JSON.stringify(axios.isAxiosError(error) ? error.response?.data : error)).not.toContain(
      'private provider detail',
    )
    expect(axios.isAxiosError(error) ? error.response?.data.error : undefined).not.toHaveProperty(
      'stack',
    )
  }
})

it('accepts a schema-valid fifty-draft response larger than 100 KiB through the browser client', async () => {
  const response = ingestionDraftsResponseSchema.parse({
    items: Array.from({ length: 50 }, (_, index) => ({
      id: String(index + 1).padStart(24, '0'),
      title: `Synthetic draft ${index}`,
      description: 'x'.repeat(2_500),
      terms: null,
      category: 'FOOD',
      offerType: 'DISCOUNT',
      validFrom: null,
      validUntil: null,
      rawValidityText: null,
      applicability: 'UNKNOWN',
      reviewStatus: 'PENDING',
      contentVersion: 1,
      sourceUrl: `https://example.test/${index}`,
      sourceName: 'Synthetic source',
      reviewNote: null,
      reviewReady: true,
    })),
    nextCursor: null,
  })
  const app = express()
  app.get('/api/ingestion/drafts', (_request, reply) => reply.json(response))
  server = createServer(app)
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test HTTP address')

  const client = createApiClient(`http://127.0.0.1:${address.port}/api`)
  const result = await client.ingestion.drafts({ limit: 50 })
  expect(result.items).toHaveLength(50)
  expect(JSON.stringify(result).length).toBeGreaterThan(100 * 1024)
})

it.each([
  ['charset', { 'Content-Type': 'application/json; charset=iso-8859-1' }],
  ['content encoding', { 'Content-Type': 'application/json', 'Content-Encoding': 'compress' }],
])('rejects unsupported JSON %s with a safe HTTP 415', async (_kind, headers) => {
  const app = express()
  app.use(express.json({ limit: '100kb' }))
  app.post('/input', (_request, response) => response.json({ ok: true }))
  app.use(apiErrorMiddleware)
  server = createServer(app)
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test HTTP address')

  const response = await axios.post(`http://127.0.0.1:${address.port}/input`, '{}', {
    adapter: 'http',
    headers,
    validateStatus: () => true,
  })
  expect(response.status).toBe(415)
  expect(response.data).toEqual({
    error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported JSON encoding' },
  })
  expect(response.data.error).not.toHaveProperty('stack')
})

it('rejects malformed compressed JSON as a sanitized HTTP 400', async () => {
  const app = express()
  app.use(express.json({ limit: '100kb' }))
  app.post('/input', (_request, response) => response.json({ ok: true }))
  app.use(apiErrorMiddleware)
  server = createServer(app)
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test HTTP address')

  const response = await axios.post(`http://127.0.0.1:${address.port}/input`, 'not gzip', {
    adapter: 'http',
    headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
    validateStatus: () => true,
  })
  expect(response.status).toBe(400)
  expect(response.data).toEqual({
    error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' },
  })
  expect(response.data.error).not.toHaveProperty('stack')
})
