<script setup lang="ts">
import type { CommunityResponse, VoteValue } from '@broke-oclock/contracts/community'
import { BButton } from '@broke-oclock/ui'
import { ApiClientError, api } from '@web/lib/api-client'
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue'

const props = withDefaults(defineProps<{ dealId: string; userId: string | null; showDealDetails?: boolean }>(), { showDealDetails: true })
const emit = defineEmits<{ updated: [summary: CommunityResponse]; loaded: [summary: CommunityResponse] }>()
const headingId = useId()
const community = ref<CommunityResponse | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
let generation = 0
const disabled = computed(() => loading.value || saving.value || !props.userId || !community.value?.canVote)
const displayError = (cause: unknown) => cause instanceof ApiClientError ? cause.message : 'Could not reach the server. Try again.'
const load = async () => {
  const current = ++generation
  loading.value = true
  error.value = ''
  notice.value = ''
  community.value = null
  try {
    const result = await api.community.get(props.dealId)
    if (current === generation) { community.value = result; emit('loaded', result) }
  } catch (cause) {
    if (current === generation) error.value = displayError(cause)
  } finally {
    if (current === generation) loading.value = false
  }
}
const vote = async (value: VoteValue) => {
  if (disabled.value || !community.value || community.value.currentVote === value) return
  const current = generation
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await api.community.setVote(props.dealId, { value, expectedVersion: community.value.contentVersion })
    if (current === generation) {
      community.value = result
      notice.value = 'Your vote has been saved.'
      emit('updated', result)
    }
  } catch (cause) {
    if (current === generation) {
      error.value = displayError(cause)
      if (cause instanceof ApiClientError && (cause.status === 401 || cause.status === 409)) {
        if (community.value) community.value.canVote = false
      }
    }
  } finally {
    if (current === generation) saving.value = false
  }
}
const reconfirm = async () => {
  if (disabled.value || !community.value?.currentVote) return
  const current = generation
  saving.value = true
  error.value = ''
  try {
    const result = await api.community.setVote(props.dealId, { value: community.value.currentVote, expectedVersion: community.value.contentVersion, reconfirm: true })
    if (current === generation) { community.value = result; notice.value = 'Confirmation refreshed.'; emit('updated', result) }
  } catch (cause) { if (current === generation) error.value = displayError(cause) }
  finally { if (current === generation) saving.value = false }
}
watch(() => [props.dealId, props.userId], () => { saving.value = false; void load() }, { immediate: true })
onBeforeUnmount(() => { generation++ })
defineExpose({ refresh: load })
</script>

<template>
  <section class="card p-4" :aria-labelledby="headingId" :aria-busy="loading || saving">
    <p v-if="loading" role="status">Loading deal…</p>
    <p v-if="error" role="alert" class="text-danger">{{ error }}</p>
    <template v-if="community">
      <h2 :id="headingId" :class="showDealDetails ? 'h4' : 'visually-hidden'">{{ community.title }}</h2>
      <template v-if="showDealDetails">
        <p class="text-secondary">{{ community.description }}</p>
        <p>Scheduled validity: <strong>{{ community.validity.toLowerCase() }}</strong></p>
        <p v-if="community.validUntil">Ends: {{ new Date(community.validUntil).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' }) }} (Singapore)</p>
      </template>
      <div class="d-flex flex-wrap gap-3 mb-3" aria-live="polite">
        <span>Still available: <strong>{{ community.aliveCount }}</strong></span>
        <span>Ended / unavailable: <strong>{{ community.deadCount }}</strong></span>
      </div>
      <p>Community status: <strong>{{ community.status.toLowerCase().replace('_', ' ') }}</strong> (evidence from the last {{ community.evidenceWindowHours }} hours, revision {{ community.contentVersion }})</p>
      <p v-if="community.lastConfirmedAt">Last confirmation: {{ new Date(community.lastConfirmedAt).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' }) }} (Singapore)</p>
      <p v-else>No confirmations yet.</p>
      <p v-if="!userId">Sign in to vote.</p>
      <p v-else-if="community.validity === 'EXPIRED' || community.validity === 'SCHEDULED'">Voting is closed for this deal.</p>
      <p v-else-if="community.voteBlockReason === 'OWNER'">Promotion owners can comment but cannot verify their own deal.</p>
      <div class="d-flex flex-wrap gap-2">
        <BButton variant="success" :disabled="disabled || community.currentVote === 'ALIVE'" :aria-pressed="community.currentVote === 'ALIVE'" @click="vote('ALIVE')">Still available</BButton>
        <BButton variant="outline-danger" :disabled="disabled || community.currentVote === 'DEAD'" :aria-pressed="community.currentVote === 'DEAD'" @click="vote('DEAD')">Ended / unavailable</BButton>
      </div>
      <p class="mt-3 mb-0">Your vote: {{ community.currentVote === 'ALIVE' ? 'Still available' : community.currentVote === 'DEAD' ? 'Ended / unavailable' : 'Not voted' }}</p>
      <BButton v-if="community.currentVote && community.canVote && (!community.reconfirmAt || Date.now() >= new Date(community.reconfirmAt).getTime())" class="mt-2 align-self-start" variant="outline-primary" :disabled="disabled" @click="reconfirm">Reconfirm availability</BButton>
      <p v-else-if="community.currentVote && community.reconfirmAt && community.canVote" class="small text-secondary mt-2">You can reconfirm after {{ new Date(community.reconfirmAt).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' }) }} (Singapore).</p>
      <p class="small text-secondary mt-2 mb-0">Availability votes are deal-wide community evidence. They do not change approval or scheduled expiry.</p>
    </template>
    <p v-if="notice" role="status" class="text-success mt-3">{{ notice }}</p>
    <BButton class="mt-3 align-self-start" variant="outline-secondary" :disabled="loading || saving" @click="load">Refresh</BButton>
  </section>
</template>
