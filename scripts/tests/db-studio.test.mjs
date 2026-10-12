import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))

test('root db:studio command runs the installed Prisma Studio and forwards options', () => {
  const result = spawnSync('pnpm', ['db:studio', '--help'], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: 'mongodb://127.0.0.1:1/studio_command_validation_only',
      CHECKPOINT_DISABLE: '1',
    },
    encoding: 'utf8',
    timeout: 30_000,
  })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /Browse your data with Prisma Studio/)
  assert.match(result.stdout, /--port/)
  assert.match(result.stdout, /--browser/)
})
