import {
  buildSeedRows,
  isLocalDatabaseUrl,
  SEED_DEALS,
  SEED_NOTE,
  SEED_USERS,
  seedObjectId,
} from '@broke-oclock/db/seed'
import { describe, expect, it } from 'vitest'

const NOW = new Date('2026-10-08T04:00:00.000Z')
const SINGAPORE = { latMin: 1.1, latMax: 1.5, lngMin: 103.5, lngMax: 104.2 }
const MINIMUM_DEALS = 50

describe('seed database guard', () => {
  it.each([
    'mongodb://127.0.0.1:27017/broke_oclock?replicaSet=rs0',
    'mongodb://localhost/broke_oclock',
    'mongodb://user:pass@localhost:27017/db',
    'mongodb://127.0.0.1:27017,127.0.0.1:27018/db',
  ])('accepts local URL %s', (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(true)
  })

  it.each([
    undefined,
    '',
    'mongodb+srv://user:pass@cluster0.example.mongodb.net/db',
    'mongodb://cluster0-shard-00-00.example.mongodb.net:27017/db',
    'mongodb://127.0.0.1:27017,remote.example.net:27017/db',
    'postgres://localhost/db',
  ])('rejects %s', (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(false)
  })
})

describe('seed object ids', () => {
  it('produces distinct 24-character hex ids per kind and index', () => {
    const ids = [
      seedObjectId('user', 0),
      seedObjectId('merchant', 0),
      seedObjectId('venue', 1),
      seedObjectId('deal', 255),
      seedObjectId('dealVenue', 255),
    ]
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{24}$/)
    expect(new Set(ids).size).toBe(ids.length)
    expect(seedObjectId('deal', 3)).toBe(seedObjectId('deal', 3))
  })

  it('rejects negative or fractional indexes', () => {
    expect(() => seedObjectId('deal', -1)).toThrow()
    expect(() => seedObjectId('deal', 1.5)).toThrow()
  })
})

describe('seed dataset', () => {
  const rows = buildSeedRows(NOW)
  const venueById = new Map(rows.venues.map((venue) => [venue.id, venue]))
  const linksByDeal = rows.dealVenues.reduce(
    (groups, link) => groups.set(link.dealId, [...(groups.get(link.dealId) ?? []), link]),
    new Map<string, (typeof rows.dealVenues)[number][]>(),
  )

  it('has at least fifty deals with unique keys and titles', () => {
    expect(rows.deals.length).toBeGreaterThanOrEqual(MINIMUM_DEALS)
    expect(new Set(SEED_DEALS.map((deal) => deal.key)).size).toBe(SEED_DEALS.length)
    expect(new Set(rows.deals.map((deal) => deal.title)).size).toBe(rows.deals.length)
  })

  it('marks reviewed deals as synthetic in the staff-only review note, not in public text', () => {
    for (const deal of rows.deals) {
      expect(deal.description).not.toContain(SEED_NOTE)
      if (deal.reviewStatus === 'PENDING') expect(deal.reviewNote).toBeNull()
      else expect(deal.reviewNote).toContain(SEED_NOTE)
    }
  })

  it('keeps every outlet inside Singapore with a real merchant', () => {
    expect(rows.venues.length).toBeGreaterThan(0)
    const merchantIds = new Set(rows.merchants.map((merchant) => merchant.id))
    for (const venue of rows.venues) {
      expect(venue.latitude).toBeGreaterThan(SINGAPORE.latMin)
      expect(venue.latitude).toBeLessThan(SINGAPORE.latMax)
      expect(venue.longitude).toBeGreaterThan(SINGAPORE.lngMin)
      expect(venue.longitude).toBeLessThan(SINGAPORE.lngMax)
      expect(merchantIds.has(venue.merchantId)).toBe(true)
    }
  })

  it('respects the applicability invariants', () => {
    for (const deal of rows.deals) {
      const links = linksByDeal.get(deal.id) ?? []
      if (deal.applicability === 'SELECTED_OUTLETS') {
        expect(links.length).toBeGreaterThan(0)
        for (const link of links)
          expect(venueById.get(link.venueId)?.merchantId).toBe(deal.merchantId)
      } else {
        expect(links).toHaveLength(0)
      }
      if (deal.applicability === 'ALL_MERCHANT_OUTLETS') expect(deal.merchantId).toBeTruthy()
    }
  })

  it('publishes only approved or hidden deals with matching review versions', () => {
    for (const deal of rows.deals) {
      expect(deal.submittedById).toBe(SEED_USERS.submitter.id)
      if (deal.reviewStatus === 'APPROVED' || deal.reviewStatus === 'HIDDEN') {
        expect(deal.publishedAt).toBeInstanceOf(Date)
        expect(deal.reviewedVersion).toBe(deal.contentVersion)
        expect(deal.reviewedById).toBe(SEED_USERS.reviewer.id)
      } else {
        expect(deal.publishedAt).toBeNull()
      }
      // Explicit null, not undefined: MongoDB `{ field: null }` filters skip missing fields.
      expect(deal.deletedAt).toBeNull()
    }
    const statuses = new Set(rows.deals.map((deal) => deal.reviewStatus))
    expect([...statuses].sort()).toEqual(['APPROVED', 'HIDDEN', 'PENDING', 'REJECTED'])
  })

  it('mixes expired, current, upcoming and open-ended validity relative to now', () => {
    const expired = rows.deals.filter((deal) => deal.validUntil && deal.validUntil < NOW)
    const upcoming = rows.deals.filter((deal) => deal.validFrom && deal.validFrom > NOW)
    const open = rows.deals.filter((deal) => !deal.validUntil)
    const current = rows.deals.filter(
      (deal) => deal.validFrom && deal.validFrom <= NOW && deal.validUntil && deal.validUntil > NOW,
    )
    expect(expired.length).toBeGreaterThanOrEqual(5)
    expect(upcoming.length).toBeGreaterThanOrEqual(3)
    expect(open.length).toBeGreaterThanOrEqual(3)
    expect(current.length).toBeGreaterThanOrEqual(25)
    for (const deal of open) expect(deal.rawValidityText).toBeTruthy()
    for (const deal of rows.deals) {
      if (deal.validFrom && deal.validUntil) expect(deal.validFrom < deal.validUntil).toBe(true)
      expect(deal.createdAt).toBeInstanceOf(Date)
      if (deal.reviewedAt instanceof Date) expect(deal.reviewedAt <= NOW).toBe(true)
    }
  })

  it('keeps offer amounts consistent with the offer type', () => {
    for (const deal of rows.deals) {
      if (deal.offerType === 'FIXED_PRICE') expect(deal.priceMinor).toBeGreaterThan(0)
      if (deal.offerType === 'PERCENT_OFF') {
        expect(deal.discountPercent).toBeGreaterThan(0)
        expect(deal.discountPercent).toBeLessThanOrEqual(100)
      }
      expect(deal.currency).toBe('SGD')
    }
  })

  it('is deterministic for the same timestamp', () => {
    expect(buildSeedRows(NOW)).toEqual(rows)
  })
})
