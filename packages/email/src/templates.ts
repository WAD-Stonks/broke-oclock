import { EmailInputError } from '@email/errors'
import type {
  EmailTemplate,
  PasswordResetEmailOptions,
  VerificationEmailOptions,
} from '@email/types'

const hasCrLf = (value: string) => /[\r\n]/u.test(value)

const requireHttpUrl = (value: string) => {
  if (typeof value !== 'string' || value.length === 0 || hasCrLf(value)) throw new EmailInputError()

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new EmailInputError()
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new EmailInputError()
  }

  return url.href
}

const requireRecipientName = (value: string | undefined) => {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || hasCrLf(value) || value.length > 200) throw new EmailInputError()
  return value.trim() || undefined
}

export const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

const greeting = (name: string | undefined) => (name ? `Hi ${name},` : 'Hello,')

export const createVerificationEmail = (options: VerificationEmailOptions): EmailTemplate => {
  if (typeof options !== 'object' || options === null) throw new EmailInputError()
  const { verificationUrl, recipientName } = options
  const safeUrl = requireHttpUrl(verificationUrl)
  const safeName = requireRecipientName(recipientName)
  const textGreeting = greeting(safeName)
  const htmlGreeting = escapeHtml(textGreeting)
  const htmlUrl = escapeHtml(safeUrl)

  return {
    subject: 'Verify your email address',
    html: `<p>${htmlGreeting}</p><p>Please verify your email address by <a href="${htmlUrl}">clicking this link</a>.</p><p>If you did not create an account, you can ignore this email.</p>`,
    text: `${textGreeting}\n\nPlease verify your email address by opening this link:\n${safeUrl}\n\nIf you did not create an account, you can ignore this email.`,
  }
}

export const createPasswordResetEmail = (options: PasswordResetEmailOptions): EmailTemplate => {
  if (typeof options !== 'object' || options === null) throw new EmailInputError()
  const { resetUrl, recipientName } = options
  const safeUrl = requireHttpUrl(resetUrl)
  const safeName = requireRecipientName(recipientName)
  const textGreeting = greeting(safeName)
  const htmlGreeting = escapeHtml(textGreeting)
  const htmlUrl = escapeHtml(safeUrl)

  return {
    subject: 'Reset your password',
    html: `<p>${htmlGreeting}</p><p>Reset your password by <a href="${htmlUrl}">clicking this link</a>.</p><p>If you did not request a password reset, you can ignore this email.</p>`,
    text: `${textGreeting}\n\nReset your password by opening this link:\n${safeUrl}\n\nIf you did not request a password reset, you can ignore this email.`,
  }
}

export const buildVerificationEmail = createVerificationEmail
export const buildPasswordResetEmail = createPasswordResetEmail
