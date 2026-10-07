import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))

test('explicit Prisma generation runs under Node without a legacy executable', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'node-runtime-'))
  try {
    const marker = join(fixture, 'legacy-runtime-used')
    writeFileSync(
      join(fixture, 'bun'),
      `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'invoked'); process.exit(97)\n`,
      { mode: 0o700 },
    )
    const result = spawnSync('pnpm', ['run', 'db:generate'], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${fixture}:${process.env.PATH}`,
        DATABASE_URL: 'mongodb://127.0.0.1:27017/node_runtime_fixture?replicaSet=rs0',
      },
      encoding: 'utf8',
      timeout: 90_000,
    })
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.equal(existsSync(marker), false, existsSync(marker) ? readFileSync(marker, 'utf8') : '')
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
