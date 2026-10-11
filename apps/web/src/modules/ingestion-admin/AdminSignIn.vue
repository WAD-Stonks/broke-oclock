<script setup lang="ts">
import SharedSignIn from '@web/components/auth/SharedSignIn.vue'

withDefaults(defineProps<{ title?: string }>(), { title: 'Sign in to review ingestion' })
const emit = defineEmits<{ signedIn: [] }>()
</script>

<template>
  <SharedSignIn :title="title" destination="/admin/ingestion" @signed-in="emit('signedIn')" />
</template>
