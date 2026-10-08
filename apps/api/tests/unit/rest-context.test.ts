import type { AppConfig } from '@api/config'
import { createRestContext } from '@api/rest/context'
import type { Auth } from '@broke-oclock/auth/types'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => vi.restoreAllMocks())

it('resolves the session from each request cookie instead of retaining identity', async () => {
  const auth = {
    api: {
      getSession: vi.fn(async ({ headers }: { headers: Headers }) => {
        const cookie = headers.get('cookie') ?? ''
        return cookie.includes('first=')
          ? ({ user: { id: 'first' } } as never)
          : cookie.includes('second=')
            ? ({ user: { id: 'second' } } as never)
            : null
      }),
    },
  } as unknown as Auth
  const config = { webOrigin: 'https://app.example' } as AppConfig
  const request = (cookie: string) =>
    ({
      headers: { cookie },
      get: (name: string) => (name === 'origin' ? config.webOrigin : undefined),
    }) as never

  const first = await createRestContext(request('first=one'), config, auth)
  const second = await createRestContext(request('second=two'), config, auth)

  expect(first.session?.user.id).toBe('first')
  expect(second.session?.user.id).toBe('second')
  expect(auth.api.getSession).toHaveBeenCalledTimes(2)
})
