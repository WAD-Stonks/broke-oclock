<script setup lang="ts">
import { AppShell, BApp } from '@broke-oclock/ui'
import SiteHeader from '@web/components/SiteHeader.vue'
import { routeLayout } from '@web/router/layouts'
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'

const route = useRoute()
const layout = computed(() => routeLayout(route))
const administration = computed(() => route.path === '/admin' || route.path.startsWith('/admin/'))
</script>

<template>
  <BApp>
    <div
      class="min-vh-100 bg-light-subtle text-body site-layout"
      :class="{ 'site-layout--shell': layout === 'shell' && !administration, 'site-layout--admin': administration }"
    >
      <SiteHeader :embedded="administration" />
      <main v-if="layout === 'canvas'" class="site-canvas">
        <RouterView />
      </main>
      <AppShell v-else>
        <RouterView />
      </AppShell>
    </div>
  </BApp>
</template>

<style scoped>
.site-layout--shell {
  padding-top: var(--site-header-clearance);
}

/* Full-bleed canvas: the page owns the viewport and the fixed header floats over it. */
.site-canvas {
  height: 100vh;
}

@supports (height: 100dvh) {
  .site-canvas {
    height: 100dvh;
  }
}
</style>
