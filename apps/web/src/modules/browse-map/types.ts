export type Coordinates = {
  readonly lat: number
  readonly lng: number
}

// Minimal shape the map needs to draw a pin. Replace with the inferred output of the
// shared deals procedure once it exists (RouterOutputs['deals'][...]).
export type DealMarker = {
  readonly id: string
  readonly title: string
  readonly lat: number
  readonly lng: number
}
