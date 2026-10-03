export type OneMapErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_CONFIGURED'
  | 'AUTH_ERROR'
  | 'HTTP_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'

export class OneMapClientError extends Error {
  readonly code: OneMapErrorCode
  constructor(code: OneMapErrorCode) {
    super(
      {
        INVALID_INPUT: 'OneMap search input is invalid',
        NOT_CONFIGURED: 'OneMap is not configured',
        AUTH_ERROR: 'OneMap authentication failed',
        HTTP_ERROR: 'OneMap request failed',
        MALFORMED_RESPONSE: 'OneMap returned an invalid response',
        NETWORK_ERROR: 'OneMap request could not be completed',
        TIMEOUT: 'OneMap request timed out',
      }[code],
    )
    this.name = 'OneMapClientError'
    this.code = code
  }
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export interface OneMapMatch {
  searchValue: string
  address: string
  postalCode: string | null
  latitude: number
  longitude: number
}
export interface OneMapClient {
  search(query: string): Promise<OneMapMatch[]>
}
export interface OneMapClientOptions {
  readonly email: string
  readonly password: string
  readonly fetch?: typeof fetch
  /** Unix milliseconds, like Date.now. */
  readonly now?: () => number
}

const validText = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 4096 && Boolean(value.trim())
const coordinate = (value: unknown, maximum: number): number => {
  if (
    !(
      typeof value === 'number' ||
      (typeof value === 'string' && /^[+-]?\d+(?:\.\d+)?$/.test(value))
    )
  ) {
    throw new OneMapClientError('MALFORMED_RESPONSE')
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || Math.abs(parsed) > maximum)
    throw new OneMapClientError('MALFORMED_RESPONSE')
  return parsed
}
const parseMatch = (value: unknown): OneMapMatch => {
  if (!isRecord(value) || !validText(value.SEARCHVAL) || !validText(value.ADDRESS))
    throw new OneMapClientError('MALFORMED_RESPONSE')
  return {
    searchValue: value.SEARCHVAL,
    address: value.ADDRESS,
    postalCode:
      typeof value.POSTAL === 'string' && /^\d{6}$/.test(value.POSTAL) ? value.POSTAL : null,
    latitude: coordinate(value.LATITUDE, 90),
    longitude: coordinate(value.LONGITUDE, 180),
  }
}
const count = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000
const parseResults = (payload: unknown): OneMapMatch[] => {
  // OneMap can return HTTP 200 AND nonempty results alongside an authentication error.
  // Presence of `error` is always failure, never a usable search result.
  if (isRecord(payload) && 'error' in payload) {
    if (!validText(payload.error)) throw new OneMapClientError('MALFORMED_RESPONSE')
    const authError =
      /token.*(missing|expired|invalid)|(missing|expired|invalid).*token|unauthori[sz]ed/i.test(
        payload.error,
      )
    throw new OneMapClientError(authError ? 'AUTH_ERROR' : 'HTTP_ERROR')
  }
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.results) ||
    payload.results.length > 20 ||
    !count(payload.found) ||
    payload.found < payload.results.length ||
    !count(payload.totalNumPages) ||
    !(payload.pageNum === 1 || (payload.pageNum === 0 && payload.found === 0)) ||
    (payload.found > 0 && (payload.totalNumPages === 0 || payload.results.length === 0))
  ) {
    throw new OneMapClientError('MALFORMED_RESPONSE')
  }
  return payload.results.map(parseMatch)
}

const REQUEST_TIMEOUT_MS = 10_000
const MAX_BODY_BYTES = 1_048_576

const readJson = async (response: Response, signal: AbortSignal): Promise<unknown> => {
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  const length = response.headers.get('content-length')
  if (
    contentType !== 'application/json' ||
    (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) ||
    !response.body
  ) {
    throw new OneMapClientError('MALFORMED_RESPONSE')
  }
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
        cancel()
        throw new OneMapClientError('MALFORMED_RESPONSE')
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
    return JSON.parse(text) as unknown
  } catch {
    throw new OneMapClientError('MALFORMED_RESPONSE')
  } finally {
    signal.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}

const requestJson = async (
  request: typeof fetch,
  url: URL | string,
  init: RequestInit,
): Promise<unknown> => {
  const controller = new AbortController()
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
      reject(new OneMapClientError('TIMEOUT'))
    }, REQUEST_TIMEOUT_MS)
  })
  const run = async (): Promise<unknown> => {
    const response = await request(url, { ...init, redirect: 'error', signal: controller.signal })
    if (controller.signal.aborted) {
      void response.body?.cancel().catch(() => {})
      throw new OneMapClientError('TIMEOUT')
    }
    if (response.status === 401 || response.status === 403)
      throw new OneMapClientError('AUTH_ERROR')
    if (!response.ok) throw new OneMapClientError('HTTP_ERROR')
    return readJson(response, controller.signal)
  }
  try {
    return await Promise.race([run(), deadline])
  } catch (error) {
    if (timedOut) throw new OneMapClientError('TIMEOUT')
    if (error instanceof OneMapClientError) throw error
    throw new OneMapClientError('NETWORK_ERROR')
  } finally {
    clearTimeout(timer)
  }
}

