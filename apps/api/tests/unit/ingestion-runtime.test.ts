import { parseConfig } from '@api/config'
import { parseMoneyDigestPost } from '@api/modules/ingestion/parser'
import { createIngestionRuntime } from '@api/modules/ingestion/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'

const base = {
  DATABASE_URL: 'mongodb://127.0.0.1:27017/synthetic',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
}
afterEach(() => vi.unstubAllGlobals())
describe('production runtime composition with mocked external HTTP only', () => {
  it('constructs without requests and accepts the real transport canonical MoneyDigest host', async () => {
    const providerFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 901,
            link: 'https://www.moneydigest.sg/synthetic-deal/',
            date: '2026-10-01T12:00:00',
            title: { rendered: 'Synthetic Pizza' },
            content: {
              rendered:
                'Singapore pizza 1-for-1. Valid from 1 October 2026 until 31 December 2026.',
            },
            excerpt: { rendered: '' },
          },
        ]),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', providerFetch)
    const runtime = createIngestionRuntime(
      parseConfig({ ...base, INGESTION_ENABLED: 'true', MONEYDIGEST_REUSE_APPROVED: 'true' }),
    )
    expect(providerFetch).not.toHaveBeenCalled()
    const posts = await runtime.listPosts({ page: 1, perPage: 20 })
    expect(providerFetch).toHaveBeenCalledTimes(1)
    expect(String(providerFetch.mock.calls[0]?.[0])).toContain(
      'https://www.moneydigest.sg/wp-json/wp/v2/posts?',
    )
    expect(parseMoneyDigestPost(posts[0])).toMatchObject({
      status: 'NEEDS_REVIEW',
      draft: {
        validFrom: new Date('2026-09-30T16:00:00Z'),
        validUntil: new Date('2026-12-31T16:00:00Z'),
      },
    })
  })
})
