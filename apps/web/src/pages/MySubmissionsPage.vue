<script setup lang="ts">
import type { Submission } from '@broke-oclock/contracts/account'
import { api } from '@web/lib/api-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

const submissions = ref<Submission[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(true)
const notLoggedIn = ref(false)
const errorMessage = ref('')

// Which Bootstrap colour to use for each review status
const badgeClass: Record<string, string> = {
  PENDING: 'text-bg-warning',
  APPROVED: 'text-bg-success',
  REJECTED: 'text-bg-danger',
  HIDDEN: 'text-bg-secondary',
}

const loadSubmissions = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await api.account.submissions()
    submissions.value = result.items
    nextCursor.value = result.nextCursor
  } catch (error) {
    if (errorCode(error) === 'UNAUTHORIZED') {
      notLoggedIn.value = true
    } else {
      errorMessage.value = 'Could not load your submissions. Please try again.'
    }
  } finally {
    loading.value = false
  }
}

const loadMore = async () => {
  if (!nextCursor.value) return
  try {
    const result = await api.account.submissions({ cursor: nextCursor.value })
    submissions.value = [...submissions.value, ...result.items]
    nextCursor.value = result.nextCursor
  } catch {
    errorMessage.value = 'Could not load more submissions. Please try again.'
  }
}

onMounted(loadSubmissions)
</script>

<template>
  <section class="container py-4">
    <h1 class="h2 mb-4">My submissions</h1>

    <p v-if="loading">Loading your submissions…</p>

    <p v-else-if="notLoggedIn">
      Please <RouterLink to="/login">log in</RouterLink> to see your submissions.
    </p>

    <div v-else-if="errorMessage" class="alert alert-danger" role="alert">
      {{ errorMessage }}
      <button type="button" class="btn btn-sm btn-outline-danger ms-2" @click="loadSubmissions">
        Retry
      </button>
    </div>

    <p v-else-if="submissions.length === 0" class="text-secondary">
      You haven't submitted any deals yet.
    </p>

    <div v-else>
      <ul class="list-unstyled d-grid gap-3">
        <li v-for="item in submissions" :key="item.id" class="card card-body">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <h2 class="h5 mb-1">{{ item.title }}</h2>
              <p class="small text-secondary mb-0">
                {{ item.category }} · submitted {{ new Date(item.createdAt).toLocaleDateString() }}
              </p>
              <p v-if="item.reviewNote" class="mt-2 mb-0">Reviewer note: {{ item.reviewNote }}</p>
            </div>
            <span class="badge" :class="badgeClass[item.reviewStatus]">{{ item.reviewStatus }}</span>
          </div>
        </li>
      </ul>
      <button v-if="nextCursor" type="button" class="btn btn-outline-secondary" @click="loadMore">
        Load more
      </button>
    </div>
  </section>
</template>
