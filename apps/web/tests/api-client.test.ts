import type { CurrentUserResponse } from '@broke-oclock/contracts/api'
import type { IngestionDashboardResponse } from '@broke-oclock/contracts/ingestion'
import { ApiClientError, createApiClient, toApiClientError } from '@web/lib/api-client'
import { AxiosError, type AxiosResponse } from 'axios'
import { expect, expectTypeOf, it } from 'vitest'

it('exposes explicit same-origin REST functions with bounded credentialed transport', () => {
  const client = createApiClient()

  expect(client.http.defaults.baseURL).toBe('/api')
  expect(client.http.defaults.withCredentials).toBe(true)
  expect(client.http.defaults.timeout).toBe(30_000)
  expect(client.http.defaults.maxContentLength).toBe(1024 * 1024)
  expect(client.infrastructure.health).toBeTypeOf('function')
  expect(client.platformAdmin.accounts).toBeTypeOf('function')
  expect(client.ingestion.dashboard).toBeTypeOf('function')
  expectTypeOf<
    Awaited<ReturnType<typeof client.ingestion.dashboard>>
  >().toEqualTypeOf<IngestionDashboardResponse>()
  expectTypeOf<
    Awaited<ReturnType<typeof client.infrastructure.me>>
  >().toEqualTypeOf<CurrentUserResponse>()
})

it('maps an Axios conflict into a safe domain error without retaining transport details', () => {
  const source = new AxiosError('provider token secret')
  source.config = { headers: { Cookie: 'private-session-cookie' } } as never
  source.request = { headers: { Authorization: 'private-header' } }
  source.response = {
    status: 409,
    statusText: 'Conflict',
    headers: { 'set-cookie': 'private-response-cookie' },
    config: source.config,
    data: { error: { code: 'CONFLICT', message: 'Refresh before trying again' } },
  } as unknown as AxiosResponse

  const mapped = toApiClientError(source)

  expect(mapped).toBeInstanceOf(ApiClientError)
  expect(mapped).toMatchObject({
    code: 'CONFLICT',
    status: 409,
    message: 'Refresh before trying again',
  })
  expect(JSON.stringify(mapped)).not.toContain('private')
  expect(mapped).not.toHaveProperty('config')
  expect(mapped).not.toHaveProperty('request')
})

it('sanitizes errors that do not contain the public REST error shape', () => {
  expect(toApiClientError(new Error('private provider response'))).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    status: 500,
    message: 'API request failed',
  })
})
