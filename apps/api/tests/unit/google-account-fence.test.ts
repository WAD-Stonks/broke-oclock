import { createAuth } from '@api/auth'
import { parseConfig } from '@api/config'
import { describe, expect, it, vi } from 'vitest'

// Direct filesystem source harness; production imports remain the shared public factory.
const fenceSource = new URL(
  '../../../../packages/auth/src/google-account-fence.ts',
  import.meta.url,
)
const base = {
  DATABASE_URL: 'mongodb://127.0.0.1:1/nonconnecting_fence_unit',
  BETTER_AUTH_SECRET: 'test-only-fence-secret-at-least-32-characters',
}

describe('Google account admission trust boundary', () => {
  it('fails closed without native hook context while leaving credential admission unchanged', async () => {
    const auth = createAuth(parseConfig(base))
    const admit = auth.options.databaseHooks?.account?.create?.before
    if (!admit) throw new Error('Missing supported admission hook')
    const account = {
      providerId: 'google',
      accountId: 'fixture',
      userId: 'fixture',
      id: 'fixture',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    expect(await admit(account, null)).toBe(false)
    expect(await admit({ ...account, providerId: 'credential' }, null)).toBeUndefined()
  })
  it('uses a private enumerable symbol that survives native object spread but not JSON', async () => {
    const { createGoogleAccountFence } = await import(fenceSource.href)
    const fence = createGoogleAccountFence()
    const data = fence.stamp(
      { userId: 'fixture', accountId: 'fixture' },
      {
        userId: 'fixture',
        accountId: 'fixture',
        email: 'fixture@example.test',
        provenEmail: 'fixture@example.test',
        sessionId: null,
      },
    )
    const symbols = Object.getOwnPropertySymbols(data)
    expect(symbols).toHaveLength(1)
    expect(Object.getOwnPropertySymbols({ ...data })).toEqual(symbols)
    expect(Object.getOwnPropertySymbols(JSON.parse(JSON.stringify(data)))).toEqual([])
    expect(Object.keys(data)).toEqual(['userId', 'accountId'])
  })
  it.each(['missing', 'different'] as const)(
    'rejects %s provider-proven email in a trusted stamp before any transaction authorization touches',
    async (scenario) => {
      const { createGoogleAccountFence } = await import(fenceSource.href)
      const fence = createGoogleAccountFence()
      const tx = {
        findOne: vi.fn().mockResolvedValue({
          id: 'fixture',
          email: 'fixture@example.test',
          emailVerified: true,
          updatedAt: new Date(),
        }),
        updateMany: vi.fn().mockResolvedValue(1),
        create: vi.fn().mockResolvedValue({ id: 'created' }),
      }
      const insert = tx.create
      const factory = () => ({
        ...tx,
        options: { adapterConfig: { transaction: () => {} } },
        transaction: (work: (adapter: typeof tx) => Promise<unknown>) => work(tx),
      })
      const adapter = fence.adapter(factory)({})
      const data = fence.stamp(
        { providerId: 'google', userId: 'fixture', accountId: 'fixture' },
        {
          userId: 'fixture',
          accountId: 'fixture',
          email: 'fixture@example.test',
          sessionId: null,
          ...(scenario === 'different' ? { provenEmail: 'other@example.test' } : {}),
        },
      )
      await expect(adapter.create({ model: 'account', data })).rejects.toThrow()
      expect(tx.updateMany).not.toHaveBeenCalled()
      expect(insert).not.toHaveBeenCalled()
    },
  )

  it('rejects adapters whose public configuration has no real transaction support', async () => {
    const { createGoogleAccountFence } = await import(fenceSource.href)
    const fence = createGoogleAccountFence()
    const factory = () => ({ options: { adapterConfig: { transaction: false } } })
    expect(() => fence.adapter(factory)({})).toThrow('requires a transactional adapter')
  })
})
