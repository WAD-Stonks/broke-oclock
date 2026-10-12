import type { Prisma, UserRole } from '@db/generated/prisma/index'
import { SEED_DEALS, type SeedDeal, type SeedValidity } from '@db/seed/deals'
import { seedObjectId } from '@db/seed/ids'
import { SEED_MERCHANTS } from '@db/seed/merchants'

export const SEED_NOTE = 'Synthetic development seed data, not a real promotion.'
const DAY_MS = 86_400_000
const CREATED_DAYS_BEFORE_START = 2
const MAX_PERCENT = 100

type SeedUser = { id: string; name: string; email: string; role: UserRole }
export const SEED_USERS: { readonly submitter: SeedUser; readonly reviewer: SeedUser } = {
  submitter: {
    id: seedObjectId('user', 0),
    name: 'Seed Submitter',
    email: 'seed-submitter@broke-oclock.local',
    role: 'USER',
  },
  reviewer: {
    id: seedObjectId('user', 1),
    name: 'Seed Reviewer',
    email: 'seed-reviewer@broke-oclock.local',
    role: 'ADMIN',
  },
}

type WithId<T> = T & { readonly id: string }
export type SeedRows = {
  readonly users: readonly WithId<Prisma.UserCreateManyInput>[]
  readonly merchants: readonly WithId<Prisma.MerchantCreateManyInput>[]
  readonly venues: readonly WithId<Prisma.VenueCreateManyInput>[]
  readonly deals: readonly WithId<Prisma.DealCreateManyInput>[]
  readonly dealVenues: readonly WithId<Prisma.DealVenueCreateManyInput>[]
}

type VenueRef = { readonly id: string; readonly merchantKey: string }

const daysFrom = (now: Date, days: number) => new Date(now.getTime() + days * DAY_MS)

const fail = (deal: SeedDeal, reason: string): never => {
  throw new Error(`Invalid seed deal "${deal.key}": ${reason}`)
}

const validateOffer = (deal: SeedDeal) => {
  if (deal.offerType === 'FIXED_PRICE' && !(deal.priceMinor && deal.priceMinor > 0))
    fail(deal, 'FIXED_PRICE needs a positive priceMinor')
  if (
    deal.offerType === 'PERCENT_OFF' &&
    !(deal.discountPercent && deal.discountPercent > 0 && deal.discountPercent <= MAX_PERCENT)
  )
    fail(deal, 'PERCENT_OFF needs a discountPercent between 1 and 100')
  if (deal.validity.kind === 'window' && deal.validity.fromDays >= deal.validity.untilDays)
    fail(deal, 'validity window must end after it starts')
}

const validatePlacement = (
  deal: SeedDeal,
  merchantIds: ReadonlyMap<string, string>,
  venues: ReadonlyMap<string, VenueRef>,
) => {
  if (deal.merchant && !merchantIds.has(deal.merchant)) fail(deal, 'unknown merchant key')
  const outlets = deal.venues ?? []
  if (deal.applicability === 'SELECTED_OUTLETS') {
    if (!deal.merchant) fail(deal, 'SELECTED_OUTLETS needs a merchant')
    if (outlets.length === 0) fail(deal, 'SELECTED_OUTLETS needs at least one venue')
  } else if (outlets.length > 0) fail(deal, `${deal.applicability} must not list venues`)
  if (deal.applicability === 'ALL_MERCHANT_OUTLETS' && !deal.merchant)
    fail(deal, 'ALL_MERCHANT_OUTLETS needs a merchant')
  for (const key of outlets) {
    const venue = venues.get(key)
    if (!venue) fail(deal, `unknown venue key ${key}`)
    else if (venue.merchantKey !== deal.merchant)
      fail(deal, `venue ${key} belongs to another merchant`)
  }
}

const validityFields = (validity: SeedValidity, now: Date) =>
  validity.kind === 'window'
    ? {
        validFrom: daysFrom(now, validity.fromDays),
        validUntil: daysFrom(now, validity.untilDays),
        rawValidityText: null,
      }
    : {
        validFrom: daysFrom(now, validity.fromDays),
        validUntil: null,
        rawValidityText: validity.rawText,
      }

