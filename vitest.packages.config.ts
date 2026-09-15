import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['packages/{email,integrations,rpc}/tests/**/*.test.ts'],
    restoreMocks: true,
    unstubGlobals: true,
    testTimeout: 15_000,
  },
})
