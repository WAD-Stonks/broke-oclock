/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Publishable CARTO basemap key (domain-restricted in the CARTO dashboard). Optional: without it
  // the browse map falls back to OneMap tiles. See docs/environment-variables.md.
  readonly VITE_CARTO_API_KEY?: string
}
