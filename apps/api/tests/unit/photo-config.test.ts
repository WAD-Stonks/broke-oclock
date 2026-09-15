import { describe, expect, it } from 'vitest'
import { parseConfig } from '../../src/config'

const environment = {
  BETTER_AUTH_SECRET: 'unit-test-only-secret-not-a-real-credential',
  DATABASE_URL: 'mongodb://127.0.0.1:27017/unit_test?replicaSet=rs0',
  PHOTO_STORAGE_PROVIDER: 'uploadthing',
}

describe('photo storage configuration', () => {
  it.each([undefined, '', 'UNSET', 'UNCONFIGURED'])(
    'disables uploads for an unset token',
    (token) => {
      expect(parseConfig({ ...environment, UPLOADTHING_TOKEN: token }).photoStorage).toBeUndefined()
    },
  )
  it('passes configured credentials only into server configuration', () => {
    expect(
      parseConfig({ ...environment, UPLOADTHING_TOKEN: 'test-only-token', NODE_ENV: 'production' })
        .photoStorage,
    ).toEqual({ token: 'test-only-token', isDev: false })
  })
  it('allows SDK development callbacks only outside production', () => {
    expect(
      parseConfig({ ...environment, UPLOADTHING_TOKEN: 'test-only-token', NODE_ENV: 'development' })
        .photoStorage?.isDev,
    ).toBe(true)
  })
  it('does not enable development callbacks when NODE_ENV is absent', () => {
    expect(
      parseConfig({ ...environment, UPLOADTHING_TOKEN: 'test-only-token' }).photoStorage?.isDev,
    ).toBe(false)
  })
  it('rejects an unsupported provider without echoing its value', () => {
    expect(() =>
      parseConfig({ ...environment, PHOTO_STORAGE_PROVIDER: 'unexpected-provider' }),
    ).toThrow('PHOTO_STORAGE_PROVIDER must be uploadthing')
  })
})
