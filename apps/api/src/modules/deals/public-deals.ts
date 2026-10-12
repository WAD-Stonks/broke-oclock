import type { DealPin, DealsQuery, DealVoteSummary } from '@broke-oclock/contracts/deals'
import type { db } from '@broke-oclock/db'

type Database = typeof db

const CENTS_PER_DOLLAR = 100

type DealWhere = NonNullable<Parameters<Database['deal']['findMany']>[0]>['where']

// On MongoDB a field that was never written is "missing", not null, and Prisma's `null`
// filter matches only an explicit null. Every optional-date check needs both branches.
const nullOrMissing = (field: string) => [{ [field]: null }, { [field]: { isSet: false } }]

// Only approved, published, undeleted deals that can be placed on the map.
const eligibleDealWhere: DealWhere = {
  OR: nullOrMissing('deletedAt'),
  reviewStatus: 'APPROVED',
  publishedAt: { not: null },
  applicability: { in: ['SELECTED_OUTLETS', 'ALL_MERCHANT_OUTLETS'] },
}

const activeVenueWhere = { OR: nullOrMissing('deletedAt') }
const visibleCommentWhere = {
  AND: [{ OR: nullOrMissing('deletedAt') }, { OR: nullOrMissing('hiddenAt') }],
}

const venueSelect = {
  id: true,
  name: true,
  latitude: true,
  longitude: true,
} as const

// Eligible deals narrowed by the visitor's filters, with the outlets needed to draw pins.
export const findPublicDeals = (database: Database, query: DealsQuery, now: Date) =>
  database.deal.findMany({
    where: {
      ...eligibleDealWhere,
      ...(query.category ? { category: query.category } : {}),
      AND: [
        // A price cap keeps deals without a fixed price, such as 1-for-1 offers.
        ...(query.priceMaxMinor === undefined
          ? []
          : [
              {
                OR: [{ priceMinor: null }, { priceMinor: { lte: query.priceMaxMinor } }],
              },
            ]),
        ...(query.validNow === 'true'
          ? [
              { OR: [...nullOrMissing('validFrom'), { validFrom: { lte: now } }] },
              // validUntil is an exclusive end, so a deal ending now is already over.
              { OR: [...nullOrMissing('validUntil'), { validUntil: { gt: now } }] },
            ]
          : []),
      ],
    },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      title: true,
      category: true,
      offerType: true,
      priceMinor: true,
      discountPercent: true,
      contentVersion: true,
      reviewedVersion: true,
      applicability: true,
      description: true,
      terms: true,
      validUntil: true,
      rawValidityText: true,
      votes: { select: { value: true } },
      // Only comments that are neither deleted by their author nor hidden by moderation.
      _count: { select: { comments: { where: visibleCommentWhere } } },
      venues: {
        where: { venue: activeVenueWhere },
        select: { venue: { select: venueSelect } },
      },
      merchant: {
        select: { venues: { where: activeVenueWhere, select: venueSelect } },
      },
    },
  })

// Category options come from every eligible deal, not just the filtered ones.
export const findEligibleCategories = async (database: Database): Promise<string[]> => {
  const rows = await database.deal.findMany({
    where: eligibleDealWhere,
    distinct: ['category'],
    orderBy: { category: 'asc' },
    select: { category: true },
  })
  return rows.map((row) => row.category)
}

type PublicDealRow = Awaited<ReturnType<typeof findPublicDeals>>[number]

const formatPrice = (priceMinor: number): string => {
  const dollars = priceMinor / CENTS_PER_DOLLAR
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

// Short text for the coral pin: price, percentage, 1-for-1, or the title as a last resort.
export const pinLabelFor = (deal: PublicDealRow): string => {
  if (deal.offerType === 'FIXED_PRICE' && deal.priceMinor !== null)
    return formatPrice(deal.priceMinor)
  if (deal.offerType === 'PERCENT_OFF' && deal.discountPercent !== null)
    return `${deal.discountPercent}% off`
  if (deal.offerType === 'BUY_ONE_GET_ONE') return '1-for-1'
  return deal.title
}

const venuesFor = (deal: PublicDealRow) =>
  deal.applicability === 'ALL_MERCHANT_OUTLETS'
    ? (deal.merchant?.venues ?? [])
    : deal.venues.map((link) => link.venue)

export const isCurrentApproval = (deal: PublicDealRow): boolean =>
  deal.reviewedVersion === deal.contentVersion

// Deal-wide tallies of the current votes; each user holds at most one vote per deal.
export const countVotes = (votes: readonly { value: 'ALIVE' | 'DEAD' }[]): DealVoteSummary => ({
  alive: votes.filter((vote) => vote.value === 'ALIVE').length,
  dead: votes.filter((vote) => vote.value === 'DEAD').length,
})

export const toDealPin = (deal: PublicDealRow): DealPin => ({
  id: deal.id,
  title: deal.title,
  category: deal.category,
  label: pinLabelFor(deal),
  description: deal.description,
  offerType: deal.offerType,
  priceMinor: deal.priceMinor,
  discountPercent: deal.discountPercent,
  terms: deal.terms,
  validUntil: deal.validUntil?.toISOString() ?? null,
  rawValidityText: deal.rawValidityText,
  votes: countVotes(deal.votes),
  commentCount: deal._count.comments,
  venues: venuesFor(deal).map((venue) => ({
    id: venue.id,
    name: venue.name,
    lat: venue.latitude,
    lng: venue.longitude,
  })),
})
