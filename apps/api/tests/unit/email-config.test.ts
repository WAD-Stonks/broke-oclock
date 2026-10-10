import { parseConfig } from '@api/config'
import { describe, expect, it } from 'vitest'

const base = {
  DATABASE_URL: 'mongodb://127.0.0.1:27017/unit_test?replicaSet=rs0',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
}

describe('email configuration', () => {
  it('stays disabled while the env values are placeholders or missing', () => {
    expect(parseConfig(base).email).toBeUndefined()
    expect(
      parseConfig({ ...base, RESEND_API_KEY: 'UNSET', EMAIL_FROM: 'UNCONFIGURED' }).email,
    ).toBeUndefined()
    expect(parseConfig({ ...base, RESEND_API_KEY: 're_test_key', EMAIL_FROM: '  ' }).email).toBe(
      undefined,
    )
  })

  it('is enabled only when both values are real', () => {
    expect(
      parseConfig({
        ...base,
        RESEND_API_KEY: 're_test_key',
        EMAIL_FROM: 'Deals <deals@example.test>',
      }).email,
    ).toEqual({ apiKey: 're_test_key', from: 'Deals <deals@example.test>' })
  })
})
