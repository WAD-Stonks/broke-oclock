import { ApiErrorException } from '@api/errors'
import type { z } from 'zod'

export const parseRestValue = <T extends z.ZodType>(schema: T, value: unknown): z.output<T> => {
  const result = schema.safeParse(value)
  if (!result.success) throw new ApiErrorException('BAD_REQUEST')
  return result.data
}

export const page = <T extends { id: string }>(items: T[], limit: number) => ({
  items: items.slice(0, limit),
  nextCursor: items.length > limit ? (items[limit - 1]?.id ?? null) : null,
})
