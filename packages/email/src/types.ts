export type SendEmailInput = {
  to: string | readonly string[]
  subject: string
  html?: string
  text?: string
  headers?: Readonly<Record<string, string>>
  idempotencyKey?: string
}

export type SendEmailResult = {
  id: string
}

export type CreateEmailClientOptions = {
  apiKey?: string
  from?: string
  fetch?: typeof globalThis.fetch
  timeoutMs?: number
}

export type EmailClient = {
  send: (input: SendEmailInput) => Promise<SendEmailResult>
  sendEmail: (input: SendEmailInput) => Promise<SendEmailResult>
}

export type EmailTemplate = {
  subject: string
  html: string
  text: string
}

export type VerificationEmailOptions = {
  verificationUrl: string
  recipientName?: string
}

export type PasswordResetEmailOptions = {
  resetUrl: string
  recipientName?: string
}
