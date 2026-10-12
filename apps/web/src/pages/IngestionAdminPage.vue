<script setup lang="ts">
import type { IngestionDashboardResponse, IngestionRunResponse } from '@broke-oclock/contracts/ingestion'
import { BButton } from '@broke-oclock/ui'
import AdminShell from '@web/components/admin/AdminShell.vue'
import { createAdminReadFence } from '@web/lib/admin-session'
import { api } from '@web/lib/api-client'
import { authClient } from '@web/lib/auth-client'
import AccountsPanel from '@web/modules/ingestion-admin/AccountsPanel.vue'
import AdminSignIn from '@web/modules/ingestion-admin/AdminSignIn.vue'
import DraftQueue from '@web/modules/ingestion-admin/DraftQueue.vue'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import IngestionRuns from '@web/modules/ingestion-admin/IngestionRuns.vue'
import LocationSearch from '@web/modules/ingestion-admin/LocationSearch.vue'
import { inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { routeLocationKey } from 'vue-router'

const access = ref('loading')
const dashboard = ref<IngestionDashboardResponse | null>(null)
const revision = ref(0)
const runPending = ref(false)
const runError = ref('')
const runResult = ref<IngestionRunResponse | null>(null)
const fence = createAdminReadFence()
const operationFence = createAdminReadFence()
const nativeFence = createAdminReadFence()
const logoutStarting = (event: Event) => { if ((event.target as Element)?.closest('[data-testid="admin-sign-out"]')) nativeFence.invalidate() }
const sessionRefreshKey = ref(0)
const panelKey = ref(0)
const route = inject(routeLocationKey, null)
const filter = (value: unknown): 'PENDING' | 'APPROVED' | 'REJECTED' => value === 'APPROVED' || value === 'REJECTED' ? value : 'PENDING'
const initialStatus = ref(filter(route?.query.status))
watch(() => route?.query.status, value => { initialStatus.value = filter(value); panelKey.value++ }, { flush: 'sync' })
const close = () => {
  fence.invalidate()
  operationFence.invalidate()
  access.value = 'closed'
  dashboard.value = null
  runResult.value = null
  runError.value = ''
  runPending.value = false
  revision.value++
  panelKey.value++
}
const anonymous = () => { close(); access.value = 'unauthorized' }
const denied = (code: string) => {
  nativeFence.invalidate()
  close()
  dashboard.value = null
  access.value = code === 'UNAUTHORIZED' ? 'unauthorized' : 'forbidden'
}
const load = async () => {
  const ticket = fence.begin()
  if (!dashboard.value) access.value = 'loading'
  try {
    const result = await api.ingestion.dashboard()
    if (!fence.current(ticket)) return false
    dashboard.value = result
    access.value = 'allowed'
    return true
  } catch (error) {
    if (!fence.current(ticket)) return false
    const code = errorCode(error)
    close()
    access.value = code === 'UNAUTHORIZED' ? 'unauthorized' : code === 'FORBIDDEN' ? 'forbidden' : 'error'
    return false
  }
}
const refresh = async () => {
  if (await load()) revision.value += 1
}
const run = async () => {
  if (access.value !== 'allowed' || runPending.value || !dashboard.value?.source.enabled || !dashboard.value.source.reuseApproved) return
  const ticket = operationFence.begin()
  runPending.value = true
  runError.value = ''
  runResult.value = null
  try {
    const result = await api.ingestion.run()
    if (!operationFence.current(ticket)) return
    runResult.value = result
    await refresh()
  } catch (failure) {
    if (!operationFence.current(ticket)) return
    const code = errorCode(failure)
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') { denied(code); return }
    runError.value = 'Unable to run ingestion. Please try again.'
  } finally {
    if (operationFence.current(ticket)) runPending.value = false
  }
}
const reload = async () => {
  close()
  const ticket = fence.begin()
  const probe = nativeFence.begin()
  access.value = 'loading'
  try {
    const identity = await authClient.getSession({ query: { disableCookieCache: true } })
    if (!nativeFence.current(probe)) return
    if (identity.error) { close(); return }
    if (!identity.data?.user) { if (access.value === 'closed' || access.value === 'loading') anonymous(); return }
    if (!fence.current(ticket)) return
    await load()
  } catch { if (nativeFence.current(probe) && fence.current(ticket)) close() }
}
const signedIn = () => { sessionRefreshKey.value++; void reload() }
onMounted(reload)
onUnmounted(() => { fence.dispose(); operationFence.dispose(); nativeFence.dispose() })
</script>

<template>
  <AdminShell @click.capture="logoutStarting" title="Ingestion admin" :refresh-key="sessionRefreshKey" @closing="close" @signed-out="anonymous" @access-reload="reload">
  <section aria-label="Ingestion administration">
    <p v-if="access === 'loading'" role="status">Loading ingestion…</p>
    <AdminSignIn v-else-if="access === 'unauthorized'" @signed-in="signedIn" />
    <p v-else-if="access === 'closed'" role="status">Access is closed. Use the session controls to retry or recheck.</p>
    <p v-else-if="access === 'forbidden'" role="alert">You do not have permission to review ingestion.</p>
    <div v-else-if="access === 'error'" role="alert">
      <p>Unable to load ingestion. Please try again.</p>
      <BButton data-testid="retry-dashboard" @click="reload">Retry dashboard</BButton>
    </div>
    <template v-else-if="dashboard">
      <section class="card p-4 mb-4" aria-labelledby="source-title">
        <h2 id="source-title" class="h4">Source readiness</h2>
        <p class="fw-semibold">{{ dashboard.source.name }}</p>
        <ul>
          <li>{{ dashboard.source.enabled ? 'Ingestion is enabled' : 'Ingestion is disabled' }}</li>
          <li>{{ dashboard.source.reuseApproved ? 'Operator reuse attestation is recorded, not publisher permission' : 'Operator reuse attestation is not recorded' }}</li>
          <li>{{ dashboard.source.onemapConfigured ? 'OneMap is configured' : 'OneMap is not configured' }}</li>
        </ul>
        <BButton data-testid="run-ingestion" variant="primary" :disabled="runPending || !dashboard.source.enabled || !dashboard.source.reuseApproved" @click="run">{{ runPending ? 'Running ingestion…' : 'Run ingestion' }}</BButton>
        <p v-if="runError" role="alert" class="text-danger mt-3 mb-0">{{ runError }}</p>
        <p v-if="runResult" role="status" class="mt-3 mb-0">Run {{ runResult.runId }}: {{ runResult.status }}. Fetched {{ runResult.fetchedCount }}, created {{ runResult.createdCount }}, updated {{ runResult.updatedCount }}, failed {{ runResult.failedCount }}.</p>
      </section>
      <dl aria-label="Ingestion counts" class="row g-3 mb-4">
        <div v-for="(count, status) in dashboard.counts" :key="status" class="col-6 col-md-3">
          <div class="card p-3"><dd class="h2 mb-1">{{ count }}</dd><dt class="text-capitalize">{{ status }}</dt></div>
        </div>
      </dl>
      <DraftQueue :key="panelKey" :initial-status="initialStatus" :revision="revision" @changed="refresh" @denied="denied" />
      <IngestionRuns :revision="revision" @denied="denied" />
      <LocationSearch :configured="dashboard.source.onemapConfigured" @denied="denied" />
      <AccountsPanel @denied="denied" />
    </template>
  </section>
  </AdminShell>
</template>
