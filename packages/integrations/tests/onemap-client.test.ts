import { createOneMapClient } from '@integrations/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Offline synthetic provider contract fixtures, never real credentials/tokens/data.
const credentials = { email: 'synthetic@example.invalid', password: 'synthetic-password-only' }
const clockStart = 1_800_000_000_000
const token = (value = 'synthetic-token', expiry = clockStart / 1000 + 259_200) => ({
  access_token: value,
  expiry_timestamp: String(expiry),
})
const match = {
  SEARCHVAL: 'SYNTHETIC BUILDING',
  ADDRESS: 'SYNTHETIC ADDRESS',
  POSTAL: '200640',
  LATITUDE: '1.307435479483892',
  LONGITUDE: '103.8547139034306',
}
const expected = {
  searchValue: match.SEARCHVAL,
  address: match.ADDRESS,
  postalCode: match.POSTAL,
  latitude: Number(match.LATITUDE),
  longitude: Number(match.LONGITUDE),
}
const results = (items: unknown[] = [match]) => ({
  found: items.length,
  totalNumPages: items.length === 0 ? 0 : 1,
  pageNum: 1,
  results: items,
})
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
const isAuth = (input: Parameters<typeof fetch>[0]) =>
  new URL(String(input)).pathname.endsWith('/getToken')
afterEach(() => vi.useRealTimers())

