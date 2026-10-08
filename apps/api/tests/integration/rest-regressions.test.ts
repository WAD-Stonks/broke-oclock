import { createServer, type Server } from 'node:http'
import { createApp } from '@api/app'
import { parseConfig } from '@api/config'
import type { IngestionRuntime } from '@api/modules/ingestion/runtime'
import axios from 'axios'
import express from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Real TCP and application middleware; identity, DB and domain-run delegate are
// explicitly synthetic. Provider factories are mocked: no external provider I/O.
const mocks = vi.hoisted(() => {
  const user = {
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    name: 'Synthetic admin',
    role: 'ADMIN',
    email: 'admin@example.test',
    platformVersion: 0,
    createdAt: new Date('2026-10-01T00:00:00Z'),
  }
  return {
    db: {
      user: { findUnique: vi.fn(async () => user), findMany: vi.fn(async () => [user]) },
      importSource: {
        findUnique: vi.fn(async () => ({ id: 'bbbbbbbbbbbbbbbbbbbbbbbb', enabled: true })),
      },
      deal: { count: vi.fn(async () => 0) },
      importedPost: { count: vi.fn(async () => 0) },
    },
    getSession: vi.fn(async () => ({
      user,
      session: { expiresAt: new Date('2027-01-01T00:00:00Z') },
    })),
    listPosts: vi.fn(async () => []),
    search: vi.fn(async () => []),
    runIngestion: vi.fn(async (_db: unknown, runtime: IngestionRuntime) => {
      await runtime.listPosts({ page: 1, perPage: 20 })
      return {
        runId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        status: 'SUCCEEDED',
        fetchedCount: 0,
        createdCount: 0,
        updatedCount: 0,
        failedCount: 0,
      }
    }),
  }
})
vi.mock('@broke-oclock/db', () => ({ db: mocks.db }))
vi.mock('@api/auth', () => ({ createAuth: () => ({ api: { getSession: mocks.getSession } }) }))
vi.mock('@broke-oclock/auth/node', () => ({
  fromNodeHeaders: (headers: unknown) => headers,
  toNodeHandler: () =>
    express.Router().all('/*splat', (_req, res) => res.status(202).json({ native: 'auth' })),
}))
vi.mock('@api/uploads', () => ({
  createPhotoRouter: () =>
    express.Router().use((_req, res) => res.status(202).json({ native: 'uploads' })),
}))
vi.mock('@api/modules/ingestion/service', () => ({ runIngestion: mocks.runIngestion }))
vi.mock('@broke-oclock/integrations/server', () => ({
  createMoneyDigestClient: () => ({ listPosts: mocks.listPosts }),
  createOneMapClient: () => ({ search: mocks.search }),
}))

const config = parseConfig({
  DATABASE_URL: 'mongodb://127.0.0.1:1/continuation_api_validation_only',
  BETTER_AUTH_SECRET: 'synthetic-test-only-secret-longer-than-32',
  WEB_ORIGIN: 'http://localhost:5173',
  INGESTION_ENABLED: 'true',
  MONEYDIGEST_REUSE_APPROVED: 'true',
  ONEMAP_EMAIL: 'synthetic@example.test',
  ONEMAP_EMAIL_PASSWORD: 'synthetic-fixture-only',
})
let server: Server
let baseURL: string
const start = async (options?: { ingestion?: IngestionRuntime }) => {
  server = createServer(createApp(config, options))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing local HTTP address')
  baseURL = `http://127.0.0.1:${address.port}`
}
beforeEach(() => vi.clearAllMocks())
afterEach(async () => {
  if (!server) return
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})
const http = (path: string, options: Parameters<typeof axios.request>[0] = {}) =>
  axios.request({
    url: `${baseURL}${path}`,
    adapter: 'http',
    validateStatus: () => true,
    headers: { Origin: config.webOrigin },
    ...options,
  })

