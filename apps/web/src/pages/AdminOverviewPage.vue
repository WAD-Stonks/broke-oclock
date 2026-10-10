<script setup lang="ts">
import type { AdminOverviewResponse } from '@broke-oclock/contracts/platform-admin'
import AdminShell from '@web/components/admin/AdminShell.vue'
import SharedSignIn from '@web/components/auth/SharedSignIn.vue'
import { createAdminReadFence } from '@web/lib/admin-session'
import { api } from '@web/lib/api-client'
import { authClient } from '@web/lib/auth-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { onMounted, onUnmounted, ref } from 'vue'

const access = ref('loading')
const overview = ref<AdminOverviewResponse | null>(null)
const sessionRefreshKey = ref(0)
const fence = createAdminReadFence()
const nativeFence = createAdminReadFence()
const logoutStarting = (event: Event) => {
  if ((event.target as Element)?.closest('[data-testid="admin-sign-out"]')) nativeFence.invalidate()
}
const close = () => { fence.invalidate(); access.value = 'closed'; overview.value = null }
const anonymous = () => { close(); access.value = 'unauthorized' }
const reload = async () => {
  close()
  const ticket = fence.begin()
  access.value = 'loading'
  const probe = nativeFence.begin()
  try {
    const identity = await authClient.getSession({ query: { disableCookieCache: true } })
    if (!nativeFence.current(probe)) return
    if (identity.error) { close(); return }
    if (!identity.data?.user) { if (access.value === 'closed' || access.value === 'loading') anonymous(); return }
    if (!fence.current(ticket)) return
    const data = await api.platformAdmin.overview()
    if (!fence.current(ticket)) return
    overview.value = data
    access.value = 'allowed'
  } catch (failure) {
    if (!fence.current(ticket)) return
    const code = errorCode(failure)
    close()
    access.value = code === 'UNAUTHORIZED' ? 'unauthorized' : code === 'FORBIDDEN' ? 'forbidden' : 'error'
  }
}
const signedIn = () => { sessionRefreshKey.value++; void reload() }
onMounted(reload)
onUnmounted(() => { fence.dispose(); nativeFence.dispose() })
</script>

<template>
  <AdminShell @click.capture="logoutStarting" title="Admin overview" :refresh-key="sessionRefreshKey" @closing="close" @signed-out="anonymous" @access-reload="reload">
    <p v-if="access === 'loading'" role="status">Loading admin overview…</p>
    <SharedSignIn v-else-if="access === 'unauthorized'" title="Sign in to view administration" destination="/admin" @signed-in="signedIn" />
    <p v-else-if="access === 'forbidden'" role="alert">You do not have permission to view administration.</p>
    <p v-else-if="access === 'closed'" role="status">Access is closed. Use the session controls to retry or recheck.</p>
    <div v-else-if="access === 'error'" role="alert">
      <p>Unable to load admin overview. Counts are unavailable.</p>
      <button type="button" class="btn btn-outline-primary" @click="reload">Retry overview</button>
    </div>
    <template v-else-if="overview">
      <p class="small text-secondary">Snapshot: {{ overview.generatedAt }}</p>
      <section class="card p-3 mb-3" aria-labelledby="work-title">
        <h2 id="work-title" class="h4">Work awaiting review</h2>
        <ul>
          <li><a href="/admin/accounts?requestStatus=PENDING#merchant-requests">Pending merchant requests: {{ overview.counts.pendingMerchantRequests }}</a></li>
          <li><a href="/admin/ingestion?status=PENDING#queue-title">Pending imported drafts: {{ overview.counts.pendingImportedDrafts }}</a></li>
          <li>Failed imported posts: {{ overview.counts.failedImportedPosts }}</li>
        </ul>
        <p class="small mb-0">Failures count imported posts, not ingestion runs.</p>
      </section>
      <section class="card p-3 mb-3" aria-labelledby="readiness-title">
        <h2 id="readiness-title" class="h4">Configuration readiness</h2>
        <p>Configured and wired does not establish live provider acceptance.</p>
        <dl>
          <dt>Google sign-in</dt><dd>{{ overview.readiness.googleConfigured ? 'Configured and wired' : 'Not configured' }}</dd>
          <dt>Email authentication</dt><dd>{{ overview.readiness.emailConfigured ? 'Configured and wired' : 'Not configured' }}</dd>
          <dt>OneMap</dt><dd>{{ overview.readiness.oneMapConfigured ? 'Configured and wired' : 'Not configured' }}</dd>
          <dt>Ingestion operator opt-in</dt><dd>{{ overview.readiness.ingestionOptIn ? 'Enabled' : 'Disabled' }}</dd>
          <dt>Operator reuse attestation, not publisher permission</dt><dd>{{ overview.readiness.reuseAttested ? 'Recorded' : 'Not recorded' }}</dd>
          <dt>Source record</dt><dd>{{ overview.readiness.sourceRecordEnabled ? 'Enabled' : 'Disabled' }}</dd>
          <dt>Source identity</dt><dd>{{ overview.readiness.sourceIdentityValid ? 'Valid' : 'Invalid or missing' }}</dd>
          <dt>Import gate</dt><dd>{{ overview.readiness.importAllowed ? 'Allowed by configuration gates' : 'Blocked by configuration gates' }}</dd>
          <dt>Live provider acceptance</dt><dd>{{ overview.readiness.liveProviderAcceptance }}</dd>
        </dl>
      </section>
      <section class="card p-3 mb-3" aria-labelledby="overview-runs-title">
        <h2 id="overview-runs-title" class="h4">Recent ingestion runs</h2>
        <a href="/admin/ingestion#runs-title">View ingestion run history</a>
        <p v-if="!overview.recentRuns.length">No ingestion runs yet.</p>
        <ul v-else class="list-unstyled">
          <li v-for="run in overview.recentRuns" :key="run.id" class="border-top py-3 text-break">
            <h3 class="h6">{{ run.sourceName }}: {{ run.status }}</h3>
            <p>Run {{ run.id }} | Started {{ run.startedAt }} | Finished {{ run.finishedAt ?? 'Not finished' }}</p>
            <p>Fetched {{ run.fetchedCount }}, created {{ run.createdCount }}, updated {{ run.updatedCount }}, failed posts {{ run.failedCount }}.</p>
            <p v-if="run.errorCode" class="text-danger">Error: {{ run.errorCode }}</p>
          </li>
        </ul>
      </section>
    </template>
  </AdminShell>
</template>
