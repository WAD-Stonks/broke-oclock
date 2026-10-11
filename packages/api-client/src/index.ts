import {
  type ApiErrorCode,
  apiErrorSchema,
  authMethodsResponseSchema,
  currentUserResponseSchema,
  currentUserUnauthorizedResponseSchema,
  healthResponseSchema,
} from '@broke-oclock/contracts/api'
import {
  ingestionAccountsQuerySchema,
  ingestionAccountsResponseSchema,
  ingestionDashboardResponseSchema,
  ingestionDraftsQuerySchema,
  ingestionDraftsResponseSchema,
  ingestionLocationsQuerySchema,
  ingestionLocationsResponseSchema,
  ingestionOutletAssociationParamsSchema,
  ingestionOutletAssociationRequestSchema,
  ingestionOutletAssociationResponseSchema,
  ingestionReviewRequestSchema,
  ingestionReviewResponseSchema,
  ingestionRunResponseSchema,
  ingestionRunsQuerySchema,
  ingestionRunsResponseSchema,
} from '@broke-oclock/contracts/ingestion'
import {
  adminOverviewResponseSchema,
  changePlatformRoleBodySchema,
  grantParamsSchema,
  grantStallBodySchema,
  merchantRequestSchema,
  merchantRequestsQuerySchema,
  platformAccountParamsSchema,
  platformAccountResponseSchema,
  platformAccountSummarySchema,
  platformAccountsQuerySchema,
  platformAuditEntrySchema,
  platformAuditQuerySchema,
  platformMutationResponseSchema,
  platformObjectIdSchema,
  platformPageSchema,
  platformVenueSchema,
  platformVenuesQuerySchema,
  reviewMerchantRequestBodySchema,
  reviewMerchantRequestParamsSchema,
  revokeStallBodySchema,
} from '@broke-oclock/contracts/platform-admin'
import axios, { type AxiosResponse } from 'axios'

export type ApiClientErrorCode = ApiErrorCode

type RuntimeSchema<Input = unknown, Output = unknown> = {
  _input: Input
  _output: Output
  safeParse: (input: unknown) => { success: true; data: Output } | { success: false }
}
type SchemaInput<Schema extends RuntimeSchema> = Schema['_input']
type SchemaOutput<Schema extends RuntimeSchema> = Schema['_output']
type QueryInput<Schema extends RuntimeSchema> = Partial<SchemaInput<Schema>>

