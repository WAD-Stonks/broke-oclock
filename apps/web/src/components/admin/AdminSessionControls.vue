<script setup lang="ts">
import { createAdminSession } from '@web/lib/admin-session'
import { authClient } from '@web/lib/auth-client'
import { onMounted, onUnmounted, watch } from 'vue'

const props = withDefaults(defineProps<{ refreshKey?: number }>(), { refreshKey: 0 })
const emit = defineEmits<{ closing: []; signedOut: []; accessReload: [] }>()
// Public Vue hook must run in setup so native lifecycle subscriptions are owned.
const nativeState = authClient.useSession()
const state = createAdminSession({ closing: () => emit('closing'), signedOut: () => emit('signedOut'), accessReload: () => emit('accessReload') }, async () => {
  await nativeState.value.refetch({ query: { disableCookieCache: true } })
  // Refetch resolves void; failures live on the reactive atom, not its return value.
  if (nativeState.value.error) throw new Error('Native session could not be confirmed')
})
const { session, loading, pending, uncertain, notice } = state
const focus = () => { void state.refresh() }
onMounted(() => { void state.refresh(); window.addEventListener('focus', focus) })
watch(() => props.refreshKey, focus)
onUnmounted(() => { state.dispose(); window.removeEventListener('focus', focus) })
</script>

<template>
  <section aria-label="Admin session" class="admin-session" :aria-busy="loading || pending">
    <div class="admin-session-copy">
    <p v-if="session" class="admin-session-identity">Signed in as <strong>{{ session.user.name }}</strong><span> ({{ session.user.email }})</span>.</p>
    <p v-else-if="loading" role="status">Checking current session…</p>
    <p v-if="notice" :role="uncertain ? 'alert' : 'status'">{{ notice }}</p>
    </div>
    <div class="d-flex flex-wrap gap-2">
      <button v-if="session || loading || pending || uncertain" data-testid="admin-sign-out" type="button" class="btn btn-link" :disabled="pending" @click="state.signOut">{{ pending ? 'Signing out…' : uncertain ? 'Retry sign-out' : 'Sign out' }}</button>
      <button v-if="uncertain || !session" type="button" class="btn btn-link" :disabled="pending || loading" @click="state.refresh">Recheck session</button>
      <button v-if="uncertain && session" data-testid="admin-access-reload" type="button" class="btn btn-outline-primary" :disabled="pending || loading" @click="state.requestAccessReload">Reload access</button>
    </div>
  </section>
</template>
