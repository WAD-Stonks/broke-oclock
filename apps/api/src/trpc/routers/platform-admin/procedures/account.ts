import { platformAdminProcedure } from '@api/modules/platform-admin/authorization'
import { accountSummary, objectId, version } from '@api/modules/platform-admin/schemas'
import { activeGrant } from '@api/modules/platform-admin/venues'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const accountProcedure = platformAdminProcedure
  .input(z.strictObject({ userId: objectId }))
  .output(
    accountSummary.extend({
      grants: z.array(
        z.object({
          id: objectId,
          venueId: objectId,
          venueName: z.string(),
          merchantName: z.string(),
          version,
          createdAt: z.string().datetime(),
        }),
      ),
    }),
  )
  .query(async ({ ctx, input }) => {
    const u = await ctx.db.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        platformVersion: true,
        createdAt: true,
      },
    })
    if (!u) throw new TRPCError({ code: 'NOT_FOUND' })
    const grants = await ctx.db.stallGrant.findMany({
      where: { userId: u.id, ...activeGrant },
      orderBy: { id: 'asc' },
    })
    const venues = await ctx.db.venue.findMany({
      where: { id: { in: grants.map((g) => g.venueId) } },
      select: { id: true, name: true, merchant: { select: { name: true } } },
    })
    const byId = new Map(venues.map((v) => [v.id, v]))
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      version: u.platformVersion ?? 0,
      createdAt: u.createdAt.toISOString(),
      grants: grants.map((g) => ({
        id: g.id,
        venueId: g.venueId,
        venueName: byId.get(g.venueId)?.name ?? 'Unavailable stall',
        merchantName: byId.get(g.venueId)?.merchant.name ?? 'Unavailable merchant',
        version: g.version,
        createdAt: g.createdAt.toISOString(),
      })),
    }
  })
