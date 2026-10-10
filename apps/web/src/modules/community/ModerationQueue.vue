<script setup lang="ts">
import { BButton } from '@broke-oclock/ui'
import { ApiClientError, api } from '@web/lib/api-client'
import { onMounted, ref } from 'vue'

type Report = Awaited<ReturnType<typeof api.community.reports>>['items'][number]
const items = ref<Report[]>([])
const cursor = ref<string | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notes = ref<Record<string, string>>({})
const hides = ref<Record<string, boolean>>({})
const message = (cause: unknown) => cause instanceof ApiClientError ? cause.message : 'Could not load reports.'
const load = async (more = false) => {
  loading.value = true
  error.value = ''
  try {
    const result = await api.community.reports(more && cursor.value ? { cursor: cursor.value } : {})
    items.value = more ? [...items.value, ...result.items] : result.items
    cursor.value = result.nextCursor
  } catch (cause) { error.value = message(cause) }
  finally { loading.value = false }
}
const review = async (item: Report, status: 'RESOLVED' | 'DISMISSED') => {
  const note = notes.value[item.id]?.trim()
  if (!note || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await api.community.reviewReport(item.targetType, item.id, { status, note, hide: Boolean(hides.value[item.id]) })
    items.value = items.value.filter((entry) => entry.id !== item.id)
  } catch (cause) { error.value = message(cause) }
  finally { saving.value = false }
}
onMounted(() => { void load() })
</script>

<template>
  <section class="mx-auto" style="max-width: 800px" aria-label="Community moderation">
    <h1>Community reports</h1>
    <p v-if="error" role="alert" class="text-danger">{{ error }}</p>
    <p v-if="loading" role="status">Loading reports…</p>
    <p v-else-if="!items.length">No open reports.</p>
    <article v-for="item in items" :key="item.id" class="card p-3 mb-3">
      <h2 class="h5">{{ item.targetType.toLowerCase() }} report <span v-if="item.priority" class="badge text-bg-warning">Priority</span></h2>
      <p>Reason: {{ item.reason.toLowerCase() }} · {{ item.openCount }} open report(s)</p>
      <p v-if="item.details" style="white-space: pre-wrap">{{ item.details }}</p>
      <label class="form-label">Review note
        <textarea v-model="notes[item.id]" class="form-control" maxlength="500" />
      </label>
      <label class="form-check mb-3"><input v-model="hides[item.id]" class="form-check-input" type="checkbox" /> Hide content</label>
      <div class="d-flex gap-2">
        <BButton variant="primary" :disabled="saving || !notes[item.id]?.trim()" @click="review(item, 'RESOLVED')">Resolve</BButton>
        <BButton variant="outline-secondary" :disabled="saving || hides[item.id] || !notes[item.id]?.trim()" @click="review(item, 'DISMISSED')">Dismiss</BButton>
      </div>
    </article>
    <BButton v-if="cursor" variant="outline-secondary" :disabled="loading" @click="load(true)">Load more</BButton>
  </section>
</template>
