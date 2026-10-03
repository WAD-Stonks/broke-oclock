import { parseConfig } from '@api/config'
import { describe, expect, it } from 'vitest'

const base = {
  DATABASE_URL: 'mongodb://127.0.0.1:27017/synthetic',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
}
describe('ingestion configuration', () => {
  it('fails closed unless both explicit opt-ins are true', () => {
    expect(parseConfig(base).ingestion).toMatchObject({ enabled: false, reuseApproved: false })
    expect(
      parseConfig({ ...base, INGESTION_ENABLED: 'true', MONEYDIGEST_REUSE_APPROVED: 'true' })
        .ingestion,
    ).toMatchObject({ enabled: true, reuseApproved: true })
    expect(() => parseConfig({ ...base, INGESTION_ENABLED: 'yes' })).toThrow('INGESTION_ENABLED')
  })
  it('does not configure OneMap from partial or placeholder secrets', () => {
    expect(
      parseConfig({ ...base, ONEMAP_EMAIL: 'synthetic@example.test' }).ingestion?.oneMap,
    ).toBeUndefined()
    expect(
      parseConfig({
        ...base,
        ONEMAP_EMAIL: 'synthetic@example.test',
        ONEMAP_EMAIL_PASSWORD: 'UNSET',
      }).ingestion?.oneMap,
    ).toBeUndefined()
    expect(
      parseConfig({
        ...base,
        ONEMAP_EMAIL: 'synthetic@example.test',
        ONEMAP_EMAIL_PASSWORD: 'synthetic-password',
      }).ingestion?.oneMap,
    ).toEqual({ email: 'synthetic@example.test', password: 'synthetic-password' })
  })
})
