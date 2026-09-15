import {
  EmailConfigurationError,
  EmailInputError,
  EmailNetworkError,
  EmailProviderError,
  EmailTimeoutError,
} from '@email/errors'
import {
  buildPasswordResetEmail,
  buildVerificationEmail,
  createPasswordResetEmail,
  createVerificationEmail,
  escapeHtml,
} from '@email/templates'
import type {
  CreateEmailClientOptions,
  EmailClient,
  EmailTemplate,
  PasswordResetEmailOptions,
  SendEmailInput,
  SendEmailResult,
  VerificationEmailOptions,
} from '@email/types'

const RESEND_EMAILS_URL = 'https://api.resend.com/emails'
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_TIMEOUT_MS = 120_000
const MAX_RECIPIENTS = 50
const MAX_IDEMPOTENCY_KEY_LENGTH = 256
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u

const isUnavailable = (value: unknown) => {
  if (typeof value !== 'string' || value.trim() === '') return true
  return /^(?:unset|unconfigured)$/iu.test(value.trim())
}

const hasCrLf = (value: string) => /[\r\n]/u.test(value)

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const validateConfiguredValue = (value: unknown) => {
  if (isUnavailable(value) || (typeof value === 'string' && hasCrLf(value))) {
    throw new EmailConfigurationError()
  }
}

const validateString = (value: unknown, allowEmpty = false, rejectCrLf = true) => {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.trim() === '') ||
    (rejectCrLf && hasCrLf(value))
  ) {
    throw new EmailInputError()
  }
}

const validateRecipients = (value: unknown) => {
  if (typeof value === 'string') {
    validateString(value)
    return value
  }

  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_RECIPIENTS) {
    throw new EmailInputError()
  }
  const recipients: string[] = []
  for (const recipient of value as readonly unknown[]) {
    if (typeof recipient !== 'string') throw new EmailInputError()
    validateString(recipient)
    recipients.push(recipient)
  }
  return recipients
}

const validateCustomHeaders = (value: unknown) => {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw new EmailInputError()

  const headers: Record<string, string> = {}
  for (const [name, headerValue] of Object.entries(value)) {
    if (
      !HEADER_NAME.test(name) ||
      typeof headerValue !== 'string' ||
      hasCrLf(name) ||
      hasCrLf(headerValue)
    ) {
      throw new EmailInputError()
    }
    headers[name] = headerValue
  }
  return headers
}

const validateInput = (input: SendEmailInput) => {
  if (!isRecord(input)) throw new EmailInputError()

  const to = validateRecipients(input.to)
  validateString(input.subject)
  if (input.subject.length > 998) throw new EmailInputError()

  if (input.html !== undefined) validateString(input.html, true, false)
  if (input.text !== undefined) validateString(input.text, true, false)
  if (input.html === undefined && input.text === undefined) throw new EmailInputError()

  const headers = validateCustomHeaders(input.headers)
  if (input.idempotencyKey !== undefined) {
    validateString(input.idempotencyKey)
    if (input.idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) throw new EmailInputError()
  }

  return { to, headers }
}

const readProviderResponse = async (response: Response): Promise<SendEmailResult> => {
  if (!response.ok) throw new EmailProviderError()

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new EmailProviderError()
  }

  if (!isRecord(body) || typeof body.id !== 'string' || body.id.trim() === '' || hasCrLf(body.id)) {
    throw new EmailProviderError()
  }
  return { id: body.id }
}

export const createEmailClient = (options: CreateEmailClientOptions = {}): EmailClient => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new EmailConfigurationError()
  }

  const requestFetch = options.fetch ?? globalThis.fetch

  const send = async (input: SendEmailInput): Promise<SendEmailResult> => {
    validateConfiguredValue(options.apiKey)
    validateConfiguredValue(options.from)
    if (typeof requestFetch !== 'function') throw new EmailConfigurationError()

    const { to, headers } = validateInput(input)
    const body: Record<string, unknown> = {
      from: options.from,
      to,
      subject: input.subject,
    }
    if (input.html !== undefined) body.html = input.html
    if (input.text !== undefined) body.text = input.text
    if (headers !== undefined) body.headers = headers

    const requestHeaders: Record<string, string> = {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    }
    if (input.idempotencyKey !== undefined) requestHeaders['Idempotency-Key'] = input.idempotencyKey

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      // POST email delivery is a side effect; deliberately make one attempt only.
      const response = await requestFetch(RESEND_EMAILS_URL, {
        method: 'POST',
        redirect: 'error',
        headers: requestHeaders,
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      return await readProviderResponse(response)
    } catch (error) {
      if (controller.signal.aborted) throw new EmailTimeoutError()
      if (error instanceof EmailProviderError) throw error
      throw new EmailNetworkError()
    } finally {
      clearTimeout(timeout)
    }
  }

  return { send, sendEmail: send }
}

export type {
  CreateEmailClientOptions,
  EmailClient,
  EmailTemplate,
  PasswordResetEmailOptions,
  SendEmailInput,
  SendEmailResult,
  VerificationEmailOptions,
}
export {
  buildPasswordResetEmail,
  buildVerificationEmail,
  createPasswordResetEmail,
  createVerificationEmail,
  EmailConfigurationError,
  EmailInputError,
  EmailNetworkError,
  EmailProviderError,
  EmailTimeoutError,
  escapeHtml,
}
