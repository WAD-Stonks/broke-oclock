import * as api from '@broke-oclock/contracts/api'
import * as ingestion from '@broke-oclock/contracts/ingestion'
import * as admin from '@broke-oclock/contracts/platform-admin'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

const schema = (module: Record<string, unknown>, name: string): z.ZodType => {
  expect(module[name], `public schema ${name}`).toBeDefined()
  return module[name] as z.ZodType
}
const id = '0123456789abcdef01234567'
const methods = { password: true, google: false, emailOtp: false, passwordRecovery: false }
const overview = {
  generatedAt: '2026-10-10T10:00:00.000Z',
  counts: { pendingMerchantRequests: 1, pendingImportedDrafts: 2, failedImportedPosts: 3 },
  recentRuns: [],
  readiness: {
    googleConfigured: false,
    emailConfigured: false,
    oneMapConfigured: false,
    ingestionOptIn: false,
    reuseAttested: false,
    sourceRecordEnabled: false,
    sourceIdentityValid: false,
    importAllowed: false,
    liveProviderAcceptance: 'NOT_ESTABLISHED',
  },
}
const outlet = {
  id,
  name: 'Fixture outlet',
  address: 'Fixture address',
  merchantName: 'Fixture merchant',
}
const association = {
  id,
  contentVersion: 2,
  reviewStatus: 'PENDING',
  applicability: 'SELECTED_OUTLETS',
  merchantId: id,
  outlet,
}

describe('admin completion browser-safe contracts, synthetic data only', () => {
  it('exposes only configured authentication booleans and retains password support', () => {
    const s = schema(api, 'authMethodsResponseSchema')
    expect(s.parse(methods)).toEqual(methods)
    expect(s.safeParse({ ...methods, password: false }).success).toBe(false)
    expect(s.safeParse({ ...methods, google: 'enabled' }).success).toBe(false)
    expect(s.safeParse({ ...methods, clientSecret: 'synthetic-unwanted-field' }).success).toBe(
      false,
    )
  })
  it.each(['authMethodsQuerySchema', 'adminOverviewQuerySchema'])(
    '%s refuses arbitrary query fields',
    (name) => {
      const s = schema(name === 'authMethodsQuerySchema' ? api : admin, name)
      expect(s.parse({})).toEqual({})
      expect(s.safeParse({ role: 'ADMIN' }).success).toBe(false)
    },
  )
  it('preserves exact pending-request, pending-draft and failed-post names', () => {
    expect(schema(admin, 'adminOverviewResponseSchema').parse(overview)).toEqual(overview)
  })
  it.each([
    { ...overview, counts: { ...overview.counts, pendingImportedDrafts: -1 } },
    { ...overview, counts: { ...overview.counts, failedImportedPosts: 1.5 } },
    { ...overview, counts: { ...overview.counts, failedRuns: 1 } },
    { ...overview, readiness: { ...overview.readiness, liveProviderAcceptance: 'CONNECTED' } },
    { ...overview, readiness: { ...overview.readiness, apiKey: 'synthetic-unwanted-field' } },
    { ...overview, generatedAt: 'not-a-date' },
    { ...overview, rawError: 'synthetic diagnostic' },
  ])('refuses misleading metrics, live claims, diagnostics and configuration values', (value) => {
    expect(schema(admin, 'adminOverviewResponseSchema').safeParse(value).success).toBe(false)
  })
  it('bounds recent history to ten existing run projections', () => {
    const run = {
      id,
      sourceName: 'MoneyDigest',
      status: 'FAILED',
      startedAt: overview.generatedAt,
      finishedAt: null,
      fetchedCount: 0,
      createdCount: 0,
      updatedCount: 0,
      failedCount: 0,
      errorCode: 'UPSTREAM_UNAVAILABLE',
    }
    const s = schema(admin, 'adminOverviewResponseSchema')
    expect(
      s.safeParse({ ...overview, recentRuns: Array.from({ length: 10 }, () => run) }).success,
    ).toBe(true)
    expect(
      s.safeParse({ ...overview, recentRuns: Array.from({ length: 11 }, () => run) }).success,
    ).toBe(false)
  })
  it('requires exact lowercase draft identity and versioned outlet selection', () => {
    expect(
      schema(ingestion, 'ingestionOutletAssociationParamsSchema').parse({ dealId: id }),
    ).toEqual({ dealId: id })
    const s = schema(ingestion, 'ingestionOutletAssociationRequestSchema')
    expect(s.parse({ expectedContentVersion: 1, venueId: id })).toEqual({
      expectedContentVersion: 1,
      venueId: id,
    })
    expect(s.safeParse({ expectedContentVersion: 2_147_483_646, venueId: id }).success).toBe(true)
  })
  it.each([
    { expectedContentVersion: 0, venueId: id },
    { expectedContentVersion: 1.5, venueId: id },
    { expectedContentVersion: 2_147_483_647, venueId: id },
    { expectedVersion: 1, venueId: id },
    { expectedContentVersion: 1, venueId: id.toUpperCase() },
    { expectedContentVersion: 1, venueId: id, merchantId: id },
    { expectedContentVersion: 1, venueId: id, actorId: id },
    { expectedContentVersion: 1, venueId: id, publishedAt: overview.generatedAt },
  ])('rejects injected ownership/publication and invalid association input', (value) => {
    expect(
      schema(ingestion, 'ingestionOutletAssociationRequestSchema').safeParse(value).success,
    ).toBe(false)
  })
  it('returns the server-derived outlet while remaining pending and unpublished', () => {
    const s = schema(ingestion, 'ingestionOutletAssociationResponseSchema')
    expect(s.parse(association)).toEqual(association)
    expect(s.safeParse({ ...association, reviewStatus: 'APPROVED' }).success).toBe(false)
    expect(s.safeParse({ ...association, applicability: 'ALL_MERCHANT_OUTLETS' }).success).toBe(
      false,
    )
    expect(s.safeParse({ ...association, publishedAt: overview.generatedAt }).success).toBe(false)
    expect(s.safeParse({ ...association, outlet: { ...outlet, latitude: 1 } }).success).toBe(false)
  })
})
