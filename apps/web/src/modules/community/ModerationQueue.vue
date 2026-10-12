<script setup lang="ts">
import { BButton } from '@broke-oclock/ui'
import { ApiClientError, api } from '@web/lib/api-client'
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

type Report = Awaited<ReturnType<typeof api.community.reports>>['items'][number]
const items = ref<Report[]>([])
const cursor = ref<string | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notes = ref<Record<string, string>>({})
const deleteCandidate = ref<string | null>(null)
const development = import.meta.env.MODE === 'development'
const message = (cause: unknown) => cause instanceof ApiClientError ? cause.message : 'Could not load reports.'
const load = async (more = false) => {
  loading.value = true
  error.value = ''
  if (!more) { items.value = []; cursor.value = null; deleteCandidate.value = null }
  try {
    const result = await api.community.reports(more && cursor.value ? { cursor: cursor.value } : {})
    items.value = more ? [...items.value, ...result.items] : result.items
    cursor.value = result.nextCursor
  } catch (cause) {
    error.value = message(cause)
    if (cause instanceof ApiClientError && (cause.status === 401 || cause.status === 403)) {
      items.value = []; cursor.value = null
    }
  }
  finally { loading.value = false }
}
const review = async (item: Report, status: 'RESOLVED' | 'DISMISSED', deleteContent = false) => {
  const note = notes.value[item.id]?.trim()
  if (!note || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await api.community.reviewReport(item.targetType, item.id, { status, note, delete: deleteContent })
    items.value = items.value.filter((entry) =>
      deleteContent
        ? entry.targetType !== item.targetType || entry.targetId !== item.targetId
        : entry.id !== item.id,
    )
    deleteCandidate.value = null
  } catch (cause) { error.value = message(cause) }
  finally { saving.value = false }
}
onMounted(() => { void load() })
</script>

<template>
  <section class="mx-auto" style="max-width: 800px" aria-label="Community moderation">
    <h1>Community reports</h1>
    <p>Sign in with a moderator or administrator account to review reports. <RouterLink v-if="development" to="/community-demo">Sign in on the demo page</RouterLink></p>
    <BButton variant="outline-primary" class="mb-3" :disabled="loading || saving" @click="load()">Refresh reports</BButton>
    <p v-if="error" role="alert" class="text-danger">{{ error }}</p>
    <p v-if="loading" role="status">Loading reports…</p>
    <p v-else-if="!error && !items.length">No open reports.</p>
    <article v-for="item in items" :key="item.id" class="card p-3 mb-3">
      <h2 class="h5">{{ item.targetType.toLowerCase() }} report <span v-if="item.priority" class="badge text-bg-warning">Priority</span></h2>
      <p class="mb-1"><strong>Deal: {{ item.deal.title }}</strong></p>
      <p class="small text-secondary" style="overflow-wrap: anywhere">Deal ID: {{ item.deal.id }}</p>
      <p v-if="item.deal.deletedAt" class="text-secondary">This deal has already been deleted.</p>
      <p style="white-space: pre-wrap; overflow-wrap: anywhere">{{ item.deal.description }}</p>
      <div v-if="item.comment" class="border-start ps-3 mb-3">
        <p class="mb-1"><strong>Reported comment by {{ item.comment.authorName }}</strong></p>
        <p style="white-space: pre-wrap; overflow-wrap: anywhere">{{ item.comment.body }}</p>
        <p v-if="item.comment.deletedAt || item.comment.hiddenAt" class="small text-secondary">This comment is no longer publicly visible.</p>
      </div>
      <p>Reason: {{ item.reason.toLowerCase() }} · {{ item.openCount }} open report(s)</p>
      <p v-if="item.details" style="white-space: pre-wrap">{{ item.details }}</p>
      <label class="form-label">Review note
        <textarea v-model="notes[item.id]" class="form-control" maxlength="500" />
      </label>
      <div class="d-flex flex-wrap gap-2">
        <BButton variant="primary" :disabled="saving || !notes[item.id]?.trim()" @click="review(item, 'RESOLVED')">Resolve</BButton>
        <BButton variant="outline-secondary" :disabled="saving || !notes[item.id]?.trim()" @click="review(item, 'DISMISSED')">Dismiss</BButton>
        <BButton variant="outline-danger" :disabled="saving || !notes[item.id]?.trim()" @click="deleteCandidate = item.id">Delete content</BButton>
      </div>
      <div v-if="deleteCandidate === item.id" class="border border-danger rounded p-3 mt-3">
        <p>Delete the reported {{ item.targetType.toLowerCase() }} from public view? The report and audit history will be retained.</p>
        <div class="d-flex gap-2">
          <BButton variant="danger" :disabled="saving" @click="review(item, 'RESOLVED', true)">Confirm delete</BButton>
          <BButton variant="outline-secondary" :disabled="saving" @click="deleteCandidate = null">Cancel</BButton>
        </div>
      </div>
    </article>
    <BButton v-if="cursor" variant="outline-secondary" :disabled="loading" @click="load(true)">Load more</BButton>
  </section>
</template>
