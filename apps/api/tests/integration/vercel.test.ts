import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
let mongo: MongoMemoryReplSet | undefined
let isolated: string | undefined
let databaseUrl = ''

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  databaseUrl = mongo.getUri(`vercel_${randomUUID().replaceAll('-', '')}`)
  await promisify(execFile)('bun', ['run', '--cwd', 'packages/db', 'push'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    timeout: 60_000,
  })
  await promisify(execFile)('bun', ['run', 'scripts/build-vercel-api.ts'], {
    cwd: root,
    timeout: 60_000,
  })
  isolated = await mkdtemp(join(tmpdir(), 'broke-oclock-vercel-'))
  await cp(join(root, 'apps/api/.vercel/output/functions/api.func'), isolated, { recursive: true })
}, 180_000)

afterAll(async () => {
  await mongo?.stop()
  if (isolated) await rm(isolated, { recursive: true, force: true })
})

it('runs the isolated Node function with real auth/Prisma and no workspace dependencies', async () => {
  if (!isolated) throw new Error('Missing isolated function fixture')
  const config = JSON.parse(await readFile(join(isolated, '.vc-config.json'), 'utf8'))
  expect(config).toMatchObject({
    runtime: 'nodejs22.x',
    architecture: 'x86_64',
    handler: 'index.mjs',
  })
  const linuxEngine = await readFile(join(isolated, 'libquery_engine-rhel-openssl-3.0.x.so.node'))
  expect([...linuxEngine.subarray(0, 4)]).toEqual([127, 69, 76, 70]) // ELF, not a macOS binary.
  const code = `
    import assert from 'node:assert/strict';
    import { createServer } from 'node:http';
    import { randomBytes, randomUUID } from 'node:crypto';
    import app from './index.mjs';
    const server = createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const request = (path, body, cookie = '', origin = process.env.WEB_ORIGIN) => fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    try {
      assert.equal((await request('/api/health')).status, 200);
      assert.equal((await request('/api/ready')).status, 200);
      assert.equal((await request('/api/me')).status, 401);
      assert.equal((await request('/api/uploadthing')).status, 503);
      const registered = await request('/api/auth/sign-up/email', {
        name: 'Isolated bundle fixture', email: randomUUID() + '@example.test',
        password: randomBytes(24).toString('base64url'), role: 'ADMIN',
      });
      assert.equal(registered.status, 200);
      const cookie = registered.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
      const session = await request('/api/auth/get-session', undefined, cookie);
      assert.equal((await session.json()).user.role, 'USER');
      const hostile = await request('/api/auth/update-user', {name: 'Blocked'}, cookie, 'https://untrusted.example');
      assert.equal(hostile.status, 403);
      console.log('isolated-function-auth-ok');
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    process.exit(0);
  `
  const result = await promisify(execFile)('node', ['--input-type=module', '-e', code], {
    cwd: isolated,
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
      BETTER_AUTH_URL: 'http://localhost:5173',
      WEB_ORIGIN: 'http://localhost:5173',
      NODE_ENV: 'test',
      PHOTO_STORAGE_PROVIDER: 'uploadthing',
      UPLOADTHING_TOKEN: 'UNSET',
    },
    timeout: 30_000,
  })
  expect(result.stdout).toContain('isolated-function-auth-ok')
}, 45_000)
