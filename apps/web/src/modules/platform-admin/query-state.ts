import { errorCode } from '@web/modules/ingestion-admin/errors'
import { shallowReactive } from 'vue'

// Only the newest read may publish data or errors. Invalidation also cancels stale denials.
export function queryState<T>(denied: (code: string) => void) {
  let generation = 0
  const state = shallowReactive({ data: null as T | null, loading: false, error: '' })
  const invalidate = () => {
    generation += 1
    state.loading = false
    state.data = null
    state.error = ''
  }
  const load = async (query: () => Promise<T>, clear = false): Promise<T | undefined> => {
    const ticket = ++generation
    state.loading = true
    state.error = ''
    if (clear) state.data = null
    try {
      const value = await query()
      if (ticket !== generation) return
      state.data = value
      return value
    } catch (failure) {
      if (ticket !== generation) return
      const code = errorCode(failure)
      if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') denied(code)
      else state.error = 'Unable to load data. Please retry.'
    } finally {
      if (ticket === generation) state.loading = false
    }
  }
  return { state, load, invalidate }
}
