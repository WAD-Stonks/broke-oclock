import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = (path) => readFileSync(join(root, path), 'utf8')
const manifest = JSON.parse(read('package.json'))
const biome = join(root, 'node_modules/@biomejs/biome/bin/biome')
const valid = 'export const value = 1\n'
const invalid = 'export const value=1;\n'

const fixtureTest = (name, run) => {
  test(name, () => {
    const container = mkdtempSync(join(tmpdir(), 'formatting-'))
    const fixture = join(container, 'project')
    mkdirSync(fixture)
    try {
      writeFileSync(join(fixture, 'biome.json'), read('biome.json'))
      writeFileSync(join(fixture, '.gitignore'), read('.gitignore'))
      writeFileSync(join(fixture, 'valid.ts'), valid)
      run(fixture)
    } finally {
      rmSync(container, { recursive: true, force: true })
    }
  })
}

const check = (fixture, script = 'lint', env = {}) => {
  const [command, ...args] = manifest.scripts[script].split(' ')
  assert.equal(command, 'biome')
  return spawnSync(process.execPath, [biome, ...args], {
    cwd: fixture,
    env: { ...process.env, BIOME_CONFIG_PATH: '', ...env },
    encoding: 'utf8',
    timeout: 30_000,
  })
}
const output = (result) => `${result.stdout}\n${result.stderr}`
const git = (cwd, args) => {
  const result = spawnSync('git', args, {
    cwd,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: join(cwd, 'empty-git-config'),
    },
    encoding: 'utf8',
    timeout: 30_000,
  })
  assert.equal(result.status, 0, output(result))
  return result.stdout.trim()
}

fixtureTest(
  'Git keeps text LF with Windows-style autocrlf and preserves binary bytes',
  (fixture) => {
    const source = join(fixture, 'source')
    const checkout = join(fixture, 'checkout')
    mkdirSync(source)
    if (existsSync(join(root, '.gitattributes'))) {
      writeFileSync(join(source, '.gitattributes'), read('.gitattributes'))
    }
    const textFiles = {
      'sample.ts': valid,
      'Component.vue': '<template>\n  <p>Hello</p>\n</template>\n',
      'config.json': '{\n  "value": 1\n}\n',
    }
    for (const [name, content] of Object.entries(textFiles)) {
      writeFileSync(join(source, name), content)
    }
    const binary = Buffer.from([0, 137, 80, 78, 71, 13, 10, 26, 10])
    writeFileSync(join(source, 'image.png'), binary)
    git(source, ['init', '--quiet'])
    git(source, ['-c', 'core.autocrlf=false', 'add', '.'])
    git(source, [
      '-c',
      'user.name=Formatting Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    ])
    git(fixture, [
      'clone',
      '--quiet',
      '--no-hardlinks',
      '--config',
      'core.autocrlf=true',
      source,
      checkout,
    ])
    for (const [name, content] of Object.entries(textFiles)) {
      assert.equal(readFileSync(join(checkout, name), 'utf8'), content, name)
    }
    assert.deepEqual(readFileSync(join(checkout, 'image.png')), binary)
  },
)

for (const ignore of ['.ignore', '.git/info/exclude']) {
  fixtureTest(`local ${ignore} cannot hide a formatting failure`, (fixture) => {
    writeFileSync(join(fixture, 'invalid.ts'), invalid)
    git(fixture, ['init', '--quiet'])
    const before = check(fixture)
    assert.equal(before.status, 1, output(before))
    assert.match(output(before), /invalid\.ts/)
    mkdirSync(dirname(join(fixture, ignore)), { recursive: true })
    writeFileSync(join(fixture, ignore), 'invalid.ts\n')
    const after = check(fixture)
    assert.equal(after.status, 1, output(after))
    assert.match(output(after), /invalid\.ts/)
  })
}

fixtureTest('lint and format use the repository config despite BIOME_CONFIG_PATH', (fixture) => {
  const external = join(dirname(fixture), 'external')
  mkdirSync(external)
  writeFileSync(
    join(external, 'biome.json'),
    JSON.stringify({ formatter: { enabled: false }, linter: { enabled: false } }),
  )
  writeFileSync(join(fixture, 'invalid.ts'), invalid)
  const env = { BIOME_CONFIG_PATH: external }
  const failed = check(fixture, 'lint', env)
  assert.equal(failed.status, 1, output(failed))
  assert.match(output(failed), /invalid\.ts/)
  const formatted = check(fixture, 'format', env)
  assert.equal(formatted.status, 0, output(formatted))
  assert.equal(readFileSync(join(fixture, 'invalid.ts'), 'utf8'), valid)
  const passed = check(fixture, 'lint', env)
  assert.equal(passed.status, 0, output(passed))
})

fixtureTest('local and generated artifacts stay outside lint and format', (fixture) => {
  const ignored = [
    '.local',
    '.vercel',
    'packages/db/src/generated',
    'apps/web/dist',
    'coverage',
    'node_modules',
    'test-results',
    'playwright-report',
  ]
  for (const directory of ignored) {
    mkdirSync(join(fixture, directory), { recursive: true })
    writeFileSync(join(fixture, directory, 'artifact.json'), '{invalid')
  }
  for (const script of ['lint', 'format']) {
    const result = check(fixture, script)
    assert.equal(result.status, 0, output(result))
  }
  for (const directory of ignored) {
    assert.equal(readFileSync(join(fixture, directory, 'artifact.json'), 'utf8'), '{invalid')
  }
})

fixtureTest('format normalizes CRLF and is idempotent', (fixture) => {
  writeFileSync(join(fixture, 'valid.ts'), valid.replaceAll('\n', '\r\n'))
  const failed = check(fixture)
  assert.equal(failed.status, 1, output(failed))
  for (let attempt = 0; attempt < 2; attempt++) {
    const formatted = check(fixture, 'format')
    assert.equal(formatted.status, 0, output(formatted))
    assert.equal(readFileSync(join(fixture, 'valid.ts'), 'utf8'), valid)
  }
  const passed = check(fixture)
  assert.equal(passed.status, 0, output(passed))
})
