import {
  createWordPressClient,
  WordPressHttpError,
  WordPressInputError,
  WordPressMalformedResponseError,
  WordPressNetworkError,
  type WordPressPost,
  WordPressTimeoutError,
} from '@integrations/wordpress-client'
import { describe, expect, it } from 'vitest'

const post: WordPressPost = {
  id: 42,
  link: 'https://scoobifydaily.com/example-post/',
  date: '2026-01-02T03:04:05',
  title: { rendered: 'A title' as WordPressPost['title']['rendered'] },
  content: {
    rendered: '<p>Raw <strong>content</strong></p>' as WordPressPost['content']['rendered'],
  },
  excerpt: {
    rendered: '<p>Raw excerpt</p>' as WordPressPost['excerpt']['rendered'],
  },
}

const responseFor = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('createWordPressClient', () => {
  it('maps post query options and keeps requests on the WordPress.com host', async () => {
    const requests: URL[] = []
    const fetchMock: typeof fetch = async (input, init) => {
      expect(init?.redirect).toBe('error')
      requests.push(new URL(input instanceof Request ? input.url : String(input)))
      return responseFor([post])
    }
    const client = createWordPressClient({ site: 'scoobifydaily.com', fetch: fetchMock })

    const result = await client.listPosts({
      page: 2,
      perPage: 50,
      order: 'asc',
      orderBy: 'modified',
      after: '2026-01-01T00:00:00Z',
      before: '2026-02-01T00:00:00Z',
    })

    const request = requests[0]
    expect(result).toEqual([post])
    expect(request?.origin).toBe('https://public-api.wordpress.com')
    expect(request?.pathname).toBe('/wp/v2/sites/scoobifydaily.com/posts')
    expect(request?.searchParams.get('page')).toBe('2')
    expect(request?.searchParams.get('per_page')).toBe('50')
    expect(request?.searchParams.get('order')).toBe('asc')
    expect(request?.searchParams.get('orderby')).toBe('modified')
    expect(request?.searchParams.get('after')).toBe('2026-01-01T00:00:00Z')
    expect(request?.searchParams.get('before')).toBe('2026-02-01T00:00:00Z')
    expect(request?.searchParams.get('_fields')).toBe(
      'id,link,date,title.rendered,content.rendered,excerpt.rendered',
    )
  })

  it('rejects out-of-bounds pagination before calling fetch', async () => {
    const fetchMock: typeof fetch = async () => responseFor([post])
    const client = createWordPressClient({ fetch: fetchMock })

    await expect(client.listPosts({ page: 0 })).rejects.toBeInstanceOf(WordPressInputError)
    await expect(client.listPosts({ page: 10_001 })).rejects.toBeInstanceOf(WordPressInputError)
    await expect(client.listPosts({ perPage: 0 })).rejects.toBeInstanceOf(WordPressInputError)
    await expect(client.listPosts({ perPage: 101 })).rejects.toBeInstanceOf(WordPressInputError)
  })

  it('runtime-validates the selected public post fields', async () => {
    const fetchMock: typeof fetch = async () => responseFor([{ ...post, title: { rendered: 123 } }])
    const client = createWordPressClient({ fetch: fetchMock })

    await expect(client.listPosts()).rejects.toBeInstanceOf(WordPressMalformedResponseError)
  })

  it('maps non-2xx responses to a typed error without reading the response body', async () => {
    let bodyRead = false
    const response = new Response('provider details', { status: 503 })
    Object.defineProperty(response, 'json', {
      value: async () => {
        bodyRead = true
        return { secret: 'not read' }
      },
    })
    const fetchMock: typeof fetch = async () => response
    const client = createWordPressClient({ fetch: fetchMock })

    const error = await client.listPosts().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(WordPressHttpError)
    expect((error as WordPressHttpError).status).toBe(503)
    expect(bodyRead).toBe(false)
  })

  it('maps fetch failures to a typed network error without exposing the cause', async () => {
    const fetchMock: typeof fetch = async () => {
      throw new Error('secret network implementation detail')
    }
    const client = createWordPressClient({ fetch: fetchMock })

    const error = await client.listPosts().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(WordPressNetworkError)
    expect((error as Error).message).not.toContain('secret network implementation detail')
  })

  it('aborts a stalled request and reports a typed timeout error', async () => {
    const fetchMock: typeof fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted by test fetch')), {
          once: true,
        })
      })
    const client = createWordPressClient({ fetch: fetchMock, timeoutMs: 5 })

    const error = await client.listPosts().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(WordPressTimeoutError)
    expect((error as Error).message).not.toContain('aborted by test fetch')
  })

  it('rejects unsafe site identifiers before any request is made', async () => {
    let calls = 0
    const fetchMock: typeof fetch = async () => {
      calls += 1
      return responseFor([post])
    }

    for (const site of ['https://evil.example', 'evil.example/path', 'evil.example:443']) {
      expect(() => createWordPressClient({ site, fetch: fetchMock })).toThrow(WordPressInputError)
    }

    expect(calls).toBe(0)
  })
  it('classifies a response-body abort as timeout rather than malformed JSON', async () => {
    const client = createWordPressClient({
      timeoutMs: 5,
      fetch: async (_input, init) => {
        const response = responseFor([])
        Object.defineProperty(response, 'json', {
          value: () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(new Error('body aborted')), {
                once: true,
              })
            }),
        })
        return response
      },
    })
    await expect(client.listPosts()).rejects.toBeInstanceOf(WordPressTimeoutError)
  })

  it('rejects unsafe post links and projects only the validated public fields', async () => {
    const unsafe = createWordPressClient({
      fetch: async () => responseFor([{ ...post, link: 'javascript:alert(1)' }]),
    })
    await expect(unsafe.listPosts()).rejects.toBeInstanceOf(WordPressMalformedResponseError)
    const valid = createWordPressClient({
      fetch: async () =>
        responseFor([
          { ...post, extra: 'not part of contract', title: { ...post.title, extra: 'not public' } },
        ]),
    })
    expect(await valid.listPosts()).toEqual([post])
  })
})
