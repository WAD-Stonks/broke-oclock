import {
  type UntrustedHtml,
  type WordPressClient,
  WordPressClientError,
  type WordPressPost,
} from '@integrations/wordpress-client'

const boundedInteger = (value: number, maximum: number): number => {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new WordPressClientError('INVALID_INPUT', 'MoneyDigest request option is invalid')
  }
  return value
}

const isDate = (value: unknown): value is string => {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)
  )
    return false
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  return (
    Number.isFinite(Date.parse(value)) &&
    Number.isFinite(calendar.getTime()) &&
    calendar.toISOString().slice(0, 10) === value.slice(0, 10) &&
    Number(value.slice(11, 13)) < 24 &&
    Number(value.slice(14, 16)) < 60 &&
    Number(value.slice(17, 19)) < 60
  )
}

/** Strict transport: rejects the page at the first invalid post, exposing only its index.
 * HTML parsing failures of otherwise valid posts remain the caller's per-post responsibility.
 */
export class MoneyDigestMalformedPostError extends WordPressClientError {
  readonly postIndex: number
  constructor(postIndex: number) {
    super('MALFORMED_RESPONSE', 'MoneyDigest returned an invalid post')
    this.name = 'MoneyDigestMalformedPostError'
    this.postIndex = postIndex
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const rendered = (value: unknown): value is { rendered: UntrustedHtml } =>
  isRecord(value) && typeof value.rendered === 'string'

const isSourceLink = (value: unknown): value is string => {
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    Array.from(value).some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127 || character === '\\',
    )
  )
    return false
  try {
    const url = new URL(value)
    return url.origin === 'https://www.moneydigest.sg' && !url.username && !url.password
  } catch {
    return false
  }
}

const parsePost = (value: unknown, index: number): WordPressPost => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    !Number.isSafeInteger(value.id) ||
    value.id < 1 ||
    !isSourceLink(value.link) ||
    (value.date !== null && !isDate(value.date)) ||
    !rendered(value.title) ||
    !rendered(value.content) ||
    (value.excerpt !== undefined && !rendered(value.excerpt))
  ) {
    throw new MoneyDigestMalformedPostError(index)
  }
  return {
    id: value.id,
    link: value.link,
    date: value.date,
    title: { rendered: value.title.rendered },
    content: { rendered: value.content.rendered },
    excerpt: { rendered: rendered(value.excerpt) ? value.excerpt.rendered : ('' as UntrustedHtml) },
  }
}

const MAX_BODY_BYTES = 1_048_576
const malformed = (): WordPressClientError =>
  new WordPressClientError('MALFORMED_RESPONSE', 'MoneyDigest returned an invalid response')

const readJson = async (response: Response, signal: AbortSignal): Promise<unknown> => {
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  const length = response.headers.get('content-length')
  if (
    contentType !== 'application/json' ||
    (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) ||
    !response.body
  )
    throw malformed()
  const reader = response.body.getReader()
  const cancel = () => {
    void reader.cancel().catch(() => {})
  }
  signal.addEventListener('abort', cancel, { once: true })
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let text = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {})
        throw malformed()
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    return JSON.parse(text) as unknown
  } catch {
    throw malformed()
  } finally {
    signal.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}

export interface MoneyDigestClientOptions {
  readonly fetch?: typeof fetch
  readonly timeoutMs?: number
}

/** Server-only, unauthenticated read-only transport; makes no request at construction.
 * One page (at most 20 posts), <=1 MiB JSON, 10s default / 30s maximum timeout.
 * Returned rendered HTML remains UNTRUSTED. Callers own reuse permission, opt-in,
 * cooldowns, parsing and persistence; technical access does not grant reuse rights.
 */
export const createMoneyDigestClient = (
  options: MoneyDigestClientOptions = {},
): WordPressClient => {
  const request = options.fetch ?? globalThis.fetch
  const timeoutMs = boundedInteger(options.timeoutMs ?? 10_000, 30_000)
  return {
    listPosts: async (listOptions = {}) => {
      if (typeof listOptions !== 'object' || listOptions === null || Array.isArray(listOptions))
        throw new WordPressClientError('INVALID_INPUT', 'MoneyDigest request options are invalid')
      const page = boundedInteger(listOptions.page === undefined ? 1 : listOptions.page, 10_000)
      const perPage = boundedInteger(
        listOptions.perPage === undefined ? 20 : listOptions.perPage,
        20,
      )
      const order = listOptions.order === undefined ? 'desc' : listOptions.order
      const orderBy = listOptions.orderBy === undefined ? 'date' : listOptions.orderBy
      if (
        !['asc', 'desc'].includes(order) ||
        !['date', 'modified', 'id', 'title', 'slug'].includes(orderBy)
      ) {
        throw new WordPressClientError('INVALID_INPUT', 'MoneyDigest ordering is invalid')
      }
      for (const value of [listOptions.after, listOptions.before]) {
        if (value !== undefined && !isDate(value))
          throw new WordPressClientError('INVALID_INPUT', 'MoneyDigest date filter is invalid')
      }
      const url = new URL('https://www.moneydigest.sg/wp-json/wp/v2/posts')
      url.search = new URLSearchParams({
        categories: '285',
        page: String(page),
        per_page: String(perPage),
        order,
        orderby: orderBy,
        _fields: 'id,link,date,title.rendered,content.rendered,excerpt.rendered',
      }).toString()
      if (listOptions.after !== undefined) url.searchParams.set('after', listOptions.after)
      if (listOptions.before !== undefined) url.searchParams.set('before', listOptions.before)
      const controller = new AbortController()
      let timedOut = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          timedOut = true
          controller.abort()
          reject(new WordPressClientError('TIMEOUT', 'MoneyDigest request timed out'))
        }, timeoutMs)
      })
      const run = async (): Promise<readonly WordPressPost[]> => {
        const response = await request(url, {
          method: 'GET',
          redirect: 'error',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        if (controller.signal.aborted) {
          void response.body?.cancel().catch(() => {})
          throw new WordPressClientError('TIMEOUT', 'MoneyDigest request timed out')
        }
        if (!response.ok) throw new WordPressClientError('HTTP_ERROR', 'MoneyDigest request failed')
        const payload = await readJson(response, controller.signal)
        if (!Array.isArray(payload) || payload.length > perPage) throw malformed()
        return payload.map(parsePost)
      }
      try {
        return await Promise.race([run(), deadline])
      } catch (error) {
        if (timedOut) throw new WordPressClientError('TIMEOUT', 'MoneyDigest request timed out')
        if (error instanceof WordPressClientError) throw error
        throw new WordPressClientError(
          'NETWORK_ERROR',
          'MoneyDigest request could not be completed',
        )
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
