import {
  createEmailOTPEmail,
  createPasswordResetEmail,
  createVerificationEmail,
  EmailInputError,
} from '@email/server'
import { describe, expect, it } from 'vitest'

describe('transactional email templates', () => {
  it('renders six-digit OTPs unchanged with exact purpose-specific metadata', () => {
    const types = ['sign-in', 'email-verification', 'forget-password', 'change-email'] as const
    const subjects = new Set<string>()
    for (const type of types) {
      const template = createEmailOTPEmail({ otp: '012345', type })
      expect(template.html.includes('012345')).toBe(true)
      expect(template.text.includes('012345')).toBe(true)
      expect(template.text.includes('5 minutes')).toBe(true)
      subjects.add(template.subject)
    }
    expect(subjects.size).toBe(4)
  })
  it.each(['12345', '1234567', '１２３４５６', '<img/>', '12345\n'])(
    'rejects malformed OTPs',
    (otp) => {
      expect(() => createEmailOTPEmail({ otp, type: 'sign-in' })).toThrow(EmailInputError)
    },
  )
  it('rejects forged OTP purpose metadata', () => {
    expect(() => createEmailOTPEmail({ otp: '012345', type: 'unknown' as 'sign-in' })).toThrow(
      EmailInputError,
    )
  })
  it('renders escaped verification HTML and a matching plain-text message', () => {
    const template = createVerificationEmail({
      verificationUrl: 'https://example.test/verify?token=a&next=%3Cscript%3E',
      recipientName: '<Sam & Co>',
    })

    expect(template.subject).toBe('Verify your email address')
    expect(template.html).toContain('&lt;Sam &amp; Co&gt;')
    expect(template.html).toContain(
      'href="https://example.test/verify?token=a&amp;next=%3Cscript%3E"',
    )
    expect(template.html).not.toContain('<Sam & Co>')
    expect(template.text).toContain('Hi <Sam & Co>,')
    expect(template.text).toContain('https://example.test/verify?token=a&next=%3Cscript%3E')
  })

  it('renders escaped password-reset HTML and a plain-text message', () => {
    const template = createPasswordResetEmail({
      resetUrl: 'http://example.test/reset?token=reset-123',
      recipientName: 'Ava "Admin"',
    })

    expect(template.subject).toBe('Reset your password')
    expect(template.html).toContain('Hi Ava &quot;Admin&quot;,')
    expect(template.html).toContain('href="http://example.test/reset?token=reset-123"')
    expect(template.text).toContain('Hi Ava "Admin",')
    expect(template.text).toContain('Reset your password by opening this link:')
  })

  it.each([
    ['javascript URL', 'javascript:alert(1)'],
    ['data URL', 'data:text/html,unsafe'],
    ['relative URL', '/verify'],
    ['URL with credentials', 'https://user:password@example.test/verify'],
    ['CRLF URL', 'https://example.test/verify\r\nBcc: attacker@example.test'],
  ])('rejects an unsafe verification link: %s', (_label, verificationUrl) => {
    expect(() => createVerificationEmail({ verificationUrl })).toThrow(EmailInputError)
  })

  it('rejects CRLF in a display name instead of placing it in generated mail', () => {
    expect(() =>
      createPasswordResetEmail({
        resetUrl: 'https://example.test/reset',
        recipientName: 'Ava\nBcc: attacker@example.test',
      }),
    ).toThrow(EmailInputError)
  })
})
