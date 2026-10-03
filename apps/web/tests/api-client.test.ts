import type { CurrentUserResponse } from '@broke-oclock/contracts/api'
import { createRpcClient, type RouterOutputs } from '@web/lib/api-client'
import { expect, expectTypeOf, it } from 'vitest'

it('infers current-user output directly from the API router', () => {
  const client = createRpcClient()
  expectTypeOf<RouterOutputs['infrastructure']['me']>().toEqualTypeOf<CurrentUserResponse>()
  expectTypeOf<
    Awaited<ReturnType<typeof client.infrastructure.me.query>>
  >().toEqualTypeOf<CurrentUserResponse>()
  expect(client.infrastructure.me.query).toBeTypeOf('function')
})
