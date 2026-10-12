<script setup lang="ts">
import type { AccountProfile } from '@broke-oclock/contracts/account'
import { BButton } from '@broke-oclock/ui'
import { api } from '@web/lib/api-client'
import { authClient } from '@web/lib/auth-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

const profile = ref<AccountProfile | null>(null)
const loading = ref(true)
const notLoggedIn = ref(false)
const errorMessage = ref('')

const name = ref('')
const saving = ref(false)
const saveError = ref('')
const saveNotice = ref('')

const roleLabel: Record<string, string> = {
  USER: 'Regular user',
  MERCHANT: 'Merchant',
  MODERATOR: 'Moderator',
  ADMIN: 'Platform admin',
}

const loadProfile = async () => {
  loading.value = true
  errorMessage.value = ''
  try {
    profile.value = await api.account.profile()
    name.value = profile.value.name
  } catch (error) {
    if (errorCode(error) === 'UNAUTHORIZED') {
      notLoggedIn.value = true
    } else {
      errorMessage.value = 'Could not load your profile. Please try again.'
    }
  } finally {
    loading.value = false
  }
}

// Only the display name is editable here. Email and role are never sent from this form.
const saveName = async () => {
  const trimmed = name.value.trim()
  saveError.value = ''
  saveNotice.value = ''
  if (trimmed.length < 1 || trimmed.length > 80) {
    saveError.value = 'Enter a name between 1 and 80 characters.'
    return
  }
  saving.value = true
  try {
    const result = await authClient.updateUser({ name: trimmed })
    if (result.error) {
      saveError.value = 'Could not update your name. Please try again.'
    } else {
      saveNotice.value = 'Name updated.'
      await loadProfile()
    }
  } catch {
    saveError.value = 'Could not update your name. Please try again.'
  } finally {
    saving.value = false
  }
}

onMounted(loadProfile)
</script>

<template>
  <section class="container py-4" aria-labelledby="profile-title">
    <h1 id="profile-title" class="h2 mb-4">My profile</h1>

    <p v-if="loading">Loading your profile…</p>
    <p v-else-if="notLoggedIn">Please <RouterLink to="/login">log in</RouterLink> to see your profile.</p>
    <div v-else-if="errorMessage" class="alert alert-danger" role="alert">
      {{ errorMessage }}
      <button type="button" class="btn btn-sm btn-outline-danger ms-2" @click="loadProfile">Retry</button>
    </div>

    <div v-else-if="profile" class="card card-body">
      <dl class="row mb-4">
        <dt class="col-sm-3">Email</dt>
        <dd class="col-sm-9">{{ profile.email }}</dd>
        <dt class="col-sm-3">Account type</dt>
        <dd class="col-sm-9">{{ roleLabel[profile.role] ?? profile.role }}</dd>
        <dt class="col-sm-3">Member since</dt>
        <dd class="col-sm-9">{{ new Date(profile.createdAt).toLocaleDateString() }}</dd>
      </dl>

      <form novalidate @submit.prevent="saveName">
        <label for="profile-name" class="form-label">Display name</label>
        <div class="input-group mb-2">
          <input id="profile-name" v-model="name" maxlength="80" class="form-control" :disabled="saving" />
          <BButton type="submit" variant="primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</BButton>
        </div>
        <p v-if="saveError" class="text-danger small mb-0" role="alert">{{ saveError }}</p>
        <p v-if="saveNotice" class="text-success small mb-0" role="status">{{ saveNotice }}</p>
      </form>

      <hr />
      <p class="mb-0 small">
        <RouterLink to="/saved">Saved deals</RouterLink> ·
        <RouterLink to="/me/submissions">My submissions</RouterLink> ·
        <RouterLink to="/me/merchant-access">Merchant access</RouterLink>
      </p>
    </div>
  </section>
</template>
