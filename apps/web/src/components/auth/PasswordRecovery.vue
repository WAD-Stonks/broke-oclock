<script setup lang="ts">
import { authClient } from '@web/lib/auth-client'
import { onUnmounted, ref, watch } from 'vue'

withDefaults(defineProps<{ title?: string }>(), { title: 'Reset your password' })
const emit = defineEmits<{ completed: []; cancel: [] }>()
const email = ref('')
const code = ref('')
const password = ref('')
const issuedEmail = ref('')
const pending = ref(false)
const error = ref('')
const cooldown = ref(0)
let generation = 0
let alive = true
const timer = setInterval(() => { if (cooldown.value > 0) cooldown.value-- }, 1000)
watch(email, () => { generation++; issuedEmail.value = ''; code.value = ''; password.value = ''; error.value = ''; cooldown.value = 0 }, { flush: 'sync' })
onUnmounted(() => { alive = false; generation++; clearInterval(timer); code.value = ''; password.value = '' })
const request = async () => {
  if (pending.value || cooldown.value || !email.value.trim()) return
  const current = ++generation
  const mailbox = email.value.trim()
  pending.value = true; error.value = ''; code.value = ''; password.value = ''
  try {
    const result = await authClient.emailOtp.requestPasswordReset({ email: mailbox })
    if (!alive || current !== generation) return
    if (result.error) error.value = 'Recovery could not be started. Please try again.'
    else { issuedEmail.value = mailbox; cooldown.value = 30 }
  } catch { if (alive && current === generation) error.value = 'Recovery could not be started. Please try again.' }
  finally { if (alive) pending.value = false }
}
const reset = async () => {
  if (pending.value || issuedEmail.value !== email.value.trim() || !/^\d{6}$/.test(code.value) || password.value.length < 8) return
  const current = ++generation
  pending.value = true; error.value = ''
  try {
    const result = await authClient.emailOtp.resetPassword({ email: issuedEmail.value, otp: code.value, password: password.value })
    if (!alive || current !== generation) return
    if (result.error) error.value = 'Password reset could not be confirmed. Request a new code or try again.'
    else emit('completed')
  } catch { if (alive && current === generation) error.value = 'Password reset could not be confirmed. Please try again.' }
  finally { code.value = ''; password.value = ''; if (alive) pending.value = false }
}
</script>

<template>
  <section aria-labelledby="recovery-title">
    <h2 id="recovery-title" class="h4">{{ title }}</h2>
    <p>If the account can receive recovery email, a code will be sent. Resetting your password ends existing sessions. Return to sign-in after resetting.</p>
    <form data-testid="recovery-request" @submit.prevent="request" :aria-busy="pending">
      <label for="recovery-email" class="form-label">Email</label>
      <input id="recovery-email" v-model="email" type="email" autocomplete="username" class="form-control mb-3" required />
      <button type="submit" class="btn btn-outline-primary mb-3" :disabled="pending || cooldown > 0">{{ cooldown ? `Resend in ${cooldown}s` : issuedEmail ? 'Resend recovery code' : 'Send recovery code' }}</button>
    </form>
    <form v-if="issuedEmail" data-testid="recovery-reset" @submit.prevent="reset" :aria-busy="pending">
      <p role="status">If recovery is available, check your email for a six digit recovery code.</p>
      <label for="recovery-code" class="form-label">Recovery code</label>
      <input id="recovery-code" v-model="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" class="form-control mb-3" :disabled="pending" required />
      <label for="recovery-password" class="form-label">New password (at least 8 characters)</label>
      <input id="recovery-password" v-model="password" type="password" autocomplete="new-password" minlength="8" class="form-control mb-3" :disabled="pending" required />
      <button type="submit" class="btn btn-primary" :disabled="pending">Reset password</button>
    </form>
    <p v-if="error" role="alert" class="text-danger">{{ error }}</p>
    <button type="button" class="btn btn-link" @click="emit('cancel')">Return to sign-in</button>
  </section>
</template>
