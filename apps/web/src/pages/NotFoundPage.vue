<template>
  <section aria-labelledby="not-found-title" class="starter-intro">
    <p class="text-primary fw-semibold mb-2">404</p>
    <h1 id="not-found-title" class="h2 mb-3">Page not found</h1>
    <p class="text-secondary mb-4">The page you requested does not exist.</p>
    <BButton variant="outline-primary" to="/">Return home</BButton>
  </section>
</template>

<script setup lang="ts">
import { BButton } from '@broke-oclock/ui'
</script>
