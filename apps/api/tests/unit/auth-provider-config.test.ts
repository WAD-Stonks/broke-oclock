import { createAuth } from '@api/auth'
import { parseConfig } from '@api/config'
import { describe, expect, it } from 'vitest'

const base = {
  BETTER_AUTH_SECRET: 'test-only-auth-provider-secret-at-least-32',
  DATABASE_URL: 'mongodb://127.0.0.1:1/admin_completion_validation_only',
}
const providers = {
  GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'test-only-google-secret',
  RESEND_API_KEY: 're_test_only_key',
  EMAIL_FROM: 'Broke O Clock <auth@example.test>',
}

describe('optional authentication provider configuration', () => {
  it('configures native Google with verified linking and rejects unverified provider email for every OAuth admission', async () => {
    const auth = createAuth(parseConfig({ ...base, ...providers }))
    expect(Boolean(auth.options.socialProviders?.google)).toBe(true)
    expect(auth.options.account?.accountLinking).toEqual({
      enabled: true,
      disableImplicitLinking: false,
      requireLocalEmailVerified: true,
      trustedProviders: [],
      allowDifferentEmails: false,
      allowUnlinkingAll: false,
      updateUserInfoOnLink: false,
    })
    const validate = auth.options.user?.validateUserInfo
    expect(typeof validate).toBe('function')
    if (!validate) throw new Error('Missing supported user validation hook')
    for (const action of ['create-user', 'link-account', 'sign-in'] as const) {
      const source = { action, method: 'oauth', oauth: { providerId: 'google' } }
      // Provider proof is necessary for every action; linking also needs authoritative local context.
      const denied = await validate({ user: { emailVerified: false }, source })
      expect(denied).toEqual({
        error: 'EMAIL_NOT_VERIFIED',
        errorDescription: 'Verify your email before signing in.',
      })
      const verified = await validate({ user: { emailVerified: true }, source })
      if (action === 'link-account')
        expect(verified).toEqual({
          error: 'LOCAL_EMAIL_NOT_VERIFIED',
          errorDescription: 'Verify your local email before linking.',
        })
      else expect(verified).toBeUndefined()
    }
  })
  it('keeps only complete configured pairs and does not expose flags as credentials', () => {
    expect(parseConfig({ ...base, ...providers }).authProviders).toEqual({
      google: {
        clientId: providers.GOOGLE_CLIENT_ID,
        clientSecret: providers.GOOGLE_CLIENT_SECRET,
      },
      email: { apiKey: providers.RESEND_API_KEY, from: providers.EMAIL_FROM },
    })
  })
  it.each([undefined, '', 'UNSET', 'UNCONFIGURED', '  unconfigured  '])(
    'disables a partial optional pair without breaking password configuration',
    (missing) => {
      const config = parseConfig({
        ...base,
        ...providers,
        GOOGLE_CLIENT_SECRET: missing,
        EMAIL_FROM: missing,
      })
      expect(config.authProviders?.google).toBeUndefined()
      expect(config.authProviders?.email).toBeUndefined()
      expect(config.betterAuthSecret).toBe(base.BETTER_AUTH_SECRET)
    },
  )
  it.each([
    { GOOGLE_CLIENT_ID: 'invalid-client' },
    { GOOGLE_CLIENT_SECRET: 'private\r\nvalue' },
    { RESEND_API_KEY: 'private key' },
    { EMAIL_FROM: 'not-an-email' },
    { EMAIL_FROM: 'private\nvalue@example.test' },
  ])('rejects malformed provided values with a generic error', (invalid) => {
    expect(() => parseConfig({ ...base, ...providers, ...invalid })).toThrow(
      'Invalid authentication provider configuration',
    )
  })
})
