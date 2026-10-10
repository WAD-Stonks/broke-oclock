import { activeRecord } from '@api/modules/platform-admin/venues'
import { createRestHandler, type RestDependencies, requireSession } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import {
  accountVenuesQuerySchema,
  accountVenuesResponseSchema,
} from '@broke-oclock/contracts/account'

export const searchVenues = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    requireSession(context) // must be logged in
    const { search } = parseRestInput(accountVenuesQuerySchema, request.query)

    // If the user typed something, match venue names containing it (ignoring upper/lower case).
    const nameFilter = search ? { name: { contains: search, mode: 'insensitive' as const } } : {}

    const venues = await context.db.venue.findMany({
      where: {
        AND: [activeRecord, { merchant: { is: activeRecord } }, nameFilter],
      },
      orderBy: { name: 'asc' },
      take: 10, // never send an unlimited list
      select: { id: true, name: true, address: true, merchant: { select: { name: true } } },
    })

    const results = []
    for (const venue of venues) {
      results.push({
        id: venue.id,
        name: venue.name,
        merchantName: venue.merchant.name,
        address: venue.address,
      })
    }

    response.json(accountVenuesResponseSchema.parse(results))
  })
