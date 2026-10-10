<script setup lang="ts">
import { BButton } from '@broke-oclock/ui'
import { ApiClientError, api } from '@web/lib/api-client'
import { ref } from 'vue'

const props = defineProps<{ dealId: string; commentId?: string }>()
const reason = ref<'SPAM' | 'MISLEADING' | 'INAPPROPRIATE' | 'OTHER'>('MISLEADING')
const details = ref('')
const saving = ref(false)
const notice = ref('')
const error = ref('')
const submit = async () => {
  if (saving.value) return
  saving.value = true
  error.value = ''
  notice.value = ''
  try {
    const input = { reason: reason.value, details: details.value.trim() }
    if (props.commentId) await api.community.reportComment(props.dealId, props.commentId, input)
    else await api.community.reportDeal(props.dealId, input)
    notice.value = 'Report sent for review.'
  } catch (cause) { error.value = cause instanceof ApiClientError ? cause.message : 'Could not send report.' }
  finally { saving.value = false }
}
</script>

<template>
  <form class="border rounded p-3 mt-3" :aria-label="commentId ? 'Report comment' : 'Report deal'" @submit.prevent="submit">
    <h3 class="h6">Report {{ commentId ? 'comment' : 'deal' }} content</h3>
    <label class="form-label">Reason
      <select v-model="reason" class="form-select">
        <option value="MISLEADING">Misleading</option><option value="SPAM">Spam</option>
        <option value="INAPPROPRIATE">Inappropriate</option><option value="OTHER">Other</option>
      </select>
    </label>
    <label class="form-label d-block">Details (optional)
      <textarea v-model="details" class="form-control" maxlength="1000" />
    </label>
    <BButton type="submit" variant="outline-danger" :disabled="saving">Send report</BButton>
    <p v-if="notice" role="status" class="text-success mt-2">{{ notice }}</p>
    <p v-if="error" role="alert" class="text-danger mt-2">{{ error }}</p>
  </form>
</template>
