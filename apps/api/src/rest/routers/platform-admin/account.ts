import { ApiErrorException } from '@api/errors'
import { activeGrant } from '@api/modules/platform-admin/venues'
import type { RestDependencies } from '@api/rest/context'
import { createRestHandler, requireAdmin } from '@api/rest/context'
import { parseRestValue } from '@api/rest/routers/platform-admin/validation'
import {
  platformAccountParamsSchema,
  platformAccountResponseSchema,
} from '@broke-oclock/contracts/platform-admin'

export const getAdminAccount = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    await requireAdmin(context, 'FORBIDDEN')
    const { userId } = parseRestValue(platformAccountParamsSchema, request.params)
    const user = await context.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        platformVersion: true,
        createdAt: true,
      },
    })
    if (!user) throw new ApiErrorException('NOT_FOUND', 'NOT_FOUND')
    const grants = await context.db.stallGrant.findMany({
      where: { userId: user.id, ...activeGrant },
      orderBy: { id: 'asc' },
    })
    const venues = await context.db.venue.findMany({
      where: { id: { in: grants.map((grant) => grant.venueId) } },
      select: { id: true, name: true, merchant: { select: { name: true } } },
    })
    const venuesById = new Map(venues.map((venue) => [venue.id, venue]))
    response.json(
      platformAccountResponseSchema.parse({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        version: user.platformVersion ?? 0,
        createdAt: user.createdAt.toISOString(),
        grants: grants.map((grant) => ({
          id: grant.id,
          venueId: grant.venueId,
          venueName: venuesById.get(grant.venueId)?.name ?? 'Unavailable stall',
          merchantName: venuesById.get(grant.venueId)?.merchant.name ?? 'Unavailable merchant',
          version: grant.version,
          createdAt: grant.createdAt.toISOString(),
        })),
      }),
    )
  })
