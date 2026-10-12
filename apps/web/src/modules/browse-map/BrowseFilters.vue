<script setup lang="ts">
import { ANY_CATEGORY, type BrowseFilters, updateFilters } from '@web/modules/browse-map/filters'

// Category options come from the shared deals API once it exists; the select stays empty until then.
const props = withDefaults(defineProps<{ categories?: readonly string[] }>(), {
  categories: () => [],
})
const model = defineModel<BrowseFilters>({ required: true })

const setCategory = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value
  model.value = updateFilters(model.value, 'category', value)
}

const setPriceMax = (event: Event) => {
  const dollars = Number.parseFloat((event.target as HTMLInputElement).value)
  const minor = Number.isFinite(dollars) && dollars >= 0 ? Math.round(dollars * 100) : null
  model.value = updateFilters(model.value, 'priceMaxMinor', minor)
}

const setValidNow = (event: Event) => {
  model.value = updateFilters(model.value, 'validNow', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <form aria-label="Deal filters" class="browse-filters" @submit.prevent>
    <div class="browse-filters__field">
      <label class="browse-filters__label" for="browse-category">Category</label>
      <select
        id="browse-category"
        class="form-select form-select-sm"
        :value="model.category"
        @change="setCategory"
      >
        <option :value="ANY_CATEGORY">Any category</option>
        <option v-for="category in props.categories" :key="category" :value="category">
          {{ category }}
        </option>
      </select>
    </div>
    <div class="browse-filters__field">
      <label class="browse-filters__label" for="browse-price-max">Max price (SGD)</label>
      <input
        id="browse-price-max"
        class="form-control form-control-sm"
        inputmode="decimal"
        min="0"
        step="0.50"
        type="number"
        :value="model.priceMaxMinor === null ? '' : model.priceMaxMinor / 100"
        @change="setPriceMax"
      />
    </div>
    <div class="form-check browse-filters__check">
      <input
        id="browse-valid-now"
        class="form-check-input"
        type="checkbox"
        :checked="model.validNow"
        @change="setValidNow"
      />
      <label class="form-check-label browse-filters__label" for="browse-valid-now">
        Valid now only
      </label>
    </div>
  </form>
</template>

<style scoped>
/* Flat cream card with a hairline border, stacked vertically so it fits a floating column. */
.browse-filters {
  display: grid;
  gap: var(--spacing-14);
  padding: var(--spacing-14);
  background: var(--color-cream);
  border: 1.5px solid var(--color-ash);
  font-family: var(--font-founders-grotesk);
  letter-spacing: -0.02em;
  font-feature-settings: "clig", "liga";
}

.browse-filters__field {
  display: grid;
  gap: var(--spacing-7);
}

.browse-filters__label {
  margin: 0;
  font-size: var(--text-body-sm);
  font-weight: var(--font-weight-light);
  color: var(--color-voltage-blue);
}

.browse-filters__check {
  margin: 0;
}
</style>
