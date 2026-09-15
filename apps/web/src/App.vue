<script setup lang="ts">
import AppShell from '@web/components/AppShell.vue'
import SiteHeader from '@web/components/SiteHeader.vue'
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="min-vh-100 bg-light-subtle text-body">
    <SiteHeader />
    <AppShell>
      <RouterView />
    </AppShell>
  </div>
</template>