export class ApiClientError extends Error {
  constructor(
    readonly code: ApiClientErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

export const toApiClientError = (error: unknown): ApiClientError => {
  if (axios.isAxiosError(error)) {
    if (
      error.config?.url === '/me' &&
      error.response?.status === 401 &&
      currentUserUnauthorizedResponseSchema.safeParse(error.response.data).success
    ) {
      return new ApiClientError('UNAUTHORIZED', 401, 'Unauthorized')
    }
    const parsed = apiErrorSchema.safeParse(error.response?.data)
    if (parsed.success) {
      return new ApiClientError(
        parsed.data.error.code,
        error.response?.status ?? 500,
        parsed.data.error.message,
      )
    }
    return new ApiClientError(
      'INTERNAL_SERVER_ERROR',
      error.response?.status ?? 500,
      'API request failed',
    )
  }
  return new ApiClientError('INTERNAL_SERVER_ERROR', 500, 'API request failed')
}

const validateInput = <Schema extends RuntimeSchema>(
  schema: Schema,
  input: unknown,
): SchemaOutput<Schema> => {
  const result = schema.safeParse(input)
  if (!result.success) throw new ApiClientError('BAD_REQUEST', 400, 'Invalid request')
  return result.data
}

const request = async <Schema extends RuntimeSchema>(
  httpCall: Promise<AxiosResponse<unknown>>,
  responseSchema: Schema,
): Promise<SchemaOutput<Schema>> => {
  try {
    const response = await httpCall
    const parsed = responseSchema.safeParse(response.data)
    if (!parsed.success)
      throw new ApiClientError('INTERNAL_SERVER_ERROR', 500, 'Unexpected API response')
    return parsed.data
  } catch (error) {
    if (error instanceof ApiClientError) throw error
    throw toApiClientError(error)
  }
}

export const createApiClient = (baseURL = '/api') => {
  const http = axios.create({
    baseURL,
    withCredentials: true,
    timeout: 30_000,
    maxBodyLength: 100 * 1024,
    maxContentLength: 1024 * 1024,
    headers: { Accept: 'application/json' },
  })

  const platformAccountsResponseSchema = platformPageSchema(platformAccountSummarySchema)
  const platformVenuesResponseSchema = platformPageSchema(platformVenueSchema)
  const merchantRequestsResponseSchema = platformPageSchema(merchantRequestSchema)
  const platformAuditResponseSchema = platformPageSchema(platformAuditEntrySchema)

  return {
    http,
    infrastructure: {
      health: () => request(http.get('/health'), healthResponseSchema),
      authMethods: () => request(http.get('/auth-methods'), authMethodsResponseSchema),
      me: () => request(http.get('/me'), currentUserResponseSchema),
    },
    ingestion: {
      dashboard: () => request(http.get('/ingestion/dashboard'), ingestionDashboardResponseSchema),
      runs: (input: QueryInput<typeof ingestionRunsQuerySchema> = {}) => {
        const query = validateInput(ingestionRunsQuerySchema, input)
        return request(http.get('/ingestion/runs', { params: query }), ingestionRunsResponseSchema)
      },
      run: () => request(http.post('/ingestion/runs'), ingestionRunResponseSchema),
      drafts: (input: QueryInput<typeof ingestionDraftsQuerySchema> = {}) => {
        const query = validateInput(ingestionDraftsQuerySchema, input)
        return request(
          http.get('/ingestion/drafts', { params: query }),
          ingestionDraftsResponseSchema,
        )
      },
      associateDraftOutlet: (
        dealId: string,
        input: SchemaInput<typeof ingestionOutletAssociationRequestSchema>,
      ) => {
        const { dealId: id } = validateInput(ingestionOutletAssociationParamsSchema, { dealId })
        const body = validateInput(ingestionOutletAssociationRequestSchema, input)
        return request(
          http.patch(`/ingestion/drafts/${id}/outlet`, body),
          ingestionOutletAssociationResponseSchema,
        )
      },
      reviewDraft: (dealId: string, input: SchemaInput<typeof ingestionReviewRequestSchema>) => {
        const id = validateInput(platformObjectIdSchema, dealId)
        const body = validateInput(ingestionReviewRequestSchema, input)
        return request(
          http.post(`/ingestion/drafts/${id}/review`, body),
          ingestionReviewResponseSchema,
        )
      },
      accounts: (input: QueryInput<typeof ingestionAccountsQuerySchema> = {}) => {
        const query = validateInput(ingestionAccountsQuerySchema, input)
        return request(
          http.get('/ingestion/accounts', { params: query }),
          ingestionAccountsResponseSchema,
        )
      },
      searchLocations: (input: SchemaInput<typeof ingestionLocationsQuerySchema>) => {
        const query = validateInput(ingestionLocationsQuerySchema, input)
        return request(
          http.get('/ingestion/locations', { params: query }),
          ingestionLocationsResponseSchema,
        )
      },
    },
    platformAdmin: {
      overview: () => request(http.get('/admin/overview'), adminOverviewResponseSchema),
      accounts: (input: QueryInput<typeof platformAccountsQuerySchema> = {}) => {
        const query = validateInput(platformAccountsQuerySchema, input)
        return request(
          http.get('/admin/accounts', { params: query }),
          platformAccountsResponseSchema,
        )
      },
      account: (userId: string) => {
        const { userId: id } = validateInput(platformAccountParamsSchema, { userId })
        return request(http.get(`/admin/accounts/${id}`), platformAccountResponseSchema)
      },
      changeRole: (userId: string, input: SchemaInput<typeof changePlatformRoleBodySchema>) => {
        const { userId: id } = validateInput(platformAccountParamsSchema, { userId })
        const body = validateInput(changePlatformRoleBodySchema, input)
        return request(
          http.patch(`/admin/accounts/${id}/role`, body),
          platformMutationResponseSchema,
        )
      },
      venues: (input: QueryInput<typeof platformVenuesQuerySchema> = {}) => {
        const query = validateInput(platformVenuesQuerySchema, input)
        return request(http.get('/admin/venues', { params: query }), platformVenuesResponseSchema)
      },
      requests: (input: QueryInput<typeof merchantRequestsQuerySchema> = {}) => {
        const query = validateInput(merchantRequestsQuerySchema, input)
        return request(
          http.get('/admin/merchant-requests', { params: query }),
          merchantRequestsResponseSchema,
        )
      },
      reviewRequest: (
        requestId: string,
        input: SchemaInput<typeof reviewMerchantRequestBodySchema>,
      ) => {
        const { requestId: id } = validateInput(reviewMerchantRequestParamsSchema, { requestId })
        const body = validateInput(reviewMerchantRequestBodySchema, input)
        return request(
          http.post(`/admin/merchant-requests/${id}/review`, body),
          platformMutationResponseSchema,
        )
      },
      grantStall: (input: SchemaInput<typeof grantStallBodySchema>) => {
        const body = validateInput(grantStallBodySchema, input)
        return request(http.post('/admin/stall-grants', body), platformMutationResponseSchema)
      },
      revokeStall: (grantId: string, input: SchemaInput<typeof revokeStallBodySchema>) => {
        const { grantId: id } = validateInput(grantParamsSchema, { grantId })
        const body = validateInput(revokeStallBodySchema, input)
        return request(
          http.delete(`/admin/stall-grants/${id}`, { data: body }),
          platformMutationResponseSchema,
        )
      },
      audit: (input: QueryInput<typeof platformAuditQuerySchema> = {}) => {
        const query = validateInput(platformAuditQuerySchema, input)
        return request(http.get('/admin/audit', { params: query }), platformAuditResponseSchema)
      },
    },
  }
}
