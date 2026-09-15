<template>
  <section aria-labelledby="not-found-title" class="starter-intro">
    <p class="text-primary fw-semibold mb-2">404</p>
    <h1 id="not-found-title" class="h2 mb-3">Page not found</h1>
    <p class="text-secondary mb-4">The page you requested does not exist.</p>
    <RouterLink class="btn btn-outline-primary" to="/">Return home</RouterLink>
  </section>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>
