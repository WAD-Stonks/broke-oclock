import { ApiErrorException, apiErrorBody } from '@api/errors'
import { DomainError } from '@api/modules/domain-error'
import { expect, it } from 'vitest'

it('maps conflict domain errors to a safe REST conflict response', () => {
  expect(apiErrorBody(new ApiErrorException('CONFLICT', 'Source is busy'))).toEqual({
    status: 409,
    body: { error: { code: 'CONFLICT', message: 'Source is busy' } },
  })
})

it('domain errors carry a code and message without an HTTP transport status', () => {
  const error = new DomainError('CONFLICT', 'Source is busy')
  expect(error.code).toBe('CONFLICT')
  expect(error.message).toBe('Source is busy')
  expect(error).not.toHaveProperty('status')
})

it('translates transport-neutral domain errors into their public REST status and code', () => {
  expect(apiErrorBody(new DomainError('CONFLICT', 'Source is busy'))).toEqual({
    status: 409,
    body: { error: { code: 'CONFLICT', message: 'Source is busy' } },
  })
})

it.each([
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PRECONDITION_FAILED',
  'TOO_MANY_REQUESTS',
  'BAD_GATEWAY',
] as const)('preserves the existing code-only domain message for %s', (code) => {
  expect(new DomainError(code).message).toBe(code)
  expect(apiErrorBody(new DomainError(code)).body.error.message).toBe(code)
})

it('sanitizes unexpected exceptions without exposing provider details', () => {
  const response = apiErrorBody(new Error('private provider detail'))
  expect(response).toEqual({
    status: 500,
    body: { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } },
  })
  expect(JSON.stringify(response)).not.toContain('private provider detail')
})

it('maps oversized JSON bodies to a sanitized 413 response', () => {
  expect(apiErrorBody({ type: 'entity.too.large' })).toEqual({
    status: 413,
    body: { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' } },
  })
})

it.each([
  Object.assign(new URIError('private unrelated URI failure'), { status: 400 }),
  Object.assign(new Error('private allocation failure'), {
    status: 400,
    code: 'ERR__ERROR_ALLOC_RING_BUFFER_1',
  }),
  { status: 400, code: 'UNEXPECTED_DECODER_ERROR', message: 'private unknown failure' },
])('retains a sanitized 500 for unrelated status-tagged failures %j', (error) => {
  expect(apiErrorBody(error)).toEqual({
    status: 500,
    body: { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } },
  })
})

it('maps malformed JSON bodies to a sanitized 400 response', () => {
  expect(apiErrorBody({ type: 'entity.parse.failed' })).toEqual({
    status: 400,
    body: { error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } },
  })
})
