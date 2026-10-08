import { ApiErrorException } from '@api/errors'
import type { z } from 'zod'

export const parseRestInput = <Schema extends z.ZodType>(schema: Schema, value: unknown) => {
  const result = schema.safeParse(value)
  if (!result.success) throw new ApiErrorException('BAD_REQUEST', 'Invalid request')
  return result.data
}
