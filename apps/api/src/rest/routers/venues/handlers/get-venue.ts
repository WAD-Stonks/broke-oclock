import { ApiErrorException } from '@api/errors'
import { activeRecord } from '@api/modules/platform-admin/venues'
import type { RestDependencies } from '@api/rest/context'
import { createRestHandler } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import { venueDetailResponseSchema, venueParamsSchema } from '@broke-oclock/contracts/venues'

const maxDeals = 50

export const getVenue = (dependencies: RestDependencies) =>
  createRestHandler(dependencies, async (request, response, context) => {
    const { venueId } = parseRestInput(venueParamsSchema, request.params)
    const venue = await context.db.venue.findFirst({
      where: { id: venueId, ...activeRecord, merchant: { is: activeRecord } },
      select: {
        id: true,
        name: true,
        address: true,
        area: true,
        postalCode: true,
        merchantId: true,
        merchant: { select: { name: true } },
      },
    })
    if (!venue) throw new ApiErrorException('NOT_FOUND', 'Venue not found')
    
    // gets deals if reviewStatus approved, has not been edited, still valid
    const now = new Date()
    const deals = await context.db.deal.findMany({
      where: {
        reviewStatus: 'APPROVED',
        reviewedVersion: { equals: context.db.deal.fields.contentVersion },
        publishedAt: { not: null },
        AND: [
          activeRecord,
          {
            OR: [{ validFrom: null }, { validFrom: { isSet: false } }, { validFrom: { lte: now } }],
          },
          {
            OR: [
              { validUntil: null },
              { validUntil: { isSet: false } },
              { validUntil: { gt: now } },
            ],
          },
          {
            OR: [
              { applicability: 'SELECTED_OUTLETS', venues: { some: { venueId: venue.id } } },
              { applicability: 'ALL_MERCHANT_OUTLETS', merchantId: venue.merchantId },
            ],
          },
        ],
      },
      orderBy: { publishedAt: 'desc' },
      take: maxDeals,
      select: {
        id: true,
        title: true,
        category: true,
        offerType: true,
        priceMinor: true,
        currency: true,
        discountPercent: true,
        validUntil: true,
        rawValidityText: true,
        images: {
          where: activeRecord,
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { url: true },
        },
      },
    })

    response.json(
      venueDetailResponseSchema.parse({
        venue: {
          id: venue.id,
          name: venue.name,
          address: venue.address,
          area: venue.area ?? null,
          postalCode: venue.postalCode ?? null,
          merchantName: venue.merchant.name,
        },
        deals: deals.map((deal) => ({
          id: deal.id,
          title: deal.title,
          category: deal.category,
          offerType: deal.offerType,
          priceMinor: deal.priceMinor ?? null,
          currency: deal.currency,
          discountPercent: deal.discountPercent ?? null,
          validUntil: deal.validUntil?.toISOString() ?? null,
          rawValidityText: deal.rawValidityText ?? null,
          imageUrl: deal.images[0]?.url ?? null,
        })),
      }),
    )
  })
