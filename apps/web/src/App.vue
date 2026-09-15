<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppShell from './components/AppShell.vue'
import SiteHeader from './components/SiteHeader.vue'
</script>

<template>
  <div class="min-vh-100 bg-light-subtle text-body">
    <SiteHeader />
    <AppShell>
      <RouterView />
    </AppShell>
  </div>
</template>
