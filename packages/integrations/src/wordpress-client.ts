const WORDPRESS_API_ORIGIN = 'https://public-api.wordpress.com'
const WORDPRESS_POSTS_PATH = '/wp/v2/sites'
const DEFAULT_SITE = 'scoobifydaily.com'
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_TIMEOUT_MS = 30_000
const DEFAULT_PAGE = 1
const DEFAULT_PER_PAGE = 20
const MAX_PAGE = 10_000
const MAX_PER_PAGE = 100
// WordPress.com documents this public site-post resource as unauthenticated.
// Source: https://developer.wordpress.com/docs/api/1.1/get/sites/%24site/posts/
// WordPress REST supports nested `_fields` selections to keep public responses small.
// Sources: https://developer.wordpress.org/rest-api/using-the-rest-api/global-parameters/
//         https://developer.wordpress.org/rest-api/using-the-rest-api/pagination/
const POST_FIELDS = [
  'id',
  'link',
  'date',
  'title.rendered',
  'content.rendered',
  'excerpt.rendered',
] as const

/** Raw HTML from WordPress. UNTRUSTED: this client does not sanitize or render it. */
export type UntrustedHtml = string & { readonly __untrustedHtml: unique symbol }

export interface WordPressPost {
  readonly id: number
  readonly link: string
  readonly date: string | null
  readonly title: {
    readonly rendered: UntrustedHtml
  }
  readonly content: {
    readonly rendered: UntrustedHtml
  }
  readonly excerpt: {
    readonly rendered: UntrustedHtml
  }
}

export interface ListWordPressPostsOptions {
  readonly page?: number
  readonly perPage?: number
  readonly order?: 'asc' | 'desc'
  readonly orderBy?: 'date' | 'modified' | 'id' | 'title' | 'slug'
  readonly after?: string
  readonly before?: string
}

export interface WordPressClientOptions {
  /** A WordPress.com site domain or numeric site ID. Defaults to Scoobify. */
  readonly site?: string
  readonly fetch?: typeof fetch
  /** Bounded request timeout in milliseconds. Defaults to 10 seconds. */
  readonly timeoutMs?: number
}

export interface WordPressClient {
  readonly listPosts: (options?: ListWordPressPostsOptions) => Promise<readonly WordPressPost[]>
}

export type WordPressErrorCode =
  | 'INVALID_INPUT'
  | 'HTTP_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'

export class WordPressClientError extends Error {
  readonly code: WordPressErrorCode

  constructor(code: WordPressErrorCode, message: string) {
    super(message)
    this.name = 'WordPressClientError'
    this.code = code
  }
}

export class WordPressInputError extends WordPressClientError {
  constructor(message: string) {
    super('INVALID_INPUT', message)
    this.name = 'WordPressInputError'
  }
}

export class WordPressHttpError extends WordPressClientError {
  readonly status: number

  constructor(status: number) {
    super('HTTP_ERROR', `WordPress.com request failed with HTTP status ${status}`)
    this.name = 'WordPressHttpError'
    this.status = status
  }
}

export class WordPressMalformedResponseError extends WordPressClientError {
  constructor() {
    super('MALFORMED_RESPONSE', 'WordPress.com returned an unexpected public post response')
    this.name = 'WordPressMalformedResponseError'
  }
}

export class WordPressNetworkError extends WordPressClientError {
  constructor() {
    super('NETWORK_ERROR', 'WordPress.com request could not be completed')
    this.name = 'WordPressNetworkError'
  }
}

export class WordPressTimeoutError extends WordPressClientError {
  constructor() {
    super('TIMEOUT', 'WordPress.com request timed out')
    this.name = 'WordPressTimeoutError'
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isRenderedField = (value: unknown): value is { readonly rendered: UntrustedHtml } =>
  isRecord(value) && typeof value.rendered === 'string'

const isPublicHttpLink = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

const isPost = (value: unknown): value is WordPressPost => {
  if (!isRecord(value)) return false
  if (!Number.isInteger(value.id) || (value.id as number) < 1) return false
  if (!isPublicHttpLink(value.link)) return false
  if (value.date !== null && typeof value.date !== 'string') return false
  return (
    isRenderedField(value.title) && isRenderedField(value.content) && isRenderedField(value.excerpt)
  )
}

const assertSiteIdentifier = (site: string): string => {
  if (site.length === 0 || site.length > 253) {
    throw new WordPressInputError('The WordPress.com site identifier is invalid')
  }

  const isNumericSiteId = /^\d+$/.test(site)
  const isDomain = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(
    site,
  )

  if (!isNumericSiteId && !isDomain) {
    throw new WordPressInputError('The WordPress.com site identifier is invalid')
  }

  return site
}

const assertBoundedInteger = (
  value: number,
  name: string,
  minimum: number,
  maximum: number,
): number => {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new WordPressInputError(`${name} must be an integer from ${minimum} to ${maximum}`)
  }
  return value
}

const assertTimeout = (timeoutMs: number): number => {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new WordPressInputError(`timeoutMs must be an integer from 1 to ${MAX_TIMEOUT_MS}`)
  }
  return timeoutMs
}

const buildPostsUrl = (site: string, options: ListWordPressPostsOptions): URL => {
  const url = new URL(
    `${WORDPRESS_POSTS_PATH}/${encodeURIComponent(site)}/posts`,
    WORDPRESS_API_ORIGIN,
  )
  const page = options.page ?? DEFAULT_PAGE
  const perPage = options.perPage ?? DEFAULT_PER_PAGE

  url.searchParams.set('page', String(assertBoundedInteger(page, 'page', DEFAULT_PAGE, MAX_PAGE)))
  url.searchParams.set(
    'per_page',
    String(assertBoundedInteger(perPage, 'perPage', 1, MAX_PER_PAGE)),
  )
  url.searchParams.set('_fields', POST_FIELDS.join(','))

  if (options.order !== undefined) url.searchParams.set('order', options.order)
  if (options.orderBy !== undefined) url.searchParams.set('orderby', options.orderBy)
  if (options.after !== undefined) url.searchParams.set('after', options.after)
  if (options.before !== undefined) url.searchParams.set('before', options.before)

  return url
}

const parsePosts = async (response: Response): Promise<readonly WordPressPost[]> => {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new WordPressMalformedResponseError()
  }

  if (!Array.isArray(payload) || !payload.every(isPost)) {
    throw new WordPressMalformedResponseError()
  }

  return payload.map((post) => ({
    id: post.id,
    link: post.link,
    date: post.date,
    title: { rendered: post.title.rendered },
    content: { rendered: post.content.rendered },
    excerpt: { rendered: post.excerpt.rendered },
  }))
}

export const createWordPressClient = (options: WordPressClientOptions = {}): WordPressClient => {
  const site = assertSiteIdentifier(options.site ?? DEFAULT_SITE)
  const request = options.fetch ?? globalThis.fetch
  const timeoutMs = assertTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  if (typeof request !== 'function') {
    throw new WordPressInputError('A native fetch implementation is required')
  }

  return {
    listPosts: async (listOptions = {}) => {
      const controller = new AbortController()
      let timedOut = false
      const timeout = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)

      try {
        const response = await request(buildPostsUrl(site, listOptions), {
          method: 'GET',
          redirect: 'error',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })

        if (!response.ok) throw new WordPressHttpError(response.status)
        return await parsePosts(response)
      } catch (error) {
        if (timedOut) throw new WordPressTimeoutError()
        if (error instanceof WordPressClientError) throw error
        throw new WordPressNetworkError()
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}

export const scoobifyWordPressClient = createWordPressClient()
