import { execFile, spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))

it('runs the isolated production artifact with plain Node and real auth/Prisma', async () => {
  const mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const isolated = await mkdtemp(join(tmpdir(), 'broke-oclock-production-'))
  let child: ReturnType<typeof spawn> | undefined
  try {
    const databaseUrl = mongo.getUri(`production_${randomUUID().replaceAll('-', '')}`)
    await promisify(execFile)('pnpm', ['--dir', 'packages/db', 'run', 'push'], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      timeout: 60_000,
    })
    await promisify(execFile)('pnpm', ['--dir', 'apps/api', 'run', 'build'], {
      cwd: root,
      timeout: 60_000,
    })
    await cp(join(root, 'apps/api/dist'), isolated, { recursive: true })
    const portProbe = createServer()
    await new Promise<void>((resolve) => portProbe.listen(0, '127.0.0.1', resolve))
    const address = portProbe.address()
    if (!address || typeof address === 'string') throw new Error('Missing fixture port')
    const port = address.port
    await new Promise<void>((resolve, reject) =>
      portProbe.close((error) => (error ? reject(error) : resolve())),
    )
    child = spawn(process.execPath, ['server.js'], {
      cwd: isolated,
      env: {
        PATH: process.env.PATH,
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
        BETTER_AUTH_URL: 'http://localhost:5173',
        WEB_ORIGIN: 'http://localhost:5173',
        NODE_ENV: 'production',
        PORT: String(port),
        PHOTO_STORAGE_PROVIDER: 'uploadthing',
        UPLOADTHING_TOKEN: 'UNSET',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout?.on('data', (data) => {
      output += data
    })
    child.stderr?.on('data', (data) => {
      output += data
    })
    const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
      child?.once('close', (code, signal) => resolve({ code, signal })),
    )
    const base = `http://127.0.0.1:${port}`
    const deadline = Date.now() + 15_000
    while (true) {
      if (child.exitCode !== null) throw new Error(`Production process exited: ${output}`)
      try {
        if ((await fetch(`${base}/api/health`)).status === 200) break
      } catch {}
      if (Date.now() > deadline) throw new Error(`Production process did not listen: ${output}`)
      await setTimeout(30)
    }
    expect((await fetch(`${base}/api/ready`)).status).toBe(200)
    expect((await fetch(`${base}/api/me`)).status).toBe(401)
    const registered = await fetch(`${base}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({
        name: 'Production fixture',
        email: `${randomUUID()}@example.test`,
        password: randomBytes(24).toString('base64url'),
        role: 'ADMIN',
      }),
    })
    expect(registered.status, output).toBe(200)
    const cookie = registered.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
    const session = await fetch(`${base}/api/auth/get-session`, { headers: { Cookie: cookie } })
    expect((await session.json()).user.role).toBe('USER')
    child.kill('SIGTERM')
    expect(
      await Promise.race([
        closed,
        setTimeout(10_000).then(() => {
          throw new Error('Production shutdown timed out')
        }),
      ]),
    ).toEqual({ code: 0, signal: null })
  } finally {
    if (child && child.exitCode === null) child.kill('SIGKILL')
    await mongo.stop()
    await rm(isolated, { recursive: true, force: true })
  }
}, 180_000)
