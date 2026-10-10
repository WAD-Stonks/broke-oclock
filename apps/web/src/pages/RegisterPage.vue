<script setup lang="ts">
import RegisterForm from '@web/modules/account/RegisterForm.vue'
import { safeRedirect } from '@web/router/guards'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const onRegistered = (needsVerification: boolean) =>
  needsVerification
    ? router.replace({ name: 'login', query: { notice: 'verify' } })
    : router.replace(safeRedirect(route.query.redirect))
</script>

<template>
  <section aria-label="Sign up" class="row justify-content-center py-4">
    <div class="col-12 col-sm-10 col-md-7 col-lg-5">
      <RegisterForm @registered="onRegistered" />
    </div>
  </section>
</template>
