import { platformAccountsQuerySchema } from '@contracts/platform-admin'
import { boundedQueryInteger } from '@contracts/query'
import { expect, expectTypeOf, it } from 'vitest'
import type { z } from 'zod'

const pageSize = boundedQueryInteger(1, 50, 20)

it('parses a bounded decimal query value and supplies its legacy default', () => {
  expect(pageSize.parse('7')).toBe(7)
  expect(pageSize.parse(7)).toBe(7)
  expect(pageSize.parse(undefined)).toBe(20)
  expectTypeOf<z.input<typeof pageSize>>().toEqualTypeOf<number | string | undefined>()
})

it.each(['0', '51', '1.5', '-1', '', '01', ['2', '3'], true, ['2']])(
  'rejects malformed or out-of-range query value %j',
  (value) => expect(() => pageSize.parse(value)).toThrow(),
)

it('accepts platform pagination as a number or canonical query string with the original default', () => {
  expect(platformAccountsQuerySchema.parse({ limit: 25 }).limit).toBe(25)
  expect(platformAccountsQuerySchema.parse({ limit: '25' }).limit).toBe(25)
  expect(platformAccountsQuerySchema.parse({}).limit).toBe(25)
})

it.each([true, '', '01', '1.5', '1e2', 1.5, 0, 101, ['25'], ['1', '2']])(
  'rejects platform pagination value %j without coercion',
  (limit) => expect(platformAccountsQuerySchema.safeParse({ limit }).success).toBe(false),
)
