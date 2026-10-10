<script setup lang="ts">
import { BButton } from '@broke-oclock/ui'
import { authClient } from '@web/lib/auth-client'
import { computed, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'

const emit = defineEmits<{ registered: [needsVerification: boolean] }>()

const form = reactive({ name: '', email: '', password: '', confirm: '' })
const touched = reactive({ name: false, email: false, password: false, confirm: false })
const pending = ref(false)
const submitError = ref('')

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const errors = computed(() => ({
  name: form.name.trim() ? '' : 'Enter your name.',
  email: EMAIL_PATTERN.test(form.email.trim()) ? '' : 'Enter a valid email address.',
  // Matches Better Auth's default 8 to 128 character policy.
  password:
    form.password.length < 8
      ? 'Use at least 8 characters.'
      : form.password.length > 128
        ? 'Use at most 128 characters.'
        : '',
  confirm: form.confirm === form.password ? '' : 'Passwords do not match.',
}))
const isValid = computed(() => Object.values(errors.value).every((message) => !message))

const register = async () => {
  for (const key of Object.keys(touched) as (keyof typeof touched)[]) touched[key] = true
  if (pending.value || !isValid.value) return
  pending.value = true
  submitError.value = ''
  try {
    // No role field: the server owns roles and ignores client input for them.
    const result = await authClient.signUp.email({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      // Where the verification email's link sends the user (only used if verification is on).
      callbackURL: `${window.location.origin}/login?notice=verified`,
    })
    if (result.error) {
      submitError.value =
        result.error.status === 429
          ? 'Too many attempts. Please wait a minute and try again.'
          : 'We could not create that account. If you already registered, try logging in.'
    } else {
      // No session token means the site wants the email verified before logging in.
      emit('registered', result.data?.token === null)
    }
  } catch {
    submitError.value = 'Registration failed. Please try again.'
  } finally {
    form.password = ''
    form.confirm = ''
    pending.value = false
  }
}
</script>

<template>
  <form class="card card-body p-4" novalidate :aria-busy="pending" @submit.prevent="register">
    <h1 class="h3 mb-1">Create an account</h1>
    <p class="text-secondary mb-4">Save deals and share your own finds.</p>

    <div class="mb-3">
      <label for="reg-name" class="form-label">Name</label>
      <input id="reg-name" v-model="form.name" type="text" autocomplete="name" maxlength="80" class="form-control" :class="{ 'is-invalid': touched.name && errors.name }" :disabled="pending" @blur="touched.name = true" />
      <div class="invalid-feedback">{{ errors.name }}</div>
    </div>
    <div class="mb-3">
      <label for="reg-email" class="form-label">Email</label>
      <input id="reg-email" v-model="form.email" type="email" autocomplete="email" class="form-control" :class="{ 'is-invalid': touched.email && errors.email }" :disabled="pending" @blur="touched.email = true" />
      <div class="invalid-feedback">{{ errors.email }}</div>
    </div>
    <div class="mb-3">
      <label for="reg-password" class="form-label">Password</label>
      <input id="reg-password" v-model="form.password" type="password" autocomplete="new-password" class="form-control" :class="{ 'is-invalid': touched.password && errors.password }" :disabled="pending" @blur="touched.password = true" />
      <div class="invalid-feedback">{{ errors.password }}</div>
    </div>
    <div class="mb-3">
      <label for="reg-confirm" class="form-label">Confirm password</label>
      <input id="reg-confirm" v-model="form.confirm" type="password" autocomplete="new-password" class="form-control" :class="{ 'is-invalid': touched.confirm && errors.confirm }" :disabled="pending" @blur="touched.confirm = true" />
      <div class="invalid-feedback">{{ errors.confirm }}</div>
    </div>

    <div v-if="submitError" class="alert alert-danger py-2" role="alert">{{ submitError }}</div>
    <BButton type="submit" variant="primary" class="w-100" :disabled="pending">
      {{ pending ? 'Creating account…' : 'Sign up' }}
    </BButton>
    <p class="text-secondary small mt-3 mb-0">
      Already have an account? <RouterLink :to="{ name: 'login' }">Log in</RouterLink>
    </p>
  </form>
</template>