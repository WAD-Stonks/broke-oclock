import {
  type ApiErrorCode,
  apiErrorSchema,
  currentUserResponseSchema,
  currentUserUnauthorizedResponseSchema,
  healthResponseSchema,
} from '@broke-oclock/contracts/api'
import {
  actionResponseSchema,
  commentParamsSchema,
  commentSchema,
  commentsQuerySchema,
  commentsResponseSchema,
  communityDealParamsSchema,
  communityResponseSchema,
  communitySummariesResponseSchema,
  createCommentBodySchema,
  createReportBodySchema,
  moderateBodySchema,
  moderationQuerySchema,
  moderationResponseSchema,
  outletEvidenceParamsSchema,
  reportResponseSchema,
  setVoteBodySchema,
} from '@broke-oclock/contracts/community'
import {
  ingestionAccountsQuerySchema,
  ingestionAccountsResponseSchema,
  ingestionDashboardResponseSchema,
  ingestionDraftsQuerySchema,
  ingestionDraftsResponseSchema,
  ingestionLocationsQuerySchema,
  ingestionLocationsResponseSchema,
  ingestionReviewRequestSchema,
  ingestionReviewResponseSchema,
  ingestionRunResponseSchema,
  ingestionRunsQuerySchema,
  ingestionRunsResponseSchema,
} from '@broke-oclock/contracts/ingestion'
import {
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
    community: {
      summaries: (dealIds: string[]) => {
        if (dealIds.length < 1 || dealIds.length > 20)
          throw new ApiClientError('BAD_REQUEST', 400, 'Request 1–20 deal IDs')
        const ids = dealIds
          .map((dealId) => validateInput(communityDealParamsSchema, { dealId }).dealId)
          .join(',')
        return request(
          http.get('/community/summaries', { params: { ids } }),
          communitySummariesResponseSchema,
        )
      },
      get: (dealId: string) => {
        const params = validateInput(communityDealParamsSchema, { dealId })
        return request(http.get(`/deals/${params.dealId}/community`), communityResponseSchema)
      },
      setVote: (dealId: string, input: SchemaInput<typeof setVoteBodySchema>) => {
        const params = validateInput(communityDealParamsSchema, { dealId })
        const body = validateInput(setVoteBodySchema, input)
        return request(http.put(`/deals/${params.dealId}/vote`, body), communityResponseSchema)
      },
      setOutletEvidence: (
        dealId: string,
        venueId: string,
        input: SchemaInput<typeof setVoteBodySchema>,
      ) => {
        const params = validateInput(outletEvidenceParamsSchema, { dealId, venueId })
        const body = validateInput(setVoteBodySchema, input)
        return request(
          http.put(`/deals/${params.dealId}/outlets/${params.venueId}/evidence`, body),
          communityResponseSchema,
        )
      },
      comments: (dealId: string, input: QueryInput<typeof commentsQuerySchema> = {}) => {
        const { dealId: id } = validateInput(communityDealParamsSchema, { dealId })
        const query = validateInput(commentsQuerySchema, input)
        return request(http.get(`/deals/${id}/comments`, { params: query }), commentsResponseSchema)
      },
      addComment: (dealId: string, input: SchemaInput<typeof createCommentBodySchema>) => {
        const { dealId: id } = validateInput(communityDealParamsSchema, { dealId })
        const body = validateInput(createCommentBodySchema, input)
        return request(http.post(`/deals/${id}/comments`, body), commentSchema)
      },
      deleteComment: (dealId: string, commentId: string) => {
        const params = validateInput(commentParamsSchema, { dealId, commentId })
        return request(
          http.delete(`/deals/${params.dealId}/comments/${params.commentId}`),
          actionResponseSchema,
        )
      },
      reportDeal: (dealId: string, input: SchemaInput<typeof createReportBodySchema>) => {
        const { dealId: id } = validateInput(communityDealParamsSchema, { dealId })
        const body = validateInput(createReportBodySchema, input)
        return request(http.post(`/deals/${id}/reports`, body), reportResponseSchema)
      },
      reportComment: (
        dealId: string,
        commentId: string,
        input: SchemaInput<typeof createReportBodySchema>,
      ) => {
        const params = validateInput(commentParamsSchema, { dealId, commentId })
        const body = validateInput(createReportBodySchema, input)
        return request(
          http.post(`/deals/${params.dealId}/comments/${params.commentId}/reports`, body),
          reportResponseSchema,
        )
      },
      reports: (input: QueryInput<typeof moderationQuerySchema> = {}) => {
        const query = validateInput(moderationQuerySchema, input)
        return request(
          http.get('/admin/community/reports', { params: query }),
          moderationResponseSchema,
        )
      },
      reviewReport: (
        kind: 'DEAL' | 'COMMENT',
        reportId: string,
        input: SchemaInput<typeof moderateBodySchema>,
      ) => {
        const { dealId: id } = validateInput(communityDealParamsSchema, { dealId: reportId })
        const body = validateInput(moderateBodySchema, input)
        return request(
          http.post(`/admin/community/reports/${kind}/${id}/review`, body),
          reportResponseSchema,
        )
      },
    },
    infrastructure: {
      health: () => request(http.get('/health'), healthResponseSchema),
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
