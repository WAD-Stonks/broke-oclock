// Leaflet defaults for the public browse map. Tile providers live in basemap.ts.
export const SINGAPORE_CENTER = { lat: 1.3521, lng: 103.8198 } as const
// Zoom used when the map focuses the visitor's located position.
export const FOCUS_ZOOM = 15
// Zoom 11 keeps the whole island on screen; anything wider shows only sea and Johor.
export const MIN_ZOOM = 11
export const MAX_ZOOM = 19
export const ZOOM_CONTROL_POSITION = 'bottomright'
// 1 = the edge is a hard wall; lower values let the map bounce past it and spring back.
export const BOUNDS_VISCOSITY = 1

// "You are here": a CSS dot inside an L.divIcon. A marker is repositioned, never scaled, during
// zoom animations, whereas a vector circleMarker balloons while Leaflet flies in.
export const USER_DOT_SIZE_PX = 16
export const USER_DOT_CLASS = 'deal-map-user-dot'
// Faint geographic halo for the browser's accuracy radius.
export const USER_ACCURACY_STYLE = {
  color: '#006eff',
  weight: 1,
  opacity: 0.35,
  fillColor: '#006eff',
  fillOpacity: 0.08,
} as const
// Skip the halo when the accuracy estimate is coarser than this; at street zoom (1px ~ 5 m)
// anything wider would cover the whole view.
export const MAX_ACCURACY_HALO_METRES = 500
