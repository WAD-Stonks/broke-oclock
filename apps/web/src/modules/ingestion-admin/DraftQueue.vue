<script setup lang="ts">
import { BButton } from '@broke-oclock/ui'
import { api, type RouterInputs, type RouterOutputs } from '@web/lib/api-client'
import { approvalBlockReason } from '@web/modules/ingestion-admin/draft-validity'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { computed, ref, watch } from 'vue'

type Draft = RouterOutputs['ingestion']['queue']['items'][number]
const props = defineProps<{ revision: number }>()
const emit = defineEmits<{ changed: []; denied: [code: string] }>()
const status = ref<Exclude<RouterInputs['ingestion']['queue'], void>['status']>('PENDING')
const items = ref<Draft[] | null>(null)
const selectedId = ref<string | null>(null)
const selected = computed(() => items.value?.find(item => item.id === selectedId.value))
const pending = ref(false)
const nextCursor = ref<string | null>(null)
const error = ref('')
const note = ref('')
const reviewPending = ref(false)
const reviewError = ref('')
const conflictedIds = ref(new Set<string>())
const conflict = computed(() => selectedId.value !== null && conflictedIds.value.has(selectedId.value))
const conflictMessage = 'Content changed. Reload the draft before reviewing again.'
const success = ref('')
let request = 0
const sourceLink = computed(() => {
  if (!selected.value) return null
  try {
    const url = new URL(selected.value.sourceUrl)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch { return null }
})
const approvalReason = computed(() => approvalBlockReason(selected.value))
const canReview = computed(() => selected.value?.reviewStatus === 'PENDING' && note.value.trim().length > 0 && note.value.trim().length <= 1000 && !reviewPending.value && !pending.value && !error.value && !conflict.value)
const load = async (cursor?: string) => {
  if (cursor && (pending.value || reviewPending.value)) return
  if (!cursor) nextCursor.value = null
  const current = ++request
  pending.value = true
  error.value = ''
  try {
    const result = await api.ingestion.queue.query({ limit: 20, status: status.value, ...(cursor ? { cursor } : {}) })
    if (current === request) {
      const combined = cursor ? [...(items.value ?? []), ...result.items] : result.items
      const previousDraft = selected.value
      const wasConflicted = conflict.value
      items.value = [...new Map(combined.map(item => [item.id, item])).values()]
      nextCursor.value = result.nextCursor === cursor ? null : result.nextCursor
      // Only fetched evidence clears that draft's conflict, never selection or unrelated pages.
      for (const draft of result.items) conflictedIds.value.delete(draft.id)
      if (!cursor || result.items.some(item => item.id === selectedId.value)) {
        reviewError.value = ''
      }
      if (!cursor && selectedId.value && !selected.value) {
        selectedId.value = null
        note.value = ''
      }
      if (previousDraft && selected.value && (previousDraft.contentVersion !== selected.value.contentVersion || (wasConflicted && !conflict.value))) {
        note.value = ''
        reviewError.value = 'Draft content changed. Read it again and enter a new review note.'
      }
    }
  } catch (failure) {
    if (current !== request) return
    const code = errorCode(failure)
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') emit('denied', code)
    error.value = 'Unable to load drafts. Please retry.'
  } finally {
    if (current === request) pending.value = false
  }
}
const select = (draft: Draft) => {
  if (reviewPending.value || (conflict.value && selectedId.value === draft.id)) return
  selectedId.value = draft.id
  note.value = ''
  reviewError.value = conflict.value ? conflictMessage : ''
  success.value = ''
}
const review = async (decision: RouterInputs['ingestion']['review']['decision']) => {
  if (!canReview.value || !selected.value) return
  if (decision === 'APPROVE') {
    const reason = approvalBlockReason(selected.value)
    if (reason) { reviewError.value = reason; return }
  }
  reviewPending.value = true
  reviewError.value = ''
  success.value = ''
  try {
    await api.ingestion.review.mutate({ dealId: selected.value.id, expectedContentVersion: selected.value.contentVersion, decision, note: note.value.trim() })
    success.value = decision === 'APPROVE' ? 'Draft approved.' : 'Draft rejected.'
    selectedId.value = null
    note.value = ''
    emit('changed')
  } catch (failure) {
    const code = errorCode(failure)
    if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') emit('denied', code)
    if (code === 'CONFLICT' && selectedId.value) conflictedIds.value.add(selectedId.value)
    reviewError.value = conflict.value ? conflictMessage : 'Unable to review draft. Please try again.'
  } finally {
    reviewPending.value = false
  }
}
watch([() => props.revision, status], () => load(), { immediate: true })
</script>

<template>
  <section aria-labelledby="queue-title" class="card p-4 mb-4" :aria-busy="pending">
    <h2 id="queue-title" class="h4">Draft review queue</h2>
    <label for="queue-status" class="form-label">Review status</label>
    <select id="queue-status" v-model="status" class="form-select mb-3" :disabled="reviewPending">
      <option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option>
    </select>
    <p v-if="pending" role="status">Loading drafts…</p>
    <div v-if="error" role="alert"><p>{{ error }}</p><BButton :disabled="pending" @click="load()">Retry drafts</BButton></div>
    <p v-if="success" role="status">{{ success }}</p>
    <p v-if="!pending && !error && items?.length === 0">No drafts match this status.</p>
    <ul v-if="items?.length" class="list-unstyled">
      <li v-for="draft in items" :key="draft.id" class="border-top py-3">
        <h3 class="h6 text-break">{{ draft.title }}</h3>
        <p class="small text-break">{{ draft.sourceName }} · {{ draft.reviewStatus }} · Version {{ draft.contentVersion }}</p>
        <BButton :data-testid="`view-${draft.id}`" :disabled="reviewPending || pending || Boolean(error) || (conflict && selectedId === draft.id)" :aria-label="`View details: ${draft.title}`" @click="select(draft)">View details</BButton>
      </li>
    </ul>
    <BButton v-if="nextCursor" data-testid="more-drafts" class="mb-3" :disabled="pending || reviewPending" @click="load(nextCursor)">Load more drafts</BButton>
    <article v-if="selected" aria-labelledby="draft-title" class="border-top pt-4 text-break">
      <h3 id="draft-title" class="h5">{{ selected.title }}</h3>
      <p class="draft-text">{{ selected.description }}</p>
      <dl>
        <dt>Terms</dt><dd class="draft-text">{{ selected.terms ?? 'Not supplied' }}</dd>
        <dt>Category / offer type</dt><dd>{{ selected.category }} / {{ selected.offerType }}</dd>
        <dt>Validity</dt><dd>{{ selected.validFrom ?? 'Unknown start' }} to {{ selected.validUntil ?? 'Unknown end' }}</dd>
        <dt>Original validity text</dt><dd>{{ selected.rawValidityText ?? 'Not supplied' }}</dd>
        <dt>Applicability</dt><dd>{{ selected.applicability }}</dd>
        <dt>Source</dt><dd>{{ selected.sourceName }} · <a v-if="sourceLink" data-testid="draft-source" :href="sourceLink" target="_blank" rel="noopener noreferrer">Open original source</a><span v-else>Source link unavailable (unsafe or invalid URL).</span></dd>
        <dt>Previous review note</dt><dd>{{ selected.reviewNote ?? 'No previous note' }}</dd>
      </dl>
      <form @submit.prevent="review('APPROVE')" :aria-busy="reviewPending">
        <label for="review-note" class="form-label">Review note (required)</label>
        <textarea id="review-note" v-model="note" class="form-control mb-3" rows="3" maxlength="1000" required :disabled="reviewPending || selected.reviewStatus !== 'PENDING'" />
        <p v-if="approvalReason" id="approval-reason" class="text-secondary">{{ approvalReason }}</p>
        <p v-if="selected.reviewStatus !== 'PENDING'">This draft has already been reviewed. Review actions are read-only.</p>
        <p v-if="reviewError" role="alert" class="text-danger">{{ reviewError }}</p>
        <BButton v-if="conflict" data-testid="reload-draft" class="mb-3" :disabled="pending" @click="load()">Reload draft</BButton>
        <div class="d-flex flex-wrap gap-2">
          <BButton data-testid="approve-draft" type="submit" variant="success" :disabled="!canReview || Boolean(approvalReason)" :aria-describedby="approvalReason ? 'approval-reason' : undefined">Approve draft</BButton>
          <BButton data-testid="reject-draft" type="button" variant="outline-danger" :disabled="!canReview" @click="review('REJECT')">{{ reviewPending ? 'Submitting…' : 'Reject draft' }}</BButton>
        </div>
      </form>
    </article>
  </section>
</template>

<style scoped>
.draft-text { white-space: pre-wrap; }
</style>
