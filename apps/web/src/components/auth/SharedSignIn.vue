<script setup lang="ts">
import type { AuthMethodsResponse } from '@broke-oclock/contracts/api'
import PasswordRecovery from '@web/components/auth/PasswordRecovery.vue'
import { consumeOAuthError, safeAuthDestination } from '@web/lib/admin-session'
import { api } from '@web/lib/api-client'
import { authClient } from '@web/lib/auth-client'
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ title?: string; destination?: string }>(), { title: 'Sign in', destination: '/' })
const emit = defineEmits<{ signedIn: [] }>()
const email = ref('')
const password = ref('')
const pending = ref(false)
const error = ref(consumeOAuthError())
const notice = ref('')
const recovery = ref(false)
const code = ref('')
const issuedEmail = ref('')
const cooldown = ref(0)
const timer = setInterval(() => { if (cooldown.value > 0) cooldown.value-- }, 1000)
const methods = ref<AuthMethodsResponse | null>(null)
const methodsUnavailable = ref(false)
let generation = 0
let alive = true
watch(email, () => { generation++; password.value = ''; code.value = ''; issuedEmail.value = ''; error.value = ''; notice.value = ''; cooldown.value = 0 }, { flush: 'sync' })
onMounted(async () => {
  try { const result = await api.infrastructure.authMethods(); if (alive) methods.value = result }
  catch { if (alive) methodsUnavailable.value = true }
})
onUnmounted(() => { alive = false; generation++; clearInterval(timer); password.value = ''; code.value = '' })
watch(recovery, () => { generation++; password.value = ''; code.value = ''; issuedEmail.value = ''; error.value = ''; cooldown.value = 0 }, { flush: 'sync' })
const signIn = async () => {
  if (pending.value || !email.value.trim() || !password.value) return
  const current = ++generation
  pending.value = true
  error.value = ''
  try {
    const result = await authClient.signIn.email({ email: email.value.trim(), password: password.value })
    if (!alive || current !== generation) return
    if (result.error) error.value = 'Sign-in failed. Check your credentials and try again.'
    else emit('signedIn')
  } catch { if (alive && current === generation) error.value = 'Sign-in failed. Please try again.' }
  finally { password.value = ''; if (alive) pending.value = false }
}
const google = async () => {
  if (pending.value || !methods.value?.google) return
  const current = ++generation
  pending.value = true; error.value = ''; password.value = ''; code.value = ''
  const callback = safeAuthDestination(props.destination, window.location.origin)
  try {
    const result = await authClient.signIn.social({ provider: 'google', callbackURL: callback, newUserCallbackURL: callback, errorCallbackURL: callback })
    if (alive && current === generation && result.error) error.value = 'Google sign-in could not be completed. Please try again.'
  } catch { if (alive && current === generation) error.value = 'Google sign-in could not be completed. Please try again.' }
  finally { if (alive) pending.value = false }
}
const sendCode = async () => {
  if (pending.value || cooldown.value || !methods.value?.emailOtp || !email.value.trim()) return
  const current = ++generation
  const mailbox = email.value.trim()
  pending.value = true; error.value = ''; code.value = ''; password.value = ''
  try {
    const result = await authClient.emailOtp.sendVerificationOtp({ email: mailbox, type: 'sign-in' })
    if (!alive || current !== generation) return
    if (result.error) error.value = 'Code could not be sent. Please try again.'
    else { issuedEmail.value = mailbox; cooldown.value = 30 }
  } catch { if (alive && current === generation) error.value = 'Code could not be sent. Please try again.' }
  finally { if (alive) pending.value = false }
}
const redeemCode = async () => {
  if (pending.value || !methods.value?.emailOtp || !issuedEmail.value || issuedEmail.value !== email.value.trim() || !/^\d{6}$/.test(code.value)) return
  const current = ++generation
  pending.value = true; error.value = ''
  try {
    const result = await authClient.signIn.emailOtp({ email: issuedEmail.value, otp: code.value })
    if (!alive || current !== generation) return
    if (result.error) error.value = 'Code sign-in could not be completed. Try again or request a new code.'
    else emit('signedIn')
  } catch { if (alive && current === generation) error.value = 'Code sign-in could not be completed. Please try again.' }
  finally { code.value = ''; password.value = ''; if (alive) pending.value = false }
}
const recovered = () => { recovery.value = false; notice.value = 'Password reset. Sign in again with your new password.' }
</script>

<template>
  <section :aria-labelledby="recovery ? 'recovery-title' : 'sign-in-title'" class="card p-4">
    <PasswordRecovery v-if="recovery" @completed="recovered" @cancel="recovery = false" />
    <div v-else>
    <h2 id="sign-in-title" class="h4">{{ title }}</h2>
    <p class="text-secondary">Signing in does not grant an administrator or merchant role.</p>
    <p v-if="methodsUnavailable" role="status">Other sign-in methods are unavailable. You can still sign in with your password.</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <form @submit.prevent="signIn" :aria-busy="pending">
      <label for="admin-email" class="form-label">Email</label>
      <input id="admin-email" v-model="email" type="email" autocomplete="username" class="form-control mb-3" required />
      <label for="admin-password" class="form-label">Password</label>
      <input id="admin-password" v-model="password" type="password" autocomplete="current-password" class="form-control mb-3" :disabled="pending" required />
      <p v-if="error" role="alert" class="text-danger">{{ error }}</p>
      <button class="btn btn-primary" type="submit" :disabled="pending">{{ pending ? 'Signing in…' : 'Sign in' }}</button>
    </form>
    <div class="d-flex flex-wrap gap-2 mt-3">
      <button v-if="methods?.google" data-testid="google-sign-in" type="button" class="btn btn-outline-primary" :disabled="pending" @click="google">Continue with Google</button>
      <button v-if="methods?.emailOtp" data-testid="otp-send" type="button" class="btn btn-outline-primary" :disabled="pending || cooldown > 0" @click="sendCode">{{ cooldown ? `Resend in ${cooldown}s` : issuedEmail ? 'Resend sign-in code' : 'Email a sign-in code' }}</button>
      <button v-if="methods?.passwordRecovery" data-testid="recovery-open" type="button" class="btn btn-link" @click="recovery = true">Reset password</button>
    </div>
    <p v-if="methods?.emailOtp" class="text-secondary mt-3">For an existing unverified account, first code sign-in can remove previous sign-in links, password and sessions. Use password recovery to set a new password. This does not grant a role.</p>
    <form v-if="issuedEmail" data-testid="otp-form" class="mt-3" @submit.prevent="redeemCode" :aria-busy="pending">
      <p role="status">If email sign-in is available, check your email for a six digit sign-in code.</p>
      <label for="sign-in-code" class="form-label">Sign-in code</label>
      <input id="sign-in-code" v-model="code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" class="form-control mb-3" :disabled="pending" required />
      <button type="submit" class="btn btn-primary" :disabled="pending">Sign in with code</button>
    </form>
    </div>
  </section>
</template>
