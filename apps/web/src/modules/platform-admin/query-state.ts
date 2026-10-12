import { createAdminReadFence } from '@web/lib/admin-session'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { shallowReactive } from 'vue'

// Only the newest read may publish data or errors. Invalidation also cancels stale denials.
export function queryState<T>(denied: (code: string) => void) {
  const fence = createAdminReadFence()
  const state = shallowReactive({ data: null as T | null, loading: false, error: '' })
  const invalidate = () => {
    fence.invalidate()
    state.loading = false
    state.data = null
    state.error = ''
  }
  const load = async (query: () => Promise<T>, clear = false): Promise<T | undefined> => {
    const ticket = fence.begin()
    state.loading = true
    state.error = ''
    if (clear) state.data = null
    try {
      const value = await query()
      if (!fence.current(ticket)) return
      state.data = value
      return value
    } catch (failure) {
      if (!fence.current(ticket)) return
      const code = errorCode(failure)
      if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') denied(code)
      else state.error = 'Unable to load data. Please retry.'
    } finally {
      if (fence.current(ticket)) state.loading = false
    }
  }
  return { state, load, invalidate }
}
