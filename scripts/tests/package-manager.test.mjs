import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = new URL('../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const manifest = JSON.parse(read('package.json'))

test('pnpm owns dependency management with one isolated workspace lockfile', () => {
  assert.equal(manifest.packageManager, 'pnpm@10.34.6')
  assert.equal(manifest.engines.bun, '1.4.2')
  assert.ok(existsSync(new URL('pnpm-lock.yaml', root)))
  for (const name of ['bun.lock', 'bun.lockb', 'package-lock.json', 'yarn.lock']) {
    assert.equal(existsSync(new URL(name, root)), false, `Unexpected lockfile: ${name}`)
  }
  const workspace = read('pnpm-workspace.yaml')
  assert.match(workspace, /apps\/\*/)
  assert.match(workspace, /packages\/\*/)
  assert.match(workspace, /nodeLinker: isolated/)
  assert.match(workspace, /hoist: false/)
  assert.match(workspace, /ignoreScripts: true/)
  assert.match(workspace, /effect: 3\.21\.0/)
  assert.match(workspace, /ignoreGhsas:\s+- GHSA-ggr8-5vv4-36mx/)
  assert.equal(manifest.scripts.audit, 'pnpm audit --audit-level=high')
  assert.equal(manifest.overrides, undefined)
  assert.equal(manifest.trustedDependencies, undefined)
  assert.equal(manifest.workspaces, undefined)
})

test('pnpm resolves exactly the documented audit exception', () => {
  const result = spawnSync('pnpm', ['config', 'get', 'auditConfig', '--json'], {
    cwd: fileURLToPath(root),
    encoding: 'utf8',
    timeout: 30_000,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), { ignoreGhsas: ['GHSA-ggr8-5vv4-36mx'] })
})

test('pinned Bun bootstrap works with a cold store/cache and inherited pnpm run policy', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'pnpm-bun-bootstrap-'))
  try {
    const store = join(fixture, 'store')
    const cache = join(fixture, 'cache')
    const probe = join(fixture, 'runtime.json')
    assert.equal(existsSync(store), false)
    assert.equal(existsSync(cache), false)
    const bootstrap = manifest.scripts['build:vercel:api'].split(' && ')[1]
    assert.ok(bootstrap.endsWith(' bun scripts/build-vercel-api.ts'))
    writeFileSync(join(fixture, 'pnpm-workspace.yaml'), read('pnpm-workspace.yaml'))
    writeFileSync(
      join(fixture, 'inherited-policy.cjs'),
      `require('node:assert/strict').equal(process.env.npm_config_ignore_scripts, 'true')`,
    )
    writeFileSync(
      join(fixture, 'probe.ts'),
      `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(probe)}, JSON.stringify({ version: Bun.version, executable: process.execPath }))`,
    )
    writeFileSync(
      join(fixture, 'package.json'),
      JSON.stringify({
        name: 'cold-bun-bootstrap-fixture',
        private: true,
        packageManager: manifest.packageManager,
        scripts: {
          bootstrap: `node inherited-policy.cjs && ${bootstrap.replace('scripts/build-vercel-api.ts', 'probe.ts')} && node inherited-policy.cjs`,
        },
      }),
    )
    // Use a real pnpm run, not a direct dlx call: run exports ignoreScripts to children.
    const result = spawnSync(
      'pnpm',
      [`--config.store-dir=${store}`, `--config.cache-dir=${cache}`, 'run', 'bootstrap'],
      { cwd: fixture, env: process.env, encoding: 'utf8', timeout: 120_000 },
    )
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    const runtime = JSON.parse(readFileSync(probe, 'utf8'))
    assert.equal(runtime.version, manifest.engines.bun)
    // macOS can report /private/var for a cache created through the /var symlink.
    assert.ok(
      realpathSync(runtime.executable).startsWith(`${realpathSync(cache)}/`),
      runtime.executable,
    )
    assert.ok(existsSync(store), 'The bootstrap must use the isolated cold store')
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('plain pnpm install cannot run project or dependency lifecycle hooks', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'pnpm-lifecycle-'))
  try {
    const marker = join(fixture, 'hook-ran')
    const hook = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unexpected')`
    mkdirSync(join(fixture, 'dependency'))
    for (const directory of [fixture, join(fixture, 'dependency')]) {
      writeFileSync(join(directory, 'hook.cjs'), hook)
      writeFileSync(
        join(directory, 'package.json'),
        JSON.stringify({
          name:
            directory === fixture ? 'lifecycle-project-fixture' : 'lifecycle-dependency-fixture',
          version: '1.0.0',
          private: true,
          packageManager: manifest.packageManager,
          scripts: {
            preinstall: 'node hook.cjs',
            install: 'node hook.cjs',
            postinstall: 'node hook.cjs',
          },
          ...(directory === fixture
            ? { dependencies: { 'lifecycle-dependency-fixture': 'file:./dependency' } }
            : {}),
        }),
      )
    }
    // Even a separately allowlisted dependency must not override ignoreScripts.
    writeFileSync(
      join(fixture, 'pnpm-workspace.yaml'),
      `${read('pnpm-workspace.yaml')}\nonlyBuiltDependencies:\n  - lifecycle-dependency-fixture\n`,
    )
    for (const options of [[], ['--frozen-lockfile']]) {
      rmSync(join(fixture, 'node_modules'), { recursive: true, force: true })
      const result = spawnSync('pnpm', ['install', '--offline', ...options], {
        cwd: fixture,
        // Prove the workspace policy itself, not ignoreScripts inherited from test:tooling.
        env: Object.fromEntries(
          Object.entries(process.env).filter(([key]) => !/^npm_config_ignore_?scripts$/i.test(key)),
        ),
        encoding: 'utf8',
        timeout: 30_000,
      })
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
      assert.equal(
        existsSync(marker),
        false,
        'An install hook executed despite the workspace policy',
      )
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('workspace runner uses pnpm and preserves arguments, cwd, environment and exit status', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'pnpm-runner-'))
  try {
    // Explicit fake command boundary, not a substitute for clean-install verification.
    writeFileSync(
      join(fixture, 'pnpm'),
      `#!/usr/bin/env node\nconsole.log(JSON.stringify({args: process.argv.slice(2), cwd: process.cwd(), sentinel: process.env.PNPM_RUNNER_TEST})); process.exit(23)\n`,
      { mode: 0o700 },
    )
    const result = spawnSync(
      'bun',
      ['scripts/workspace.ts', 'packages/db', 'fixture-script', '--flag'],
      {
        cwd: fileURLToPath(root),
        env: {
          ...process.env,
          PATH: `${fixture}:${process.env.PATH}`,
          PNPM_RUNNER_TEST: 'retained',
        },
        encoding: 'utf8',
      },
    )
    assert.equal(result.status, 23, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout.trim()), {
      args: ['run', 'fixture-script', '--flag'],
      cwd: fileURLToPath(new URL('packages/db', root)),
      sentinel: 'retained',
    })
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})

