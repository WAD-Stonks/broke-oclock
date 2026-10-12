import {
  findEligibleCategories,
  findPublicDeals,
  isCurrentApproval,
  toDealPin,
} from '@api/modules/deals/public-deals'
import { createRestHandler, type RestDependencies } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import { dealsQuerySchema, dealsResponseSchema } from '@broke-oclock/contracts/deals'
import type { RequestHandler } from 'express'

// Public list of mappable deals. Browsing needs no session and a GET never checks Origin.
export const getDeals = (dependencies: RestDependencies): RequestHandler =>
  createRestHandler(dependencies, async (request, response, context) => {
    const query = parseRestInput(dealsQuerySchema, request.query)
    const now = new Date()

    const rows = await findPublicDeals(context.db, query, now)
    const categories = await findEligibleCategories(context.db)

    const items = rows
      .filter(isCurrentApproval)
      .map(toDealPin)
      .filter((deal) => deal.venues.length > 0)

    response.json(dealsResponseSchema.parse({ items, categories }))
  })
