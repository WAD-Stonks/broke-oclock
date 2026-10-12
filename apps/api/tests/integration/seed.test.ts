import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { PrismaClient } from '@broke-oclock/db'
import { buildSeedRows, SEED_USERS, seedDevelopmentData } from '@broke-oclock/db/seed'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
let mongo: MongoMemoryReplSet | undefined
let db: PrismaClient

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`seed_${randomUUID().replaceAll('-', '')}`)
  await promisify(execFile)('pnpm', ['--dir', 'packages/db', 'run', 'push'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    timeout: 60_000,
  })
  // Always the disposable URI above, never the configured application database.
  db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
})

afterAll(async () => {
  await db?.$disconnect()
  await mongo?.stop()
})

describe('development seed', () => {
  it('inserts the dataset and is idempotent across reruns', async () => {
    const now = new Date()
    const expected = buildSeedRows(now)

    const first = await seedDevelopmentData(db, now)
    expect(first.deals).toBe(expected.deals.length)
    expect(await db.deal.count()).toBe(expected.deals.length)
    expect(await db.venue.count()).toBe(expected.venues.length)
    expect(await db.merchant.count()).toBe(expected.merchants.length)
    expect(await db.dealVenue.count()).toBe(expected.dealVenues.length)

    const teammateUser = await db.user.create({
      data: {
        name: 'Teammate',
        email: `${randomUUID()}@example.test`,
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      },
    })
    const seedVenue = expected.venues[0]
    const teammateDeal = await db.deal.create({
      data: {
        title: 'Teammate fixture',
        description: 'Synthetic test record, not a real promotion.',
        category: 'FOOD',
        offerType: 'OTHER',
        applicability: 'SELECTED_OUTLETS',
        merchantId: seedVenue.merchantId,
        submittedById: teammateUser.id,
        venues: { create: { venueId: seedVenue.id } },
      },
    })
    const seedDeal = expected.deals[0]
    await db.dealVote.create({
      data: { dealId: seedDeal.id, userId: teammateUser.id, value: 'ALIVE' },
    })

    const second = await seedDevelopmentData(db, now)
    expect(second).toEqual(first)
    expect(await db.deal.count()).toBe(expected.deals.length + 1)
    expect(await db.venue.count()).toBe(expected.venues.length)
    expect(await db.dealVenue.count()).toBe(expected.dealVenues.length + 1)
    expect(await db.dealVote.count({ where: { dealId: seedDeal.id } })).toBe(0)
    expect(await db.deal.findUnique({ where: { id: teammateDeal.id } })).not.toBeNull()
    expect(await db.user.count({ where: { email: SEED_USERS.reviewer.email } })).toBe(1)
  })

  it('stores only eligible published deals for approved records', async () => {
    const approved = await db.deal.findMany({ where: { reviewStatus: 'APPROVED' } })
    expect(approved.length).toBeGreaterThan(0)
    for (const deal of approved) {
      expect(deal.publishedAt).not.toBeNull()
      expect(deal.reviewedVersion).toBe(deal.contentVersion)
      expect(deal.deletedAt).toBeNull()
    }
    const seedDeals = { submittedById: SEED_USERS.submitter.id }
    const pending = await db.deal.findMany({ where: { ...seedDeals, reviewStatus: 'PENDING' } })
    expect(pending.length).toBeGreaterThan(0)
    for (const deal of pending) expect(deal.publishedAt).toBeNull()
    // A browse query will filter on `deletedAt: null`; unset fields would not match in MongoDB.
    expect(await db.deal.count({ where: { ...seedDeals, deletedAt: null } })).toBe(
      await db.deal.count({ where: seedDeals }),
    )
    expect(
      await db.deal.count({ where: { ...seedDeals, reviewStatus: 'PENDING', publishedAt: null } }),
    ).toBe(pending.length)
  })
})
