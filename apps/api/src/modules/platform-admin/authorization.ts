import { protectedProcedure } from '@api/trpc/init'
import { TRPCError } from '@trpc/server'

export const platformAdminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const actor = await ctx.db.user.findUnique({
    where: { id: ctx.session.user.id },
    select: { role: true },
  })
  if (actor?.role !== 'ADMIN') throw new TRPCError({ code: 'FORBIDDEN' })
  return next()
})
