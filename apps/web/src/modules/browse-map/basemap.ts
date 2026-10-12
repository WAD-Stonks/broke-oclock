// Basemap selection. CARTO Positron (`light_all`) is the preferred light, low-contrast style and
// needs a publishable, domain-restricted key on every tile URL. Without a key the map falls back
// to OneMap `Grey`, the Singapore Land Authority's keyless light basemap, so the page never goes
// blank. Tiles render untinted; the pins, cards and buttons carry the colour.
export type BasemapProvider = 'carto' | 'onemap'

export type Basemap = {
  readonly provider: BasemapProvider
  readonly url: string
  readonly attribution: string
}

// Other CARTO raster styles: light_nolabels, dark_all, dark_nolabels, voyager, voyager_nolabels.
export const CARTO_STYLE = 'light_all'
const CARTO_TILE_HOST = 'https://basemaps.cartocdn.com/rastertiles'
// Attribution strings are fixed constants rendered by Leaflet's control, never user content.
const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attribution/">CARTO</a>'

// OneMap styles: Grey, Default, Original, Night. Docs: https://www.onemap.gov.sg/apidocs/maps
export const ONEMAP_STYLE = 'Grey'
const ONEMAP_TILE_URL = `https://www.onemap.gov.sg/maps/tiles/${ONEMAP_STYLE}/{z}/{x}/{y}.png`
const ONEMAP_ATTRIBUTION =
  '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" alt="" style="height:1rem;width:1rem;vertical-align:text-bottom"/> <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a> &copy; contributors | <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>'

// `.env.example` ships UNSET/UNCONFIGURED markers; treat them like an absent key.
const PLACEHOLDER_KEYS = new Set(['unset', 'unconfigured'])

const isConfiguredKey = (key: string | undefined): key is string => {
  const trimmed = key?.trim() ?? ''
  return trimmed.length > 0 && !PLACEHOLDER_KEYS.has(trimmed.toLowerCase())
}

export const resolveBasemap = (cartoApiKey: string | undefined): Basemap => {
  if (!isConfiguredKey(cartoApiKey)) {
    return {
      provider: 'onemap',
      url: ONEMAP_TILE_URL,
      attribution: ONEMAP_ATTRIBUTION,
    }
  }
  const key = encodeURIComponent(cartoApiKey.trim())
  return {
    provider: 'carto',
    url: `${CARTO_TILE_HOST}/${CARTO_STYLE}/{z}/{x}/{y}{r}.png?key=${key}`,
    attribution: CARTO_ATTRIBUTION,
  }
}

// Vite only exposes VITE_-prefixed variables to the browser; this one is a publishable tile key.
export const readCartoApiKey = (): string | undefined => import.meta.env.VITE_CARTO_API_KEY
