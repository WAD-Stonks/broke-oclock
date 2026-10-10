import { PrismaClient } from '@broke-oclock/db'
import { loadEnvironment } from '@scripts/environment'

const env = loadEnvironment()
const url = env.DATABASE_URL
if (
  !url ||
  !/^mongodb:\/\/(127\.0\.0\.1|localhost):27017\/broke_oclock\?/.test(url) ||
  env.NODE_ENV === 'production'
) {
  throw new Error('Community fixtures require the local broke_oclock database on port 27017.')
}
const db = new PrismaClient({ datasourceUrl: url })
try {
  const owner = await db.user.findUnique({
    where: { email: 'tester1@example.com' },
    select: { id: true },
  })
  if (!owner) throw new Error('Create the local tester1 account before seeding the demo.')
  const id = 'da0000000000000000000001'
  const existing = await db.deal.findUnique({ where: { id }, select: { id: true } })
  if (existing) console.info(`Demo deal already exists: ${id}; existing votes and dates retained.`)
  else {
    const now = new Date()
    await db.deal.create({
      data: {
        id,
        title: 'Synthetic $3 lunch — voting test',
        description:
          'Local test fixture only. No real merchant, outlet or promotion is represented.',
        category: 'food',
        offerType: 'FIXED_PRICE',
        priceMinor: 300,
        applicability: 'NO_FIXED_LOCATION',
        submittedBy: { connect: { id: owner.id } },
        reviewStatus: 'APPROVED',
        contentVersion: 1,
        reviewedVersion: 1,
        publishedAt: now,
        validFrom: now,
        validUntil: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    })
    console.info(`Created synthetic local demo deal: ${id}`)
  }
  const outletDealId = 'da0000000000000000000002'
  const outletDeal = await db.deal.findUnique({ where: { id: outletDealId }, select: { id: true } })
  if (outletDeal)
    console.info(`Outlet demo deal already exists: ${outletDealId}; existing data retained.`)
  else {
    const merchantId = 'db0000000000000000000001'
    const venueIds = ['dc0000000000000000000001', 'dc0000000000000000000002']
    await db.merchant.upsert({
      where: { id: merchantId },
      create: { id: merchantId, name: 'SYNTHETIC test merchant' },
      update: {},
    })
    for (const [index, venueId] of venueIds.entries()) {
      await db.venue.upsert({
        where: { id: venueId },
        create: {
          id: venueId,
          merchantId,
          name: `SYNTHETIC outlet ${index + 1}`,
          address: 'SYNTHETIC TEST ONLY — not a real business',
          latitude: 1.3 + index * 0.001,
          longitude: 103.8 + index * 0.001,
        },
        update: {},
      })
    }
    const now = new Date()
    await db.deal.create({
      data: {
        id: outletDealId,
        title: 'Synthetic two-outlet promotion — test only',
        description: 'Local fixture only. No real merchant, outlet or promotion is represented.',
        category: 'food',
        offerType: 'OTHER',
        applicability: 'SELECTED_OUTLETS',
        merchantId,
        submittedById: owner.id,
        reviewStatus: 'APPROVED',
        contentVersion: 1,
        reviewedVersion: 1,
        publishedAt: now,
        validFrom: now,
        validUntil: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    })
    await db.dealVenue.createMany({
      data: venueIds.map((venueId) => ({ dealId: outletDealId, venueId })),
    })
    console.info(`Created synthetic local outlet demo deal: ${outletDealId}`)
  }
} finally {
  await db.$disconnect()
}
