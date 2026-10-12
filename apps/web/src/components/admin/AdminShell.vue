<script setup lang="ts">
import '@web/assets/admin.css'
import AdminSessionControls from '@web/components/admin/AdminSessionControls.vue'
import { inject } from 'vue'
import { routeLocationKey, routerKey } from 'vue-router'

withDefaults(defineProps<{ title?: string; refreshKey?: number }>(), { title: 'Administration', refreshKey: 0 })
const emit = defineEmits<{ closing: []; signedOut: []; accessReload: [] }>()
const route = inject(routeLocationKey, null)
const router = inject(routerKey, null)
const navigation = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/accounts', label: 'Accounts' },
  { href: '/admin/ingestion', label: 'Ingestion' },
]
const navigate = (event: MouseEvent, href: string) => {
  if (!router || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  void router.push(href)
}
</script>

<template>
  <div class="admin-shell">
    <div class="admin-wayfinding">
      <nav aria-label="Administration" class="admin-navigation">
        <ul>
          <li v-for="item in navigation" :key="item.href">
            <a :href="item.href" :aria-current="route?.path === item.href ? 'page' : undefined"
              @click="navigate($event, item.href)">{{ item.label }}</a>
          </li>
        </ul>
      </nav>
      <a class="admin-map-link" href="/" @click="navigate($event, '/')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="m14 7-5 5 5 5 M9 12h11" /></svg>
        Back to map
      </a>
    </div>
    <header class="admin-heading">
      <h1>{{ title }}</h1>
      <AdminSessionControls :refresh-key="refreshKey" @closing="emit('closing')" @signed-out="emit('signedOut')" @access-reload="emit('accessReload')" />
    </header>
    <div class="admin-content"><slot /></div>
  </div>
</template>
