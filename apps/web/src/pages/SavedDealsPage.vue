<script setup lang="ts">
import type { Bookmark } from '@broke-oclock/contracts/account'
import { api } from '@web/lib/api-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

// State: things the page needs to remember
const bookmarks = ref<Bookmark[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(true)
const notLoggedIn = ref(false)
const errorMessage = ref('')
const removeError = ref('')

// Load the first page of saved deals
const loadBookmarks = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await api.account.bookmarks()
    bookmarks.value = result.items
    nextCursor.value = result.nextCursor
  } catch (error) {
    if (errorCode(error) === 'UNAUTHORIZED') {
      notLoggedIn.value = true
    } else {
      errorMessage.value = 'Could not load your saved deals. Please try again.'
    }
  } finally {
    loading.value = false
  }
}

// Load the next page and add it to the end of the list
const loadMore = async () => {
  if (!nextCursor.value) return
  try {
    const result = await api.account.bookmarks({ cursor: nextCursor.value })
    bookmarks.value = [...bookmarks.value, ...result.items]
    nextCursor.value = result.nextCursor
  } catch {
    errorMessage.value = 'Could not load more deals. Please try again.'
  }
}

// Remove one saved deal, then take it out of the list on screen
const removeBookmark = async (dealId: string) => {
  removeError.value = ''
  try {
    await api.account.unsaveDeal(dealId)
    bookmarks.value = bookmarks.value.filter((item) => item.dealId !== dealId)
  } catch {
    removeError.value = 'Could not remove that deal. Please try again.'
  }
}

onMounted(loadBookmarks)
</script>

<template>
  <section class="container py-4">
    <h1 class="h2 mb-4">Saved deals</h1>

    <p v-if="loading">Loading your saved deals…</p>

    <p v-else-if="notLoggedIn">
      Please <RouterLink to="/login">log in</RouterLink> to see your saved deals.
    </p>

    <div v-else-if="errorMessage" class="alert alert-danger" role="alert">
      {{ errorMessage }}
      <button type="button" class="btn btn-sm btn-outline-danger ms-2" @click="loadBookmarks">
        Retry
      </button>
    </div>

    <p v-else-if="bookmarks.length === 0" class="text-secondary">
      You haven't saved any deals yet.
    </p>

    <div v-else>
      <p v-if="removeError" class="text-danger" role="alert">{{ removeError }}</p>
      <ul class="list-unstyled d-grid gap-3">
        <li v-for="item in bookmarks" :key="item.id" class="card card-body">
          <div v-if="item.deal">
            <h2 class="h5">{{ item.deal.title }}</h2>
            <span class="badge text-bg-secondary mb-2">{{ item.deal.category }}</span>
            <p class="mb-2">{{ item.deal.description }}</p>
          </div>
          <p v-else class="text-secondary mb-2">This deal is no longer available.</p>
          <button
            type="button"
            class="btn btn-sm btn-outline-danger align-self-start"
            @click="removeBookmark(item.dealId)"
          >
            Remove
          </button>
        </li>
      </ul>
      <button v-if="nextCursor" type="button" class="btn btn-outline-secondary" @click="loadMore">
        Load more
      </button>
    </div>
  </section>
</template>