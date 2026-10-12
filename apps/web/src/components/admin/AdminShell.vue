<script setup lang="ts">
import '@web/assets/admin.css'
import AdminSessionControls from '@web/components/admin/AdminSessionControls.vue'
import { inject } from 'vue'
import { routeLocationKey } from 'vue-router'

withDefaults(defineProps<{ title?: string; refreshKey?: number }>(), { title: 'Administration', refreshKey: 0 })
const emit = defineEmits<{ closing: []; signedOut: []; accessReload: [] }>()
const route = inject(routeLocationKey, null)
const navigation = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/accounts', label: 'Accounts and merchant requests' },
  { href: '/admin/ingestion', label: 'Ingestion' },
]
</script>

<template>
  <div class="admin-shell">
    <header class="admin-heading">
      <div>
        <p class="admin-eyebrow">Lobangers <span>Admin</span></p>
        <h1>{{ title }}</h1>
      </div>
      <a class="browse-pill browse-pill--compact admin-map-link" href="/">
        <svg class="browse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 18-6-3V3l6 3 6-3 6 3v12l-6-3-6 3Z M9 6v12 M15 3v12" /></svg>
        Back to map
      </a>
    </header>
    <nav aria-label="Administration" class="admin-navigation">
      <a v-for="item in navigation" :key="item.href" :href="item.href" class="browse-pill"
        :class="{ 'browse-pill--primary': route?.path === item.href }"
        :aria-current="route?.path === item.href ? 'page' : undefined">{{ item.label }}</a>
    </nav>
    <AdminSessionControls :refresh-key="refreshKey" @closing="emit('closing')" @signed-out="emit('signedOut')" @access-reload="emit('accessReload')" />
    <div class="admin-content"><slot /></div>
  </div>
</template>
