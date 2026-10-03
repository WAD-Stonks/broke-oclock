import { protectedProcedure } from '@api/trpc/init'
import { TRPCError } from '@trpc/server'

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const user = await ctx.db.user.findUnique({
    where: { id: ctx.session.user.id },
    select: { role: true },
  })
  if (user?.role !== 'ADMIN')
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Administrator required' })
  return next()
})
