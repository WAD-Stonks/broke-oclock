import { z } from 'zod'

// Browser-safe schemas for the public deals list. No database or server imports here.
const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/)
const MAX_CATEGORY_LENGTH = 40
const MAX_PRICE_MINOR = 1_000_000

// Query strings arrive as text, so booleans are a two-value enum and the price is coerced.
export const dealsQuerySchema = z.strictObject({
  category: z.string().trim().min(1).max(MAX_CATEGORY_LENGTH).optional(),
  priceMaxMinor: z.coerce.number().int().min(0).max(MAX_PRICE_MINOR).optional(),
  validNow: z.enum(['true', 'false']).default('true'),
})

export const dealVenuePinSchema = z.strictObject({
  id: objectIdSchema,
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
})

export const offerTypeSchema = z.enum(['FIXED_PRICE', 'PERCENT_OFF', 'BUY_ONE_GET_ONE', 'OTHER'])

// Read-only community evidence for the drawer; voting itself is a separate community contract.
export const dealVoteSummarySchema = z.strictObject({
  alive: z.number().int().min(0),
  dead: z.number().int().min(0),
})

export const dealPinSchema = z.strictObject({
  id: objectIdSchema,
  title: z.string(),
  category: z.string(),
  label: z.string(),
  description: z.string(),
  offerType: offerTypeSchema,
  priceMinor: z.number().int().min(0).nullable(),
  discountPercent: z.number().int().min(0).max(100).nullable(),
  terms: z.string().nullable(),
  // ISO timestamp of the exclusive end, or null when the deal has no known end date.
  validUntil: z.string().datetime().nullable(),
  rawValidityText: z.string().nullable(),
  votes: dealVoteSummarySchema,
  commentCount: z.number().int().min(0),
  venues: z.array(dealVenuePinSchema),
})

export const dealsResponseSchema = z.strictObject({
  items: z.array(dealPinSchema),
  categories: z.array(z.string()),
})

export type DealsQuery = z.infer<typeof dealsQuerySchema>
export type DealVenuePin = z.infer<typeof dealVenuePinSchema>
export type DealVoteSummary = z.infer<typeof dealVoteSummarySchema>
export type DealPin = z.infer<typeof dealPinSchema>
export type DealsResponse = z.infer<typeof dealsResponseSchema>
