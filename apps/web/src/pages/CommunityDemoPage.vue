<script setup lang="ts">
import type { CommunityResponse } from '@broke-oclock/contracts/community'
import { BButton } from '@broke-oclock/ui'
import { ApiClientError, api } from '@web/lib/api-client'
import { authClient } from '@web/lib/auth-client'
import CommentSection from '@web/modules/community/CommentSection.vue'
import OutletEvidence from '@web/modules/community/OutletEvidence.vue'
import ReportForm from '@web/modules/community/ReportForm.vue'
import VoteControls from '@web/modules/community/VoteControls.vue'
import { onMounted, ref, watch } from 'vue'

const dealId = ref('da0000000000000000000001')
const inputDealId = ref(dealId.value)
const loadOutletFixture = () => { inputDealId.value = 'da0000000000000000000002'; dealId.value = inputDealId.value }
const user = ref<{ id: string; name: string } | null>(null)
const email = ref('')
const password = ref('')
const pending = ref(true)
const error = ref('')
const summary = ref<CommunityResponse | null>(null)
watch(dealId, () => { summary.value = null })
const readSession = async () => {
  try { user.value = (await api.infrastructure.me()).user }
  catch (cause) {
    user.value = null
    if (!(cause instanceof ApiClientError && cause.status === 401)) throw cause
  }
}
const signIn = async () => {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try {
    const result = await authClient.signIn.email({ email: email.value.trim(), password: password.value })
    if (result.error) error.value = 'Sign-in failed. Check your email and password.'
    else await readSession()
  } catch { error.value = 'Could not sign in. Try again.' }
  finally { pending.value = false; password.value = '' }
}
const signOut = async () => {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try {
    const result = await authClient.signOut()
    if (result.error) error.value = 'Could not sign out. Try again.'
    else user.value = null
  } catch { error.value = 'Could not sign out. Try again.' }
  finally { pending.value = false }
}
onMounted(async () => {
  try { await readSession() }
  catch { error.value = 'Could not check your session. Reload to try again.' }
  finally { pending.value = false }
})
</script>

<template>
  <section class="mx-auto" style="max-width: 760px">
    <h1>Community voting demo</h1>
    <p class="text-secondary">Development test page. The default deal is synthetic and is not a real promotion.</p>
    <section class="card p-4 mb-4" aria-label="Account" :aria-busy="pending">
      <p v-if="pending" role="status">Checking account…</p>
      <template v-if="user">
        <p>Signed in as <strong>{{ user.name }}</strong></p>
        <BButton variant="outline-secondary" class="align-self-start" :disabled="pending" @click="signOut">Sign out</BButton>
      </template>
      <form v-else @submit.prevent="signIn">
        <h2 class="h5">Sign in to vote</h2>
        <label for="community-email" class="form-label">Email</label>
        <input id="community-email" v-model="email" type="email" autocomplete="username" class="form-control mb-3" :disabled="pending" required />
        <label for="community-password" class="form-label">Password</label>
        <input id="community-password" v-model="password" type="password" autocomplete="current-password" class="form-control mb-3" :disabled="pending" required />
        <BButton variant="primary" type="submit" :disabled="pending">Sign in</BButton>
      </form>
      <p v-if="error" role="alert" class="text-danger mt-3 mb-0">{{ error }}</p>
    </section>
    <form class="mb-4" @submit.prevent="dealId = inputDealId.trim()">
      <label for="community-deal-id" class="form-label">Deal ID</label>
      <div class="d-flex gap-2">
        <input id="community-deal-id" v-model="inputDealId" class="form-control" pattern="[a-f0-9]{24}" required />
        <BButton variant="outline-primary" type="submit">Load</BButton>
      </div>
      <BButton type="button" variant="link" class="mt-2" @click="loadOutletFixture">Load synthetic two-outlet deal</BButton>
    </form>
    <VoteControls :deal-id="dealId" :user-id="pending ? null : user?.id ?? null" @loaded="summary = $event" @updated="summary = $event" />
    <OutletEvidence v-if="summary" :summary="summary" :user-id="pending ? null : user?.id ?? null" @updated="summary = $event" />
    <CommentSection :deal-id="dealId" :user-id="pending ? null : user?.id ?? null" :outlets="summary?.outlets" />
    <ReportForm v-if="user" :deal-id="dealId" />
  </section>
</template>
