import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { PrismaClient } from '@broke-oclock/db'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
let mongo: MongoMemoryReplSet | undefined
let db: PrismaClient
let userId: string
let merchantId: string
let venueId: string

const sourceSnapshot = (post: {
  id: string
  contentHash: string
  rawContent: string
  url: string
}) => ({
  importedPost: { connect: { id: post.id } },
  sourceContentHash: post.contentHash,
  sourceContentSnapshot: post.rawContent,
  sourceUrl: post.url,
})

const dealData = () => ({
  title: `Schema fixture ${randomUUID()}`,
  description: 'Synthetic schema test, not a real promotion.',
  category: 'food',
  offerType: 'OTHER' as const,
  applicability: 'NO_FIXED_LOCATION' as const,
  submittedBy: { connect: { id: userId } },
})

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1' },
  })
  const databaseUrl = mongo.getUri(`schema_${randomUUID().replaceAll('-', '')}`)
  // Do not block the event loop: the in-memory Mongo process needs its output drained.
  await promisify(execFile)('bun', ['run', '--cwd', 'packages/db', 'push'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
    timeout: 60_000,
  })
  // Always pass the fresh test URI; never connect to the application's configured database.
  db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  const user = await db.user.create({
    data: {
      name: 'Schema Tester',
      email: `${randomUUID()}@example.test`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  })
  userId = user.id
  const merchant = await db.merchant.create({ data: { name: 'Synthetic merchant' } })
  merchantId = merchant.id
  const venue = await db.venue.create({
    data: {
      merchant: { connect: { id: merchantId } },
      name: 'Synthetic outlet',
      address: 'Synthetic address — not a real listing',
      latitude: 1.3,
      longitude: 103.8,
    },
  })
  venueId = venue.id
}, 180_000)

afterAll(async () => {
  await db?.$disconnect()
  await mongo?.stop()
})

