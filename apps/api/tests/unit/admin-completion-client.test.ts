import { ApiClientError, createApiClient } from '@broke-oclock/api-client'
import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
const association = {
  id,
  contentVersion: 2,
  reviewStatus: 'PENDING',
  applicability: 'SELECTED_OUTLETS',
  merchantId: id,
  outlet: {
    id,
    name: 'Fixture outlet',
    address: 'Fixture address',
    merchantName: 'Fixture merchant',
  },
}
const fixture = () => {
  const http = { get: vi.fn(), patch: vi.fn() }
  vi.spyOn(axios, 'create').mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
  return { http, client: createApiClient() }
}
const method = (group: object, key: string) => {
  const fn = Reflect.get(group, key)
  expect(typeof fn, `client method ${key}`).toBe('function')
  return fn as (...args: unknown[]) => Promise<unknown>
}
afterEach(() => vi.restoreAllMocks())

describe('admin completion Axios methods, synthetic transport only', () => {
  it('reads public authentication availability from the explicit REST endpoint', async () => {
    const { http, client } = fixture()
    http.get.mockResolvedValue({ data: methods })
    expect(await method(client.infrastructure, 'authMethods')()).toEqual(methods)
    expect(http.get).toHaveBeenCalledExactlyOnceWith('/auth-methods')
    expect(http.patch).not.toHaveBeenCalled()
  })
  it('reads the protected operational overview and validates its DTO', async () => {
    const { http, client } = fixture()
    http.get.mockResolvedValue({ data: overview })
    expect(await method(client.platformAdmin, 'overview')()).toEqual(overview)
    expect(http.get).toHaveBeenCalledExactlyOnceWith('/admin/overview')
  })
  it('uses one versioned PATCH for an existing outlet without auth or automatic replay', async () => {
    const { http, client } = fixture()
    http.patch.mockResolvedValue({ data: association })
    const body = { expectedContentVersion: 1, venueId: id }
    expect(await method(client.ingestion, 'associateDraftOutlet')(id, body)).toEqual(association)
    expect(http.patch).toHaveBeenCalledExactlyOnceWith(`/ingestion/drafts/${id}/outlet`, body)
    expect(http.get).not.toHaveBeenCalled()
  })
  it('rejects ownership injection and malformed identities before transport', () => {
    const { http, client } = fixture()
    const associate = method(client.ingestion, 'associateDraftOutlet')
    expect(() => associate(id, { expectedContentVersion: 1, venueId: id, actorId: id })).toThrow(
      expect.objectContaining({ code: 'BAD_REQUEST', status: 400 }),
    )
    expect(() => associate(id.toUpperCase(), { expectedContentVersion: 1, venueId: id })).toThrow(
      expect.objectContaining({ code: 'BAD_REQUEST', status: 400 }),
    )
    expect(http.patch).not.toHaveBeenCalled()
  })
  it('rejects a misleading published association response', async () => {
    const { http, client } = fixture()
    http.patch.mockResolvedValue({ data: { ...association, reviewStatus: 'APPROVED' } })
    await expect(
      method(client.ingestion, 'associateDraftOutlet')(id, {
        expectedContentVersion: 1,
        venueId: id,
      }),
    ).rejects.toBeInstanceOf(ApiClientError)
    expect(http.patch).toHaveBeenCalledTimes(1)
  })
  it('does not turn an uncertain mutation failure into a retry', async () => {
    const { http, client } = fixture()
    http.patch.mockRejectedValue(new Error('synthetic transport failure'))
    await expect(
      method(client.ingestion, 'associateDraftOutlet')(id, {
        expectedContentVersion: 1,
        venueId: id,
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })
    expect(http.patch).toHaveBeenCalledTimes(1)
  })
})
