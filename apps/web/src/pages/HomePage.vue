<template>
  <section aria-labelledby="home-title" class="starter-intro">

    <h1 id="home-title" class="display-5 fw-semibold mb-3">Student deals, less guesswork.</h1>
    <p class="lead text-secondary mb-4">
      Project starter — deal features are not implemented yet.
    </p>
    <p class="mb-0">
      <RouterLink class="btn btn-primary" to="/getting-started">
        Read the developer setup
      </RouterLink>
    </p>
  </section>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>