describe('domain schema on a real disposable MongoDB replica set', () => {
  it('keeps new submissions pending, unpublished and without fabricated validity', async () => {
    const deal = await db.deal.create({ data: dealData() })
    expect(deal).toMatchObject({
      reviewStatus: 'PENDING',
      contentVersion: 1,
      reviewedVersion: null,
      origin: 'USER_SUBMITTED',
      currency: 'SGD',
      validFrom: null,
      validUntil: null,
      publishedAt: null,
      deletedAt: null,
    })
    expect(deal.id).toMatch(/^[a-f0-9]{24}$/)
  })

  it('links one deal to multiple outlets and prevents duplicate associations', async () => {
    const second = await db.venue.create({
      data: {
        merchant: { connect: { id: merchantId } },
        name: 'Second synthetic outlet',
        address: 'Another synthetic address',
        latitude: 1.31,
        longitude: 103.81,
      },
    })
    const deal = await db.deal.create({
      data: {
        ...dealData(),
        applicability: 'SELECTED_OUTLETS',
        merchant: { connect: { id: merchantId } },
        venues: {
          create: [venueId, second.id].map((id) => ({ venue: { connect: { id } } })),
        },
      },
      include: { venues: { include: { venue: true } } },
    })
    expect(deal.venues.map(({ venue }) => venue.id).sort()).toEqual([venueId, second.id].sort())
    await expect(db.dealVenue.create({ data: { dealId: deal.id, venueId } })).rejects.toMatchObject(
      { code: 'P2002' },
    )
  })

  it('distinguishes merchant-wide, online and other no-fixed-location promotions', async () => {
    for (const applicability of ['ALL_MERCHANT_OUTLETS', 'ONLINE', 'NO_FIXED_LOCATION'] as const) {
      const deal = await db.deal.create({
        data: { ...dealData(), applicability, merchant: { connect: { id: merchantId } } },
        include: { venues: true },
      })
      expect(deal.applicability).toBe(applicability)
      expect(deal.venues).toEqual([])
    }
  })

  it('supports a bounded numeric bbox without raw geospatial commands', async () => {
    const venues = await db.venue.findMany({
      where: {
        merchantId,
        latitude: { gte: 1.29, lte: 1.32 },
        longitude: { gte: 103.79, lte: 103.82 },
      },
      take: 10,
    })
    expect(venues.some(({ id }) => id === venueId)).toBe(true)
  })

  it('stores exact minor-unit prices and retains ambiguous original validity text', async () => {
    const deal = await db.deal.create({
      data: {
        ...dealData(),
        offerType: 'FIXED_PRICE',
        priceMinor: 550,
        rawValidityText: 'Till 8 Mar — year not supplied',
      },
    })
    expect(deal.priceMinor).toBe(550)
    expect(deal.rawValidityText).toBe('Till 8 Mar — year not supplied')
    expect(deal.validUntil).toBeNull()
  })

  it('keeps one current vote per user/deal while allowing changes', async () => {
    const deal = await db.deal.create({ data: dealData() })
    const vote = await db.dealVote.create({ data: { userId, dealId: deal.id, value: 'ALIVE' } })
    await expect(
      db.dealVote.create({ data: { userId, dealId: deal.id, value: 'DEAD' } }),
    ).rejects.toMatchObject({ code: 'P2002' })
    const changed = await db.dealVote.update({
      where: { userId_dealId: { userId, dealId: deal.id } },
      data: { value: 'DEAD' },
    })
    expect(changed.id).toBe(vote.id)
    expect(changed.value).toBe('DEAD')
    expect(await db.dealVote.count({ where: { userId, dealId: deal.id } })).toBe(1)
  })

  it('makes bookmarks unique and independent from comments and soft deletion', async () => {
    const deal = await db.deal.create({ data: dealData() })
    await db.bookmark.create({ data: { userId, dealId: deal.id } })
    await expect(db.bookmark.create({ data: { userId, dealId: deal.id } })).rejects.toMatchObject({
      code: 'P2002',
    })
    const comment = await db.comment.create({
      data: { authorId: userId, dealId: deal.id, body: 'Synthetic comment' },
    })
    await db.comment.update({ where: { id: comment.id }, data: { deletedAt: new Date() } })
    await db.deal.update({ where: { id: deal.id }, data: { deletedAt: new Date() } })
    expect(await db.bookmark.count({ where: { userId, dealId: deal.id } })).toBe(1)
    expect(
      (await db.comment.findUniqueOrThrow({ where: { id: comment.id } })).deletedAt,
    ).toBeInstanceOf(Date)
  })

  it('separates deal and comment reports without nullable unique targets', async () => {
    const first = await db.deal.create({ data: dealData() })
    const second = await db.deal.create({ data: dealData() })
    const firstComment = await db.comment.create({
      data: { dealId: first.id, authorId: userId, body: 'First' },
    })
    const secondComment = await db.comment.create({
      data: { dealId: first.id, authorId: userId, body: 'Second' },
    })
    for (const dealId of [first.id, second.id])
      await db.dealReport.create({ data: { dealId, reporterId: userId, reason: 'SPAM' } })
    for (const commentId of [firstComment.id, secondComment.id])
      await db.commentReport.create({
        data: { commentId, reporterId: userId, reason: 'INAPPROPRIATE' },
      })
    await expect(
      db.dealReport.create({ data: { dealId: first.id, reporterId: userId, reason: 'OTHER' } }),
    ).rejects.toMatchObject({ code: 'P2002' })
    await expect(
      db.commentReport.create({
        data: { commentId: firstComment.id, reporterId: userId, reason: 'OTHER' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
    expect((await db.deal.findUniqueOrThrow({ where: { id: first.id } })).reviewStatus).toBe(
      'PENDING',
    )
  })

  it('tracks several unattached uploads, unique keys, uploader and later deal attachment', async () => {
    const fileData = {
      uploaderId: userId,
      url: 'https://example.test/fixture.webp',
      mimeType: 'image/webp',
      sizeBytes: 128,
    }
    const first = await db.uploadedFile.create({ data: { ...fileData, key: randomUUID() } })
    const second = await db.uploadedFile.create({ data: { ...fileData, key: randomUUID() } })
    expect(first.dealId).toBeNull()
    expect(second.dealId).toBeNull()
    await expect(
      db.uploadedFile.create({ data: { ...fileData, key: first.key } }),
    ).rejects.toMatchObject({ code: 'P2002' })
    const deal = await db.deal.create({ data: dealData() })
    await db.uploadedFile.update({
      where: { id: first.id },
      data: { deal: { connect: { id: deal.id } } },
    })
    expect(
      (await db.deal.findUniqueOrThrow({ where: { id: deal.id }, include: { images: true } }))
        .images[0]?.uploaderId,
    ).toBe(userId)
  })

  it('preserves many-to-many import provenance and deduplicates provider identities', async () => {
    const sourceData = {
      provider: 'WORDPRESS' as const,
      externalId: randomUUID(),
      name: 'Synthetic source',
      url: 'https://example.test/',
    }
    const source = await db.importSource.create({ data: sourceData })
    const anotherSource = await db.importSource.create({
      data: { ...sourceData, externalId: randomUUID() },
    })
    expect(source.enabled).toBe(false)
    await expect(db.importSource.create({ data: sourceData })).rejects.toMatchObject({
      code: 'P2002',
    })
    const postData = {
      sourceId: source.id,
      externalId: '42',
      url: 'https://example.test/post',
      rawContent: 'Synthetic source text',
      contentHash: createHash('sha256').update('Synthetic source text').digest('hex'),
    }
    const post = await db.importedPost.create({ data: postData })
    const otherPost = await db.importedPost.create({
      data: { ...postData, sourceId: anotherSource.id },
    })
    expect(post.status).toBe('NEW')
    await expect(db.importedPost.create({ data: postData })).rejects.toMatchObject({
      code: 'P2002',
    })
    const first = await db.deal.create({
      data: {
        ...dealData(),
        origin: 'IMPORTED',
        sources: { create: [post, otherPost].map(sourceSnapshot) },
      },
    })
    const second = await db.deal.create({
      data: { ...dealData(), origin: 'IMPORTED', sources: { create: sourceSnapshot(post) } },
    })
    expect(
      (
        await db.importedPost.findUniqueOrThrow({
          where: { id: post.id },
          include: { deals: true },
        })
      ).deals
        .map(({ dealId }) => dealId)
        .sort(),
    ).toEqual([first.id, second.id].sort())
    expect(await db.dealSource.count({ where: { dealId: first.id } })).toBe(2)
    await expect(
      db.dealSource.create({
        data: { deal: { connect: { id: first.id } }, ...sourceSnapshot(post) },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
    await db.importedPost.update({
      where: { id: post.id },
      data: {
        rawContent: 'Edited source text',
        contentHash: createHash('sha256').update('Edited source text').digest('hex'),
      },
    })
    const citation = await db.dealSource.findUniqueOrThrow({
      where: { dealId_importedPostId: { dealId: first.id, importedPostId: post.id } },
    })
    expect(citation.sourceContentSnapshot).toBe('Synthetic source text')
    expect(citation.sourceContentHash).toBe(post.contentHash)
    const run = await db.ingestionRun.create({ data: { sourceId: source.id } })
    expect(run).toMatchObject({
      status: 'RUNNING',
      fetchedCount: 0,
      failedCount: 0,
      finishedAt: null,
    })
  })

  it('rolls back an unsuccessful multi-record transaction', async () => {
    const title = `rollback-${randomUUID()}`
    await expect(
      db.$transaction(async (tx) => {
        await tx.deal.create({ data: { ...dealData(), title } })
        throw new Error('Intentional rollback')
      }),
    ).rejects.toThrow('Intentional rollback')
    expect(await db.deal.count({ where: { title } })).toBe(0)
  })

  it('rejects a checked relation connect to a missing venue', async () => {
    await expect(
      db.deal.create({
        data: {
          ...dealData(),
          applicability: 'SELECTED_OUTLETS',
          venues: { create: { venue: { connect: { id: '000000000000000000000000' } } } },
        },
      }),
    ).rejects.toMatchObject({ code: 'P2025' })
  })
})
