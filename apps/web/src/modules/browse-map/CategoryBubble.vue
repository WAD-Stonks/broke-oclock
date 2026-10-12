<script setup lang="ts">
import { CATEGORY_ICON_PATHS, categoryStyle } from '@web/modules/browse-map/category-style'
import { computed } from 'vue'

// Tinted circle with the category's outline icon. Decorative: the category is always written
// out next to it, so the bubble itself is hidden from assistive technology.
const props = withDefaults(defineProps<{ category: string; size?: 'sm' | 'md' | 'lg' }>(), {
  size: 'md',
})

const style = computed(() => categoryStyle(props.category))
const paths = computed(() => CATEGORY_ICON_PATHS[style.value.icon])
</script>

<template>
  <span
    class="category-bubble"
    :class="`category-bubble--${size}`"
    :style="{ '--bubble-tint': style.tint }"
    aria-hidden="true"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path v-for="(d, index) in paths" :key="index" :d="d" />
    </svg>
  </span>
</template>

<style scoped>
.category-bubble {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: var(--bubble-size);
  height: var(--bubble-size);
  color: var(--ink);
  background: var(--bubble-tint);
  border-radius: 50%;
}

.category-bubble svg {
  width: calc(var(--bubble-size) * 0.45);
  height: calc(var(--bubble-size) * 0.45);
}

.category-bubble--sm {
  --bubble-size: 2.5rem;
}

.category-bubble--md {
  --bubble-size: 3.25rem;
}

.category-bubble--lg {
  --bubble-size: 3.5rem;
  border: 4px solid var(--paper-white);
}
</style>
