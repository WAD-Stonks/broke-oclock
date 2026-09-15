import { describe, expect, it } from 'vitest'
import { parseConfig } from '../../src/config'

const environment = {
  BETTER_AUTH_SECRET: 'unit-test-only-secret-not-a-real-credential',
  DATABASE_URL: 'mongodb://127.0.0.1:27017/unit_test?replicaSet=rs0',
}

describe('configuration boundary', () => {
  it('uses documented local origins and port', () => {
    expect(parseConfig(environment)).toMatchObject({
      port: 3000,
      webOrigin: 'http://localhost:5173',
      betterAuthUrl: 'http://localhost:3000',
      databaseUrl: environment.DATABASE_URL,
    })
  })
  it('requires an explicit database instead of silently using a different one', () => {
    expect(() => parseConfig({ BETTER_AUTH_SECRET: environment.BETTER_AUTH_SECRET })).toThrow(
      'DATABASE_URL',
    )
  })
  it.each(['', 'short'])('rejects missing/short secrets without printing the value', (secret) => {
    expect(() => parseConfig({ ...environment, BETTER_AUTH_SECRET: secret })).toThrow(
      'BETTER_AUTH_SECRET',
    )
  })
  it.each(['0', '65536', '3.5', 'not-a-port'])('rejects invalid port %s', (port) => {
    expect(() => parseConfig({ ...environment, PORT: port })).toThrow('PORT')
  })
  it.each([
    'https://example.com/path',
    'https://example.com?x=1',
    '*',
    'https://user:password@example.com',
  ])('rejects non-origin WEB_ORIGIN', (origin) => {
    expect(() => parseConfig({ ...environment, WEB_ORIGIN: origin })).toThrow('WEB_ORIGIN')
  })
  it.each(['postgresql://localhost/db', 'mongodb://', 'mongodb://localhost'])(
    'rejects malformed/missing-name MongoDB targets',
    (url) => {
      expect(() => parseConfig({ ...environment, DATABASE_URL: url })).toThrow('DATABASE_URL')
    },
  )
})
