import { z } from 'zod'

export const venueObjectIdSchema = z.string().regex(/^[a-f0-9]{24}$/)
export const venueOfferTypeSchema = z.enum([
  'BUY_ONE_GET_ONE',
  'PERCENT_OFF',
  'FIXED_PRICE',
  'OTHER',
])

export const venueParamsSchema = z.strictObject({ venueId: venueObjectIdSchema })

export const venueDealSummarySchema = z.object({
  id: venueObjectIdSchema,
  title: z.string(),
  category: z.string(),
  offerType: venueOfferTypeSchema,
  priceMinor: z.number().int().nullable(),
  currency: z.string(),
  discountPercent: z.number().int().nullable(),
  validUntil: z.string().datetime().nullable(),
  rawValidityText: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
})

export const venuePastDealSummarySchema = z.object({
  id: venueObjectIdSchema,
  title: z.string(),
  offerType: venueOfferTypeSchema,
  priceMinor: z.number().int().nullable(),
  currency: z.string(),
  discountPercent: z.number().int().nullable(),
  validUntil: z.string().datetime(),
})

export const venueDetailResponseSchema = z.object({
  venue: z.object({
    id: venueObjectIdSchema,
    name: z.string(),
    address: z.string(),
    area: z.string().nullable(),
    postalCode: z.string().nullable(),
    merchantName: z.string(),
  }),
  deals: z.array(venueDealSummarySchema),
  pastDeals: z.array(venuePastDealSummarySchema),
})

export type VenueDealSummary = z.infer<typeof venueDealSummarySchema>
export type VenuePastDealSummary = z.infer<typeof venuePastDealSummarySchema>
export type VenueDetailResponse = z.infer<typeof venueDetailResponseSchema>
