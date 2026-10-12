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
  <!-- A row of small white pills floating over the map, so the map stays the main thing on screen.
       Labels stay in the document for screen readers even where the pill text already says it. -->
  <form aria-label="Deal filters" class="browse-filters" @submit.prevent>
    <div class="browse-filters__pill browse-filters__pill--select">
      <label class="visually-hidden" for="browse-category">Category</label>
      <select
        id="browse-category"
        class="browse-filters__select"
        :value="model.category"
        @change="setCategory"
      >
        <option :value="ANY_CATEGORY">Any category</option>
        <option v-for="category in props.categories" :key="category" :value="category">
          {{ category }}
        </option>
      </select>
    </div>

    <div class="browse-filters__pill">
      <label class="browse-filters__prefix" for="browse-price-max">
        Max <span class="visually-hidden">price (SGD)</span><span aria-hidden="true">$</span>
      </label>
      <input
        id="browse-price-max"
        class="browse-filters__price"
        inputmode="decimal"
        min="0"
        placeholder="any"
        step="0.50"
        type="number"
        :value="model.priceMaxMinor === null ? '' : model.priceMaxMinor / 100"
        @change="setPriceMax"
      />
    </div>

    <!-- A real checkbox drives the state; the label is styled as the pill and fills in when checked. -->
    <label class="browse-filters__toggle" for="browse-valid-now">
      <input
        id="browse-valid-now"
        class="browse-filters__toggle-input"
        type="checkbox"
        :checked="model.validNow"
        @change="setValidNow"
      />
      <span class="browse-filters__pill browse-filters__toggle-text">Valid now</span>
    </label>
  </form>
</template>

<style scoped>
.browse-filters {
  --filter-pill-height: 2.25rem;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-family: var(--font-sans);
}

/* Shared pill shell: small, white, soft shadow, same height for every control. */
.browse-filters__pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: var(--filter-pill-height);
  padding: 0 var(--space-4);
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1;
  color: var(--ink);
  background: var(--paper-white);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-pill);
  transition:
    color 160ms ease,
    background-color 160ms ease,
    box-shadow 160ms ease;
}

.browse-filters__pill:focus-within {
  box-shadow:
    var(--shadow-pill),
    0 0 0 3px var(--coral-soft);
}

/* Category: the select itself is the pill text, with a small chevron drawn after it. */
.browse-filters__pill--select {
  padding: 0;
}

.browse-filters__pill--select::after {
  content: '';
  position: absolute;
  top: 50%;
  right: var(--space-4);
  width: 0.4rem;
  height: 0.4rem;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: translateY(-70%) rotate(45deg);
  pointer-events: none;
}

.browse-filters__select {
  height: 100%;
  padding: 0 calc(var(--space-4) + 1rem) 0 var(--space-4);
  font: inherit;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: inherit;
  appearance: none;
  cursor: pointer;
}

.browse-filters__select:focus {
  outline: none;
}

/* Max price: "Max $" prefix then a short number box with no spinner arrows. */
.browse-filters__prefix {
  margin: 0;
  white-space: nowrap;
  color: var(--ink-muted);
  cursor: text;
}

.browse-filters__price {
  width: 3.25rem;
  padding: 0;
  font: inherit;
  color: var(--ink);
  background: transparent;
  border: 0;
  -moz-appearance: textfield;
}

.browse-filters__price::-webkit-outer-spin-button,
.browse-filters__price::-webkit-inner-spin-button {
  margin: 0;
  -webkit-appearance: none;
}

.browse-filters__price::placeholder {
  font-weight: 500;
  color: var(--ink-muted);
}

.browse-filters__price:focus {
  outline: none;
}

/* Valid now: the checkbox is kept but hidden; the pill text fills with ink while it is checked. */
.browse-filters__toggle {
  position: relative;
  display: inline-flex;
  margin: 0;
  cursor: pointer;
}

.browse-filters__toggle-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  opacity: 0;
  pointer-events: none;
}

.browse-filters__toggle-text {
  user-select: none;
}

.browse-filters__toggle:hover .browse-filters__toggle-text {
  background: var(--paper);
}

.browse-filters__toggle-input:checked + .browse-filters__toggle-text {
  color: var(--paper-white);
  background: var(--ink);
}

.browse-filters__toggle-input:focus-visible + .browse-filters__toggle-text {
  outline: 3px solid var(--coral-ring);
  outline-offset: 3px;
}
</style>
