<script setup lang="ts">
import { BButton } from '@broke-oclock/ui'
import { authClient } from '@web/lib/auth-client'
import { computed, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'

const emit = defineEmits<{ signedIn: [] }>()

const form = reactive({ email: '', password: '' })
const touched = reactive({ email: false, password: false })
const pending = ref(false)
const submitError = ref('')

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const emailError = (value: string) => {
  const email = value.trim()
  if (!email) return 'Enter your email address.'
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address.'
  return ''
}

const errors = computed(() => ({
  email: emailError(form.email),
  password: form.password ? '' : 'Enter your password.',
}))
const isValid = computed(() => !errors.value.email && !errors.value.password)

const signIn = async () => {
  touched.email = true
  touched.password = true
  if (pending.value || !isValid.value) return
  pending.value = true
  submitError.value = ''
  try {
    const result = await authClient.signIn.email({
      email: form.email.trim(),
      password: form.password,
    })
    if (result.error) {
      // One generic message: never reveal whether the email or the password was wrong.
      if (result.error.status === 429) {
        submitError.value = 'Too many attempts. Please wait a minute and try again.'
      } else if (result.error.status === 403) {
        // Only happens when email verification is switched on for this site.
        submitError.value = 'Please verify your email first. We have sent you a new link.'
      } else {
        submitError.value = 'Sign-in failed. Check your email and password and try again.'
      }
    } else {
      emit('signedIn')
    }
  } catch {
    submitError.value = 'Sign-in failed. Please try again.'
  } finally {
    form.password = ''
    pending.value = false
  }
}
</script>

<template>
  <form class="card card-body p-4" novalidate :aria-busy="pending" @submit.prevent="signIn">
    <h1 class="h3 mb-1">Log in</h1>
    <p class="text-secondary mb-4">Welcome back. Sign in to see your saved deals.</p>

    <div class="mb-3">
      <label for="login-email" class="form-label">Email</label>
      <input
        id="login-email"
        v-model="form.email"
        type="email"
        autocomplete="username"
        class="form-control"
        :class="{ 'is-invalid': touched.email && errors.email }"
        :aria-invalid="touched.email && !!errors.email"
        aria-describedby="login-email-feedback"
        :disabled="pending"
        @blur="touched.email = true"
      />
      <div id="login-email-feedback" class="invalid-feedback">{{ errors.email }}</div>
    </div>

    <div class="mb-3">
      <label for="login-password" class="form-label">Password</label>
      <input
        id="login-password"
        v-model="form.password"
        type="password"
        autocomplete="current-password"
        class="form-control"
        :class="{ 'is-invalid': touched.password && errors.password }"
        :aria-invalid="touched.password && !!errors.password"
        aria-describedby="login-password-feedback"
        :disabled="pending"
        @blur="touched.password = true"
      />
      <div id="login-password-feedback" class="invalid-feedback">{{ errors.password }}</div>
      <div class="form-text"><RouterLink :to="{ name: 'forgot-password' }">Forgot your password?</RouterLink></div>
    </div>

    <div v-if="submitError" class="alert alert-danger py-2" role="alert">{{ submitError }}</div>

    <BButton type="submit" variant="primary" class="w-100" :disabled="pending">
      {{ pending ? 'Signing in…' : 'Log in' }}
    </BButton>
  </form>
</template>