import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const argumentsFor = (script) => [
  '--import',
  'tsx',
  `scripts/${script}.ts`,
  ...(script === 'workspace' ? ['packages/db', 'fixture'] : []),
]
const fixtureFor = (source) => {
  const directory = mkdtempSync(join(tmpdir(), 'node-process-fixture-'))
  // Explicit fake pnpm command boundary with real Node subprocesses.
  writeFileSync(join(directory, 'pnpm'), `#!${process.execPath}\n${source}`, { mode: 0o700 })
  return directory
}
const waitFor = async (condition) => {
  const deadline = Date.now() + 10_000
  while (!condition()) {
    assert.ok(Date.now() < deadline, 'Timed out waiting for subprocess evidence')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
const stopped = (pid) => {
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    if (error.code === 'ESRCH') return true
    throw error
  }
}

test('workspace reports a missing executable without an unhandled spawn error', () => {
  const directory = mkdtempSync(join(tmpdir(), 'node-missing-command-'))
  try {
    const result = spawnSync(process.execPath, argumentsFor('workspace'), {
      cwd: root,
      env: { ...process.env, PATH: directory },
      encoding: 'utf8',
      timeout: 10_000,
    })
    assert.equal(result.status, 127, result.stderr)
    assert.match(result.stderr, /ENOENT/)
    assert.doesNotMatch(result.stderr, /Unhandled 'error'/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('workspace maps a child signal to the conventional nonzero exit code', () => {
  const directory = fixtureFor("process.kill(process.pid, 'SIGTERM')")
  try {
    const result = spawnSync(process.execPath, argumentsFor('workspace'), {
      cwd: root,
      env: { ...process.env, PATH: directory },
      encoding: 'utf8',
      timeout: 10_000,
    })
    assert.equal(result.status, 143, result.stderr)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

for (const script of ['workspace', 'dev']) {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    test(`${script} forwards ${signal} to all owned subprocess trees`, async () => {
      const directory = fixtureFor(`
        const {spawn} = require('node:child_process');
        const {appendFileSync} = require('node:fs');
        const marker = process.env.PROCESS_MARKER;
        const grandchild = spawn(process.execPath, ['-e', \`process.on('SIGINT', () => process.exit(0)); process.on('SIGTERM', () => process.exit(0)); console.log('grandchild-ready:' + process.pid); setInterval(() => {}, 1000)\`], {stdio: 'inherit'});
        for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {appendFileSync(marker, signal + '\\n'); grandchild.once('exit', () => process.exit(0));});
        console.log('child-ready:' + process.pid);
        setInterval(() => {}, 1000);
      `)
      const marker = join(directory, 'signals')
      const child = spawn(process.execPath, argumentsFor(script), {
        cwd: root,
        env: { ...process.env, PATH: directory, PROCESS_MARKER: marker },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let output = ''
      child.stdout.on('data', (data) => {
        output += data
      })
      child.stderr.on('data', (data) => {
        output += data
      })
      const closed = new Promise((resolve) =>
        child.once('close', (code, signal) => resolve({ code, signal })),
      )
      const pids = () =>
        [...output.matchAll(/(?:child|grandchild)-ready:(\d+)/g)].map((match) => Number(match[1]))
      try {
        await waitFor(() => pids().length === (script === 'dev' ? 4 : 2))
        child.kill(signal)
        const result = await Promise.race([
          closed,
          new Promise((_, reject) => setTimeout(() => reject(new Error(output)), 12_000).unref()),
        ])
        assert.equal(result.code, signal === 'SIGINT' ? 130 : 143, output)
        assert.equal(result.signal, null, output)
        assert.equal(
          readFileSync(marker, 'utf8').trim().split('\n').length,
          script === 'dev' ? 2 : 1,
        )
        assert.ok(readFileSync(marker, 'utf8').includes(signal))
        await waitFor(() => pids().every(stopped))
      } finally {
        child.kill('SIGKILL')
        for (const pid of pids()) {
          try {
            process.kill(pid, 'SIGKILL')
          } catch {}
        }
        rmSync(directory, { recursive: true, force: true })
      }
    })
  }
}

test('workspace force-stops a descendant that ignores termination', async () => {
  const directory = fixtureFor(`
    const {spawn} = require('node:child_process');
    spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); console.log('stubborn-ready:' + process.pid); setInterval(() => {}, 1000)"], {stdio: 'inherit'});
    process.on('SIGTERM', () => process.exit(0));
    setInterval(() => {}, 1000);
  `)
  const child = spawn(process.execPath, argumentsFor('workspace'), {
    cwd: root,
    env: { ...process.env, PATH: directory },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (data) => {
    output += data
  })
  child.stderr.on('data', (data) => {
    output += data
  })
  const closed = new Promise((resolve) => child.once('close', (code) => resolve(code)))
  let pid
  try {
    await waitFor(() => /stubborn-ready:(\d+)/.test(output))
    pid = Number(output.match(/stubborn-ready:(\d+)/)[1])
    child.kill('SIGTERM')
    const code = await Promise.race([
      closed,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Forced shutdown timed out')), 8000).unref(),
      ),
    ])
    assert.equal(code, 143, output)
    await waitFor(() => stopped(pid))
  } finally {
    child.kill('SIGKILL')
    if (pid) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {}
    }
    rmSync(directory, { recursive: true, force: true })
  }
})

test('dev preserves the first child failure and shuts down its sibling', async () => {
  const directory = fixtureFor(`
    if (process.cwd().endsWith('/api')) setTimeout(() => process.exit(23), 600);
    else {process.on('SIGTERM', () => {console.log('sibling-stopped'); process.exit(0)}); setInterval(() => {}, 1000)}
  `)
  try {
    const result = spawnSync(process.execPath, argumentsFor('dev'), {
      cwd: root,
      env: { ...process.env, PATH: directory },
      encoding: 'utf8',
      timeout: 10_000,
    })
    assert.equal(result.status, 23, result.stderr)
    assert.match(result.stdout, /sibling-stopped/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
