import { parseConfig } from '@api/config'
import { describe, expect, it } from 'vitest'

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
      community: {
        evidenceWindowHours: 72,
        confirmThreshold: 3,
        deadThreshold: 2,
        reconfirmHours: 24,
        contentReportThreshold: 3,
      },
    })
  })
  it('parses positive community policy settings', () => {
    expect(
      parseConfig({
        ...environment,
        DEAL_CONFIRM_THRESHOLD: '4',
        COMMUNITY_EVIDENCE_WINDOW_HOURS: '48',
      }).community,
    ).toMatchObject({ confirmThreshold: 4, evidenceWindowHours: 48 })
    expect(() => parseConfig({ ...environment, DEAL_DEAD_REPORT_THRESHOLD: '0' })).toThrow(
      'DEAL_DEAD_REPORT_THRESHOLD',
    )
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
