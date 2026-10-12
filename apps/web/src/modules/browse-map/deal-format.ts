// Small text helpers for the deal detail view. Dates are shown in Singapore time because
// every deal is local, whatever time zone the visitor's browser reports.
const SINGAPORE_TIME_ZONE = 'Asia/Singapore'
const NO_END_DATE = 'No end date given'

const endDateFormat = new Intl.DateTimeFormat('en-SG', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: SINGAPORE_TIME_ZONE,
})

// "Until 31 Dec 2026", else the deal's own wording, else a plain note.
export const formatValidity = (
  validUntil: string | null,
  rawValidityText: string | null,
): string => {
  if (validUntil !== null) {
    const endDate = new Date(validUntil)
    if (!Number.isNaN(endDate.getTime())) return `Until ${endDateFormat.format(endDate)}`
  }
  return rawValidityText ?? NO_END_DATE
}

// Category codes are stored upper case with underscores, for example FAST_FOOD.
export const formatCategory = (category: string): string => {
  const words = category.toLowerCase().replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// Null when the deal has only the outlet being viewed.
export const formatOtherOutlets = (totalOutlets: number): string | null => {
  const others = totalOutlets - 1
  if (others < 1) return null
  return `Also at ${others} other ${others === 1 ? 'outlet' : 'outlets'}`
}
