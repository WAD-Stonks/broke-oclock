import { ApiErrorException } from '@api/errors'
import { requireTrustedOrigin } from '@api/rest/policy'
import { expect, it } from 'vitest'

it('requires the exact configured Origin on write requests', () => {
  expect(() => requireTrustedOrigin('https://evil.example', 'https://app.example')).toThrow(
    new ApiErrorException('FORBIDDEN', 'Untrusted request origin'),
  )
  expect(() => requireTrustedOrigin('https://app.example', 'https://app.example')).not.toThrow()
  expect(() => requireTrustedOrigin(undefined, 'https://app.example')).toThrow(
    new ApiErrorException('FORBIDDEN', 'Untrusted request origin'),
  )
})
