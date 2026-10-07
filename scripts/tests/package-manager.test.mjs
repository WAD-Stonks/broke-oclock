import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = new URL('../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const manifest = JSON.parse(read('package.json'))

test('pnpm owns dependency management with one isolated workspace lockfile', () => {
  assert.equal(manifest.packageManager, 'pnpm@10.34.6')
  assert.equal(manifest.engines.bun, undefined)
  assert.equal(manifest.devDependencies.tsx, '4.23.15')
  assert.equal(manifest.devDependencies.esbuild, '0.28.2')
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

test('cold frozen Node tooling works with all install hooks disabled', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'pnpm-node-cold-'))
  try {
    const store = join(fixture, 'store')
    const cache = join(fixture, 'cache')
    const marker = join(fixture, 'legacy-used')
    writeFileSync(
      join(fixture, 'bun'),
      `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unexpected'); process.exit(97)\n`,
      { mode: 0o700 },
    )
    writeFileSync(join(fixture, 'pnpm-workspace.yaml'), read('pnpm-workspace.yaml'))
    writeFileSync(
      join(fixture, 'package.json'),
      JSON.stringify({
        name: 'cold-node-tooling-fixture',
        private: true,
        type: 'module',
        packageManager: manifest.packageManager,
        devDependencies: {
          tsx: manifest.devDependencies.tsx,
          esbuild: manifest.devDependencies.esbuild,
        },
        scripts: { probe: 'node --import tsx probe.ts' },
      }),
    )
    writeFileSync(
      join(fixture, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { paths: { '@fixture/*': ['./src/*'] } } }),
    )
    mkdirSync(join(fixture, 'src'))
    writeFileSync(join(fixture, 'src/value.ts'), 'export const value: number = 42')
    writeFileSync(
      join(fixture, 'probe.ts'),
      `
      import assert from 'node:assert/strict';
      import {build, version} from 'esbuild';
      import {value} from '@fixture/value';
      assert.equal(value, 42);
      assert.equal(version, ${JSON.stringify(manifest.devDependencies.esbuild)});
      assert.equal(process.env.npm_config_ignore_scripts, 'true');
      await build({entryPoints: ['src/value.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'value.mjs'});
      assert.equal((await import('./value.mjs')).value, 42);
      console.log('cold-node-tooling-ok');
    `,
    )
    const options = {
      cwd: fixture,
      env: {
        ...process.env,
        PATH: `${fixture}:${process.env.PATH}`,
        ESBUILD_BINARY_PATH: '',
        TSX_DISABLE_CACHE: '1',
      },
      encoding: 'utf8',
      timeout: 120_000,
    }
    const args = [`--config.store-dir=${store}`, `--config.cache-dir=${cache}`]
    const lock = spawnSync(
      'pnpm',
      [...args, 'install', '--lockfile-only', '--ignore-scripts'],
      options,
    )
    assert.equal(lock.status, 0, `${lock.stdout}\n${lock.stderr}`)
    rmSync(store, { recursive: true, force: true })
    rmSync(cache, { recursive: true, force: true })
    assert.equal(existsSync(store), false)
    assert.equal(existsSync(cache), false)
    const installed = spawnSync(
      'pnpm',
      [...args, 'install', '--frozen-lockfile', '--ignore-scripts'],
      options,
    )
    assert.equal(installed.status, 0, `${installed.stdout}\n${installed.stderr}`)
    const result = spawnSync('pnpm', [...args, 'run', 'probe'], options)
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /cold-node-tooling-ok/)
    assert.equal(existsSync(marker), false)
    assert.ok(existsSync(store), 'The install must populate its isolated cold store')
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
      process.execPath,
      ['--import', 'tsx', 'scripts/workspace.ts', 'packages/db', 'fixture-script', '--flag'],
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

test('root, CI and hosting commands need only Node and pnpm', () => {
  for (const script of Object.values(manifest.scripts)) {
    assert.doesNotMatch(script, /\bbun\b|ignore-scripts=false|\bdlx\b/)
  }
  const ci = read('.github/workflows/ci.yml')
  assert.match(ci, /pnpm\/action-setup@/)
  assert.match(ci, /pnpm install --frozen-lockfile --ignore-scripts/)
  assert.doesNotMatch(ci, /setup-bun|\bbun\b/)
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
