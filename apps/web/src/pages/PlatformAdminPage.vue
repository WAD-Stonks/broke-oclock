<script setup lang="ts">
import AdminShell from '@web/components/admin/AdminShell.vue'
import SharedSignIn from '@web/components/auth/SharedSignIn.vue'
import { usePlatformAdmin } from '@web/modules/platform-admin/use-platform-admin'
import { inject, watch } from 'vue'
import { routeLocationKey } from 'vue-router'

const route = inject(routeLocationKey, null)
const status = (value: unknown): 'PENDING' | 'APPROVED' | 'REJECTED' => value === 'APPROVED' || value === 'REJECTED' ? value : 'PENDING'
const s = usePlatformAdmin(status(route?.query.requestStatus))
watch(() => route?.query.requestStatus, value => { s.requestStatus = status(value) }, { flush: 'sync' })
</script>
<template>
  <AdminShell @click.capture="s.logoutStarting" title="Platform admin" :refresh-key="s.sessionRefreshKey" @closing="s.close" @signed-out="s.anonymous" @access-reload="s.load">
  <section aria-label="Platform administration" class="platform-admin">
    <p>Manage account roles and explicit stall access. Permissions are checked against the current server record for every action.</p>
    <p>Account deletion is unavailable pending the retention and anonymisation policy.</p>
    <p v-if="s.access === 'loading'" role="status">Loading accounts…</p>
    <SharedSignIn v-else-if="s.access === 'UNAUTHORIZED'" title="Sign in to manage accounts" destination="/admin/accounts" @signed-in="s.signedIn" />
    <p v-else-if="s.access === 'closed'" role="status">Access is closed. Use the session controls to retry or recheck.</p>
    <p v-else-if="s.access === 'FORBIDDEN'" role="alert">You do not have permission to manage platform accounts.</p>
    <div v-else-if="s.access === 'error'" role="alert">
      <p>Unable to load platform administration.</p><button type="button" class="btn btn-outline-primary" data-testid="retry-platform-admin" @click="s.load">Retry platform admin</button>
    </div>
    <template v-else-if="s.access === 'allowed'">
      <p v-if="s.notice" role="status">{{ s.notice }}</p>
      <section aria-label="Accounts" class="card p-3 mb-3">
        <h2 class="h4">Accounts</h2>
        <form id="account-search-form" @submit.prevent="s.searchAccounts" class="mb-3">
          <fieldset :disabled="s.busy">
            <label for="account-search" class="form-label">Search accounts</label><input id="account-search" v-model="s.accountSearch" maxlength="100" class="form-control mb-2" />
            <label for="account-role-filter" class="form-label">Account role filter</label><select id="account-role-filter" v-model="s.roleFilter" class="form-select mb-2"><option value="">All roles</option><option>USER</option><option>MERCHANT</option><option>MODERATOR</option><option>ADMIN</option></select>
            <button class="btn btn-outline-primary" type="submit">Search accounts</button>
          </fieldset>
        </form>
        <p v-if="s.accounts.loading" role="status">Loading accounts…</p>
        <p v-if="s.accounts.error" role="alert">{{ s.accounts.error }}</p>
        <p v-if="!s.accounts.loading && !s.accounts.error && !s.accounts.data?.items.length">No accounts match these filters.</p>
        <ul class="list-unstyled">
          <li v-for="account in s.accounts.data?.items" :key="account.id" class="mb-2">
            <button type="button" class="btn btn-outline-primary text-start" :data-testid="`account-${account.id}`" :disabled="s.busy" @click="s.selectAccount(account.id)">View account: {{ account.name }} ({{ account.email }})</button>
            <span class="ms-2">{{ account.role }}</span>
          </li>
        </ul>
        <button type="button" v-if="s.accounts.data?.nextCursor" data-testid="more-accounts" class="btn btn-outline-secondary" :disabled="s.busy || s.accounts.loading" @click="s.loadAccounts(true)">Load more accounts</button>
      </section>
      <p v-if="s.detail.loading" role="status">Loading account details…</p>
      <p v-if="s.detail.error" role="alert">{{ s.detail.error }}</p>
      <button type="button" v-if="s.selectedId" data-testid="reload-account" class="btn btn-outline-secondary mb-3" :disabled="s.busy || s.detail.loading" @click="s.selectAccount(s.selectedId)">Reload account</button>
      <section v-if="s.detail.data" aria-label="Account details" class="card p-3 mb-3">
        <h2 class="h4">{{ s.detail.data.name }}</h2>
        <p>{{ s.detail.data.email }} | {{ s.detail.data.role }} | Version {{ s.detail.data.version }}</p>
        <p>Account ID: {{ s.detail.data.id }}</p>
        <p>Created {{ s.detail.data.createdAt }}</p>
        <button type="button" data-testid="account-audit" class="btn btn-outline-secondary mb-3" :disabled="s.busy" @click="s.viewAccountAudit">View this account's audit</button>
        <p v-if="s.accountError" role="alert">{{ s.accountError }}</p>
        <h3 class="h5">Active stall grants</h3>
        <p v-if="!s.detail.data.grants.length">No active stall grants.</p>
        <ul><li v-for="grant in s.detail.data.grants" :key="grant.id">{{ grant.venueName }} / {{ grant.merchantName }} | Version {{ grant.version }} | {{ grant.createdAt }}</li></ul>
        <label for="account-action" class="form-label">Account action</label>
        <select id="account-action" v-model="s.action" :disabled="s.busy" class="form-select mb-3"><option value="role">Change role</option><option value="grant" :disabled="s.detail.data.role !== 'MERCHANT'">Grant stall access</option><option value="revoke">Revoke stall access</option></select>
        <div v-if="s.action === 'grant'">
          <p>A MERCHANT role alone grants no stall access. Choose one existing stall. You cannot grant yourself access.</p>
          <form id="venue-search-form" @submit.prevent="s.loadVenues()" class="mb-3">
            <label for="venue-search" class="form-label">Search existing stalls</label>
            <input id="venue-search" v-model="s.venueSearch" :disabled="s.busy" class="form-control mb-2" maxlength="100" />
            <button type="submit" class="btn btn-outline-primary" :disabled="s.busy">Search stalls</button>
          </form>
          <button type="button" v-if="s.venues.data?.nextCursor" data-testid="more-venues" class="btn btn-outline-secondary mb-3" :disabled="s.busy || s.venues.loading" @click="s.loadVenues(true)">Load more stalls</button>
          <p v-if="s.venues.loading" role="status">Loading stalls…</p>
          <p v-if="s.venues.error" role="alert">{{ s.venues.error }}</p>
          <p v-if="s.venues.data && !s.venues.data.items.length">No existing stalls match this search.</p>
        </div>
        <form id="account-action-form" @submit.prevent="s.submitAccountAction">
          <fieldset :disabled="s.busy || s.detail.loading">
            <template v-if="s.action === 'role'">
            <label for="new-role" class="form-label">New role</label>
            <select id="new-role" v-model="s.newRole" class="form-select mb-3"><option>USER</option><option>MERCHANT</option><option>MODERATOR</option><option>ADMIN</option></select>
            <p>Changing away from MERCHANT revokes outstanding stall grants. You cannot change your own role. The server protects the final administrator.</p>
            </template>
            <template v-if="s.action === 'grant'">
              <label for="venue-choice" class="form-label">Stall to grant</label>
              <select id="venue-choice" v-model="s.venueId" :disabled="s.venues.loading" class="form-select mb-3"><option value="">Choose a stall</option><option v-for="venue in s.venues.data?.items" :key="venue.id" :value="venue.id">{{ venue.name }} / {{ venue.merchantName }} / {{ venue.address }}</option></select>
            </template>
            <template v-if="s.action === 'revoke'">
              <label for="grant-choice" class="form-label">Active grant to revoke</label>
              <select id="grant-choice" v-model="s.grantId" class="form-select mb-3"><option value="">Choose an active grant</option><option v-for="grant in s.detail.data.grants" :key="grant.id" :value="grant.id">{{ grant.venueName }} / {{ grant.merchantName }}</option></select>
            </template>
            <label for="account-note" class="form-label">Account action note (required)</label>
            <textarea id="account-note" v-model="s.note" required maxlength="500" class="form-control mb-3" />
            <label class="d-block mb-3"><input id="account-confirm" v-model="s.confirmed" type="checkbox" /> Confirm {{ s.actionLabel }} for {{ s.detail.data.email }}: {{ s.actionTarget }}</label>
            <button type="submit" class="btn btn-primary" :disabled="!s.accountReady || !s.actionValid">{{ s.actionLabel }}</button>
          </fieldset>
        </form>
      </section>
      <section aria-label="Merchant requests" class="card p-3 mb-3">
        <h2 id="merchant-requests" class="h4">Merchant requests</h2>
        <label for="request-status" class="form-label">Request status</label>
        <select id="request-status" v-model="s.requestStatus" :disabled="s.busy" class="form-select mb-3"><option>PENDING</option><option>APPROVED</option><option>REJECTED</option></select>
        <p v-if="s.requests.loading" role="status">Loading requests…</p>
        <p v-if="s.requests.error" role="alert">{{ s.requests.error }}</p>
        <button type="button" class="btn btn-outline-secondary mb-3" :disabled="s.busy || s.requests.loading" data-testid="reload-requests" @click="s.loadRequests()">Reload requests</button>
        <p v-if="!s.requests.loading && !s.requests.error && !s.requests.data?.items.length">No requests match this status.</p>
        <ul class="list-unstyled"><li v-for="request in s.requests.data?.items" :key="request.id" class="mb-2"><button type="button" class="btn btn-outline-primary text-start" :data-testid="`request-${request.id}`" :disabled="s.busy" @click="s.selectRequest(request.id)">Review request: {{ request.userName }} / {{ request.venueName }} ({{ request.status }})</button></li></ul>
        <button type="button" v-if="s.requests.data?.nextCursor" data-testid="more-requests" class="btn btn-outline-secondary mb-3" :disabled="s.busy || s.requests.loading" @click="s.loadRequests(true)">Load more requests</button>
        <article v-if="s.selectedRequest" aria-label="Request details" class="border-top pt-3">
          <h3 class="h5">{{ s.selectedRequest.venueName }} / {{ s.selectedRequest.merchantName }}</h3>
          <p>{{ s.selectedRequest.userName }} ({{ s.selectedRequest.userEmail }})</p>
          <p>{{ s.selectedRequest.message }}</p>
          <p>Status: {{ s.selectedRequest.status }} | Version {{ s.selectedRequest.version }} | {{ s.selectedRequest.createdAt }}</p>
          <p v-if="s.selectedRequest.reviewNote">Review note: {{ s.selectedRequest.reviewNote }}</p>
          <p v-if="s.requestError || s.staleRequests.has(s.selectedRequest.id)" role="alert">{{ s.requestError || 'Request changed. Reload requests before trying again.' }}</p>
          <form v-if="s.selectedRequest.status === 'PENDING'" id="request-form" @submit.prevent="s.reviewRequest">
            <fieldset :disabled="s.busy || s.requests.loading">
              <label for="request-decision" class="form-label">Request decision</label>
              <select id="request-decision" v-model="s.decision" class="form-select mb-3"><option value="APPROVE">Approve</option><option value="REJECT">Reject</option></select>
              <p>Approval grants only this named stall. An eligible USER becomes MERCHANT. Existing staff roles are not silently downgraded.</p>
              <label for="request-note" class="form-label">Request review note (required)</label>
              <textarea id="request-note" v-model="s.requestNote" class="form-control mb-3" maxlength="500" required />
              <label class="d-block mb-3"><input id="request-confirm" v-model="s.requestConfirmed" type="checkbox" /> Confirm {{ s.decision }} for {{ s.selectedRequest.userEmail }} at {{ s.selectedRequest.venueName }}</label>
              <button class="btn btn-primary" type="submit" :disabled="!s.requestReady">{{ s.decision === 'APPROVE' ? 'Approve request' : 'Reject request' }}</button>
            </fieldset>
          </form>
        </article>
      </section>
      <section aria-label="Audit history" class="card p-3 mb-3">
        <h2 class="h4">Audit history</h2>
        <form id="audit-filter-form" @submit.prevent="s.filterAudit" class="mb-3">
          <label for="audit-user" class="form-label">Audit target account ID (blank for all)</label>
          <input id="audit-user" v-model="s.auditUser" :disabled="s.busy" class="form-control mb-2" maxlength="100" />
          <button class="btn btn-outline-primary" :disabled="s.busy" type="submit">Filter audit</button>
        </form>
        <p v-if="s.audit.loading" role="status">Loading audit history…</p>
        <p v-if="s.audit.error" role="alert">{{ s.audit.error }}</p>
        <p v-if="!s.audit.loading && !s.audit.error && !s.audit.data?.items.length">No audit events match this filter.</p>
        <ul class="list-unstyled"><li v-for="event in s.audit.data?.items" :key="event.id" class="border-top py-3">
          <p class="fw-semibold mb-1">{{ event.action }} <span v-if="event.roleBefore && event.roleAfter">{{ event.roleBefore }} → {{ event.roleAfter }}</span></p>
          <p class="mb-1">By {{ event.actorName }} ({{ event.actorId }}) for {{ event.targetUserId }}<span v-if="event.venueId"> | Stall {{ event.venueId }}</span></p>
          <p class="mb-1">{{ event.note }}</p><p class="small mb-0">{{ event.createdAt }}</p>
        </li></ul>
        <button type="button" v-if="s.audit.data?.nextCursor" data-testid="more-audit" class="btn btn-outline-secondary" :disabled="s.busy || s.audit.loading" @click="s.loadAudit(true)">Load more audit</button>
      </section>
    </template>
  </section>
  </AdminShell>
</template>
<style scoped>
.platform-admin { overflow-wrap: anywhere; }
.platform-admin button { white-space: normal; max-width: 100%; }
.platform-admin fieldset { min-width: 0; }
</style>
