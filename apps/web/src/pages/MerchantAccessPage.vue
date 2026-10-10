<script setup lang="ts">
import type { AccountVenue, MyMerchantRequest } from '@broke-oclock/contracts/account'
import { api } from '@web/lib/api-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { computed, onMounted, ref } from 'vue'

const search = ref('')
const venues = ref<AccountVenue[]>([])
const venueId = ref('')
const message = ref('')
const myRequests = ref<MyMerchantRequest[]>([])
const submitting = ref(false)
const successMessage = ref('')
const errorMessage = ref('')

// The Send button only works when a stall is chosen, there is a message, and we are not already sending
const canSubmit = computed(() => {
  return venueId.value !== '' && message.value.trim() !== '' && !submitting.value
})

const findVenues = async () => {
  try {
    venues.value = await api.account.venues({ search: search.value })
    venueId.value = '' // the old choice may not be in the new list
  } catch {
    errorMessage.value = 'Could not search stalls. Please try again.'
  }
}

const loadMyRequests = async () => {
  try {
    const result = await api.account.merchantRequests()
    myRequests.value = result.items
  } catch {
    errorMessage.value = 'Could not load your earlier requests.'
  }
}

const sendRequest = async () => {
  if (!canSubmit.value) return
  submitting.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    await api.account.requestMerchantAccess({ venueId: venueId.value, message: message.value })
    successMessage.value = 'Request sent. An administrator will review it.'
    message.value = ''
    venueId.value = ''
    await loadMyRequests() // refresh the list so the new request shows up
  } catch (error) {
    const code = errorCode(error)
    if (code === 'CONFLICT') {
      errorMessage.value = 'You already have a pending request or access for this stall.'
    } else if (code === 'PRECONDITION_FAILED') {
      errorMessage.value = 'This stall is unavailable, or your account cannot request access.'
    } else if (code === 'UNAUTHORIZED') {
      errorMessage.value = 'Please log in first.'
    } else {
      errorMessage.value = 'Could not send your request. Please try again.'
    }
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  findVenues()
  loadMyRequests()
})
</script>

<template>
  <section class="container py-4">
    <h1 class="h2 mb-3">Merchant access</h1>
    <p class="text-secondary">
      Run a stall? Request access to manage its deals. An administrator reviews every request.
    </p>

    <form class="card card-body mb-4" @submit.prevent="sendRequest">
      <label for="venue-search" class="form-label">Find your stall</label>
      <div class="input-group mb-3">
        <input id="venue-search" v-model="search" class="form-control" maxlength="100" />
        <button type="button" class="btn btn-outline-primary" @click="findVenues">Search</button>
      </div>

      <label for="venue" class="form-label">Stall</label>
      <select id="venue" v-model="venueId" class="form-select mb-3">
        <option value="">Choose a stall</option>
        <option v-for="venue in venues" :key="venue.id" :value="venue.id">
          {{ venue.name }} ({{ venue.merchantName }})
        </option>
      </select>

      <label for="why" class="form-label">Why should you have access?</label>
      <textarea id="why" v-model="message" rows="3" maxlength="1000" class="form-control mb-3"></textarea>

      <p v-if="errorMessage" class="text-danger" role="alert">{{ errorMessage }}</p>
      <p v-if="successMessage" class="text-success" role="status">{{ successMessage }}</p>

      <button type="submit" class="btn btn-primary align-self-start" :disabled="!canSubmit">
        {{ submitting ? 'Sending…' : 'Send request' }}
      </button>
    </form>

    <h2 class="h4 mb-3">Your requests</h2>
    <p v-if="myRequests.length === 0" class="text-secondary">No requests yet.</p>
    <ul v-else class="list-unstyled d-grid gap-2">
      <li v-for="item in myRequests" :key="item.id" class="card card-body">
        <div class="d-flex justify-content-between">
          <span>{{ item.venueName }} ({{ item.merchantName }})</span>
          <span class="badge text-bg-secondary">{{ item.status }}</span>
        </div>
        <p v-if="item.reviewNote" class="small mb-0 mt-2">Reviewer note: {{ item.reviewNote }}</p>
      </li>
    </ul>
  </section>
</template>