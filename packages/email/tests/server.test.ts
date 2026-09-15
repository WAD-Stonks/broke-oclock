import {
  createEmailClient,
  EmailConfigurationError,
  EmailInputError,
  EmailNetworkError,
  EmailProviderError,
  EmailTimeoutError,
  type SendEmailInput,
} from '@email/server'
import { describe, expect, it, vi } from 'vitest'

const endpoint = 'https://api.resend.com/emails'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const validInput: SendEmailInput = {
  to: ['person@example.test'],
  subject: 'Welcome',
  html: '<p>Welcome</p>',
  text: 'Welcome',
}

describe('Resend email client', () => {
  it.each([undefined, '', 'UNSET', 'UNCONFIGURED'])(
    'fails closed for an unavailable API key before network access',
    async (apiKey) => {
      const fetchMock = vi.fn<typeof fetch>()
      const client = createEmailClient({
        apiKey,
        from: "Broke O'Clock <mail@example.test>",
        fetch: fetchMock,
      })

      await expect(client.send(validInput)).rejects.toBeInstanceOf(EmailConfigurationError)
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it.each([undefined, '', 'UNSET', 'UNCONFIGURED'])(
    'fails closed for an unavailable sender before network access',
    async (from) => {
      const fetchMock = vi.fn<typeof fetch>()
      const client = createEmailClient({ apiKey: 're_test_key', from, fetch: fetchMock })

      await expect(client.send(validInput)).rejects.toBeInstanceOf(EmailConfigurationError)
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('does not read environment variables when explicit configuration is absent', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const client = createEmailClient({ fetch: fetchMock })

    await expect(client.send(validInput)).rejects.toBeInstanceOf(EmailConfigurationError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps the documented Resend request, fixed endpoint, and idempotency header', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 'email_123' }))
    const client = createEmailClient({
      apiKey: 're_test_key',
      from: "Broke O'Clock <mail@example.test>",
      fetch: fetchMock,
    })

    const result = await client.send({
      to: ['one@example.test', 'two@example.test'],
      subject: 'Hello',
      html: '<p>Hello</p>',
      text: 'Hello',
      headers: { 'X-Product': 'broke-oclock' },
      idempotencyKey: 'signup-user-123',
    })

    expect(result).toEqual({ id: 'email_123' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [input, init] = fetchMock.mock.calls[0] ?? []
    expect(input).toBe(endpoint)
    expect(init?.method).toBe('POST')
    expect(init?.redirect).toBe('error')
    expect(init?.headers).toEqual({
      Authorization: 'Bearer re_test_key',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'signup-user-123',
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      from: "Broke O'Clock <mail@example.test>",
      to: ['one@example.test', 'two@example.test'],
      subject: 'Hello',
      html: '<p>Hello</p>',
      text: 'Hello',
      headers: { 'X-Product': 'broke-oclock' },
    })
  })

  it('supports the sendEmail method as the same one-shot side-effect operation', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ id: 'email_456' }))
    const client = createEmailClient({
      apiKey: 're_test_key',
      from: 'mail@example.test',
      fetch: fetchMock,
    })

    await expect(client.sendEmail(validInput)).resolves.toEqual({ id: 'email_456' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['missing recipients', { ...validInput, to: [] }],
    [
      'too many recipients',
      { ...validInput, to: Array.from({ length: 51 }, () => 'a@example.test') },
    ],
    ['missing subject', { ...validInput, subject: '' }],
    ['missing content', { ...validInput, html: undefined, text: undefined }],
    ['CRLF subject', { ...validInput, subject: 'Hello\r\nBcc: bad@example.test' }],
    ['CRLF idempotency key', { ...validInput, idempotencyKey: 'safe\r\nX-Injected: yes' }],
  ] as const)('rejects %s before network access', async (_label, input) => {
    const fetchMock = vi.fn<typeof fetch>()
    const client = createEmailClient({
      apiKey: 're_test_key',
      from: 'mail@example.test',
      fetch: fetchMock,
    })

    await expect(client.send(input)).rejects.toBeInstanceOf(EmailInputError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects CRLF in the sender or custom email headers', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    const client = createEmailClient({
      apiKey: 're_test_key',
      from: 'mail\r\nBcc: bad@example.test',
      fetch: fetchMock,
    })

    await expect(client.send(validInput)).rejects.toBeInstanceOf(EmailConfigurationError)
    expect(fetchMock).not.toHaveBeenCalled()

    const safeClient = createEmailClient({
      apiKey: 're_test_key',
      from: 'mail@example.test',
      fetch: fetchMock,
    })
    await expect(
      safeClient.send({ ...validInput, headers: { 'X-Test': 'safe\nmalicious' } }),
    ).rejects.toBeInstanceOf(EmailInputError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects provider failures without exposing the provider body or API key', async () => {
    const secret = 're_test_secret_do_not_return'
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ message: `provider body ${secret}` }, 422))
    const client = createEmailClient({
      apiKey: secret,
      from: 'mail@example.test',
      fetch: fetchMock,
    })

    const error = await client.send(validInput).catch((value: unknown) => value)
    expect(error).toBeInstanceOf(EmailProviderError)
    expect(String(error)).not.toContain(secret)
    expect(String(error)).not.toContain('provider body')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['non-object JSON', 'null'],
    ['missing ID', JSON.stringify({ ok: true })],
    ['non-string ID', JSON.stringify({ id: 123 })],
    ['empty ID', JSON.stringify({ id: '' })],
    ['invalid JSON', '{not-json'],
  ])('rejects a malformed provider success response: %s', async (_label, body) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }),
      )
    const client = createEmailClient({
      apiKey: 're_test_key',
      from: 'mail@example.test',
      fetch: fetchMock,
    })

    await expect(client.send(validInput)).rejects.toBeInstanceOf(EmailProviderError)
  })

  it('maps network failures to a safe generic error without retrying', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('socket details and secret'))
    const client = createEmailClient({
      apiKey: 're_test_key',
      from: 'mail@example.test',
      fetch: fetchMock,
    })

    const error = await client.send(validInput).catch((value: unknown) => value)
    expect(error).toBeInstanceOf(EmailNetworkError)
    expect(String(error)).not.toContain('socket details')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('aborts a hung request at the configured timeout without retrying', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    const client = createEmailClient({
      apiKey: 're_test_key',
      from: 'mail@example.test',
      fetch: fetchMock,
      timeoutMs: 10,
    })

    await expect(client.send(validInput)).rejects.toBeInstanceOf(EmailTimeoutError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
