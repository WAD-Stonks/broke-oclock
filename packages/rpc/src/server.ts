import type { Session } from '@broke-oclock/auth/types'
import {
  type CurrentUserResponse,
  currentUserResponseSchema,
  healthResponseSchema,
} from '@broke-oclock/contracts/api'
import { initTRPC, TRPCError } from '@trpc/server'

export { RPC_BATCH_LIMIT } from '@rpc/constants'

import { z } from 'zod'

export type RpcContext = {
  session: Session | null
  hasTrustedOrigin: boolean
}

const t = initTRPC.context<RpcContext>().create({
  isDev: false,
  errorFormatter: ({ shape, error }) =>
    error.code === 'INTERNAL_SERVER_ERROR' ? { ...shape, message: 'Internal server error' } : shape,
})
export const router = t.router
export const publicProcedure = t.procedure.use(({ ctx, type, next }) => {
  // Cookies authenticate a user, not the origin of a state-changing request.
  if (type === 'mutation' && !ctx.hasTrustedOrigin) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Untrusted request origin' })
  }
  return next()
})
export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { session: ctx.session } })
})

// One allowlisted JSON projection for tRPC and the existing REST compatibility route.
export const toCurrentUserResponse = (session: Session): CurrentUserResponse => ({
  user: {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
  },
  session: { expiresAt: session.session.expiresAt.toISOString() },
})

export const appRouter = router({
  health: publicProcedure
    .input(z.void())
    .output(healthResponseSchema)
    .query(() => ({ ok: true })),
  me: protectedProcedure
    .input(z.void())
    .output(currentUserResponseSchema)
    .query(({ ctx }) => toCurrentUserResponse(ctx.session)),
})
export type AppRouter = typeof appRouter
