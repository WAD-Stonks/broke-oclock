import { createServer } from 'node:http'
import { createTRPCRouter, protectedProcedure, publicProcedure } from '@api/trpc/init'
import type { AppRouter } from '@api/trpc/root'
import type { CurrentUserResponse } from '@broke-oclock/contracts/api'
import { db } from '@broke-oclock/db'
import type { CreateTRPCClient } from '@trpc/client'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import express from 'express'
import { expect, expectTypeOf, it } from 'vitest'

const policyRouter = createTRPCRouter({
  write: publicProcedure.mutation(() => ({ ok: true })),
  private: protectedProcedure.query(({ ctx }) => ctx.session.user.id),
})

it('rejects mutations without the exact trusted origin', async () => {
  const caller = policyRouter.createCaller({ db, session: null, hasTrustedOrigin: false })
  await expect(caller.write()).rejects.toMatchObject({ code: 'FORBIDDEN' })
})

it('permits a public mutation with the trusted origin', async () => {
  const caller = policyRouter.createCaller({ db, session: null, hasTrustedOrigin: true })
  expect(await caller.write()).toEqual({ ok: true })
})

it('requires a real session even when the origin is trusted', async () => {
  const caller = policyRouter.createCaller({ db, session: null, hasTrustedOrigin: true })
  await expect(caller.private()).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
})

type Client = CreateTRPCClient<AppRouter>
expectTypeOf<Awaited<ReturnType<Client['me']['query']>>>().toEqualTypeOf<CurrentUserResponse>()

it('redacts unexpected internal errors over the real Express transport', async () => {
  const app = express()
  const failingRouter = createTRPCRouter({
    broken: publicProcedure.query(() => {
      throw new Error('private provider detail')
    }),
  })
  app.use(
    '/trpc',
    createExpressMiddleware({
      router: failingRouter,
      createContext: () => ({ db, session: null, hasTrustedOrigin: false }),
    }),
  )
  const server = createServer(app)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No TCP address')
    const response = await fetch(`http://127.0.0.1:${address.port}/trpc/broken`)
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toMatchObject({
      error: { message: 'Internal server error', data: { code: 'INTERNAL_SERVER_ERROR' } },
    })
    expect(JSON.stringify(body)).not.toContain('private provider detail')
    expect(body.error.data).not.toHaveProperty('stack')
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
