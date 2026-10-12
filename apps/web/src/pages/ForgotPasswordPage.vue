<script setup lang="ts">
import { BButton } from '@broke-oclock/ui'
import { authClient } from '@web/lib/auth-client'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

const email = ref('')
const touched = ref(false)
const pending = ref(false)
const sent = ref(false)
const errorMessage = ref('')

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const emailError = computed(() => (EMAIL_PATTERN.test(email.value.trim()) ? '' : 'Enter a valid email address.'))

const submit = async () => {
  touched.value = true
  if (pending.value || emailError.value) return
  pending.value = true
  errorMessage.value = ''
  try {
    // The email's link comes back to /reset-password?token=... on this site.
    const result = await authClient.requestPasswordReset({
      email: email.value.trim(),
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (result.error) {
      errorMessage.value =
        result.error.status === 429
          ? 'Too many attempts. Please wait a minute and try again.'
          : 'Password reset is unavailable right now. Please try again later.'
    } else {
      sent.value = true
    }
  } catch {
    errorMessage.value = 'Something went wrong. Please try again.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section aria-label="Forgot password" class="row justify-content-center py-4">
    <div class="col-12 col-sm-10 col-md-7 col-lg-5">
      <div class="card card-body p-4">
        <h1 class="h3 mb-1">Reset your password</h1>

        <!-- Same message whether or not the address has an account, so it can't be probed. -->
        <p v-if="sent" role="status" class="mb-0">
          If an account exists for that email, we've sent a link to reset the password. The link
          expires in one hour.
        </p>

        <form v-else novalidate @submit.prevent="submit">
          <p class="text-secondary mb-4">Enter your email and we'll send you a reset link.</p>
          <div class="mb-3">
            <label for="forgot-email" class="form-label">Email</label>
            <input
              id="forgot-email"
              v-model="email"
              type="email"
              autocomplete="username"
              class="form-control"
              :class="{ 'is-invalid': touched && emailError }"
              :disabled="pending"
              @blur="touched = true"
            />
            <div class="invalid-feedback">{{ emailError }}</div>
          </div>
          <div v-if="errorMessage" class="alert alert-danger py-2" role="alert">{{ errorMessage }}</div>
          <BButton type="submit" variant="primary" class="w-100" :disabled="pending">
            {{ pending ? 'Sending…' : 'Send reset link' }}
          </BButton>
        </form>

        <p class="small mt-3 mb-0"><RouterLink :to="{ name: 'login' }">Back to log in</RouterLink></p>
      </div>
    </div>
  </section>
</template>