test('workspaces declare the libraries their own tests import', () => {
  const dependencies = {
    'apps/api': ['mongodb-memory-server'],
    'packages/email': ['vitest'],
    'packages/integrations': ['vitest'],
  }
  for (const [workspace, names] of Object.entries(dependencies)) {
    const own = JSON.parse(read(`${workspace}/package.json`))
    for (const name of names) assert.ok(own.devDependencies?.[name], `${workspace} needs ${name}`)
  }
})

test('root, CI and checked-in hosting commands use pnpm, keeping Bun only as runtime', () => {
  for (const script of Object.values(manifest.scripts)) {
    assert.doesNotMatch(script, /\bbun (?:run|install|add|remove|update|audit|x)\b/)
  }
  const ci = read('.github/workflows/ci.yml')
  assert.match(ci, /pnpm\/action-setup@/)
  assert.match(ci, /bun-version: '1\.4\.2'/)
  assert.match(ci, /pnpm install --frozen-lockfile --ignore-scripts/)
  assert.doesNotMatch(ci, /\bbun(?:x| (?:run|install|audit))\b/)
  for (const app of ['api', 'web']) {
    const config = JSON.parse(read(`apps/${app}/vercel.json`))
    assert.equal(config.git.deploymentEnabled, false)
    assert.equal(
      config.installCommand,
      'cd ../.. && pnpm install --frozen-lockfile --ignore-scripts',
    )
    assert.match(config.buildCommand, /pnpm/)
  }
})
