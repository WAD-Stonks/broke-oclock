import type { Coordinates } from '@web/modules/browse-map/types'

export type BoundingBox = {
  readonly south: number
  readonly west: number
  readonly north: number
  readonly east: number
}

// Singapore's mainland and islands with a small margin. The map opens fitted to this box and
// cannot be dragged outside it; positions beyond it are ignored rather than clamped.
export const SINGAPORE_BOUNDS: BoundingBox = {
  south: 1.15,
  west: 103.58,
  north: 1.48,
  east: 104.1,
}

export const toBoundsTuple = (
  box: BoundingBox,
): readonly [readonly [number, number], readonly [number, number]] => [
  [box.south, box.west],
  [box.north, box.east],
]

export const isWithinSingapore = ({ lat, lng }: Coordinates): boolean =>
  lat >= SINGAPORE_BOUNDS.south &&
  lat <= SINGAPORE_BOUNDS.north &&
  lng >= SINGAPORE_BOUNDS.west &&
  lng <= SINGAPORE_BOUNDS.east
