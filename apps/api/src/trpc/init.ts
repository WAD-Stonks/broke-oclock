import type { Context } from '@api/trpc/context'
import { initTRPC, TRPCError } from '@trpc/server'

const t = initTRPC.context<Context>().create({
  isDev: false,
  errorFormatter: ({ shape, error }) =>
    error.code === 'INTERNAL_SERVER_ERROR' ? { ...shape, message: 'Internal server error' } : shape,
})
export const createTRPCRouter = t.router
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
