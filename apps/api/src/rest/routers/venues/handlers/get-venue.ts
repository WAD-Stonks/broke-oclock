import { ApiErrorException } from '@api/errors'
import { activeRecord } from '@api/modules/platform-admin/venues'
import type { RestDependencies } from '@api/rest/context'
import { createRestHandler } from '@api/rest/context'
import { parseRestInput } from '@api/rest/validation'
import { venueDetailResponseSchema, venueParamsSchema } from '@broke-oclock/contracts/venues'

const maxDeals = 50
const maxPastDeals = 20

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

    // deals shown publicly at this venue: approved, not edited since review, published, not deleted
    const now = new Date()
    const publicAtVenue = {
      reviewStatus: 'APPROVED' as const,
      reviewedVersion: { equals: context.db.deal.fields.contentVersion },
      publishedAt: { not: null },
    }
    const activeAtVenue = [
      activeRecord,
      {
        OR: [
          { applicability: 'SELECTED_OUTLETS' as const, venues: { some: { venueId: venue.id } } },
          { applicability: 'ALL_MERCHANT_OUTLETS' as const, merchantId: venue.merchantId },
        ],
      },
    ]

    // ongoing deals have started and have not yet reached validUntil
    const ongoing = context.db.deal.findMany({
      where: {
        ...publicAtVenue,
        AND: [
          ...activeAtVenue,
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

    // past deals that have exclusive validUntil over
    const past = context.db.deal.findMany({
      where: { ...publicAtVenue, validUntil: { lte: now }, AND: activeAtVenue },
      orderBy: { validUntil: 'desc' },
      take: maxPastDeals,
      select: {
        id: true,
        title: true,
        offerType: true,
        priceMinor: true,
        currency: true,
        discountPercent: true,
        validUntil: true,
      },
    })

    const [deals, pastDeals] = await Promise.all([ongoing, past])

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
        pastDeals: pastDeals.map((deal) => ({
          id: deal.id,
          title: deal.title,
          offerType: deal.offerType,
          priceMinor: deal.priceMinor ?? null,
          currency: deal.currency,
          discountPercent: deal.discountPercent ?? null,
          validUntil: deal.validUntil?.toISOString(),
        })),
      }),
    )
  })
