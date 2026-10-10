<script setup lang="ts">
import { api } from '@web/lib/api-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { ref } from 'vue'

// Props: data the parent gives us. Emits: how we tell the parent something happened.
// Use it like: <BookmarkButton :deal-id="deal.id" :saved="isSaved" @change="isSaved = $event" />
const props = defineProps<{ dealId: string; saved: boolean }>()
const emit = defineEmits<{ change: [saved: boolean] }>()

const busy = ref(false)
const errorMessage = ref('')

const toggle = async () => {
  if (busy.value) return // ignore double clicks
  busy.value = true
  errorMessage.value = ''
  try {
    // If it is already saved, a click removes it. Otherwise a click saves it.
    const result = props.saved
      ? await api.account.unsaveDeal(props.dealId)
      : await api.account.saveDeal(props.dealId)
    emit('change', result.saved)
  } catch (error) {
    errorMessage.value =
      errorCode(error) === 'UNAUTHORIZED'
        ? 'Please log in to save deals.'
        : 'Could not update your saved deals. Please try again.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <span>
    <button
      type="button"
      class="btn btn-sm"
      :class="saved ? 'btn-primary' : 'btn-outline-primary'"
      :aria-pressed="saved"
      :disabled="busy"
      @click="toggle"
    >
      {{ saved ? 'Saved' : 'Save' }}
    </button>
    <span v-if="errorMessage" class="text-danger small ms-2" role="alert">{{ errorMessage }}</span>
  </span>
</template>