describe('REST regression slices (real HTTP, synthetic transport dependencies)', () => {
  it('uses the configured default ingestion runtime for dashboard and provider/run dispatch', async () => {
    await start()
    const dashboard = await http('/api/ingestion/dashboard')
    expect(dashboard.status).toBe(200)
    expect(dashboard.data.source).toMatchObject({
      enabled: true,
      reuseApproved: true,
      onemapConfigured: true,
    })
    expect((await http('/api/ingestion/locations?query=Synthetic')).data).toEqual({ items: [] })
    expect(mocks.search).toHaveBeenCalledWith('Synthetic')
    expect((await http('/api/ingestion/runs', { method: 'POST' })).status).toBe(200)
    expect(mocks.runIngestion).toHaveBeenCalledTimes(1)
    expect(mocks.listPosts).toHaveBeenCalledWith({ page: 1, perPage: 20 })
  })

  it('rejects raw query overflow before parsing or consulting identity/domain delegates', async () => {
    await start()
    const overflow = `limit=1${'&'.repeat(1000)}limit=101&unexpected=yes`
    const response = await http(`/api/admin/accounts?${overflow}`)
    expect(response.status).toBe(400)
    expect(response.data).toEqual({
      error: { code: 'BAD_REQUEST', message: 'Query is too complex' },
    })
    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(mocks.db.user.findUnique).not.toHaveBeenCalled()
    expect(mocks.db.user.findMany).not.toHaveBeenCalled()
    expect(mocks.runIngestion).not.toHaveBeenCalled()
    for (const query of ['limit=1&limit=101', 'limit=1&unexpected=yes', 'limit[]=1']) {
      expect((await http(`/api/admin/accounts?${query}`)).status).toBe(400)
    }
    expect(mocks.db.user.findMany).not.toHaveBeenCalled()
    expect((await http('/api/admin/accounts?limit=1')).status).toBe(200)
    expect(mocks.db.user.findMany).toHaveBeenCalledTimes(1)
    expect((await http(`/api/auth/native?${overflow}`)).status).toBe(202)
    expect((await http(`/api/uploadthing?${overflow}`)).status).toBe(202)
    expect(
      (
        await http(`/api/trpc?${overflow}`, {
          method: 'POST',
          data: '{malformed',
          headers: { 'Content-Type': 'application/json' },
        })
      ).status,
    ).toBe(404)
  })

  it('preserves the explicitly injected ingestion runtime override', async () => {
    const runtime: IngestionRuntime = {
      enabled: false,
      reuseApproved: false,
      now: () => new Date(),
      listPosts: vi.fn(async () => []),
    }
    await start({ ingestion: runtime })
    const dashboard = await http('/api/ingestion/dashboard')
    expect(dashboard.data.source).toMatchObject({
      enabled: false,
      reuseApproved: false,
      onemapConfigured: false,
    })
    expect((await http('/api/ingestion/locations?query=Synthetic')).status).toBe(412)
    await http('/api/ingestion/runs', { method: 'POST' })
    expect(mocks.runIngestion.mock.calls[0]?.[1]).toBe(runtime)
    expect(mocks.listPosts).not.toHaveBeenCalled()
  })

  it('retires malformed legacy descendants with 404 before URI, query, body or identity handling', async () => {
    await start()
    for (const path of ['/api/trpc/%ZZ', '/api/trpc/%FF', '/api/trpc/%E0%A4']) {
      for (const method of ['GET', 'POST', 'HEAD', 'OPTIONS']) {
        const response = await http(`${path}?limit=1${'&'.repeat(1000)}unexpected=yes`, {
          method,
          ...(method === 'POST'
            ? {
                data: Buffer.from('not compressed JSON'),
                headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'br' },
              }
            : {}),
        })
        expect(response.status).toBe(404)
      }
    }
    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(mocks.runIngestion).not.toHaveBeenCalled()
    expect(mocks.db.user.findUnique).not.toHaveBeenCalled()
  })

  it('rejects unexpected dashboard query fields before source or count reads', async () => {
    await start()
    const response = await http('/api/ingestion/dashboard?unexpected=1')
    expect(response.status).toBe(400)
    expect(response.data.error.code).toBe('BAD_REQUEST')
    expect(mocks.db.importSource.findUnique).not.toHaveBeenCalled()
    expect(mocks.db.deal.count).not.toHaveBeenCalled()
    expect(mocks.db.importedPost.count).not.toHaveBeenCalled()
    expect((await http('/api/ingestion/dashboard')).status).toBe(200)
    expect(mocks.db.importSource.findUnique).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['/api/admin/accounts/%ZZ', 'GET'],
    ['/api/admin/accounts/%FF', 'GET'],
    ['/api/admin/accounts/%E0%A4', 'GET'],
    ['/api/ingestion/drafts/%ZZ/review', 'POST'],
    ['/api/ingestion/drafts/%FF/review', 'POST'],
    ['/api/ingestion/drafts/%E0%A4/review', 'POST'],
  ])('rejects invalid path encoding on %s using %s before dispatch', async (path, method) => {
    await start()
    const response = await http(path, {
      method,
      data:
        method === 'POST'
          ? { decision: 'REJECT', expectedContentVersion: 1, note: 'Synthetic' }
          : undefined,
    })
    expect(response.status).toBe(400)
    expect(response.data).toEqual({
      error: { code: 'BAD_REQUEST', message: 'Invalid path parameter' },
    })
    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(mocks.db.user.findUnique).not.toHaveBeenCalled()
    expect(mocks.runIngestion).not.toHaveBeenCalled()
  })

  it.each(['gzip', 'deflate', 'br'])(
    'rejects malformed supported %s JSON before identity or write dispatch',
    async (encoding) => {
      await start()
      const response = await http('/api/ingestion/runs', {
        method: 'POST',
        data: Buffer.from('not valid compressed data'),
        headers: { 'Content-Type': 'application/json', 'Content-Encoding': encoding },
      })
      expect(response.status).toBe(400)
      expect(response.data).toEqual({
        error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' },
      })
      expect(mocks.getSession).not.toHaveBeenCalled()
      expect(mocks.runIngestion).not.toHaveBeenCalled()
      expect(mocks.db.user.findUnique).not.toHaveBeenCalled()
    },
  )
})
