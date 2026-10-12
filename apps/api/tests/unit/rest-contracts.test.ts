import { apiErrorSchema } from '@broke-oclock/contracts/api'
import { expect, it } from 'vitest'

it('accepts a stable REST error object with a public code and message', () => {
  expect(
    apiErrorSchema.parse({ error: { code: 'CONFLICT', message: 'Refresh before retrying' } }),
  ).toEqual({ error: { code: 'CONFLICT', message: 'Refresh before retrying' } })
})
