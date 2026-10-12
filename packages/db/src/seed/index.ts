import type { PrismaClient } from '@db/generated/prisma/index'
import { buildSeedRows } from '@db/seed/build'

export { buildSeedRows, SEED_NOTE, SEED_USERS, type SeedRows } from '@db/seed/build'
export { SEED_DEALS, type SeedDeal } from '@db/seed/deals'
export { assertLocalDatabaseUrl, isLocalDatabaseUrl } from '@db/seed/guard'
export { seedObjectId } from '@db/seed/ids'
export { SEED_MERCHANTS, type SeedMerchant, type SeedVenue } from '@db/seed/merchants'

export type SeedSummary = {
  readonly users: number
  readonly merchants: number
  readonly venues: number
  readonly deals: number
  readonly dealVenues: number
}

const TRANSACTION_TIMEOUT_MS = 60_000

// Replaces the seed deals (and anything hanging off them) on every run. Seed users, merchants and
// venues are upserted in place so teammate records that reference them keep working.
export const seedDevelopmentData = async (
  client: PrismaClient,
  now: Date = new Date(),
): Promise<SeedSummary> => {
  const rows = buildSeedRows(now)
  const dealIds = rows.deals.map((deal) => deal.id)
  const byDeal = { where: { dealId: { in: dealIds } } }

  await client.$transaction(
    async (tx) => {
      await tx.commentReport.deleteMany({ where: { comment: { dealId: { in: dealIds } } } })
      await tx.comment.deleteMany(byDeal)
      await tx.dealVote.deleteMany(byDeal)
      await tx.bookmark.deleteMany(byDeal)
      await tx.dealReport.deleteMany(byDeal)
      await tx.dealSource.deleteMany(byDeal)
      await tx.dealVenue.deleteMany(byDeal)
      await tx.deal.deleteMany({ where: { id: { in: dealIds } } })
      for (const user of rows.users) {
        await tx.user.upsert({
          where: { id: user.id },
          create: user,
          update: { name: user.name, role: user.role, updatedAt: now },
        })
      }
      for (const merchant of rows.merchants) {
        await tx.merchant.upsert({
          where: { id: merchant.id },
          create: merchant,
          update: { name: merchant.name, deletedAt: null },
        })
      }
      for (const { id, ...venue } of rows.venues) {
        await tx.venue.upsert({
          where: { id },
          create: { id, ...venue },
          update: { ...venue, deletedAt: null },
        })
      }
      await tx.deal.createMany({ data: [...rows.deals] })
      await tx.dealVenue.createMany({ data: [...rows.dealVenues] })
    },
    { timeout: TRANSACTION_TIMEOUT_MS },
  )

  return {
    users: rows.users.length,
    merchants: rows.merchants.length,
    venues: rows.venues.length,
    deals: rows.deals.length,
    dealVenues: rows.dealVenues.length,
  }
}