describe('createOneMapClient', () => {
  it('authenticates lazily and sends the raw token on the fixed first-page search endpoint', async () => {
    const requests: { url: URL; init: RequestInit | undefined }[] = []
    const client = createOneMapClient({
      ...credentials,
      now: () => clockStart,
      fetch: async (input, init) => {
        requests.push({ url: new URL(String(input)), init })
        return json(isAuth(input) ? token() : results())
      },
    })
    expect(requests).toHaveLength(0)
    expect(await client.search('synthetic & query')).toEqual([expected])
    expect(requests).toHaveLength(2)
    expect(requests[0]?.url.href).toBe('https://www.onemap.gov.sg/api/auth/post/getToken')
    expect(requests[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual(credentials)
    expect(new Headers(requests[0]?.init?.headers).get('Content-Type')).toBe('application/json')
    expect(requests[1]?.url.origin).toBe('https://www.onemap.gov.sg')
    expect(requests[1]?.url.pathname).toBe('/api/common/elastic/search')
    expect(Object.fromEntries(requests[1]?.url.searchParams ?? [])).toEqual({
      searchVal: 'synthetic & query',
      returnGeom: 'Y',
      getAddrDetails: 'Y',
      pageNum: '1',
    })
    expect(new Headers(requests[1]?.init?.headers).get('Authorization')).toBe('synthetic-token')
    for (const { init } of requests) {
      expect(init?.redirect).toBe('error')
      expect(init?.signal).toBeInstanceOf(AbortSignal)
    }
  })

  it('shares concurrent authentication and reuses a token across distinct searches', async () => {
    let authCalls = 0
    let resolveAuth: ((response: Response) => void) | undefined
    const fetchMock: typeof fetch = async (input) => {
      if (!isAuth(input)) return json(results())
      authCalls += 1
      return new Promise<Response>((resolve) => {
        resolveAuth = resolve
      })
    }
    const client = createOneMapClient({ ...credentials, fetch: fetchMock, now: () => clockStart })
    const first = client.search('first')
    const second = client.search('second')
    expect(authCalls).toBe(1)
    resolveAuth?.(json(token()))
    expect(await Promise.all([first, second])).toEqual([[expected], [expected]])
    await client.search('third')
    expect(authCalls).toBe(1)
  })

  it('renews at the expiry buffer using Unix seconds, not milliseconds', async () => {
    let now = clockStart
    let authCalls = 0
    const client = createOneMapClient({
      ...credentials,
      now: () => now,
      fetch: async (input) => {
        if (!isAuth(input)) return json(results())
        authCalls += 1
        return json(token(`synthetic-token-${authCalls}`, now / 1000 + 120))
      },
    })
    await client.search('first')
    now += 89_000
    await client.search('second')
    expect(authCalls).toBe(1)
    now += 1_000
    await client.search('third')
    expect(authCalls).toBe(2)
  })

  it('caches queries for five minutes, trims keys and protects cached matches from mutation', async () => {
    let now = clockStart
    let searches = 0
    const client = createOneMapClient({
      ...credentials,
      now: () => now,
      fetch: async (input) => {
        if (isAuth(input)) return json(token())
        searches += 1
        return json(results())
      },
    })
    const first = await client.search('  synthetic  ')
    const item = first[0]
    if (item) item.address = 'caller mutation'
    first.pop()
    expect(await client.search('synthetic')).toEqual([expected])
    expect(searches).toBe(1)
    now += 299_999
    expect(await client.search('synthetic')).toEqual([expected])
    expect(searches).toBe(1)
    now += 1
    await client.search('synthetic')
    expect(searches).toBe(2)
  })

  it('bounds the query cache to 100 entries', async () => {
    let searches = 0
    const client = createOneMapClient({
      ...credentials,
      now: () => clockStart,
      fetch: async (input) => {
        if (isAuth(input)) return json(token())
        searches += 1
        return json(results())
      },
    })
    for (let index = 0; index <= 100; index += 1) await client.search(`query-${index}`)
    await client.search('query-100')
    expect(searches).toBe(101)
    await client.search('query-0')
    expect(searches).toBe(102)
  })

  it.each(['', '  ', 'x'.repeat(201), 'bad\nquery', 'bad\u0000query'])(
    'rejects invalid input before authenticating',
    async (query) => {
      let calls = 0
      const client = createOneMapClient({
        ...credentials,
        fetch: async () => {
          calls += 1
          return json(token())
        },
      })
      await expect(client.search(query)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
      expect(calls).toBe(0)
    },
  )

  it.each([{ email: '' }, { password: '' }, { email: 'invalid' }, { password: 'x'.repeat(4097) }])(
    'fails closed when not configured',
    async (changes) => {
      let calls = 0
      const client = createOneMapClient({
        ...credentials,
        ...changes,
        fetch: async () => {
          calls += 1
          return json(token())
        },
      })
      await expect(client.search('synthetic')).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })
      expect(calls).toBe(0)
    },
  )

  it.each([
    {},
    { access_token: '', expiry_timestamp: clockStart / 1000 + 100 },
    { ...token(), access_token: 'unsafe\r\nheader' },
    { ...token(), access_token: 1 },
    { ...token(), expiry_timestamp: 'junk' },
    { ...token(), expiry_timestamp: null },
    { ...token(), expiry_timestamp: clockStart / 1000 },
    { ...token(), expiry_timestamp: clockStart / 1000 + 30 },
    { ...token(), expiry_timestamp: 1e30 },
    { ...token(), error: 'synthetic auth rejection' },
  ])('rejects malformed or expired auth payload %j without search', async (payload) => {
    let searches = 0
    const client = createOneMapClient({
      ...credentials,
      now: () => clockStart,
      fetch: async (input) => {
        if (isAuth(input)) return json(payload)
        searches += 1
        return json(results())
      },
    })
    await expect(client.search('synthetic')).rejects.toMatchObject({ code: 'AUTH_ERROR' })
    expect(searches).toBe(0)
  })

  it('accepts numeric Unix expiry seconds', async () => {
    const client = createOneMapClient({
      ...credentials,
      now: () => clockStart,
      fetch: async (input) =>
        json(isAuth(input) ? { ...token(), expiry_timestamp: clockStart / 1000 + 120 } : results()),
    })
    expect(await client.search('synthetic')).toEqual([expected])
  })

  it('clears failed auth single-flight for a later attempt', async () => {
    let authCalls = 0
    const client = createOneMapClient({
      ...credentials,
      now: () => clockStart,
      fetch: async (input) => {
        if (!isAuth(input)) return json(results())
        authCalls += 1
        return json(authCalls === 1 ? {} : token())
      },
    })
    const outcomes = await Promise.allSettled([client.search('first'), client.search('second')])
    expect(outcomes.map((outcome) => outcome.status)).toEqual(['rejected', 'rejected'])
    expect(authCalls).toBe(1)
    expect(await client.search('third')).toEqual([expected])
    expect(authCalls).toBe(2)
  })

  it.each([
    { SEARCHVAL: 4 },
    { SEARCHVAL: '' },
    { ADDRESS: null },
    { ADDRESS: '' },
    { LATITUDE: '' },
    { LATITUDE: 'NaN' },
    { LATITUDE: '91' },
    { LATITUDE: '-91' },
    { LONGITUDE: '181' },
    { LONGITUDE: '-181' },
    { LONGITUDE: 'Infinity' },
    { LATITUDE: true },
  ])('rejects malformed match %j without caching it', async (changes) => {
    let searches = 0
    const client = createOneMapClient({
      ...credentials,
      now: () => clockStart,
      fetch: async (input) => {
        if (isAuth(input)) return json(token())
        searches += 1
        return json(results([{ ...match, ...changes }]))
      },
    })
    await expect(client.search('synthetic')).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
    await expect(client.search('synthetic')).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
    expect(searches).toBe(2)
  })

  it.each([
    null,
    {},
    { ...results(), found: '1' },
    { ...results(), found: -1 },
    { ...results(), found: 0 },
    { ...results(), totalNumPages: '1' },
    { ...results(), totalNumPages: 0 },
    { ...results(), pageNum: 2 },
    { ...results(), results: {} },
    results(Array.from({ length: 21 }, () => match)),
  ])('rejects invalid envelopes and oversized result pages', async (payload) => {
    const client = createOneMapClient({
      ...credentials,
      now: () => clockStart,
      fetch: async (input) => json(isAuth(input) ? token() : payload),
    })
    await expect(client.search('synthetic')).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
  })

  it.each(['NIL', '', 'not-a-postal-code', null, 200640])(
    'normalizes unusable postal codes %s to null',
    async (postal) => {
      const client = createOneMapClient({
        ...credentials,
        now: () => clockStart,
        fetch: async (input) =>
          json(isAuth(input) ? token() : results([{ ...match, POSTAL: postal }])),
      })
      expect(await client.search('synthetic')).toEqual([{ ...expected, postalCode: null }])
    },
  )

  it('validates the entire first page without following provider pagination', async () => {
    let searches = 0
    const client = createOneMapClient({
      ...credentials,
      now: () => clockStart,
      fetch: async (input) => {
        if (isAuth(input)) return json(token())
        searches += 1
        return json({
          ...results(Array.from({ length: 20 }, () => match)),
          found: 100,
          totalNumPages: 5,
        })
      },
    })
    expect(await client.search('synthetic')).toHaveLength(20)
    expect(searches).toBe(1)
  })

  it('returns and caches a successful empty search', async () => {
    let searches = 0
    const client = createOneMapClient({
      ...credentials,
      now: () => clockStart,
      fetch: async (input) => {
        if (isAuth(input)) return json(token())
        searches += 1
        return json(results([]))
      },
    })
    expect(await client.search('synthetic')).toEqual([])
    expect(await client.search('synthetic')).toEqual([])
    expect(searches).toBe(1)
  })

  it.each([
    'Authentication token missing. Please create an account and generate or renew your API Token.',
    'Token expired.',
    'Invalid token.',
  ])('renews once on HTTP 200 auth errors even with nonempty results: %s', async (error) => {
    let authCalls = 0
    let searches = 0
    const usedTokens: (string | null)[] = []
    const client = createOneMapClient({
      ...credentials,
      now: () => clockStart,
      fetch: async (input, init) => {
        if (isAuth(input)) {
          authCalls += 1
          return json(token(`synthetic-token-${authCalls}`))
        }
        searches += 1
        usedTokens.push(new Headers(init?.headers).get('Authorization'))
        return json(searches === 1 ? { ...results(), error } : results())
      },
    })
    expect(await client.search('synthetic')).toEqual([expected])
    expect(authCalls).toBe(2)
    expect(searches).toBe(2)
    expect(usedTokens).toEqual(['synthetic-token-1', 'synthetic-token-2'])
  })

  it.each([401, 403])('renews once on HTTP %s without reading its error body', async (status) => {
    let authCalls = 0
    let searches = 0
    const rejected = new Response('synthetic secret provider detail', { status })
    const client = createOneMapClient({
      ...credentials,
      now: () => clockStart,
      fetch: async (input) => {
        if (isAuth(input)) {
          authCalls += 1
          return json(token(`synthetic-token-${authCalls}`))
        }
        searches += 1
        return searches === 1 ? rejected : json(results())
      },
    })
    expect(await client.search('synthetic')).toEqual([expected])
    expect(authCalls).toBe(2)
    expect(searches).toBe(2)
    expect(rejected.bodyUsed).toBe(false)
  })

  it('does not accept nonempty results when both attempts have auth errors or cache that failure', async () => {
    let authCalls = 0
    let searches = 0
    const client = createOneMapClient({
      ...credentials,
      now: () => clockStart,
      fetch: async (input) => {
        if (isAuth(input)) {
          authCalls += 1
          return json(token(`synthetic-token-${authCalls}`))
        }
        searches += 1
        return json({ ...results(), error: 'Invalid token.' })
      },
    })
    await expect(client.search('synthetic')).rejects.toMatchObject({ code: 'AUTH_ERROR' })
    expect(authCalls).toBe(2)
    expect(searches).toBe(2)
    await expect(client.search('synthetic')).rejects.toMatchObject({ code: 'AUTH_ERROR' })
    expect(authCalls).toBe(4)
    expect(searches).toBe(4)
  })

  it.each(['Parameter searchVal is invalid.', 'API limit exceeded.'])(
    'rejects non-auth HTTP 200 errors without reauth: %s',
    async (error) => {
      let authCalls = 0
      const client = createOneMapClient({
        ...credentials,
        now: () => clockStart,
        fetch: async (input) => {
          if (isAuth(input)) {
            authCalls += 1
            return json(token())
          }
          return json({ ...results(), error })
        },
      })
      await expect(client.search('synthetic')).rejects.toMatchObject({ code: 'HTTP_ERROR' })
      expect(authCalls).toBe(1)
    },
  )

  it.each([null, false, '', {}])(
    'treats any malformed error attribute as failure',
    async (error) => {
      let authCalls = 0
      const client = createOneMapClient({
        ...credentials,
        now: () => clockStart,
        fetch: async (input) => {
          if (isAuth(input)) {
            authCalls += 1
            return json(token())
          }
          return json({ ...results(), error })
        },
      })
      await expect(client.search('synthetic')).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
      expect(authCalls).toBe(1)
    },
  )

  it('single-flights renewal for concurrent rejected sessions, including a late stale rejection', async () => {
    let authCalls = 0
    let releaseLate: (() => void) | undefined
    const late = new Promise<void>((resolve) => {
      releaseLate = resolve
    })
    const usedTokens: (string | null)[] = []
    const client = createOneMapClient({
      ...credentials,
      now: () => clockStart,
      fetch: async (input, init) => {
        if (isAuth(input)) {
          authCalls += 1
          return json(token(`synthetic-token-${authCalls}`))
        }
        const authorization = new Headers(init?.headers).get('Authorization')
        usedTokens.push(authorization)
        if (authorization === 'synthetic-token-1') {
          if (new URL(String(input)).searchParams.get('searchVal') === 'second') await late
          return json({ ...results(), error: 'Token expired.' })
        }
        return json(results())
      },
    })
    const first = client.search('first')
    const second = client.search('second')
    expect(await first).toEqual([expected])
    releaseLate?.()
    expect(await second).toEqual([expected])
    expect(authCalls).toBe(2)
    expect(usedTokens).toEqual([
      'synthetic-token-1',
      'synthetic-token-1',
      'synthetic-token-2',
      'synthetic-token-2',
    ])
  })

  it.each([
    ['auth', 401, 'AUTH_ERROR'],
    ['auth', 403, 'AUTH_ERROR'],
    ['auth', 429, 'HTTP_ERROR'],
    ['auth', 503, 'HTTP_ERROR'],
    ['search', 429, 'HTTP_ERROR'],
    ['search', 503, 'HTTP_ERROR'],
    ['search', 302, 'HTTP_ERROR'],
  ])(
    'redacts %s HTTP %s as %s without reading error bodies or retrying',
    async (stage, status, code) => {
      let authCalls = 0
      let searches = 0
      const rejected = new Response('synthetic sensitive provider detail', {
        status: Number(status),
      })
      const client = createOneMapClient({
        ...credentials,
        now: () => clockStart,
        fetch: async (input) => {
          if (isAuth(input)) {
            authCalls += 1
            return stage === 'auth' ? rejected : json(token())
          }
          searches += 1
          return rejected
        },
      })
      const error: unknown = await client.search('synthetic').catch((caught: unknown) => caught)
      expect(error).toMatchObject({ code })
      expect(rejected.bodyUsed).toBe(false)
      expect(String(error)).not.toContain('sensitive')
      expect(authCalls).toBe(1)
      expect(searches).toBe(stage === 'auth' ? 0 : 1)
    },
  )

  it.each(['auth', 'search'])(
    'redacts %s network failures and never logs credentials',
    async (stage) => {
      const log = vi.spyOn(console, 'log')
      const warn = vi.spyOn(console, 'warn')
      const errorLog = vi.spyOn(console, 'error')
      const client = createOneMapClient({
        ...credentials,
        now: () => clockStart,
        fetch: async (input) => {
          if (isAuth(input) && stage === 'search') return json(token())
          throw new Error(`${credentials.password} synthetic-token synthetic-network-secret`)
        },
      })
      const error: unknown = await client.search('synthetic').catch((caught: unknown) => caught)
      expect(error).toMatchObject({ code: 'NETWORK_ERROR' })
      for (const secret of [
        credentials.email,
        credentials.password,
        'synthetic-token',
        'synthetic-network-secret',
      ]) {
        expect(String(error)).not.toContain(secret)
        expect(JSON.stringify(error)).not.toContain(secret)
      }
      expect(error).not.toHaveProperty('cause')
      expect(log).not.toHaveBeenCalled()
      expect(warn).not.toHaveBeenCalled()
      expect(errorLog).not.toHaveBeenCalled()
    },
  )

  it.each(['auth', 'search'])(
    'rejects %s broken JSON without leaking provider text',
    async (stage) => {
      const client = createOneMapClient({
        ...credentials,
        now: () => clockStart,
        fetch: async (input) => {
          if (isAuth(input) && stage === 'search') return json(token())
          return new Response('{synthetic-secret-body', {
            headers: { 'content-type': 'application/json' },
          })
        },
      })
      const error: unknown = await client.search('synthetic').catch((caught: unknown) => caught)
      expect(error).toMatchObject({ code: 'MALFORMED_RESPONSE' })
      expect(String(error)).not.toContain('synthetic-secret-body')
    },
  )

  it.each(['auth', 'search'])(
    'enforces %s content type and content length limits',
    async (stage) => {
      const invalidHeaders: HeadersInit[] = [
        { 'content-type': 'text/html' },
        { 'content-type': 'application/json', 'content-length': '1048577' },
      ]
      for (const headers of invalidHeaders) {
        const client = createOneMapClient({
          ...credentials,
          now: () => clockStart,
          fetch: async (input) => {
            if (isAuth(input) && stage === 'search') return json(token())
            return new Response(JSON.stringify(isAuth(input) ? token() : results()), { headers })
          },
        })
        await expect(client.search('synthetic')).rejects.toMatchObject({
          code: 'MALFORMED_RESPONSE',
        })
      }
    },
  )

  it('bounds streamed bodies even without content length', async () => {
    const client = createOneMapClient({
      ...credentials,
      now: () => clockStart,
      fetch: async (input) => {
        if (isAuth(input)) return json(token())
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(600_000))
              controller.enqueue(new Uint8Array(600_000))
              controller.close()
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        )
      },
    })
    await expect(client.search('synthetic')).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
  })

  it.each(['auth-fetch', 'auth-body', 'search-fetch', 'search-body'])(
    'bounds %s by a ten-second deadline and aborts',
    async (stage) => {
      vi.useFakeTimers()
      let stalledSignal: AbortSignal | null | undefined
      const client = createOneMapClient({
        ...credentials,
        now: () => clockStart,
        fetch: async (input, init) => {
          if (isAuth(input) && stage.startsWith('search')) return json(token())
          stalledSignal = init?.signal
          if (stage.endsWith('fetch')) return new Promise<Response>(() => {})
          return new Response(new ReadableStream<Uint8Array>({ start() {} }), {
            headers: { 'content-type': 'application/json' },
          })
        },
      })
      const pending = client.search('synthetic').catch((caught: unknown) => caught)
      await vi.advanceTimersByTimeAsync(10_000)
      expect(await pending).toMatchObject({ code: 'TIMEOUT' })
      expect(stalledSignal?.aborted).toBe(true)
    },
    1000,
  )
})
