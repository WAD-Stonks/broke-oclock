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
export const USER_DOT_SIZE_PX = 14
export const USER_DOT_CLASS = 'deal-map-user-dot'
// Soft sky-blue halo for the browser's accuracy radius; matches --sky in main.css.
export const USER_ACCURACY_STYLE = {
  color: '#4f7df3',
  weight: 0,
  fillColor: '#4f7df3',
  fillOpacity: 0.14,
} as const
// Skip the halo when the accuracy estimate is coarser than this; at street zoom (1px ~ 5 m)
// anything wider would cover the whole view.
export const MAX_ACCURACY_HALO_METRES = 500

// Venue pins (tinted category bubble plus a black price badge) are built by venue-pin.ts;
// the class is styled in DealMap.vue.
export const DEAL_PIN_CLASS = 'deal-map-pin'
export const DEAL_PIN_BUBBLE_PX = 52
// Longer labels are cut so a badge never grows into a banner across the map.
export const DEAL_PIN_LABEL_MAX_CHARS = 14
