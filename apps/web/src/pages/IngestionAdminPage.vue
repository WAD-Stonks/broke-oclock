<script setup lang="ts">
import { BButton } from '@broke-oclock/ui'
import { api, type RouterOutputs } from '@web/lib/api-client'
import AccountsPanel from '@web/modules/ingestion-admin/AccountsPanel.vue'
import AdminSignIn from '@web/modules/ingestion-admin/AdminSignIn.vue'
import DraftQueue from '@web/modules/ingestion-admin/DraftQueue.vue'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import IngestionRuns from '@web/modules/ingestion-admin/IngestionRuns.vue'
import LocationSearch from '@web/modules/ingestion-admin/LocationSearch.vue'
import { onMounted, ref } from 'vue'

const access = ref('loading')
const dashboard = ref<RouterOutputs['ingestion']['dashboard'] | null>(null)
const revision = ref(0)
const runPending = ref(false)
const runError = ref('')
const runResult = ref<RouterOutputs['ingestion']['run'] | null>(null)
const denied = (code: string) => {
  dashboard.value = null
  access.value = code === 'UNAUTHORIZED' ? 'unauthorized' : 'forbidden'
}
const load = async () => {
  if (!dashboard.value) access.value = 'loading'
  try {
    dashboard.value = await api.ingestion.dashboard.query()
    access.value = 'allowed'
  } catch (error) {
    const code = errorCode(error)
    access.value = code === 'UNAUTHORIZED' ? 'unauthorized' : code === 'FORBIDDEN' ? 'forbidden' : 'error'
  }
}
const refresh = async () => {
  await load()
  revision.value += 1
}
const run = async () => {
  if (runPending.value || !dashboard.value?.source.enabled || !dashboard.value.source.reuseApproved) return
  runPending.value = true
  runError.value = ''
  runResult.value = null
  try {
    runResult.value = await api.ingestion.run.mutate()
    await refresh()
  } catch (failure) {
    const code = errorCode(failure)
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') denied(code)
    runError.value = 'Unable to run ingestion. Please try again.'
  } finally {
    runPending.value = false
  }
}
onMounted(load)
</script>

<template>
  <section aria-labelledby="ingestion-title">
    <h1 id="ingestion-title" class="h2 mb-4">Ingestion admin</h1>
    <p v-if="access === 'loading'" role="status">Loading ingestion…</p>
    <AdminSignIn v-else-if="access === 'unauthorized'" @signed-in="load" />
    <p v-else-if="access === 'forbidden'" role="alert">You do not have permission to review ingestion.</p>
    <div v-else-if="access === 'error'" role="alert">
      <p>Unable to load ingestion. Please try again.</p>
      <BButton data-testid="retry-dashboard" @click="load">Retry dashboard</BButton>
    </div>
    <template v-else-if="dashboard">
      <section class="card p-4 mb-4" aria-labelledby="source-title">
        <h2 id="source-title" class="h4">Source readiness</h2>
        <p class="fw-semibold">{{ dashboard.source.name }}</p>
        <ul>
          <li>{{ dashboard.source.enabled ? 'Ingestion is enabled' : 'Ingestion is disabled' }}</li>
          <li>{{ dashboard.source.reuseApproved ? 'Content reuse is approved' : 'Content reuse is not approved' }}</li>
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
      <DraftQueue :revision="revision" @changed="refresh" @denied="denied" />
      <IngestionRuns :revision="revision" @denied="denied" />
      <LocationSearch :configured="dashboard.source.onemapConfigured" @denied="denied" />
      <AccountsPanel @denied="denied" />
    </template>
  </section>
</template>
