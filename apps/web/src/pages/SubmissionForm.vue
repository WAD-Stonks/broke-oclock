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

// Load previously saved deals from localStorage
const savedDeals = ref(
  JSON.parse(localStorage.getItem('student_deals')? localStorage.getItem('student_deals') : '[]')
)

// file handling
function selectPhoto(event) {
  const file = event.target.files?.[0]

  if (!file) return

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

// validating if form is filled up correctly
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
    (
      Number.isFinite(originalPrice) &&
      promotionalPrice >= originalPrice
    )
  ) {
    errors.value.promotionalPrice =
      'Promo price must be below the original price.'
  }

  if (!deal.value.location.trim()) {
    errors.value.location = 'Enter a location.'
  }

  return Object.keys(errors.value).length === 0
}

function saveDeal(status) {
  message.value = ''
  errors.value = {}

  // Only validate when submitting a deal.
  // Drafts can be saved with incomplete information.
  if (status !== 'draft' && !validate()) {
    return
  }

  saving.value = true

  try {
    // Create a deal object from the form
    const newDeal = {
      merchantName: deal.value.merchantName.trim(),
      title: deal.value.title.trim(),
      description: deal.value.description.trim(),
      cuisine: deal.value.cuisine,

      originalPrice:
        deal.value.originalPrice === ''
          ? null
          : Number(deal.value.originalPrice),

      promotionalPrice:
        deal.value.promotionalPrice === ''
          ? null
          : Number(deal.value.promotionalPrice),

      location: deal.value.location.trim(),
      status: status,
      photo: deal.photo?.name ?? null
    }

    // Create an updated list of deals
    const updatedDeals = [
      ...savedDeals.value,
      newDeal
    ]

    // Save the updated list in localStorage
    localStorage.setItem(
      'student_deals',
      JSON.stringify(updatedDeals)
    )

    // Update the reactive array
    savedDeals.value = updatedDeals

    // Display a success message
    message.value = status === 'draft'
      ? 'Draft saved!'
      : 'Deal submitted!'

    console.log(savedDeals.value)

  } catch (error) {
    console.error('Unable to save the deal:', error)
    message.value = 'Unable to save the deal.'

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
    </div>

    <div v-if="message" class="alert alert-info">
      {{ message }}
    </div>

    <form
      class="card border-0 shadow-sm p-4"
      @submit.prevent="saveDeal('unverified')"
    >

      <h2 class="h5 mb-3">Merchant information</h2>

      <!-- Merchant name -->
      <div class="mb-3">
        <label class="form-label">Merchant name *</label>

        <input
          v-model="deal.merchantName"
          class="form-control"
          :class="{ 'is-invalid': errors.merchantName }"
        />

        <div class="invalid-feedback">
          {{ errors.merchantName }}
        </div>
      </div>

      <!-- Deal title -->
      <div class="mb-3">
        <label class="form-label">Deal title *</label>

        <input
          v-model="deal.title"
          class="form-control"
          :class="{ 'is-invalid': errors.title }"
          placeholder="e.g. Student lunch set"
        />

        <div class="invalid-feedback">
          {{ errors.title }}
        </div>
      </div>

      <!-- Description -->
      <div class="mb-3">
        <label class="form-label">Description</label>

        <textarea
          v-model="deal.description"
          class="form-control"
          rows="3"
          placeholder="Describe what's included and any conditions."
        ></textarea>
      </div>

      <!-- Cuisine -->
      <div class="mb-3">
        <label class="form-label">Cuisine *</label>

        <select
          v-model="deal.cuisine"
          class="form-select"
          :class="{ 'is-invalid': errors.cuisine }"
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

        <div class="invalid-feedback">
          {{ errors.cuisine }}
        </div>
      </div>

      <!-- Pricing -->
      <h2 class="h5 mt-3 mb-3">Promotional pricing</h2>

      <div class="row g-3">

        <div class="col-md-6">
          <label class="form-label">Original price (S$) *</label>

          <input
            v-model="deal.originalPrice"
            type="number"
            min="0.01"
            step="0.01"
            class="form-control"
            :class="{ 'is-invalid': errors.originalPrice }"
          />

          <div class="invalid-feedback">
            {{ errors.originalPrice }}
          </div>
        </div>

        <div class="col-md-6">
          <label class="form-label">Promo price (S$) *</label>

          <input
            v-model="deal.promotionalPrice"
            type="number"
            min="0"
            step="0.01"
            class="form-control"
            :class="{ 'is-invalid': errors.promotionalPrice }"
          />

          <div class="invalid-feedback">
            {{ errors.promotionalPrice }}
          </div>
        </div>

      </div>

      <!-- Deal photo -->
      <div class="mt-4 mb-3">
        <label class="form-label">Deal photo</label>

        <input
          type="file"
          accept="image/*"
          class="form-control"
          @change="selectPhoto"
        />

        <div class="text-danger small">
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
        <label class="form-label">Search or add location *</label>

        <input
          v-model="deal.location"
          class="form-control"
          :class="{ 'is-invalid': errors.location }"
          placeholder="Enter a building, street or postal code"
        />

        <div class="form-text">
          Choose a suggested OneMap result to confirm the location.
        </div>

        <div class="text-danger small">
          {{ errors.location }}
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
          {{ saving ? 'Saving...' : 'Submit deal' }}
        </button>

      </div>

    </form>
  </main>
</template>