<script setup lang="ts">
import type { CommunityResponse, VoteValue } from '@broke-oclock/contracts/community'
import { BButton } from '@broke-oclock/ui'
import { ApiClientError, api } from '@web/lib/api-client'
import { ref } from 'vue'

const props = defineProps<{ summary: CommunityResponse; userId: string | null }>()
const emit = defineEmits<{ updated: [summary: CommunityResponse] }>()
const saving = ref(false)
const error = ref('')
const selected = ref('')
const submit = async (value: VoteValue, reconfirm = false) => {
  if (!selected.value || saving.value) return
  saving.value = true
  error.value = ''
  const dealId = props.summary.dealId
  const version = props.summary.contentVersion
  const userId = props.userId
  try {
    const result = await api.community.setOutletEvidence(dealId, selected.value, { value, expectedVersion: version, reconfirm })
    if (props.summary.dealId === dealId && props.userId === userId) emit('updated', result)
  } catch (cause) {
    if (props.summary.dealId === dealId && props.userId === userId) error.value = cause instanceof ApiClientError ? cause.message : 'Could not save outlet evidence.'
  } finally { saving.value = false }
}
</script>

<template>
  <section v-if="summary.outlets.length" class="card p-4 mt-3" aria-label="Outlet availability">
    <h2 class="h5">Outlet availability</h2>
    <label for="outlet-evidence-select" class="form-label">Choose an outlet</label>
    <select id="outlet-evidence-select" v-model="selected" class="form-select mb-3">
      <option value="">Select outlet</option>
      <option v-for="outlet in summary.outlets" :key="outlet.venueId" :value="outlet.venueId">{{ outlet.name }}</option>
    </select>
    <template v-for="outlet in summary.outlets" :key="outlet.venueId">
      <div v-if="selected === outlet.venueId">
        <p>Community status: {{ outlet.status.toLowerCase().replace('_', ' ') }}. Still available: {{ outlet.aliveCount }}. Unavailable: {{ outlet.deadCount }}.</p>
        <p v-if="!userId">Sign in to submit evidence.</p>
        <p v-else-if="!outlet.canVote">You cannot verify this outlet.</p>
        <div class="d-flex flex-wrap gap-2">
          <BButton variant="success" :disabled="saving || !outlet.canVote || outlet.currentVote === 'ALIVE'" @click="submit('ALIVE')">Available here</BButton>
          <BButton variant="outline-danger" :disabled="saving || !outlet.canVote || outlet.currentVote === 'DEAD'" @click="submit('DEAD')">Unavailable here</BButton>
          <BButton v-if="outlet.currentVote && (!outlet.reconfirmAt || Date.now() >= new Date(outlet.reconfirmAt).getTime())" variant="outline-primary" :disabled="saving || !outlet.canVote" @click="submit(outlet.currentVote, true)">Reconfirm</BButton>
        </div>
        <p v-if="outlet.currentVote && outlet.reconfirmAt && Date.now() < new Date(outlet.reconfirmAt).getTime()" class="small text-secondary mt-2">You can reconfirm after {{ new Date(outlet.reconfirmAt).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' }) }} (Singapore).</p>
      </div>
    </template>
    <p v-if="error" role="alert" class="text-danger mt-3">{{ error }}</p>
  </section>
</template>
