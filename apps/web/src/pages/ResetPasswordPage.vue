<script setup lang="ts">
import { BButton } from '@broke-oclock/ui'
import { authClient } from '@web/lib/auth-client'
import { computed, reactive, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// Better Auth redirects here as /reset-password?token=... (or ?error=INVALID_TOKEN).
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const linkInvalid = computed(() => !token.value || route.query.error !== undefined)

const form = reactive({ password: '', confirm: '' })
const touched = reactive({ password: false, confirm: false })
const pending = ref(false)
const errorMessage = ref('')

const errors = computed(() => ({
  password:
    form.password.length < 8
      ? 'Use at least 8 characters.'
      : form.password.length > 128
        ? 'Use at most 128 characters.'
        : '',
  confirm: form.confirm === form.password ? '' : 'Passwords do not match.',
}))

const submit = async () => {
  touched.password = true
  touched.confirm = true
  if (pending.value || errors.value.password || errors.value.confirm) return
  pending.value = true
  errorMessage.value = ''
  try {
    const result = await authClient.resetPassword({
      newPassword: form.password,
      token: token.value,
    })
    if (result.error) {
      errorMessage.value = 'This reset link is invalid or has expired. Please request a new one.'
    } else {
      await router.replace({ name: 'login', query: { notice: 'reset' } })
    }
  } catch {
    errorMessage.value = 'Something went wrong. Please try again.'
  } finally {
    form.password = ''
    form.confirm = ''
    pending.value = false
  }
}
</script>

<template>
  <section aria-label="Choose a new password" class="row justify-content-center py-4">
    <div class="col-12 col-sm-10 col-md-7 col-lg-5">
      <div class="card card-body p-4">
        <h1 class="h3 mb-3">Choose a new password</h1>

        <div v-if="linkInvalid" role="alert">
          <p>This reset link is invalid or has expired.</p>
          <RouterLink :to="{ name: 'forgot-password' }">Request a new link</RouterLink>
        </div>

        <form v-else novalidate @submit.prevent="submit">
          <div class="mb-3">
            <label for="reset-password" class="form-label">New password</label>
            <input id="reset-password" v-model="form.password" type="password" autocomplete="new-password" class="form-control" :class="{ 'is-invalid': touched.password && errors.password }" :disabled="pending" @blur="touched.password = true" />
            <div class="invalid-feedback">{{ errors.password }}</div>
          </div>
          <div class="mb-3">
            <label for="reset-confirm" class="form-label">Confirm new password</label>
            <input id="reset-confirm" v-model="form.confirm" type="password" autocomplete="new-password" class="form-control" :class="{ 'is-invalid': touched.confirm && errors.confirm }" :disabled="pending" @blur="touched.confirm = true" />
            <div class="invalid-feedback">{{ errors.confirm }}</div>
          </div>
          <div v-if="errorMessage" class="alert alert-danger py-2" role="alert">{{ errorMessage }}</div>
          <BButton type="submit" variant="primary" class="w-100" :disabled="pending">
            {{ pending ? 'Saving…' : 'Change password' }}
          </BButton>
        </form>
      </div>
    </div>
  </section>
</template>
