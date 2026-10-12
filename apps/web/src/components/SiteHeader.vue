<script setup lang="ts">
import logoUrl from '@web/assets/logo.png'
import AccountMenu from '@web/components/AccountMenu.vue'
import { RouterLink } from 'vue-router'
</script>

<template>
  <header class="border-bottom bg-white">
    <nav
      aria-label="Primary navigation"
      class="container navbar navbar-expand-sm px-3 py-3"
      data-testid="primary-nav"
    >
      <RouterLink class="navbar-brand py-0" to="/">
        <img :src="logoUrl" alt="Lobangers" class="site-logo" />
      </RouterLink>
      <div class="navbar-nav ms-auto flex-row flex-wrap gap-3">
        <RouterLink class="nav-link px-0" to="/">Home</RouterLink>
        <RouterLink class="nav-link px-0" to="/deals">Deals</RouterLink>
        <RouterLink class="nav-link px-0" to="/getting-started">Getting started</RouterLink>
        <RouterLink class="nav-link px-0" to="/admin">Admin overview</RouterLink>
        <RouterLink class="nav-link px-0" to="/admin/accounts">Platform admin</RouterLink>
        <RouterLink class="nav-link px-0" to="/admin/ingestion">Ingestion admin</RouterLink>
        <AccountMenu />
      </div>
    </nav>
  </header>
</template>

<style scoped>
.site-logo {
  display: block;
  height: 2rem;
  aspect-ratio: 5.6;
  object-fit: cover;
  object-position: center 48%;
}
</style>
