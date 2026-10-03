<script setup lang="ts">
import { BButton } from '@broke-oclock/ui'
import { api, type RouterOutputs } from '@web/lib/api-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { ref } from 'vue'

const emit = defineEmits<{ denied: [code: string] }>()
const items = ref<RouterOutputs['ingestion']['accounts']['items'] | null>(null)
const pending = ref(false)
const nextCursor = ref<string | null>(null)
const error = ref('')
const load = async (cursor?: string) => {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try {
    const result = await api.ingestion.accounts.query({ limit: 20, ...(cursor ? { cursor } : {}) })
    const combined = cursor ? [...(items.value ?? []), ...result.items] : result.items
    items.value = [...new Map(combined.map(item => [item.id, item])).values()]
    nextCursor.value = result.nextCursor === cursor ? null : result.nextCursor
  } catch (failure) {
    items.value = null
    nextCursor.value = null
    const code = errorCode(failure)
    if (code === 'UNAUTHORIZED') emit('denied', code)
    error.value = code === 'FORBIDDEN' ? 'Accounts are restricted to administrators.' : 'Unable to load accounts. Please retry.'
  } finally { pending.value = false }
}
</script>

<template>
  <section aria-labelledby="accounts-title" class="card p-4 mb-4" :aria-busy="pending">
    <h2 id="accounts-title" class="h4">Accounts</h2>
    <p class="text-secondary">Read-only account directory. The server restricts access to administrators. Account deletion and role changes are not available here.</p>
    <BButton data-testid="load-accounts" :disabled="pending" @click="load()">{{ pending ? 'Loading accounts…' : items ? 'Refresh accounts' : 'View accounts (read-only)' }}</BButton>
    <p v-if="error" role="alert" class="text-danger mt-3">{{ error }}</p>
    <p v-if="items?.length === 0" class="mt-3">No accounts found.</p>
    <ul v-if="items?.length" class="list-unstyled mt-3 mb-0">
      <li v-for="account in items" :key="account.id" class="border-top py-3 text-break">
        <h3 class="h6">{{ account.name }}</h3>
        <p class="mb-1">{{ account.email }} · {{ account.role }}</p>
        <p class="small mb-0">Created {{ account.createdAt }}</p>
      </li>
    </ul>
    <BButton v-if="nextCursor" data-testid="more-accounts" :disabled="pending" @click="load(nextCursor)">Load more accounts</BButton>
  </section>
</template>
