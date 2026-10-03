import { createMoneyDigestClient } from '@integrations/server'
import { describe, expect, it } from 'vitest'

// Synthetic fixtures only: no live source access or content-reuse permission implied.
const post = {
  id: 42,
  link: 'https://www.moneydigest.sg/synthetic-post/',
  date: '2026-01-02T03:04:05',
  title: { rendered: 'Synthetic title' },
  content: { rendered: '<p>Untrusted synthetic HTML</p>' },
  excerpt: { rendered: '<p>Synthetic excerpt</p>' },
}
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('createMoneyDigestClient', () => {
  it('uses the site REST API, category 285 and bounded date-ordered page defaults without auth', async () => {
    const urls: URL[] = []
    const client = createMoneyDigestClient({
      fetch: async (input, init) => {
        urls.push(new URL(String(input)))
        expect(init?.method).toBe('GET')
        expect(init?.redirect).toBe('error')
        expect(new Headers(init?.headers).get('Authorization')).toBeNull()
        expect(init?.signal).toBeInstanceOf(AbortSignal)
        return json([post])
      },
    })
    expect(await client.listPosts()).toEqual([post])
    const url = urls[0]
    expect(url?.origin).toBe('https://www.moneydigest.sg')
    expect(url?.pathname).toBe('/wp-json/wp/v2/posts')
    expect(Object.fromEntries(url?.searchParams ?? [])).toEqual({
      categories: '285',
      page: '1',
      per_page: '20',
      order: 'desc',
      orderby: 'date',
      _fields: 'id,link,date,title.rendered,content.rendered,excerpt.rendered',
    })
  })

  it('maps compatible explicit ordering and date filters into one page request', async () => {
    const urls: URL[] = []
    const client = createMoneyDigestClient({
      fetch: async (input) => {
        urls.push(new URL(String(input)))
        return json([])
      },
    })
    await client.listPosts({
      page: 2,
      perPage: 3,
      order: 'asc',
      orderBy: 'modified',
      after: '2026-01-01T00:00:00Z',
      before: '2026-02-01T00:00:00Z',
    })
    expect(urls).toHaveLength(1)
    expect(Object.fromEntries(urls[0]?.searchParams ?? [])).toMatchObject({
      page: '2',
      per_page: '3',
      order: 'asc',
      orderby: 'modified',
      after: '2026-01-01T00:00:00Z',
      before: '2026-02-01T00:00:00Z',
    })
  })

  it.each([
    { page: 0 },
    { page: 10_001 },
    { page: 1.5 },
    { page: Number.NaN },
    { perPage: 0 },
    { perPage: 21 },
    { perPage: Infinity },
    JSON.parse('{"order":"unsafe"}'),
    JSON.parse('{"orderBy":"unsafe"}'),
    { after: 'not-a-date' },
    { before: '2026-02-30T00:00:00Z' },
  ])('rejects invalid query %j before network', async (options) => {
    let calls = 0
    const client = createMoneyDigestClient({
      fetch: async () => {
        calls += 1
        return json([])
      },
    })
    await expect(client.listPosts(options)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(calls).toBe(0)
  })

  it.each([0, -1, 30_001, Number.NaN, 1.5])('rejects invalid timeout %s', (timeoutMs) => {
    expect(() => createMoneyDigestClient({ timeoutMs, fetch: async () => json([]) })).toThrow()
  })
  it.each([
    { id: 0 },
    { id: 1.5 },
    { id: Number.MAX_SAFE_INTEGER + 1 },
    { title: { rendered: 1 } },
    { content: null },
    { excerpt: null },
    { date: 'junk' },
    { date: '2026-02-30T12:00:00' },
    { link: 'http://www.moneydigest.sg/post' },
    { link: 'https://evil.example/post' },
    { link: 'https://www.moneydigest.sg.evil.example/post' },
    { link: 'https://user:pass@www.moneydigest.sg/post' },
    { link: 'javascript:alert(1)' },
    { link: 'https://www.moneydigest.sg:444/post' },
  ])('rejects malformed post %j with its index, not its untrusted fields', async (changes) => {
    const client = createMoneyDigestClient({
      fetch: async () => json([post, { ...post, ...changes }]),
    })
    await expect(client.listPosts()).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
      postIndex: 1,
    })
  })

  it('normalizes missing excerpt and null date and projects only validated fields', async () => {
    const client = createMoneyDigestClient({
      fetch: async () =>
        json([
          {
            ...post,
            date: null,
            excerpt: undefined,
            privateField: 'discard',
            title: { ...post.title, extra: 'discard' },
          },
        ]),
    })
    expect(await client.listPosts()).toEqual([{ ...post, date: null, excerpt: { rendered: '' } }])
  })

  it.each([{}, null, Array.from({ length: 21 }, () => post)])(
    'rejects an invalid page envelope',
    async (payload) => {
      const client = createMoneyDigestClient({ fetch: async () => json(payload) })
      await expect(client.listPosts()).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
    },
  )

  it('rejects more posts than requested', async () => {
    const client = createMoneyDigestClient({ fetch: async () => json([post, post]) })
    await expect(client.listPosts({ perPage: 1 })).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    })
  })
  it.each([301, 401, 429, 503])('redacts HTTP %s without reading error body', async (status) => {
    const response = new Response('synthetic sensitive provider detail', { status })
    const client = createMoneyDigestClient({ fetch: async () => response })
    const error: unknown = await client.listPosts().catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'HTTP_ERROR' })
    expect(response.bodyUsed).toBe(false)
    expect(String(error)).not.toContain('sensitive')
  })

  it('redacts network causes', async () => {
    const client = createMoneyDigestClient({
      fetch: async () => {
        throw new Error('synthetic secret cause')
      },
    })
    const error: unknown = await client.listPosts().catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'NETWORK_ERROR' })
    expect(String(error)).not.toContain('secret')
    expect(error).not.toHaveProperty('cause')
  })

  it.each([
    () => new Response('[]', { headers: { 'content-type': 'text/html' } }),
    () => new Response('{invalid', { headers: { 'content-type': 'application/json' } }),
    () =>
      new Response('[]', {
        headers: { 'content-type': 'application/json', 'content-length': '1048577' },
      }),
    () => json([{ ...post, content: { rendered: 'x'.repeat(1_048_576) } }]),
  ])('rejects non-JSON, broken JSON and bounded-body violations', async (response) => {
    const client = createMoneyDigestClient({ fetch: async () => response() })
    await expect(client.listPosts()).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
  })

  it.each(['fetch', 'body'])(
    'times out stalled %s even when injected fetch ignores abort',
    async (stage) => {
      let signal: AbortSignal | null | undefined
      const client = createMoneyDigestClient({
        timeoutMs: 5,
        fetch: async (_input, init) => {
          signal = init?.signal
          if (stage === 'fetch') return new Promise<Response>(() => {})
          return new Response(new ReadableStream<Uint8Array>({ start() {} }), {
            headers: { 'content-type': 'application/json' },
          })
        },
      })
      await expect(client.listPosts()).rejects.toMatchObject({ code: 'TIMEOUT' })
      expect(signal?.aborted).toBe(true)
    },
    1000,
  )

  it.each([
    ' https://www.moneydigest.sg/post',
    'https://www.moneydigest.sg/po\nst',
    'https:\\www.moneydigest.sg\\post',
  ])('rejects links that URL parsing would silently repair', async (link) => {
    const client = createMoneyDigestClient({ fetch: async () => json([{ ...post, link }]) })
    await expect(client.listPosts()).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
      postIndex: 0,
    })
  })

  it('cancels a stalled body on timeout', async () => {
    let canceled = false
    const client = createMoneyDigestClient({
      timeoutMs: 5,
      fetch: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              canceled = true
            },
          }),
          {
            headers: { 'content-type': 'application/json' },
          },
        ),
    })
    await expect(client.listPosts()).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(canceled).toBe(true)
  })

  it.each([null, { page: null }, { perPage: null }, { order: null }, { orderBy: null }])(
    'rejects runtime null options without accessing the provider',
    async (options) => {
      let calls = 0
      const client = createMoneyDigestClient({
        fetch: async () => {
          calls += 1
          return json([])
        },
      })
      await expect(Reflect.apply(client.listPosts, client, [options])).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      })
      expect(calls).toBe(0)
    },
  )

  it('cancels a late fetch response after the deadline instead of starting its body read', async () => {
    let resolveFetch: ((response: Response) => void) | undefined
    let canceled = false
    const client = createMoneyDigestClient({
      timeoutMs: 5,
      fetch: async () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        }),
    })
    await expect(client.listPosts()).rejects.toMatchObject({ code: 'TIMEOUT' })
    resolveFetch?.(
      new Response(
        new ReadableStream<Uint8Array>({
          cancel() {
            canceled = true
          },
        }),
        {
          headers: { 'content-type': 'application/json' },
        },
      ),
    )
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(canceled).toBe(true)
  })
})
