import type { CurrentUserResponse } from '@broke-oclock/contracts/api'
import { createRpcClient, type RouterOutputs } from '@web/lib/api-client'
import { expect, expectTypeOf, it } from 'vitest'

it('infers current-user output directly from the API router', () => {
  const client = createRpcClient()
  expectTypeOf<RouterOutputs['me']>().toEqualTypeOf<CurrentUserResponse>()
  expectTypeOf<Awaited<ReturnType<typeof client.me.query>>>().toEqualTypeOf<CurrentUserResponse>()
  expect(client.me.query).toBeTypeOf('function')
})
