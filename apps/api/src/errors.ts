import { constants as compressionConstants } from 'node:zlib'
import { DomainError } from '@api/modules/domain-error'
import type { ApiError, ApiErrorCode } from '@broke-oclock/contracts/api'
import type { ErrorRequestHandler } from 'express'

const malformedBrotliCodes = new Set(
  Object.keys(compressionConstants)
    .filter(
      (name) =>
        name.startsWith('BROTLI_DECODER_ERROR_FORMAT_') ||
        name === 'BROTLI_DECODER_ERROR_DICTIONARY_NOT_SET',
    )
    .map((name) => name.replace('BROTLI_DECODER', 'ERR_')),
)

const statusByCode: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  METHOD_NOT_ALLOWED: 405,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  TOO_MANY_REQUESTS: 429,
  BAD_GATEWAY: 502,
  INTERNAL_SERVER_ERROR: 500,
}

export class ApiErrorException extends Error {
  readonly status: number

  constructor(
    readonly code: Exclude<ApiErrorCode, 'INTERNAL_SERVER_ERROR'>,
    message = defaultMessage(code),
  ) {
    super(message)
    this.name = 'ApiErrorException'
    this.status = statusByCode[code]
  }
}

function defaultMessage(code: ApiErrorCode): string {
  switch (code) {
    case 'UNAUTHORIZED':
      return 'Unauthorized'
    case 'FORBIDDEN':
      return 'Forbidden'
    case 'NOT_FOUND':
      return 'Not found'
    case 'CONFLICT':
      return 'Conflict'
    case 'PRECONDITION_FAILED':
      return 'Precondition failed'
    case 'TOO_MANY_REQUESTS':
      return 'Too many requests'
    case 'BAD_GATEWAY':
      return 'Upstream service unavailable'
    case 'INTERNAL_SERVER_ERROR':
      return 'Internal server error'
    case 'BAD_REQUEST':
      return 'Bad request'
    case 'PAYLOAD_TOO_LARGE':
      return 'Request body too large'
    case 'UNSUPPORTED_MEDIA_TYPE':
      return 'Unsupported JSON encoding'
    case 'METHOD_NOT_ALLOWED':
      return 'Method not allowed'
  }
}

export const apiErrorBody = (error: unknown): { status: number; body: ApiError } => {
  if (error instanceof ApiErrorException) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.message.slice(0, 200) } },
    }
  }
  if (error instanceof DomainError) {
    return {
      status: statusByCode[error.code],
      body: { error: { code: error.code, message: error.message.slice(0, 200) } },
    }
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 400 &&
    'code' in error &&
    (error.code === 'Z_DATA_ERROR' ||
      error.code === 'Z_BUF_ERROR' ||
      (typeof error.code === 'string' && malformedBrotliCodes.has(error.code)))
  ) {
    return { status: 400, body: { error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } } }
  }
  if (
    error instanceof URIError &&
    'status' in error &&
    error.status === 400 &&
    error.message.startsWith("Failed to decode param '")
  ) {
    return {
      status: 400,
      body: { error: { code: 'BAD_REQUEST', message: 'Invalid path parameter' } },
    }
  }
  if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'charset.unsupported' || error.type === 'encoding.unsupported') {
      return {
        status: 415,
        body: { error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported JSON encoding' } },
      }
    }
    if (error.type === 'entity.too.large') {
      return {
        status: 413,
        body: { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' } },
      }
    }
    if (error.type === 'entity.parse.failed') {
      return {
        status: 400,
        body: { error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } },
      }
    }
  }
  return {
    status: statusByCode.INTERNAL_SERVER_ERROR,
    body: {
      error: { code: 'INTERNAL_SERVER_ERROR', message: defaultMessage('INTERNAL_SERVER_ERROR') },
    },
  }
}

export const apiErrorMiddleware: ErrorRequestHandler = (error, _request, response, _next) => {
  const mapped = apiErrorBody(error)
  response.status(mapped.status).json(mapped.body)
}
