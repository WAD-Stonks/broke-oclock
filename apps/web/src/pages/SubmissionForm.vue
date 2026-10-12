```vue
<script setup>
import { ref } from 'vue'

const cuisines = [
  'Chinese', 'Japanese', 'Korean', 'Western',
  'Indian', 'Thai', 'Malay', 'Cafe & Desserts',
  'Other'
]

const deal = ref({
  merchantName: '',
  title: '',
  description: '',
  cuisine: '',
  originalPrice: '',
  promotionalPrice: '',
  location: '',
  photo: null
})

const photoPreview = ref('')
const errors = ref({})
const saving = ref(false)
const message = ref('')

// Load previously saved deals safely
let savedDealsList = []

try {
  const storedDeals = localStorage.getItem('student_deals')

  if (storedDeals) {
    const parsedDeals = JSON.parse(storedDeals)

    if (Array.isArray(parsedDeals)) {
      savedDealsList = parsedDeals
    } else {
      localStorage.setItem('student_deals', '[]')
      message.value = 'Saved deals were invalid. Starting with an empty list.'
    }
  }
} catch {
  try {
    localStorage.setItem('student_deals', '[]')
  } catch {
    console.log('Unable to reset localStorage.')
  }

  message.value = 'Unable to load saved deals. Starting with an empty list.'
}

const savedDeals = ref(savedDealsList)

// File handling
function selectPhoto(event) {
  let file = null

  if (event.target.files && event.target.files.length > 0) {
    file = event.target.files[0]
  }

  if (file === null) {
    return
  }

  if (!file.type.startsWith('image/')) {
    errors.value.photo = 'Please select an image.'
    return
  }

  if (file.size > 5 * 1024 * 1024) {
    errors.value.photo = 'Image must be smaller than 5 MB.'
    return
  }

  deal.value.photo = file
  photoPreview.value = URL.createObjectURL(file)

  delete errors.value.photo
}

// Validate form
function validate() {
  errors.value = {}

  if (!deal.value.merchantName.trim()) {
    errors.value.merchantName = 'Enter a merchant name.'
  }

  if (!deal.value.title.trim()) {
    errors.value.title = 'Enter a deal title.'
  }

  if (!deal.value.cuisine) {
    errors.value.cuisine = 'Choose a cuisine.'
  }

  const originalPrice = Number(deal.value.originalPrice)
  const promotionalPrice = Number(deal.value.promotionalPrice)

  if (
    deal.value.originalPrice === '' ||
    !Number.isFinite(originalPrice) ||
    originalPrice <= 0
  ) {
    errors.value.originalPrice = 'Enter a valid original price.'
  }

  if (
    deal.value.promotionalPrice === '' ||
    !Number.isFinite(promotionalPrice) ||
    promotionalPrice < 0 ||
    promotionalPrice >= originalPrice
  ) {
    errors.value.promotionalPrice =
      'Promo price must be below the original price.'
  }

  if (!deal.value.location.trim()) {
    errors.value.location = 'Enter a location.'
  }

  return Object.keys(errors.value).length === 0
}

// Save draft or local preview
function saveDeal(status) {
  message.value = ''
  errors.value = {}

  if (status !== 'draft' && !validate()) {
    return
  }

  saving.value = true

  try {
    // Get the original price
    let originalPrice = null

    if (deal.value.originalPrice !== '') {
      originalPrice = Number(deal.value.originalPrice)
    }

    // Get the promotional price
    let promotionalPrice = null

    if (deal.value.promotionalPrice !== '') {
      promotionalPrice = Number(deal.value.promotionalPrice)
    }

    // Get the photo filename
    let photoName = null

    if (deal.value.photo !== null) {
      photoName = deal.value.photo.name
    }

    // Create a new deal object
    const newDeal = {
      merchantName: deal.value.merchantName.trim(),
      title: deal.value.title.trim(),
      description: deal.value.description.trim(),
      cuisine: deal.value.cuisine,
      originalPrice: originalPrice,
      promotionalPrice: promotionalPrice,
      location: deal.value.location.trim(),
      status: status === 'draft' ? 'draft' : 'local-preview',
      photo: photoName
    }

    // Copy the existing deals into a new array
    const updatedDeals = []

    for (let i = 0; i < savedDeals.value.length; i++) {
      updatedDeals.push(savedDeals.value[i])
    }

    // Add the new deal
    updatedDeals.push(newDeal)

    // Save the updated list in localStorage
    localStorage.setItem(
      'student_deals',
      JSON.stringify(updatedDeals)
    )

    // Update the reactive array
    savedDeals.value = updatedDeals

    // Display a message
    if (status === 'draft') {
      message.value = 'Local draft saved!'
    } else {
      message.value =
        'Local preview saved! This deal has not been submitted to the community.'
    }

  } catch (error) {
    console.error('Unable to save the deal:', error)
    message.value = 'Unable to save the deal locally.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="container py-5" style="max-width: 850px">

    <div class="mb-4">
      <h1 class="fw-bold">Add a Deal</h1>

      <p class="text-secondary">
        Share a promotion with the student community.
      </p>

      <p class="text-warning">
        Prototype only: deals are saved in this browser and are not submitted to a server.
      </p>
    </div>

    <div v-if="message" class="alert alert-info" role="status">
      {{ message }}
    </div>

    <form
      class="card border-0 shadow-sm p-4"
      @submit.prevent="saveDeal('preview')"
    >

      <h2 class="h5 mb-3">Merchant information</h2>

      <!-- Merchant name -->
      <div class="mb-3">
        <label class="form-label" for="merchantName">
          Merchant name *
        </label>

        <input
          id="merchantName"
          v-model="deal.merchantName"
          class="form-control"
          :class="{ 'is-invalid': errors.merchantName }"
          :aria-invalid="errors.merchantName ? 'true' : 'false'"
          :aria-describedby="errors.merchantName ? 'merchantNameError' : undefined"
        />

        <div
          v-if="errors.merchantName"
          id="merchantNameError"
          class="invalid-feedback"
        >
          {{ errors.merchantName }}
        </div>
      </div>

      <!-- Deal title -->
      <div class="mb-3">
        <label class="form-label" for="dealTitle">
          Deal title *
        </label>

        <input
          id="dealTitle"
          v-model="deal.title"
          class="form-control"
          :class="{ 'is-invalid': errors.title }"
          :aria-invalid="errors.title ? 'true' : 'false'"
          :aria-describedby="errors.title ? 'titleError' : undefined"
          placeholder="e.g. Student lunch set"
        />

        <div
          v-if="errors.title"
          id="titleError"
          class="invalid-feedback"
        >
          {{ errors.title }}
        </div>
      </div>

      <!-- Description -->
      <div class="mb-3">
        <label class="form-label" for="description">
          Description
        </label>

        <textarea
          id="description"
          v-model="deal.description"
          class="form-control"
          rows="3"
          placeholder="Describe what's included and any conditions."
        ></textarea>
      </div>

      <!-- Cuisine -->
      <div class="mb-3">
        <label class="form-label" for="cuisine">
          Cuisine *
        </label>

        <select
          id="cuisine"
          v-model="deal.cuisine"
          class="form-select"
          :class="{ 'is-invalid': errors.cuisine }"
          :aria-invalid="errors.cuisine ? 'true' : 'false'"
          :aria-describedby="errors.cuisine ? 'cuisineError' : undefined"
        >
          <option value="" disabled>Select cuisine</option>

          <option
            v-for="cuisine in cuisines"
            :key="cuisine"
            :value="cuisine"
          >
            {{ cuisine }}
          </option>
        </select>

        <div
          v-if="errors.cuisine"
          id="cuisineError"
          class="invalid-feedback"
        >
          {{ errors.cuisine }}
        </div>
      </div>

      <!-- Pricing -->
      <h2 class="h5 mt-3 mb-3">Promotional pricing</h2>

      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label" for="originalPrice">
            Original price (S$) *
          </label>

          <input
            id="originalPrice"
            v-model="deal.originalPrice"
            type="number"
            min="0.01"
            step="0.01"
            class="form-control"
            :class="{ 'is-invalid': errors.originalPrice }"
            :aria-invalid="errors.originalPrice ? 'true' : 'false'"
            :aria-describedby="errors.originalPrice ? 'originalPriceError' : undefined"
          />

          <div
            v-if="errors.originalPrice"
            id="originalPriceError"
            class="invalid-feedback"
          >
            {{ errors.originalPrice }}
          </div>
        </div>

        <div class="col-md-6">
          <label class="form-label" for="promotionalPrice">
            Promo price (S$) *
          </label>

          <input
            id="promotionalPrice"
            v-model="deal.promotionalPrice"
            type="number"
            min="0"
            step="0.01"
            class="form-control"
            :class="{ 'is-invalid': errors.promotionalPrice }"
            :aria-invalid="errors.promotionalPrice ? 'true' : 'false'"
            :aria-describedby="errors.promotionalPrice ? 'promoPriceError' : undefined"
          />

          <div
            v-if="errors.promotionalPrice"
            id="promoPriceError"
            class="invalid-feedback"
          >
            {{ errors.promotionalPrice }}
          </div>
        </div>
      </div>

      <!-- Deal photo -->
      <div class="mt-4 mb-3">
        <label class="form-label" for="photo">
          Deal photo
        </label>

        <input
          id="photo"
          type="file"
          accept="image/*"
          class="form-control"
          :class="{ 'is-invalid': errors.photo }"
          :aria-invalid="errors.photo ? 'true' : 'false'"
          :aria-describedby="errors.photo ? 'photoError' : undefined"
          @change="selectPhoto"
        />

        <div
          v-if="errors.photo"
          id="photoError"
          class="invalid-feedback"
        >
          {{ errors.photo }}
        </div>

        <img
          v-if="photoPreview"
          :src="photoPreview"
          alt="Deal preview"
          class="img-thumbnail mt-3"
          style="max-height: 220px"
        />
      </div>

      <!-- Deal location -->
      <h2 class="h5 mt-3 mb-3">Deal location</h2>

      <div class="mb-4">
        <label class="form-label" for="location">
          Search or add location *
        </label>

        <input
          id="location"
          v-model="deal.location"
          class="form-control"
          :class="{ 'is-invalid': errors.location }"
          :aria-invalid="errors.location ? 'true' : 'false'"
          :aria-describedby="errors.location ? 'locationError' : 'locationHelp'"
          placeholder="Enter a building, street or postal code"
        />

        <div
          v-if="errors.location"
          id="locationError"
          class="invalid-feedback"
        >
          {{ errors.location }}
        </div>

        <div id="locationHelp" class="form-text">
          OneMap suggestions are not connected yet.
        </div>
      </div>

      <!-- Action buttons -->
      <div class="d-flex flex-wrap gap-2 justify-content-end">
        <button
          type="button"
          class="btn btn-outline-secondary"
          :disabled="saving"
          @click="saveDeal('draft')"
        >
          {{ saving ? 'Saving...' : 'Save draft' }}
        </button>

        <button
          type="submit"
          class="btn btn-primary"
          :disabled="saving"
        >
          {{ saving ? 'Saving...' : 'Save local preview' }}
        </button>
      </div>

    </form>
  </main>
</template>
```
