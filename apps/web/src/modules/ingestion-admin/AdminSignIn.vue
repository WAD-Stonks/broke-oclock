<script setup lang="ts">
import { BButton } from '@broke-oclock/ui'
import { authClient } from '@web/lib/auth-client'
import { ref } from 'vue'

const emit = defineEmits<{ signedIn: [] }>()
const email = ref('')
const password = ref('')
const pending = ref(false)
const error = ref('')
const signIn = async () => {
  if (pending.value || !email.value.trim() || !password.value) return
  pending.value = true
  error.value = ''
  try {
    const result = await authClient.signIn.email({ email: email.value.trim(), password: password.value })
    if (result.error) error.value = 'Sign-in failed. Check your credentials and try again.'
    else emit('signedIn')
  } catch {
    error.value = 'Sign-in failed. Please try again.'
  } finally {
    password.value = ''
    pending.value = false
  }
}
</script>

<template>
  <section aria-labelledby="sign-in-title" class="card p-4">
    <h2 id="sign-in-title" class="h4">Sign in to review ingestion</h2>
    <p class="text-secondary">An authorized staff account is required. Signing in does not grant a role.</p>
    <form @submit.prevent="signIn" :aria-busy="pending">
      <label for="admin-email" class="form-label">Email</label>
      <input id="admin-email" v-model="email" type="email" autocomplete="username" class="form-control mb-3" :disabled="pending" required />
      <label for="admin-password" class="form-label">Password</label>
      <input id="admin-password" v-model="password" type="password" autocomplete="current-password" class="form-control mb-3" :disabled="pending" required />
      <p v-if="error" role="alert" class="text-danger">{{ error }}</p>
      <BButton type="submit" variant="primary" :disabled="pending">{{ pending ? 'Signing in…' : 'Sign in' }}</BButton>
    </form>
  </section>
</template>
