import type { Coordinates } from '@web/modules/browse-map/types'
import { readonly, ref } from 'vue'

export type GeolocationStatus = 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable'

// GeolocationPositionError.PERMISSION_DENIED; compared by value so fakes need no prototype.
const PERMISSION_DENIED_CODE = 1
const POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 60_000,
}

// Wraps the browser Geolocation API. Callers decide the fallback (for example the Singapore
// bounds) when the result is null; this composable never invents a position.
export function useGeolocation(
  geolocation: Geolocation | undefined = globalThis.navigator?.geolocation,
) {
  const status = ref<GeolocationStatus>('idle')
  const position = ref<Coordinates | null>(null)
  // Radius in metres the browser reports around `position`; drawn as the accuracy circle.
  const accuracyMetres = ref<number | null>(null)

  const locate = () =>
    new Promise<Coordinates | null>((resolve) => {
      if (!geolocation) {
        status.value = 'unavailable'
        resolve(null)
        return
      }
      status.value = 'locating'
      geolocation.getCurrentPosition(
        (result) => {
          const next = { lat: result.coords.latitude, lng: result.coords.longitude }
          position.value = next
          accuracyMetres.value = Number.isFinite(result.coords.accuracy)
            ? result.coords.accuracy
            : null
          status.value = 'granted'
          resolve(next)
        },
        (failure) => {
          status.value = failure.code === PERMISSION_DENIED_CODE ? 'denied' : 'unavailable'
          position.value = null
          accuracyMetres.value = null
          resolve(null)
        },
        POSITION_OPTIONS,
      )
    })

  return {
    status: readonly(status),
    position: readonly(position),
    accuracyMetres: readonly(accuracyMetres),
    locate,
  }
}
