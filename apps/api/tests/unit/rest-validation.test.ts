import { ApiErrorException } from '@api/errors'
import { parseRestInput } from '@api/rest/validation'
import { expect, it } from 'vitest'
import { z } from 'zod'

const requestSchema = z.strictObject({ name: z.string().min(1) })

it('validates JSON input and maps invalid or unknown fields to BAD_REQUEST', () => {
  expect(parseRestInput(requestSchema, { name: 'valid' })).toEqual({ name: 'valid' })
  expect(() => parseRestInput(requestSchema, { name: '' })).toThrow(
    new ApiErrorException('BAD_REQUEST', 'Invalid request'),
  )
  expect(() => parseRestInput(requestSchema, { name: 'valid', extra: true })).toThrow(
    new ApiErrorException('BAD_REQUEST', 'Invalid request'),
  )
})
