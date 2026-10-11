<script setup lang="ts">
import type { IngestionDraft, IngestionDraftsQuery, IngestionReviewRequest } from '@broke-oclock/contracts/ingestion'
import type { PlatformVenue } from '@broke-oclock/contracts/platform-admin'
import { BButton } from '@broke-oclock/ui'
import { api } from '@web/lib/api-client'
import { approvalBlockReason } from '@web/modules/ingestion-admin/draft-validity'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

type Draft = IngestionDraft
const props = defineProps<{ revision: number; initialStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' }>()
const emit = defineEmits<{ changed: []; denied: [code: string] }>()
const status = ref<IngestionDraftsQuery['status']>(['PENDING', 'APPROVED', 'REJECTED'].includes(props.initialStatus ?? '') ? props.initialStatus ?? 'PENDING' : 'PENDING')
const items = ref<Draft[] | null>(null)
const selectedId = ref<string | null>(null)
const selected = computed(() => items.value?.find(item => item.id === selectedId.value))
const pending = ref(false)
const nextCursor = ref<string | null>(null)
const error = ref('')
const note = ref('')
const reviewPending = ref(false)
const reviewError = ref('')
const success = ref('')
const outletQuery = ref('')
const venues = ref<PlatformVenue[] | null>(null)
const venueId = ref('')
const confirmed = ref(false)
const venueCursor = ref<string | null>(null)
const venuePending = ref(false)
const associationPending = ref(false)
const outletError = ref('')
const busy = computed(() => reviewPending.value || associationPending.value)
// Identity guards survive selection, filter and pagination changes.
const locks = ref(new Map<string, { version: number; after: number }>())
const highest = new Map<string, Draft>()
const activeWrites = new Set<string>()
const conflict = computed(() => selectedId.value !== null && locks.value.has(selectedId.value))
const conflictMessage = 'Content changed. Reload the draft before reviewing again.'
let generation = 0
let request = 0
let venueRequest = 0
let evidenceClock = 0
let closed = false
const live = (epoch: number) => !closed && epoch === generation
const lock = (id: string, version: number) => {
  locks.value.set(id, { version: Math.max(version, locks.value.get(id)?.version ?? 0, highest.get(id)?.contentVersion ?? 0), after: ++evidenceClock })
}
const clearOutlets = () => {
  ++venueRequest; venuePending.value = false
  outletQuery.value = ''; venues.value = null; venueId.value = ''; confirmed.value = false
  venueCursor.value = null; outletError.value = ''
}
const close = () => {
  closed = true; ++generation; ++request; clearOutlets()
  items.value = null; selectedId.value = null; note.value = ''; nextCursor.value = null
  pending.value = false; reviewPending.value = false; associationPending.value = false
  error.value = ''; reviewError.value = ''; success.value = ''
  locks.value.clear(); highest.clear(); activeWrites.clear()
}
const denied = (failure: unknown) => {
  const code = errorCode(failure)
  if (code !== 'UNAUTHORIZED' && code !== 'FORBIDDEN') return false
  close(); emit('denied', code); return true
}
onBeforeUnmount(close)
const sourceLink = computed(() => {
  if (!selected.value) return null
  try {
    const url = new URL(selected.value.sourceUrl)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch { return null }
})
const approvalReason = computed(() => approvalBlockReason(selected.value))
const canReview = computed(() => !closed && selected.value?.reviewStatus === 'PENDING' && note.value.trim().length > 0 && note.value.trim().length <= 1000 && !busy.value && !venuePending.value && !pending.value && !error.value && !conflict.value)
const associationAllowed = computed(() => selected.value?.reviewStatus === 'PENDING' && ['NO_FIXED_LOCATION', 'SELECTED_OUTLETS'].includes(selected.value.applicability))
const chosenVenue = computed(() => venues.value?.find(item => item.id === venueId.value))
const canAssociate = computed(() => !closed && associationAllowed.value && chosenVenue.value && chosenVenue.value.id !== selected.value?.outlet?.id && confirmed.value && !busy.value && !pending.value && !venuePending.value && !error.value && !conflict.value)
const load = async (cursor?: string) => {
  if (closed || busy.value || (cursor && (pending.value || venuePending.value))) return
  if (!cursor) nextCursor.value = null
  const current = ++request
  const epoch = generation
  const started = ++evidenceClock
  pending.value = true; error.value = ''
  try {
    const result = await api.ingestion.drafts({ limit: 20, status: status.value, ...(cursor ? { cursor } : {}) })
    if (!live(epoch) || current !== request) return
    const previous = selected.value
    const wasConflicted = conflict.value
    const accepted = result.items.map(draft => {
      const known = highest.get(draft.id)
      if (known && draft.contentVersion < known.contentVersion) return known
      highest.set(draft.id, draft)
      const guard = locks.value.get(draft.id)
      if (guard && draft.contentVersion >= guard.version && started > guard.after && !activeWrites.has(draft.id)) locks.value.delete(draft.id)
      return draft
    })
    items.value = [...new Map([...(cursor ? items.value ?? [] : []), ...accepted].map(item => [item.id, item])).values()]
    nextCursor.value = result.nextCursor === cursor ? null : result.nextCursor
    if (!cursor && selectedId.value && !selected.value) { selectedId.value = null; note.value = ''; clearOutlets() }
    if (previous && selected.value && (previous.contentVersion !== selected.value.contentVersion || (wasConflicted && !conflict.value))) {
      note.value = ''; clearOutlets()
      reviewError.value = 'Draft content changed. Read it again and enter a new review note.'
    } else if (conflict.value) reviewError.value = conflictMessage
    else if (!cursor || result.items.some(item => item.id === selectedId.value)) reviewError.value = ''
  } catch (failure) {
    if (!live(epoch) || current !== request) return
    if (denied(failure)) return
    error.value = 'Unable to load drafts. Please retry.'
  } finally { if (live(epoch) && current === request) pending.value = false }
}
const select = (draft: Draft) => {
  if (closed || busy.value || pending.value || error.value || (conflict.value && selectedId.value === draft.id)) return
  clearOutlets(); selectedId.value = draft.id; note.value = ''
  reviewError.value = conflict.value ? conflictMessage : ''; success.value = ''
}
const searchOutlets = async (cursor?: string) => {
  if (closed || !selected.value || !associationAllowed.value || busy.value || pending.value || venuePending.value || conflict.value || error.value || outletQuery.value.trim().length > 100) return
  const current = ++venueRequest
  const epoch = generation
  const id = selected.value.id
  const version = selected.value.contentVersion
  venuePending.value = true; outletError.value = ''; venueId.value = ''; confirmed.value = false
  if (!cursor) { venues.value = null; venueCursor.value = null }
  const valid = () => live(epoch) && current === venueRequest && selected.value?.id === id && selected.value.contentVersion === version
  try {
    const result = await api.platformAdmin.venues({ search: outletQuery.value.trim(), limit: 20, ...(cursor ? { cursor } : {}) })
    if (!valid()) return
    venues.value = [...new Map([...(cursor ? venues.value ?? [] : []), ...result.items].map(item => [item.id, item])).values()]
    venueCursor.value = result.nextCursor === cursor ? null : result.nextCursor
    venueId.value = ''; confirmed.value = false
  } catch (failure) {
    if (!valid()) return
    if (denied(failure)) return
    outletError.value = 'Unable to search existing outlets. Please retry.'
  } finally { if (valid()) venuePending.value = false }
}
const associate = async () => {
  if (!canAssociate.value || !selected.value || !chosenVenue.value) return
  const id = selected.value.id
  const expectedContentVersion = selected.value.contentVersion
  const targetVenueId = chosenVenue.value.id
  const epoch = generation
  activeWrites.add(id); lock(id, expectedContentVersion)
  associationPending.value = true; outletError.value = ''; success.value = ''
  try {
    const result = await api.ingestion.associateDraftOutlet(id, { expectedContentVersion, venueId: targetVenueId })
    if (closed) return
    lock(id, Math.max(expectedContentVersion + 1, result.contentVersion))
    if (!live(epoch) || selectedId.value !== id) return
    note.value = ''; clearOutlets(); reviewError.value = conflictMessage
    success.value = 'Outlet associated. The draft remains pending. Reload and review the new version.'
    emit('changed')
  } catch (failure) {
    if (closed) return
    lock(id, expectedContentVersion)
    if (!live(epoch)) return
    if (denied(failure)) return
    if (selectedId.value === id) {
      note.value = ''; clearOutlets(); reviewError.value = conflictMessage
      outletError.value = 'Unable to confirm the association. Reload fresh draft evidence before retrying.'
    }
  } finally {
    activeWrites.delete(id)
    if (live(epoch)) associationPending.value = false
  }
}
const review = async (decision: IngestionReviewRequest['decision']) => {
  if (!canReview.value || !selected.value) return
  if (decision === 'APPROVE') {
    const reason = approvalBlockReason(selected.value)
    if (reason) { reviewError.value = reason; return }
  }
  const id = selected.value.id
  const expectedContentVersion = selected.value.contentVersion
  const reviewNote = note.value.trim()
  const epoch = generation
  activeWrites.add(id)
  reviewPending.value = true; reviewError.value = ''; success.value = ''
  try {
    await api.ingestion.reviewDraft(id, { expectedContentVersion, decision, note: reviewNote })
    if (closed) return
    if (!live(epoch)) { lock(id, expectedContentVersion); return }
    if (selectedId.value !== id) return
    success.value = decision === 'APPROVE' ? 'Draft approved.' : 'Draft rejected.'
    selectedId.value = null; note.value = ''; clearOutlets(); emit('changed')
  } catch (failure) {
    if (closed) return
    if (!live(epoch)) { lock(id, expectedContentVersion); return }
    if (denied(failure)) return
    if (errorCode(failure) === 'CONFLICT') lock(id, expectedContentVersion)
    if (selectedId.value === id) reviewError.value = conflict.value ? conflictMessage : 'Unable to review draft. Please try again.'
  } finally {
    activeWrites.delete(id)
    if (live(epoch)) reviewPending.value = false
  }
}
watch(venueId, () => { confirmed.value = false }, { flush: 'sync' })
watch(outletQuery, () => { venues.value = null; venueId.value = ''; confirmed.value = false; venueCursor.value = null }, { flush: 'sync' })
watch([() => props.revision, status], (_value, previous) => {
  if (closed) return
  ++generation; ++request; clearOutlets(); note.value = ''
  // A context shift makes an in-flight review outcome uncertain for its old target.
  for (const id of activeWrites) lock(id, highest.get(id)?.contentVersion ?? 1)
  reviewPending.value = false; associationPending.value = false
  if (previous && previous[1] !== status.value) { selectedId.value = null; note.value = ''; items.value = null; reviewError.value = ''; success.value = '' }
  void load()
}, { immediate: true, flush: 'sync' })
</script>

<template>
  <section aria-labelledby="queue-title" class="card p-4 mb-4" :aria-busy="pending">
    <h2 id="queue-title" class="h4">Draft review queue</h2>
    <label for="queue-status" class="form-label">Review status</label>
    <select id="queue-status" v-model="status" class="form-select mb-3" :disabled="busy || venuePending">
      <option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option>
    </select>
    <p v-if="pending" role="status">Loading drafts…</p>
    <div v-if="error" role="alert"><p>{{ error }}</p><BButton :disabled="pending || busy" @click="load()">Retry drafts</BButton></div>
    <p v-if="success" role="status">{{ success }}</p>
    <p v-if="!pending && !error && items?.length === 0">No drafts match this status.</p>
    <ul v-if="items?.length" class="list-unstyled">
      <li v-for="draft in items" :key="draft.id" class="border-top py-3">
        <h3 class="h6 text-break">{{ draft.title }}</h3>
        <p class="small text-break">{{ draft.sourceName }} · {{ draft.reviewStatus }} · Version {{ draft.contentVersion }}</p>
        <BButton :data-testid="`view-${draft.id}`" :disabled="busy || pending || Boolean(error) || (conflict && selectedId === draft.id)" :aria-label="`View details: ${draft.title}`" @click="select(draft)">View details</BButton>
      </li>
    </ul>
    <BButton v-if="nextCursor" data-testid="more-drafts" class="mb-3" :disabled="pending || busy || venuePending" @click="load(nextCursor)">Load more drafts</BButton>
    <article v-if="selected" aria-labelledby="draft-title" class="border-top pt-4 text-break">
      <h3 id="draft-title" class="h5">{{ selected.title }}</h3>
      <p class="draft-text">{{ selected.description }}</p>
      <dl>
        <dt>Terms</dt><dd class="draft-text">{{ selected.terms ?? 'Not supplied' }}</dd>
        <dt>Category / offer type</dt><dd>{{ selected.category }} / {{ selected.offerType }}</dd>
        <dt>Validity</dt><dd>{{ selected.validFrom ?? 'Unknown start' }} to {{ selected.validUntil ?? 'Unknown end' }}</dd>
        <dt>Original validity text</dt><dd>{{ selected.rawValidityText ?? 'Not supplied' }}</dd>
        <dt>Content version</dt><dd>Version {{ selected.contentVersion }}</dd>
        <dt>Current outlet</dt><dd v-if="selected.outlet">{{ selected.outlet.name }} · {{ selected.outlet.address }} · {{ selected.outlet.merchantName }}</dd><dd v-else>No existing outlet associated</dd>
        <dt>Applicability</dt><dd>{{ selected.applicability }}</dd>
        <dt>Source</dt><dd>{{ selected.sourceName }} · <a v-if="sourceLink" data-testid="draft-source" :href="sourceLink" target="_blank" rel="noopener noreferrer">Open original source</a><span v-else>Source link unavailable (unsafe or invalid URL).</span></dd>
        <dt>Previous review note</dt><dd>{{ selected.reviewNote ?? 'No previous note' }}</dd>
      </dl>
      <form @submit.prevent="review('APPROVE')" :aria-busy="reviewPending">
        <label for="review-note" class="form-label">Review note (required)</label>
        <textarea id="review-note" v-model="note" class="form-control mb-3" rows="3" maxlength="1000" required :disabled="busy || pending || selected.reviewStatus !== 'PENDING'" />
        <p v-if="approvalReason" id="approval-reason" class="text-secondary">{{ approvalReason }}</p>
        <p v-if="selected.reviewStatus !== 'PENDING'">This draft has already been reviewed. Review actions are read-only.</p>
        <p v-if="reviewError || conflict" role="alert" class="text-danger">{{ reviewError || conflictMessage }}</p>
        <BButton v-if="conflict" data-testid="reload-draft" class="mb-3" :disabled="pending || busy" @click="load()">Reload draft</BButton>
        <div class="d-flex flex-wrap gap-2">
          <BButton data-testid="approve-draft" type="submit" variant="success" :disabled="!canReview || Boolean(approvalReason)" :aria-describedby="approvalReason ? 'approval-reason' : undefined">Approve draft</BButton>
          <BButton data-testid="reject-draft" type="button" variant="outline-danger" :disabled="!canReview" @click="review('REJECT')">{{ reviewPending ? 'Submitting…' : 'Reject draft' }}</BButton>
        </div>
      </form>
      <section v-if="associationAllowed" aria-labelledby="outlet-title" class="mb-4">
        <h4 id="outlet-title" class="h6">Associate an existing outlet</h4>
        <p id="outlet-help">Choose only an existing active outlet supported by the named source evidence. This does not approve or publish the draft. OneMap candidates are not outlet records.</p>
        <form data-testid="outlet-search" @submit.prevent="searchOutlets()" :aria-busy="venuePending">
          <label for="outlet-query" class="form-label">Search existing outlets</label>
          <input id="outlet-query" v-model="outletQuery" type="search" maxlength="100" class="form-control mb-2" :disabled="busy || pending || venuePending || conflict" aria-describedby="outlet-help" />
          <BButton type="submit" :disabled="busy || pending || venuePending || conflict || outletQuery.trim().length > 100">Search outlets</BButton>
        </form>
        <p v-if="venuePending" role="status">Loading existing outlets…</p>
        <p v-if="venues?.length === 0">No matching active outlet records. Association requires an existing merchant and outlet. This screen cannot create them; ask the responsible administrator to maintain canonical records.</p>
        <BButton v-if="venueCursor" data-testid="more-outlets" :disabled="busy || venuePending || pending || conflict" @click="searchOutlets(venueCursor)">Load more outlets</BButton>
        <form data-testid="outlet-association" @submit.prevent="associate" :aria-busy="associationPending">
          <label for="outlet-choice" class="form-label">Existing outlet</label>
          <select id="outlet-choice" v-model="venueId" class="form-select mb-2" :disabled="busy || pending || venuePending || conflict">
            <option value="">Choose an outlet explicitly</option>
            <option v-for="venue in venues ?? []" :key="venue.id" :value="venue.id" :disabled="venue.id === selected.outlet?.id">{{ venue.name }} · {{ venue.address }} · {{ venue.merchantName }}</option>
          </select>
          <div class="form-check mb-2">
            <input id="outlet-confirmation" v-model="confirmed" type="checkbox" class="form-check-input" :disabled="!chosenVenue || busy || pending || venuePending || conflict" />
            <label for="outlet-confirmation" class="form-check-label">I checked the original source and it supports this exact outlet for this draft version.</label>
          </div>
          <p v-if="outletError" role="alert">{{ outletError }}</p>
          <BButton data-testid="associate-outlet" type="submit" :disabled="!canAssociate">{{ associationPending ? 'Associating…' : 'Associate outlet' }}</BButton>
        </form>
      </section>
      <p v-else>This applicability or review status cannot be changed through single-outlet association.</p>
    </article>
  </section>
</template>

<style scoped>
.draft-text { white-space: pre-wrap; }
</style>
