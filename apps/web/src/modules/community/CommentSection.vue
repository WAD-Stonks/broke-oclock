<script setup lang="ts">
import type { CommentResponse } from '@broke-oclock/contracts/community'
import { BButton } from '@broke-oclock/ui'
import { ApiClientError, api } from '@web/lib/api-client'
import ReportForm from '@web/modules/community/ReportForm.vue'
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{ dealId: string; userId: string | null; outlets?: { venueId: string; name: string }[] }>()
const items = ref<CommentResponse[]>([])
const cursor = ref<string | null>(null)
const body = ref('')
const venueId = ref('')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const reportId = ref<string | null>(null)
let pendingComment: { body: string; venueId: string | null; requestKey: string } | null = null
let generation = 0
const message = (cause: unknown) => cause instanceof ApiClientError ? cause.message : 'Could not complete the request.'
const load = async (more = false) => {
  const current = more ? generation : ++generation
  if (!more) { items.value = []; cursor.value = null }
  loading.value = true
  error.value = ''
  try {
    const result = await api.community.comments(props.dealId, more && cursor.value ? { cursor: cursor.value } : {})
    if (current === generation) { items.value = more ? [...items.value, ...result.items] : result.items; cursor.value = result.nextCursor }
  } catch (cause) { if (current === generation) error.value = message(cause) }
  finally { if (current === generation) loading.value = false }
}
const post = async () => {
  if (!props.userId || saving.value || !body.value.trim()) return
  const current = generation
  saving.value = true
  error.value = ''
  const text = body.value.trim()
  const outlet = venueId.value || null
  if (!pendingComment || pendingComment.body !== text || pendingComment.venueId !== outlet) pendingComment = { body: text, venueId: outlet, requestKey: crypto.randomUUID() }
  try {
    await api.community.addComment(props.dealId, pendingComment)
    if (current === generation) { pendingComment = null; body.value = ''; notice.value = 'Comment posted.'; saving.value = false; await load() }
  } catch (cause) { if (current === generation) error.value = message(cause) }
  finally { if (current === generation) saving.value = false }
}
const remove = async (id: string) => {
  if (saving.value) return
  const current = generation
  saving.value = true
  error.value = ''
  try { await api.community.deleteComment(props.dealId, id); if (current === generation) items.value = items.value.filter((item) => item.id !== id) }
  catch (cause) { if (current === generation) error.value = message(cause) }
  finally { if (current === generation) saving.value = false }
}
watch(() => [props.dealId, props.userId], () => { pendingComment = null; reportId.value = null; saving.value = false; void load() }, { immediate: true })
onBeforeUnmount(() => { generation++ })
</script>

<template>
  <section class="card p-4 mt-3" aria-label="Comments">
    <h2 class="h5">Comments</h2>
    <p v-if="error" role="alert" class="text-danger">{{ error }}</p>
    <p v-if="notice" role="status" class="text-success">{{ notice }}</p>
    <p v-if="loading" role="status">Loading comments…</p>
    <p v-else-if="!items.length">No comments yet.</p>
    <ul class="list-unstyled">
      <li v-for="item in items" :key="item.id" class="border-bottom py-2">
        <strong>{{ item.authorName }}</strong><span v-if="item.venueId" class="text-secondary"> · outlet comment</span>
        <p class="mb-1" style="white-space: pre-wrap">{{ item.body }}</p>
        <small>{{ new Date(item.createdAt).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' }) }}</small>
        <div class="d-flex gap-2 mt-1">
          <BButton v-if="item.canDelete" size="sm" variant="outline-secondary" :disabled="saving" @click="remove(item.id)">Delete</BButton>
          <BButton v-if="userId" size="sm" variant="outline-danger" :disabled="saving" @click="reportId = reportId === item.id ? null : item.id">Report</BButton>
        </div>
        <ReportForm v-if="reportId === item.id" :deal-id="dealId" :comment-id="item.id" />
      </li>
    </ul>
    <BButton v-if="cursor" variant="outline-secondary" :disabled="loading" @click="load(true)">Load more</BButton>
    <form v-if="userId" class="mt-3" @submit.prevent="post">
      <label for="community-comment" class="form-label">Add a comment</label>
      <textarea id="community-comment" v-model="body" class="form-control mb-2" maxlength="1000" required />
      <select v-if="outlets?.length" v-model="venueId" class="form-select mb-2" aria-label="Comment outlet">
        <option value="">Whole promotion</option>
        <option v-for="outlet in outlets" :key="outlet.venueId" :value="outlet.venueId">{{ outlet.name }}</option>
      </select>
      <BButton type="submit" variant="primary" :disabled="saving || !body.trim()">Post comment</BButton>
    </form>
    <p v-else>Sign in to comment.</p>
  </section>
</template>
