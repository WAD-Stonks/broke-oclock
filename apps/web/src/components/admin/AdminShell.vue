<script setup lang="ts">
import AdminSessionControls from '@web/components/admin/AdminSessionControls.vue'

withDefaults(defineProps<{ title?: string; refreshKey?: number }>(), { title: 'Administration', refreshKey: 0 })
const emit = defineEmits<{ closing: []; signedOut: []; accessReload: [] }>()
</script>

<template>
  <div class="admin-shell">
    <h1 class="mb-3">{{ title }}</h1>
    <nav aria-label="Administration" class="d-flex flex-wrap gap-3 mb-3">
      <a href="/admin">Overview</a>
      <a href="/admin/accounts">Accounts and merchant requests</a>
      <a href="/admin/ingestion">Ingestion</a>
    </nav>
    <AdminSessionControls :refresh-key="refreshKey" @closing="emit('closing')" @signed-out="emit('signedOut')" @access-reload="emit('accessReload')" />
    <slot />
  </div>
</template>