// Optional fields are written as explicit nulls. MongoDB documents created without a field do not
// match Prisma's `{ field: null }` filter, which would hide seed deals from `deletedAt: null` queries.
const reviewFields = (deal: SeedDeal, createdAt: Date) => {
  const reviewedAt = new Date(createdAt.getTime() + DAY_MS)
  const reviewed = { reviewedVersion: 1, reviewedById: SEED_USERS.reviewer.id, reviewedAt }
  // The synthetic-data marker lives in the staff-only review note, never in public text.
  const note = deal.reviewNote ? `${deal.reviewNote} ${SEED_NOTE}` : SEED_NOTE
  switch (deal.review) {
    case 'APPROVED':
      return {
        reviewStatus: 'APPROVED' as const,
        ...reviewed,
        publishedAt: reviewedAt,
        reviewNote: note,
      }
    case 'HIDDEN':
      return {
        reviewStatus: 'HIDDEN' as const,
        ...reviewed,
        publishedAt: reviewedAt,
        reviewNote: note,
      }
    case 'REJECTED':
      return { reviewStatus: 'REJECTED' as const, ...reviewed, publishedAt: null, reviewNote: note }
    default:
      return {
        reviewStatus: 'PENDING' as const,
        reviewedVersion: null,
        reviewedById: null,
        reviewedAt: null,
        publishedAt: null,
        reviewNote: null,
      }
  }
}

const buildDeal = (
  deal: SeedDeal,
  index: number,
  now: Date,
  merchantIds: ReadonlyMap<string, string>,
): WithId<Prisma.DealCreateManyInput> => {
  const createdAt = daysFrom(now, Math.min(deal.validity.fromDays, 0) - CREATED_DAYS_BEFORE_START)
  return {
    id: seedObjectId('deal', index),
    title: deal.title,
    description: deal.description,
    category: deal.category,
    offerType: deal.offerType,
    terms: deal.terms ?? null,
    priceMinor: deal.priceMinor ?? null,
    currency: 'SGD',
    discountPercent: deal.discountPercent ?? null,
    ...validityFields(deal.validity, now),
    applicability: deal.applicability,
    origin: 'USER_SUBMITTED',
    contentVersion: 1,
    createdAt,
    updatedAt: createdAt,
    merchantId: deal.merchant ? (merchantIds.get(deal.merchant) ?? null) : null,
    submittedById: SEED_USERS.submitter.id,
    deletedAt: null,
    ...reviewFields(deal, createdAt),
  }
}

export const buildSeedRows = (now: Date): SeedRows => {
  const keys = new Set(SEED_DEALS.map((deal) => deal.key))
  if (keys.size !== SEED_DEALS.length) throw new Error('Seed deal keys must be unique')

  const users = [SEED_USERS.submitter, SEED_USERS.reviewer].map((user) => ({
    ...user,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  }))
  const merchants = SEED_MERCHANTS.map((merchant, index) => ({
    id: seedObjectId('merchant', index),
    name: merchant.name,
  }))
  const merchantIds = new Map(
    SEED_MERCHANTS.map((merchant, index) => [merchant.key, merchants[index].id]),
  )

  const venueDefinitions = SEED_MERCHANTS.flatMap((merchant) =>
    merchant.venues.map((venue) => ({ ...venue, merchantKey: merchant.key })),
  )
  const venues = venueDefinitions.map((venue, index) => ({
    id: seedObjectId('venue', index),
    merchantId: merchantIds.get(venue.merchantKey) ?? '',
    name: venue.name,
    address: venue.address,
    area: venue.area,
    postalCode: venue.postalCode ?? null,
    latitude: venue.lat,
    longitude: venue.lng,
  }))
  const venueRefs = new Map<string, VenueRef>(
    venueDefinitions.map((venue, index) => [
      venue.key,
      { id: venues[index].id, merchantKey: venue.merchantKey },
    ]),
  )

  for (const deal of SEED_DEALS) {
    validateOffer(deal)
    validatePlacement(deal, merchantIds, venueRefs)
  }
  const deals = SEED_DEALS.map((deal, index) => buildDeal(deal, index, now, merchantIds))
  const dealVenues = SEED_DEALS.flatMap((deal, dealIndex) =>
    (deal.venues ?? []).map((venueKey) => ({
      dealId: seedObjectId('deal', dealIndex),
      venueId: venueRefs.get(venueKey)?.id ?? '',
    })),
  ).map((link, index) => ({ id: seedObjectId('dealVenue', index), ...link }))

  return { users, merchants, venues, deals, dealVenues }
}
