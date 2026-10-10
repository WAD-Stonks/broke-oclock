import type { AppConfig } from '@api/config'
import { type AuthEmailSender, createAuth as createSharedAuth } from '@broke-oclock/auth/server'
import type { Session } from '@broke-oclock/auth/types'
import type { CurrentUserResponse } from '@broke-oclock/contracts/api'
import {
  createEmailClient,
  createPasswordResetEmail,
  createVerificationEmail,
  type EmailTemplate,
} from '@broke-oclock/email/server'

// Wraps the Resend client so a delivery failure is logged (without details) and swallowed.
const createEmailSender = (email: NonNullable<AppConfig['email']>): AuthEmailSender => {
  const client = createEmailClient({ apiKey: email.apiKey, from: email.from })
  const deliver = async (to: string, template: EmailTemplate) => {
    try {
      await client.send({
        to,
        subject: template.subject,
        html: template.html,
        text: template.text,
      })
    } catch {
      console.error('An account email could not be sent')
    }
  }
  return {
    sendVerification: ({ name, email: to, url }) =>
      deliver(to, createVerificationEmail({ verificationUrl: url, recipientName: name })),
    sendPasswordReset: ({ name, email: to, url }) =>
      deliver(to, createPasswordResetEmail({ resetUrl: url, recipientName: name })),
  }
}

export const createAuth = (config: AppConfig) =>
  createSharedAuth({
    baseURL: config.betterAuthUrl,
    secret: config.betterAuthSecret,
    trustedOrigin: config.webOrigin,
    ...(config.email ? { email: createEmailSender(config.email) } : {}),
  })

export const toCurrentUserResponse = (session: Session): CurrentUserResponse => ({
  user: {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
  },
  session: { expiresAt: session.session.expiresAt.toISOString() },
})
