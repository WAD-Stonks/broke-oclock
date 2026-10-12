import type {
  ChangePlatformRoleBody,
  MerchantRequest,
  MerchantRequestsQuery,
  PlatformAccountResponse,
  PlatformAccountSummary,
  PlatformAccountsQuery,
  PlatformAuditEntry,
  PlatformAuditQuery,
  PlatformRole,
  PlatformVenue,
  ReviewMerchantRequestBody,
} from '@broke-oclock/contracts/platform-admin'
import { createAdminReadFence } from '@web/lib/admin-session'
import { api } from '@web/lib/api-client'
import { authClient } from '@web/lib/auth-client'
import { errorCode } from '@web/modules/ingestion-admin/errors'
import { queryState } from '@web/modules/platform-admin/query-state'
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

function mergeItems<T extends { id: string }>(previous: T[], incoming: T[]): T[] {
  return [...new Map([...previous, ...incoming].map((item) => [item.id, item])).values()]
}

type Page<T> = { items: T[]; nextCursor: string | null }
export function usePlatformAdmin(
  initialRequestStatus: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING',
) {
  const fence = createAdminReadFence()
  const nativeFence = createAdminReadFence()
  const logoutStarting = (event: Event) => {
    if ((event.target as Element)?.closest('[data-testid="admin-sign-out"]'))
      nativeFence.invalidate()
  }
  const sessionRefreshKey = ref(0)
  const access = ref('loading')
  const busy = ref(false)
  const notice = ref('')
  const accountError = ref('')
  const staleAccounts = reactive(new Set<string>())
  // Keep accepted version evidence even while details are cleared or filters change.
  const accountVersions = new Map<string, number>()
  const observeAccount = (record: { id: string; version: number }) => {
    const version = Math.max(accountVersions.get(record.id) ?? record.version, record.version)
    accountVersions.set(record.id, version)
    return version
  }
  const denied = (code: string) => {
    fence.invalidate()
    access.value = code
    busy.value = false
    notice.value = ''
    for (const query of queries) query.invalidate()
    selectedId.value = ''
    selectedRequest.value = null
    resetRequestForm()
    resetAccountForm()
    accountError.value = ''
    requestError.value = ''
    venueId.value = ''
    grantId.value = ''
    venueSearch.value = ''
    accountSearch.value = ''
    roleFilter.value = ''
    auditUser.value = ''
    action.value = 'role'
    newRole.value = 'USER'
    decision.value = 'APPROVE'
    staleAccounts.clear()
    staleRequests.clear()
    accountVersions.clear()
    accountFilters = { limit: 20 }
    venueFilter = { limit: 20 }
    auditFilter = { limit: 20 }
  }
  const close = () => denied('closed')
  const anonymous = () => denied('UNAUTHORIZED')
  const accounts = queryState<Page<PlatformAccountSummary>>(denied)
  const detail = queryState<PlatformAccountResponse>(denied)
  const requests = queryState<Page<MerchantRequest>>(denied)
  const audit = queryState<Page<PlatformAuditEntry>>(denied)
  const venues = queryState<Page<PlatformVenue>>(denied)
  const queries = [accounts, detail, requests, audit, venues]
  const requestStatus = ref<NonNullable<MerchantRequestsQuery['status']>>(initialRequestStatus)
  const selectedRequest = ref<MerchantRequest | null>(null)
  const requestNote = ref('')
  const requestConfirmed = ref(false)
  const decision = ref<ReviewMerchantRequestBody['decision']>('APPROVE')
  const requestError = ref('')
  const staleRequests = reactive(new Set<string>())
  const resetRequestForm = () => {
    requestNote.value = ''
    requestConfirmed.value = false
  }
  watch(decision, resetRequestForm, { flush: 'sync' })
  const selectRequest = (id: string) => {
    if (busy.value) return
    selectedRequest.value = requests.state.data?.items.find((item) => item.id === id) ?? null
    resetRequestForm()
    requestError.value = ''
  }
  const selectedId = ref('')
  const action = ref<'role' | 'grant' | 'revoke'>('role')
  const venueSearch = ref('')
  const venueId = ref('')
  const grantId = ref('')
  const newRole = ref<PlatformRole>('USER')
  const note = ref('')
  const confirmed = ref(false)
  const resetAccountForm = () => {
    note.value = ''
    confirmed.value = false
  }
  watch([newRole, action, venueId, grantId], resetAccountForm, { flush: 'sync' })
  let venueFilter: Pick<PlatformAccountsQuery, 'cursor' | 'limit' | 'search'> = { limit: 20 }
  const loadVenues = async (more = false) => {
    if (busy.value) return
    const previous = more ? venues.state.data : null
    if (more && (!previous?.nextCursor || venues.state.loading)) return
    if (!more) {
      venueFilter = {
        limit: 20,
        ...(venueSearch.value.trim() ? { search: venueSearch.value.trim() } : {}),
      }
      venueId.value = ''
    }
    resetAccountForm()
    const input = {
      ...venueFilter,
      ...(previous?.nextCursor ? { cursor: previous.nextCursor } : {}),
    }
    const evidence = await venues.load(async () => {
      const page = await api.platformAdmin.venues(input)
      return { ...page, items: mergeItems(previous?.items ?? [], page.items) }
    }, !more)
    if (evidence) resetAccountForm()
  }
  const chosenVenue = computed(() =>
    venues.state.data?.items.find((item) => item.id === venueId.value),
  )
  const chosenGrant = computed(() =>
    detail.state.data?.grants.find((item) => item.id === grantId.value),
  )
  const actionLabel = computed(() =>
    action.value === 'role'
      ? 'Change role'
      : action.value === 'grant'
        ? 'Grant stall access'
        : 'Revoke stall access',
  )
  const actionTarget = computed(() =>
    action.value === 'role'
      ? newRole.value
      : action.value === 'grant'
        ? chosenVenue.value?.name
        : chosenGrant.value?.venueName,
  )
  const actionValid = computed(() =>
    action.value === 'role'
      ? newRole.value !== detail.state.data?.role
      : action.value === 'grant'
        ? detail.state.data?.role === 'MERCHANT' &&
          !!chosenVenue.value &&
          !venues.state.loading &&
          !venues.state.error &&
          !detail.state.data.grants.some((grant) => grant.venueId === venueId.value)
        : !!chosenGrant.value,
  )
  const accountSearch = ref('')
  const roleFilter = ref<PlatformRole | ''>('')
  let accountFilters: PlatformAccountsQuery = { limit: 20 }
  const loadAccounts = async (more = false) => {
    const previous = more ? accounts.state.data : null
    if (more && (!previous?.nextCursor || accounts.state.loading)) return
    const input = {
      ...accountFilters,
      ...(previous?.nextCursor ? { cursor: previous.nextCursor } : {}),
    }
    let fetched: PlatformAccountSummary[] = []
    const result = await accounts.load(async () => {
      const page = await api.platformAdmin.accounts(input)
      fetched = page.items
      return { ...page, items: mergeItems(previous?.items ?? [], page.items) }
    }, !more)
    if (result) for (const item of fetched) observeAccount(item)
    const current = detail.state.data
    const evidence = result && current ? fetched.find((item) => item.id === current.id) : undefined
    if (
      current &&
      evidence &&
      evidence.version >= current.version &&
      (evidence.version !== current.version ||
        evidence.role !== current.role ||
        evidence.name !== current.name ||
        evidence.email !== current.email)
    ) {
      staleAccounts.add(current.id)
      resetAccountForm()
      accountError.value = 'Account evidence changed. Reload the account before trying again.'
    }
    return result
  }
  const searchAccounts = () => {
    if (busy.value) return
    accountFilters = {
      limit: 20,
      ...(accountSearch.value.trim() ? { search: accountSearch.value.trim() } : {}),
      ...(roleFilter.value ? { role: roleFilter.value } : {}),
    }
    return loadAccounts()
  }
  const loadRequests = async (more = false) => {
    const previous = more ? requests.state.data : null
    if (more && (!previous?.nextCursor || requests.state.loading)) return
    if (!more) resetRequestForm()
    const input: MerchantRequestsQuery = {
      status: requestStatus.value,
      limit: 20,
      ...(previous?.nextCursor ? { cursor: previous.nextCursor } : {}),
    }
    let fetched: MerchantRequest[] = []
    const result = await requests.load(async () => {
      const page = await api.platformAdmin.requests(input)
      fetched = page.items
      return { ...page, items: mergeItems(previous?.items ?? [], page.items) }
    }, !more)
    if (result) {
      for (const item of fetched) staleRequests.delete(item.id)
      if (selectedRequest.value) {
        const evidence = fetched.find((item) => item.id === selectedRequest.value?.id)
        if (evidence || !more) {
          selectedRequest.value = evidence ?? null
          resetRequestForm()
          requestError.value = ''
        }
      }
    }
  }
  watch(
    requestStatus,
    () => {
      requests.invalidate()
      selectedRequest.value = null
      resetRequestForm()
      if (access.value === 'allowed') void loadRequests()
    },
    { flush: 'sync' },
  )
  const auditUser = ref('')
  let auditFilter: PlatformAuditQuery = { limit: 20 }
  const loadAudit = (more = false) => {
    const previous = more ? audit.state.data : null
    if (more && (!previous?.nextCursor || audit.state.loading)) return
    return audit.load(async () => {
      const result = await api.platformAdmin.audit({
        ...auditFilter,
        ...(previous?.nextCursor ? { cursor: previous.nextCursor } : {}),
      })
      return { ...result, items: mergeItems(previous?.items ?? [], result.items) }
    }, !more)
  }
  const filterAudit = () => {
    if (busy.value) return
    auditFilter = {
      limit: 20,
      ...(auditUser.value.trim() ? { userId: auditUser.value.trim() } : {}),
    }
    return loadAudit()
  }
  const viewAccountAudit = () => {
    if (busy.value || !detail.state.data) return
    auditUser.value = detail.state.data.id
    return filterAudit()
  }
  const loadDetail = async (id: string) => {
    resetAccountForm()
    accountError.value = ''
    venueId.value = ''
    grantId.value = ''
    const record = await detail.load(() => api.platformAdmin.account(id), true)
    if (record) {
      if (record.version < observeAccount(record)) {
        staleAccounts.add(record.id)
        accountError.value = 'Account evidence changed. Reload the account before trying again.'
      } else staleAccounts.delete(record.id)
      newRole.value = record.role
    }
  }
  const selectAccount = async (id: string) => {
    if (busy.value) return
    selectedId.value = id
    await loadDetail(id)
  }
  const loadAuthorizedPage = async () => {
    close()
    const ticket = fence.begin()
    access.value = 'loading'
    const probe = nativeFence.begin()
    try {
      const identity = await authClient.getSession({ query: { disableCookieCache: true } })
      if (!nativeFence.current(probe)) return
      if (identity.error) {
        close()
        return
      }
      if (!identity.data?.user) {
        if (access.value === 'closed' || access.value === 'loading') anonymous()
        return
      }
      if (!fence.current(ticket)) return
    } catch {
      if (nativeFence.current(probe) && fence.current(ticket)) close()
      return
    }
    const result = await loadAccounts()
    if (!fence.current(ticket)) return
    if (!result) {
      if (access.value === 'loading') access.value = 'error'
      return
    }
    access.value = 'allowed'
    await Promise.all([loadRequests(), loadAudit()])
  }
  const load = () => {
    if (!busy.value) return loadAuthorizedPage()
  }
  const recheckMutationAccess = async (refusal: string) => {
    // FORBIDDEN may reject one operation (for example, changing your own role).
    // Clear protected evidence first; the accounts query rechecks the actor's ADMIN
    // role against the database, even when the filtered page contains no accounts.
    denied('loading')
    await loadAuthorizedPage()
    if (access.value === 'allowed') notice.value = refusal
  }
  const refresh = async () => {
    await Promise.all([
      loadAccounts(),
      loadRequests(),
      loadAudit(),
      ...(selectedId.value ? [loadDetail(selectedId.value)] : []),
    ])
  }
  const accountReady = computed(
    () =>
      access.value === 'allowed' &&
      !busy.value &&
      !detail.state.loading &&
      !!detail.state.data &&
      !staleAccounts.has(detail.state.data.id) &&
      !!note.value.trim() &&
      note.value.trim().length <= 500 &&
      confirmed.value,
  )
  const submitAccountAction = async () => {
    const record = detail.state.data
    if (!record || !accountReady.value || !actionValid.value) return
    const currentAction = action.value
    const currentNote = note.value.trim()
    const roleInput: ChangePlatformRoleBody = {
      expectedVersion: record.version,
      role: newRole.value,
      note: currentNote,
    }
    const grantInput = {
      userId: record.id,
      expectedUserVersion: record.version,
      venueId: venueId.value,
      note: currentNote,
    }
    const grant = chosenGrant.value
    const ticket = fence.begin()
    busy.value = true
    notice.value = ''
    accountError.value = ''
    try {
      if (currentAction === 'role') await api.platformAdmin.changeRole(record.id, roleInput)
      else if (currentAction === 'grant') await api.platformAdmin.grantStall(grantInput)
      else if (grant)
        await api.platformAdmin.revokeStall(grant.id, {
          expectedVersion: grant.version,
          note: currentNote,
        })
      if (!fence.current(ticket)) return
      resetAccountForm()
      await refresh()
      if (!fence.current(ticket)) return
      notice.value =
        'Account action completed. Check the panels below for the latest available evidence.'
    } catch (failure) {
      if (!fence.current(ticket)) return
      const code = errorCode(failure)
      if (code === 'UNAUTHORIZED') denied(code)
      else if (code === 'FORBIDDEN')
        await recheckMutationAccess(
          'Account action was refused. Select an account to review fresh evidence before trying another action.',
        )
      else {
        staleAccounts.add(record.id)
        accountError.value =
          'Action failed or account changed. Reload the account before trying again.'
        resetAccountForm()
      }
    } finally {
      if (fence.current(ticket)) busy.value = false
    }
  }
  const requestReady = computed(
    () =>
      access.value === 'allowed' &&
      !busy.value &&
      !requests.state.loading &&
      !requests.state.error &&
      selectedRequest.value?.status === 'PENDING' &&
      !staleRequests.has(selectedRequest.value.id) &&
      !!requestNote.value.trim() &&
      requestNote.value.trim().length <= 500 &&
      requestConfirmed.value,
  )
  const reviewRequest = async () => {
    const record = selectedRequest.value
    if (!record || !requestReady.value) return
    const input: ReviewMerchantRequestBody = {
      expectedVersion: record.version,
      decision: decision.value,
      note: requestNote.value.trim(),
    }
    const ticket = fence.begin()
    busy.value = true
    notice.value = ''
    requestError.value = ''
    try {
      await api.platformAdmin.reviewRequest(record.id, input)
      if (!fence.current(ticket)) return
      resetRequestForm()
      await refresh()
      if (!fence.current(ticket)) return
      notice.value = 'Request reviewed. Check the panels below for the latest available evidence.'
    } catch (failure) {
      if (!fence.current(ticket)) return
      const code = errorCode(failure)
      if (code === 'UNAUTHORIZED') denied(code)
      else if (code === 'FORBIDDEN')
        await recheckMutationAccess(
          'Request review was refused. Select a request to review fresh evidence before trying another action.',
        )
      else {
        staleRequests.add(record.id)
        requestError.value =
          'Action failed or request changed. Reload requests before trying again.'
        resetRequestForm()
      }
    } finally {
      if (fence.current(ticket)) busy.value = false
    }
  }
  const signedIn = () => {
    sessionRefreshKey.value++
    void loadAuthorizedPage()
  }
  onMounted(load)
  onUnmounted(() => {
    fence.dispose()
    nativeFence.dispose()
    for (const query of queries) query.invalidate()
  })
  return reactive({
    close,
    anonymous,
    signedIn,
    sessionRefreshKey,
    logoutStarting,
    access,
    busy,
    notice,
    accounts: accounts.state,
    detail: detail.state,
    requests: requests.state,
    audit: audit.state,
    selectedId,
    newRole,
    note,
    confirmed,
    accountError,
    accountReady,
    staleAccounts,
    load,
    selectAccount,
    submitAccountAction,
    action,
    venueSearch,
    venueId,
    grantId,
    chosenVenue,
    chosenGrant,
    actionLabel,
    actionTarget,
    actionValid,
    venues: venues.state,
    loadVenues,
    requestStatus,
    selectedRequest,
    requestNote,
    requestConfirmed,
    decision,
    requestError,
    staleRequests,
    selectRequest,
    requestReady,
    reviewRequest,
    loadRequests: (more = false) => {
      if (!busy.value) return loadRequests(more)
    },
    accountSearch,
    roleFilter,
    searchAccounts,
    loadAccounts: (more = false) => {
      if (!busy.value) return loadAccounts(more)
    },
    auditUser,
    filterAudit,
    viewAccountAudit,
    loadAudit: (more = false) => {
      if (!busy.value) return loadAudit(more)
    },
  })
}
