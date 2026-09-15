<script setup lang="ts">
import { AppShell, BApp } from '@broke-oclock/ui'
import SiteHeader from '@web/components/SiteHeader.vue'
import { RouterView } from 'vue-router'
</script>

<template>
  <BApp>
    <div class="min-vh-100 bg-light-subtle text-body">
      <SiteHeader />
      <AppShell>
        <RouterView />
      </AppShell>
    </div>
  </BApp>
</template>
