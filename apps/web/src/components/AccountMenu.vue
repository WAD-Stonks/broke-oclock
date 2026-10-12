<script setup lang="ts">
import { authClient } from '@web/lib/auth-client'
import { RouterLink, useRouter } from 'vue-router'

const router = useRouter()
const session = authClient.useSession()

const logOut = async () => {
  await authClient.signOut()
  await router.push('/')
}
</script>

<template>
  <template v-if="session.isPending" />
  <template v-else-if="session.data">
    <RouterLink class="nav-link px-0" to="/saved">Saved</RouterLink>
    <RouterLink class="nav-link px-0" to="/me/submissions">My submissions</RouterLink>
    <RouterLink class="nav-link px-0" to="/me/merchant-access">Merchant access</RouterLink>
    <RouterLink class="nav-link px-0" to="/me/profile" data-testid="signed-in-name">{{ session.data.user.name }}</RouterLink>
    <button type="button" class="btn btn-link nav-link px-0" data-testid="log-out" @click="logOut">Log out</button>
  </template>
  <template v-else>
    <RouterLink class="nav-link px-0" to="/login">Log in</RouterLink>
    <RouterLink class="nav-link px-0" to="/register">Sign up</RouterLink>
  </template>
</template>