/** Server-only transport: credentials and tokens stay inside this client instance.
 * Authentication: https://www.onemap.gov.sg/apidocs/authentication
 * Raw Authorization and HTTP-200 errors: https://www.onemap.gov.sg/apidocs/docs/verifyingsearchapitoken
 * Unix-seconds expiry (normally three days), renewed 30s early; single-flight auth.
 * Search is first-page-only (<=20 matches), <=1 MiB JSON, 10s per HTTP request.
 * Successful query results have an ephemeral 5-minute / 100-entry FIFO cache.
 * No persistent storage or licence/reuse-rights guarantee; consumers own attribution
 * and applicable OneMap API terms. Construction does not authenticate or call search.
 */
export const createOneMapClient = (options: OneMapClientOptions): OneMapClient => {
  const request = options.fetch ?? globalThis.fetch
  const now = options.now ?? Date.now
  const { email, password } = options
  type Session = { token: string; expiresAt: number }
  let session: Session | undefined
  let authPending: Promise<Session> | undefined
  const cache = new Map<string, { expiresAt: number; matches: OneMapMatch[] }>()
  const authenticate = async () => {
    const auth = await requestJson(request, 'https://www.onemap.gov.sg/api/auth/post/getToken', {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (
      !isRecord(auth) ||
      'error' in auth ||
      typeof auth.access_token !== 'string' ||
      auth.access_token.length > 4096 ||
      !/^[A-Za-z0-9._~-]+$/.test(auth.access_token) ||
      !(
        typeof auth.expiry_timestamp === 'number' ||
        (typeof auth.expiry_timestamp === 'string' && /^\d+$/.test(auth.expiry_timestamp))
      )
    ) {
      throw new OneMapClientError('AUTH_ERROR')
    }
    const expiresAt = Number(auth.expiry_timestamp) * 1000
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now() + 30_000)
      throw new OneMapClientError('AUTH_ERROR')
    session = { token: auth.access_token, expiresAt }
    return session
  }
  const getSession = async (rejected?: Session) => {
    if (rejected && session === rejected) session = undefined
    if (session && session.expiresAt > now() + 30_000) return session
    if (!authPending)
      authPending = authenticate().finally(() => {
        authPending = undefined
      })
    return authPending
  }
  return {
    search: async (query) => {
      if (
        typeof query !== 'string' ||
        query.length > 200 ||
        Array.from(query).some(
          (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        ) ||
        !query.trim()
      ) {
        throw new OneMapClientError('INVALID_INPUT')
      }
      if (
        typeof email !== 'string' ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        typeof password !== 'string' ||
        !password.trim() ||
        password.length > 4096
      ) {
        throw new OneMapClientError('NOT_CONFIGURED')
      }
      query = query.trim()
      const cached = cache.get(query)
      if (cached && cached.expiresAt > now()) return cached.matches.map((item) => ({ ...item }))
      let auth = await getSession()
      const url = new URL('https://www.onemap.gov.sg/api/common/elastic/search')
      url.search = new URLSearchParams({
        searchVal: query,
        returnGeom: 'Y',
        getAddrDetails: 'Y',
        pageNum: '1',
      }).toString()
      const searchOnce = async (current: Session): Promise<OneMapMatch[]> => {
        const payload = await requestJson(request, url, {
          method: 'GET',
          headers: { Authorization: current.token, Accept: 'application/json' },
        })
        return parseResults(payload)
      }
      let matches: OneMapMatch[]
      try {
        matches = await searchOnce(auth)
      } catch (error) {
        if (!(error instanceof OneMapClientError) || error.code !== 'AUTH_ERROR') throw error
        auth = await getSession(auth)
        try {
          matches = await searchOnce(auth)
        } catch (retryError) {
          if (
            retryError instanceof OneMapClientError &&
            retryError.code === 'AUTH_ERROR' &&
            session === auth
          )
            session = undefined
          throw retryError
        }
      }
      for (const [key, entry] of cache) if (entry.expiresAt <= now()) cache.delete(key)
      cache.delete(query)
      cache.set(query, { expiresAt: now() + 300_000, matches })
      if (cache.size > 100) {
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
      }
      return matches.map((item) => ({ ...item }))
    },
  }
}
