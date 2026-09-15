<script setup lang="ts">
import { RouterLink } from 'vue-router'

const plannedModules = [
  {
    name: 'browse-map',
    ownership: 'Browse and map experience; define discovery and map contracts.',
  },
  {
    name: 'add-deal',
    ownership: 'Deal submission flow; define validation and moderation handoff.',
  },
  {
    name: 'community',
    ownership: 'Community interactions; define reports, votes, and discussion surfaces.',
  },
  {
    name: 'account',
    ownership: 'Account experience; connect BetterAuth flows when the backend contract is ready.',
  },
  {
    name: 'ingestion-admin',
    ownership: 'Ingestion and admin tools; document job status and review responsibilities.',
  },
  {
    name: 'venues-feed',
    ownership: 'Venue and feed integration; define source data and freshness boundaries.',
  },
]
</script>

<template>
  <section aria-labelledby="setup-title">
    <RouterLink class="link-secondary d-inline-block mb-4" to="/">← Back home</RouterLink>
    <h1 id="setup-title" class="h2 mb-3">Getting started</h1>
    <p class="text-secondary setup-copy">
      This is the frontend starter for the six planned workstreams. It supplies the Vue shell,
      routing, Bootstrap baseline, and auth client wiring only. Product behavior belongs to each
      module and should follow the team plans rather than invented endpoints or schemas.
    </p>

    <h2 class="h4 mt-5 mb-3">Planned module ownership</h2>
    <dl class="row g-0 module-list">
      <template v-for="module in plannedModules" :key="module.name">
        <dt class="col-md-4 py-3 font-monospace">src/modules/{{ module.name }}</dt>
        <dd class="col-md-8 py-3 mb-0">{{ module.ownership }}</dd>
      </template>
    </dl>

    <p class="text-secondary small mt-4 mb-0">
      Auth UI is intentionally not included here. The generic client lives at
      <code>src/lib/auth-client.ts</code>; the Vite proxy forwards same-origin <code>/api</code>
      requests to the local backend.
    </p>
  </section>
</template>
