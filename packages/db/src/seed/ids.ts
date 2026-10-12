// Deterministic 24-hex ObjectIds so reruns replace the same seed records instead of duplicating them.
const SEED_PREFIX = '5eed'
const KIND_CODES = { user: '01', merchant: '02', venue: '03', deal: '04', dealVenue: '05' } as const
const INDEX_HEX_LENGTH = 18

export type SeedKind = keyof typeof KIND_CODES

export const seedObjectId = (kind: SeedKind, index: number): string => {
  if (!Number.isInteger(index) || index < 0) throw new Error(`Invalid seed index: ${index}`)
  return `${SEED_PREFIX}${KIND_CODES[kind]}${index.toString(16).padStart(INDEX_HEX_LENGTH, '0')}`
}
