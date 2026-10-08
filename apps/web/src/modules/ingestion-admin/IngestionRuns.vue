<script setup lang="ts">
import type { IngestionRunsResponse } from '@broke-oclock/contracts/ingestion'
import { BButton } from '@broke-oclock/ui'
import { api } from '@web/lib/api-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { ref, watch } from 'vue'

const props = defineProps<{ revision: number }>()
const emit = defineEmits<{ denied: [code: string] }>()
const items = ref<IngestionRunsResponse['items'] | null>(null)
const pending = ref(false)
const error = ref('')
let request = 0
const load = async () => {
  const current = ++request
  pending.value = true
  error.value = ''
  try {
    const result = await api.ingestion.runs({ limit: 20 })
    if (current === request) items.value = result.items
  } catch (failure) {
    if (current !== request) return
    const code = errorCode(failure)
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') emit('denied', code)
    error.value = 'Unable to load runs. Please retry.'
  } finally {
    if (current === request) pending.value = false
  }
}
watch(() => props.revision, load, { immediate: true })
</script>

<template>
  <section aria-labelledby="runs-title" class="card p-4 mb-4" :aria-busy="pending">
    <h2 id="runs-title" class="h4">Recent runs</h2>
    <p v-if="pending" role="status">Loading runs…</p>
    <div v-if="error" role="alert"><p>{{ error }}</p><BButton :disabled="pending" @click="load">Retry runs</BButton></div>
    <p v-if="!pending && !error && items?.length === 0">No ingestion runs yet.</p>
    <ul v-if="items?.length" class="list-unstyled mb-0">
      <li v-for="run in items" :key="run.id" class="border-top py-3">
        <h3 class="h6 text-break">{{ run.sourceName }} · {{ run.status }}</h3>
        <p class="small text-break mb-2">Run {{ run.id }} · Started {{ run.startedAt }} · Finished {{ run.finishedAt ?? 'Not finished' }}</p>
        <dl class="row small mb-0">
          <div class="col-6 col-md-3"><dt>Fetched</dt><dd>{{ run.fetchedCount }}</dd></div>
          <div class="col-6 col-md-3"><dt>Created</dt><dd>{{ run.createdCount }}</dd></div>
          <div class="col-6 col-md-3"><dt>Updated</dt><dd>{{ run.updatedCount }}</dd></div>
          <div class="col-6 col-md-3"><dt>Failed</dt><dd>{{ run.failedCount }}</dd></div>
        </dl>
        <p v-if="run.errorCode" class="text-danger small mb-0">Error: {{ run.errorCode }}</p>
      </li>
    </ul>
  </section>
</template>
