<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <header class="border-bottom bg-white">
    <nav
      aria-label="Primary navigation"
      class="container navbar navbar-expand-sm px-3 py-3"
      data-testid="primary-nav"
    >
      <RouterLink class="navbar-brand fw-semibold text-primary" to="/">
        Broke O'Clock
      </RouterLink>
      <div class="navbar-nav ms-auto flex-row gap-3">
        <RouterLink class="nav-link px-0" to="/">Home</RouterLink>
        <RouterLink class="nav-link px-0" to="/getting-started">Getting started</RouterLink>
      </div>
    </nav>
  </header>
</template>
