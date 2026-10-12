<script setup lang="ts">
import LoginForm from '@web/modules/account/LoginForm.vue'
import { safeRedirect } from '@web/router/guards'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// Fixed messages only: the ?notice= value picks one, it is never shown itself.
const notices: Record<string, string> = {
  verified: 'Your email is verified. You can log in now.',
  verify: 'Check your email for a link to verify your account, then log in.',
  reset: 'Your password was changed. Log in with the new one.',
}
const notice = computed(() => {
  const key = route.query.notice
  return typeof key === 'string' && Object.hasOwn(notices, key) ? notices[key] : ''
})

// Return to the page the guard bounced the visitor from, or home.
const onSignedIn = () => router.replace(safeRedirect(route.query.redirect))
</script>

<template>
  <section aria-label="Log in" class="row justify-content-center py-4">
    <div class="col-12 col-sm-10 col-md-7 col-lg-5">
      <div v-if="notice" class="alert alert-success" role="status">{{ notice }}</div>
      <LoginForm @signed-in="onSignedIn" />
    </div>
  </section>
</template>