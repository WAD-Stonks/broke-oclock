import { flushPromises, mount } from '@vue/test-utils'
import type { RouterOutputs } from '@web/lib/api-client'
import DraftQueue from '@web/modules/ingestion-admin/DraftQueue.vue'
import IngestionAdminPage from '@web/pages/IngestionAdminPage.vue'
import { beforeEach, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => ({
  dashboard: vi.fn(),
  signIn: vi.fn(),
  runs: vi.fn(),
  run: vi.fn(),
  queue: vi.fn(),
  review: vi.fn(),
  locations: vi.fn(),
  accounts: vi.fn(),
}))
vi.mock('@web/lib/api-client', () => ({
  api: {
    ingestion: {
      dashboard: { query: rpc.dashboard },
      runs: { query: rpc.runs },
      run: { mutate: rpc.run },
      queue: { query: rpc.queue },
      review: { mutate: rpc.review },
      searchLocations: { query: rpc.locations },
      accounts: { query: rpc.accounts },
    },
  },
}))

vi.mock('@web/lib/auth-client', () => ({ authClient: { signIn: { email: rpc.signIn } } }))

const dashboard = {
  source: {
    name: 'Synthetic fixture source',
    enabled: false,
    reuseApproved: false,
    onemapConfigured: false,
  },
  counts: { pending: 3, approved: 4, rejected: 2, failed: 1 },
} satisfies RouterOutputs['ingestion']['dashboard']
beforeEach(() => {
  vi.resetAllMocks()
  rpc.dashboard.mockResolvedValue(dashboard)
  rpc.runs.mockResolvedValue({ items: [] })
  rpc.queue.mockResolvedValue({ items: [], nextCursor: null })
  rpc.accounts.mockResolvedValue({ items: [], nextCursor: null })
  rpc.locations.mockResolvedValue({ items: [] })
})

it('shows a sign-in form when the server denies anonymous access', async () => {
  rpc.dashboard.mockRejectedValue({ data: { code: 'UNAUTHORIZED' } })
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  expect(wrapper.text()).toContain('Sign in to review ingestion')
  expect(wrapper.find('input[type="email"]').exists()).toBe(true)
  expect(wrapper.find('input[type="password"]').exists()).toBe(true)
  expect(wrapper.find('[aria-label="Ingestion counts"]').exists()).toBe(false)
})

it('renders server counts and explains both disabled-source gates', async () => {
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  expect(wrapper.get('[aria-label="Ingestion counts"]').text()).toContain('3pending')
  expect(wrapper.text()).toContain('Synthetic fixture source')
  expect(wrapper.text()).toContain('Ingestion is disabled')
  expect(wrapper.text()).toContain('Content reuse is not approved')
  expect(wrapper.get('[data-testid="run-ingestion"]').attributes('disabled')).toBeDefined()
})

it('shows forbidden distinctly and recovers from a dashboard error', async () => {
  rpc.dashboard.mockRejectedValueOnce({ data: { code: 'FORBIDDEN' } })
  const denied = mount(IngestionAdminPage)
  await flushPromises()
  expect(denied.text()).toContain('You do not have permission')
  expect(denied.find('input[type="password"]').exists()).toBe(false)
  denied.unmount()
  rpc.dashboard.mockRejectedValueOnce(new Error('private implementation detail'))
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  expect(wrapper.text()).toContain('Unable to load ingestion')
  expect(wrapper.text()).not.toContain('private implementation detail')
  await wrapper.get('[data-testid="retry-dashboard"]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Synthetic fixture source')
})

it('uses shared Better Auth, clears the password, and retries authorized reads', async () => {
  rpc.dashboard.mockRejectedValueOnce({ data: { code: 'UNAUTHORIZED' } })
  rpc.signIn.mockResolvedValue({ error: null })
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  await wrapper.get('#admin-email').setValue('synthetic@example.test')
  await wrapper.get('#admin-password').setValue('synthetic-not-a-real-password')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
  expect(rpc.signIn).toHaveBeenCalledWith({
    email: 'synthetic@example.test',
    password: 'synthetic-not-a-real-password',
  })
  expect(rpc.dashboard).toHaveBeenCalledTimes(2)
  expect(wrapper.text()).toContain('Synthetic fixture source')
})

it('runs once while pending and refreshes actual dashboard and run reads', async () => {
  rpc.dashboard.mockResolvedValue({
    ...dashboard,
    source: { ...dashboard.source, enabled: true, reuseApproved: true },
  })
  rpc.runs.mockResolvedValue({
    items: [
      {
        id: 'run-1',
        sourceName: 'Synthetic fixture source',
        status: 'FAILED',
        startedAt: '2026-10-01T10:00:00Z',
        finishedAt: null,
        fetchedCount: 8,
        createdCount: 2,
        updatedCount: 1,
        failedCount: 5,
        errorCode: 'SOURCE_UNAVAILABLE',
      },
    ],
  })
  let complete: ((value: unknown) => void) | undefined
  rpc.run.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  )
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  expect(wrapper.text()).toContain('SOURCE_UNAVAILABLE')
  expect(rpc.runs).toHaveBeenCalledWith({ limit: 20 })
  await wrapper.get('[data-testid="run-ingestion"]').trigger('click')
  await wrapper.get('[data-testid="run-ingestion"]').trigger('click')
  expect(rpc.run).toHaveBeenCalledTimes(1)
  expect(wrapper.get('[data-testid="run-ingestion"]').attributes('disabled')).toBeDefined()
  complete?.({
    runId: 'run-2',
    status: 'COMPLETED',
    fetchedCount: 8,
    createdCount: 2,
    updatedCount: 1,
    failedCount: 0,
  })
  await flushPromises()
  expect(rpc.dashboard).toHaveBeenCalledTimes(2)
  expect(rpc.runs).toHaveBeenCalledTimes(2)
  expect(wrapper.text()).toContain('Run run-2: COMPLETED')
})

it('restores the run button after an API error without inventing success', async () => {
  rpc.dashboard.mockResolvedValue({
    ...dashboard,
    source: { ...dashboard.source, enabled: true, reuseApproved: true },
  })
  rpc.run.mockRejectedValue(new Error('private provider response'))
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  await wrapper.get('[data-testid="run-ingestion"]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Unable to run ingestion')
  expect(wrapper.text()).not.toContain('private provider response')
  expect(wrapper.get('[data-testid="run-ingestion"]').attributes('disabled')).toBeUndefined()
})

const draft: RouterOutputs['ingestion']['queue']['items'][number] = {
  id: 'draft-1',
  title: '<img src=x onerror=alert(1)> Synthetic deal',
  description: '<script>unsafe()</script>',
  terms: 'Fixture terms',
  category: 'FOOD',
  offerType: 'OTHER',
  validFrom: null,
  validUntil: null,
  rawValidityText: 'While stocks last',
  applicability: 'NO_FIXED_LOCATION',
  reviewStatus: 'PENDING',
  contentVersion: 7,
  sourceUrl: 'https://example.test/post/1',
  sourceName: 'Synthetic source',
  reviewNote: null,
  reviewReady: true,
}

it('renders escaped attributed draft details and rejects with a required note and current version', async () => {
  rpc.queue.mockResolvedValueOnce({ items: [draft], nextCursor: null })
  rpc.review.mockResolvedValue({ id: draft.id, reviewStatus: 'REJECTED' })
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  expect(rpc.queue).toHaveBeenCalledWith({ limit: 20, status: 'PENDING' })
  await wrapper.get('[data-testid="view-draft-1"]').trigger('click')
  expect(wrapper.text()).toContain(draft.description)
  expect(wrapper.find('script').exists()).toBe(false)
  expect(wrapper.find('img').exists()).toBe(false)
  expect(wrapper.get('[data-testid="draft-source"]').attributes('rel')).toBe('noopener noreferrer')
  expect(wrapper.get('[data-testid="draft-source"]').attributes('href')).toBe(draft.sourceUrl)
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeDefined()
  await wrapper.get('#review-note').setValue('Not enough confirmed validity information')
  await wrapper.get('[data-testid="reject-draft"]').trigger('click')
  await flushPromises()
  expect(rpc.review).toHaveBeenCalledWith({
    dealId: draft.id,
    expectedContentVersion: 7,
    decision: 'REJECT',
    note: 'Not enough confirmed validity information',
  })
  expect(rpc.queue).toHaveBeenCalledTimes(2)
  expect(rpc.dashboard).toHaveBeenCalledTimes(2)
  expect(wrapper.text()).toContain('Draft rejected')
  expect(wrapper.text()).toContain('No drafts match this status')
})

it('disables approval for unknown or expired validity, and never links unsafe URLs', async () => {
  rpc.queue.mockResolvedValue({
    items: [{ ...draft, sourceUrl: 'javascript:alert(1)' }],
    nextCursor: null,
  })
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  await wrapper.get('[data-testid="view-draft-1"]').trigger('click')
  await wrapper.get('#review-note').setValue('Checked the source')
  expect(wrapper.get('[data-testid="approve-draft"]').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain('Approval requires known validity dates')
  expect(wrapper.find('[data-testid="draft-source"]').exists()).toBe(false)
  await wrapper.get('[data-testid="approve-draft"]').trigger('click')
  expect(rpc.review).not.toHaveBeenCalled()
})

it('filters the queue using server status and preserves review notes on failure', async () => {
  rpc.queue.mockResolvedValue({ items: [draft], nextCursor: null })
  rpc.review.mockRejectedValue(new Error('private DB error'))
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  await wrapper.get('#queue-status').setValue('REJECTED')
  await flushPromises()
  expect(rpc.queue).toHaveBeenLastCalledWith({ limit: 20, status: 'REJECTED' })
  await wrapper.get('#queue-status').setValue('PENDING')
  await flushPromises()
  await wrapper.get('[data-testid="view-draft-1"]').trigger('click')
  await wrapper.get('#review-note').setValue('Keep this review note')
  await wrapper.get('[data-testid="reject-draft"]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Unable to review draft')
  expect(wrapper.get('#review-note').element).toHaveProperty('value', 'Keep this review note')
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeUndefined()
})

it.each([
  ['2000-01-01T00:00:00Z', '2000-01-02T00:00:00Z', 'This offer has expired'],
  ['invalid', '2099-12-01T00:00:00Z', 'Validity dates are invalid'],
  ['2099-12-01T00:00:00Z', '2099-01-01T00:00:00Z', 'Validity dates are invalid'],
  ['2099-01-01T00:00:00Z', '2099-01-01T00:00:00Z', 'Validity dates are invalid'],
])('blocks unsafe validity %s → %s', async (validFrom, validUntil, reason) => {
  rpc.queue.mockResolvedValue({ items: [{ ...draft, validFrom, validUntil }], nextCursor: null })
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  await wrapper.get('[data-testid="view-draft-1"]').trigger('click')
  await wrapper.get('#review-note').setValue('Checked source')
  expect(wrapper.text()).toContain(reason)
  expect(wrapper.get('[data-testid="approve-draft"]').attributes('disabled')).toBeDefined()
})

it('approves known validity once and displays a stale-content conflict with a reload action', async () => {
  rpc.queue.mockResolvedValue({
    items: [{ ...draft, validFrom: '2099-01-01T00:00:00Z', validUntil: '2099-12-01T00:00:00Z' }],
    nextCursor: null,
  })
  rpc.review
    .mockRejectedValueOnce({ data: { code: 'CONFLICT' } })
    .mockResolvedValue({ id: draft.id, reviewStatus: 'APPROVED' })
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  await wrapper.get('[data-testid="view-draft-1"]').trigger('click')
  await wrapper.get('#review-note').setValue('Verified dated source')
  await wrapper.get('article form').trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('Content changed. Reload the draft before reviewing again')
  expect(wrapper.get('[data-testid="view-draft-1"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('[data-testid="approve-draft"]').attributes('disabled')).toBeDefined()
  rpc.queue.mockResolvedValueOnce({
    items: [
      {
        ...draft,
        contentVersion: 8,
        validFrom: '2099-01-01T00:00:00Z',
        validUntil: '2099-12-01T00:00:00Z',
      },
    ],
    nextCursor: null,
  })
  await wrapper.get('[data-testid="reload-draft"]').trigger('click')
  await flushPromises()
  await wrapper.get('#review-note').setValue('Verified dated source')
  let complete: ((value: unknown) => void) | undefined
  rpc.review.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  )
  await wrapper.get('article form').trigger('submit')
  await wrapper.get('article form').trigger('submit')
  expect(rpc.review).toHaveBeenCalledTimes(2)
  expect(rpc.review).toHaveBeenLastCalledWith({
    dealId: draft.id,
    expectedContentVersion: 8,
    decision: 'APPROVE',
    note: 'Verified dated source',
  })
  complete?.({ id: draft.id, reviewStatus: 'APPROVED' })
  await flushPromises()
  expect(wrapper.text()).toContain('Draft approved')
})

it('preserves a selected stale draft conflict through pagination until an explicit reload', async () => {
  const datedDraft = {
    ...draft,
    validFrom: '2099-01-01T00:00:00Z',
    validUntil: '2099-12-01T00:00:00Z',
  }
  rpc.queue
    .mockResolvedValueOnce({ items: [datedDraft], nextCursor: 'next-draft' })
    .mockResolvedValueOnce({
      items: [{ ...datedDraft, id: 'draft-2', title: 'Second synthetic draft' }],
      nextCursor: null,
    })
    .mockResolvedValueOnce({
      items: [{ ...datedDraft, contentVersion: 8, description: 'Current synthetic content' }],
      nextCursor: null,
    })
  rpc.review
    .mockRejectedValueOnce({ data: { code: 'CONFLICT' } })
    .mockResolvedValue({ id: draft.id, reviewStatus: 'APPROVED' })
  const wrapper = mount(DraftQueue, { props: { revision: 0 } })
  await flushPromises()
  await wrapper.get('[data-testid="view-draft-1"]').trigger('click')
  await wrapper.get('#review-note').setValue('Review of version seven')
  await wrapper.get('article form').trigger('submit')
  await flushPromises()
  expect(wrapper.get('[data-testid="approve-draft"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeDefined()

  await wrapper.get('[data-testid="more-drafts"]').trigger('click')
  await flushPromises()
  expect(rpc.queue).toHaveBeenLastCalledWith({ limit: 20, status: 'PENDING', cursor: 'next-draft' })
  expect(wrapper.text()).toContain('Second synthetic draft')
  expect(wrapper.text()).toContain('Version 7')
  expect(wrapper.get('#review-note').element).toHaveProperty('value', 'Review of version seven')
  expect(wrapper.text()).toContain('Content changed. Reload the draft before reviewing again.')
  expect(wrapper.find('[data-testid="reload-draft"]').exists()).toBe(true)
  expect(wrapper.get('[data-testid="view-draft-1"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('[data-testid="approve-draft"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeDefined()
  await wrapper.get('article form').trigger('submit')
  await wrapper.get('[data-testid="reject-draft"]').trigger('click')
  expect(rpc.review).toHaveBeenCalledTimes(1)

  await wrapper.get('[data-testid="reload-draft"]').trigger('click')
  await flushPromises()
  expect(rpc.queue).toHaveBeenLastCalledWith({ limit: 20, status: 'PENDING' })
  expect(wrapper.text()).toContain('Current synthetic content')
  expect(wrapper.text()).toContain('Version 8')
  expect(wrapper.find('[data-testid="reload-draft"]').exists()).toBe(false)
  expect(wrapper.get('#review-note').element).toHaveProperty('value', '')
  expect(wrapper.text()).toContain(
    'Draft content changed. Read it again and enter a new review note.',
  )
  expect(wrapper.get('[data-testid="approve-draft"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeDefined()
  await wrapper.get('#review-note').setValue('Review of current version eight')
  expect(wrapper.get('[data-testid="approve-draft"]').attributes('disabled')).toBeUndefined()
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeUndefined()
  await wrapper.get('article form').trigger('submit')
  await flushPromises()
  expect(rpc.review).toHaveBeenCalledTimes(2)
  expect(rpc.review).toHaveBeenLastCalledWith({
    dealId: draft.id,
    expectedContentVersion: 8,
    decision: 'APPROVE',
    note: 'Review of current version eight',
  })
})

it('keeps a conflicted draft blocked after switching away and back to cached evidence', async () => {
  const datedDraft = {
    ...draft,
    validFrom: '2099-01-01T00:00:00Z',
    validUntil: '2099-12-01T00:00:00Z',
  }
  rpc.queue.mockResolvedValue({
    items: [datedDraft, { ...datedDraft, id: 'draft-2', title: 'Other draft' }],
    nextCursor: null,
  })
  rpc.review.mockRejectedValueOnce({ data: { code: 'CONFLICT' } })
  const wrapper = mount(DraftQueue, { props: { revision: 0 } })
  await flushPromises()
  await wrapper.get('[data-testid="view-draft-1"]').trigger('click')
  await wrapper.get('#review-note').setValue('Review of version seven')
  await wrapper.get('article form').trigger('submit')
  await flushPromises()
  await wrapper.get('[data-testid="view-draft-2"]').trigger('click')
  await wrapper.get('#review-note').setValue('Review of the other draft')
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeUndefined()
  await wrapper.get('[data-testid="view-draft-1"]').trigger('click')
  await wrapper.get('#review-note').setValue('Another stale review')
  expect(wrapper.text()).toContain('Content changed. Reload the draft before reviewing again.')
  expect(wrapper.find('[data-testid="reload-draft"]').exists()).toBe(true)
  expect(wrapper.get('[data-testid="approve-draft"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeDefined()
  await wrapper.get('article form').trigger('submit')
  await wrapper.get('[data-testid="reject-draft"]').trigger('click')
  expect(rpc.queue).toHaveBeenCalledTimes(1)
  expect(rpc.review).toHaveBeenCalledTimes(1)
})

it.each(['draft-1', 'replacement-draft'])(
  'clears a conflicted selection beyond the first page before deliberately reviewing %s',
  async (currentId) => {
    const datedDraft = {
      ...draft,
      validFrom: '2099-01-01T00:00:00Z',
      validUntil: '2099-12-01T00:00:00Z',
    }
    const other = { ...datedDraft, id: 'draft-2', title: 'First-page draft' }
    const current = {
      ...datedDraft,
      id: currentId,
      contentVersion: 8,
      title: 'Current source revision',
      description: 'Current source evidence',
    }
    // A source revision rejects the old pending draft and creates a different-ID replacement.
    const superseded = {
      ...datedDraft,
      contentVersion: 8,
      reviewStatus: 'REJECTED',
      reviewNote: 'Superseded by source revision',
    }
    rpc.queue
      .mockResolvedValueOnce({ items: [other], nextCursor: 'page-two' })
      .mockResolvedValueOnce({ items: [datedDraft], nextCursor: null })
      .mockResolvedValueOnce({ items: [other], nextCursor: 'page-two' })
      .mockResolvedValueOnce({ items: [current], nextCursor: null })
      .mockResolvedValueOnce({ items: [superseded], nextCursor: null })
    rpc.review
      .mockRejectedValueOnce({ data: { code: 'CONFLICT' } })
      .mockResolvedValue({ id: currentId, reviewStatus: 'APPROVED' })
    const wrapper = mount(DraftQueue, { props: { revision: 0 } })
    await flushPromises()
    await wrapper.get('[data-testid="more-drafts"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="view-draft-1"]').trigger('click')
    await wrapper.get('#review-note').setValue('Review of old source revision')
    await wrapper.get('article form').trigger('submit')
    await flushPromises()
    await wrapper.get('[data-testid="reload-draft"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="view-draft-1"]').exists()).toBe(false)
    expect(wrapper.find('article').exists()).toBe(false)
    await wrapper.get('[data-testid="more-drafts"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('article').exists()).toBe(false)
    expect(rpc.review).toHaveBeenCalledTimes(1)
    await wrapper.get(`[data-testid="view-${currentId}"]`).trigger('click')
    expect(wrapper.get('#review-note').element).toHaveProperty('value', '')
    expect(wrapper.text()).toContain('Current source evidence')
    expect(wrapper.find('[data-testid="reload-draft"]').exists()).toBe(false)
    await wrapper.get('article form').trigger('submit')
    await wrapper.get('[data-testid="reject-draft"]').trigger('click')
    expect(rpc.review).toHaveBeenCalledTimes(1)
    await wrapper.get('#review-note').setValue('Review of current source revision')
    await wrapper.get('article form').trigger('submit')
    await flushPromises()
    expect(rpc.review).toHaveBeenCalledTimes(2)
    expect(rpc.review).toHaveBeenLastCalledWith({
      dealId: currentId,
      expectedContentVersion: 8,
      decision: 'APPROVE',
      note: 'Review of current source revision',
    })
    await wrapper.get('#queue-status').setValue('REJECTED')
    await flushPromises()
    expect(wrapper.find('article').exists()).toBe(false)
    await wrapper.get('[data-testid="view-draft-1"]').trigger('click')
    expect(wrapper.text()).toContain('Superseded by source revision')
    expect(wrapper.get('#review-note').element).toHaveProperty('value', '')
    expect(wrapper.get('[data-testid="approve-draft"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeDefined()
  },
)

it('requires deliberate selection of a different-ID source replacement returned by reload', async () => {
  const old = { ...draft, validFrom: '2099-01-01T00:00:00Z', validUntil: '2099-12-01T00:00:00Z' }
  const replacement = {
    ...old,
    id: 'replacement-draft',
    contentVersion: 8,
    description: 'Replacement source evidence',
  }
  rpc.queue
    .mockResolvedValueOnce({ items: [old], nextCursor: null })
    .mockResolvedValueOnce({ items: [replacement], nextCursor: null })
    .mockResolvedValueOnce({
      items: [
        {
          ...old,
          reviewStatus: 'REJECTED',
          contentVersion: 8,
          reviewNote: 'Superseded by source revision',
        },
      ],
      nextCursor: null,
    })
    .mockResolvedValueOnce({ items: [replacement], nextCursor: null })
  rpc.review
    .mockRejectedValueOnce({ data: { code: 'CONFLICT' } })
    .mockResolvedValue({ id: replacement.id, reviewStatus: 'APPROVED' })
  const wrapper = mount(DraftQueue, { props: { revision: 0 } })
  await flushPromises()
  await wrapper.get('[data-testid="view-draft-1"]').trigger('click')
  await wrapper.get('#review-note').setValue('Old source note')
  await wrapper.get('article form').trigger('submit')
  await flushPromises()
  await wrapper.get('[data-testid="reload-draft"]').trigger('click')
  await flushPromises()
  expect(wrapper.find('[data-testid="view-draft-1"]').exists()).toBe(false)
  expect(wrapper.find('article').exists()).toBe(false)
  await wrapper.get('#queue-status').setValue('REJECTED')
  await flushPromises()
  expect(wrapper.find('article').exists()).toBe(false)
  await wrapper.get('[data-testid="view-draft-1"]').trigger('click')
  expect(wrapper.text()).toContain('Superseded by source revision')
  expect(wrapper.get('#review-note').element).toHaveProperty('value', '')
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeDefined()
  await wrapper.get('#queue-status').setValue('PENDING')
  await flushPromises()
  expect(wrapper.find('article').exists()).toBe(false)
  await wrapper.get('[data-testid="view-replacement-draft"]').trigger('click')
  expect(wrapper.get('#review-note').element).toHaveProperty('value', '')
  await wrapper.get('article form').trigger('submit')
  await wrapper.get('[data-testid="reject-draft"]').trigger('click')
  expect(rpc.review).toHaveBeenCalledTimes(1)
  await wrapper.get('#review-note').setValue('Reviewed replacement evidence')
  await wrapper.get('article form').trigger('submit')
  await flushPromises()
  expect(rpc.review).toHaveBeenCalledTimes(2)
  expect(rpc.review).toHaveBeenLastCalledWith({
    dealId: replacement.id,
    expectedContentVersion: 8,
    decision: 'APPROVE',
    note: 'Reviewed replacement evidence',
  })
})

it('requires a fresh review note when conflicted evidence is fetched even at the same version', async () => {
  rpc.queue.mockResolvedValue({ items: [draft], nextCursor: null })
  rpc.review.mockRejectedValueOnce({ data: { code: 'CONFLICT' } })
  const wrapper = mount(DraftQueue, { props: { revision: 0 } })
  await flushPromises()
  await wrapper.get('[data-testid="view-draft-1"]').trigger('click')
  await wrapper.get('#review-note').setValue('Stale evidence note')
  await wrapper.get('[data-testid="reject-draft"]').trigger('click')
  await flushPromises()
  await wrapper.get('[data-testid="reload-draft"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('#review-note').element).toHaveProperty('value', '')
  expect(wrapper.find('[data-testid="reload-draft"]').exists()).toBe(false)
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeDefined()
  await wrapper.get('article form').trigger('submit')
  await wrapper.get('[data-testid="reject-draft"]').trigger('click')
  expect(rpc.review).toHaveBeenCalledTimes(1)
})

it('paginates drafts with the server cursor, deduplicates IDs, and resets pagination on filters', async () => {
  rpc.queue
    .mockResolvedValueOnce({ items: [draft], nextCursor: 'next-draft' })
    .mockResolvedValueOnce({
      items: [draft, { ...draft, id: 'draft-2', title: 'Second synthetic draft' }],
      nextCursor: null,
    })
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  await wrapper.get('[data-testid="more-drafts"]').trigger('click')
  await flushPromises()
  expect(rpc.queue).toHaveBeenLastCalledWith({ limit: 20, status: 'PENDING', cursor: 'next-draft' })
  expect(wrapper.findAll('[data-testid="view-draft-1"]')).toHaveLength(1)
  expect(wrapper.text()).toContain('Second synthetic draft')
  expect(wrapper.find('[data-testid="more-drafts"]').exists()).toBe(false)
  await wrapper.get('#queue-status').setValue('APPROVED')
  await flushPromises()
  expect(rpc.queue).toHaveBeenLastCalledWith({ limit: 20, status: 'APPROVED' })
})

it('acknowledges OneMap as the data source with the documented Singapore Open Data Licence', async () => {
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  const panel = wrapper.get('[aria-labelledby="locations-title"]')
  expect(panel.text()).toContain('Data source: OneMap')
  const licence = panel.get('a')
  expect(licence.text()).toBe('Singapore Open Data Licence')
  expect(licence.attributes('href')).toBe('https://www.onemap.gov.sg/legal/opendatalicence.html')
})

it('shows OneMap address/coordinate candidates without claiming merchant verification or attaching them', async () => {
  rpc.dashboard.mockResolvedValue({
    ...dashboard,
    source: { ...dashboard.source, onemapConfigured: true },
  })
  rpc.locations.mockResolvedValue({
    items: [
      {
        searchValue: 'Synthetic plaza',
        address: '123 FIXTURE ROAD',
        postalCode: '123456',
        latitude: 1.3,
        longitude: 103.8,
      },
    ],
  })
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  await wrapper.get('#location-query').setValue('  fixture plaza  ')
  await wrapper.get('[data-testid="location-search"]').trigger('submit')
  await flushPromises()
  expect(rpc.locations).toHaveBeenCalledWith({ query: 'fixture plaza' })
  expect(wrapper.text()).toContain('123 FIXTURE ROAD')
  expect(wrapper.text()).toContain('1.3, 103.8')
  expect(wrapper.text()).toContain('Candidates are not verified merchants or outlets')
  expect(rpc.review).not.toHaveBeenCalled()
})

it('disables unconfigured OneMap and recovers search errors without stale candidates', async () => {
  const disabled = mount(IngestionAdminPage)
  await flushPromises()
  expect(disabled.get('[data-testid="search-locations"]').attributes('disabled')).toBeDefined()
  disabled.unmount()
  rpc.dashboard.mockResolvedValue({
    ...dashboard,
    source: { ...dashboard.source, onemapConfigured: true },
  })
  rpc.locations.mockRejectedValueOnce(new Error('private OneMap token'))
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  await wrapper.get('#location-query').setValue('fixture plaza')
  await wrapper.get('[data-testid="location-search"]').trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('Unable to search locations')
  expect(wrapper.text()).not.toContain('private OneMap token')
  await wrapper.get('[data-testid="location-search"]').trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('No location candidates found')
})

it('reads accounts only on request and provides no deletion or role-edit controls', async () => {
  rpc.accounts.mockResolvedValue({
    items: [
      {
        id: 'fixture-user',
        name: 'Synthetic Admin',
        email: 'synthetic@example.test',
        role: 'ADMIN',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
    nextCursor: null,
  })
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  expect(rpc.accounts).not.toHaveBeenCalled()
  await wrapper.get('[data-testid="load-accounts"]').trigger('click')
  await flushPromises()
  expect(rpc.accounts).toHaveBeenCalledWith({ limit: 20 })
  const panel = wrapper.get('[aria-labelledby="accounts-title"]')
  expect(panel.text()).toContain('synthetic@example.test')
  expect(panel.text()).toContain('ADMIN')
  expect(panel.text()).toContain('Read-only')
  expect(panel.find('input').exists()).toBe(false)
  expect(panel.find('select').exists()).toBe(false)
  expect(panel.text()).not.toMatch(/Delete account|Change role/)
})

it('reports the account server gate without hiding the review dashboard', async () => {
  rpc.accounts.mockRejectedValue({ data: { code: 'FORBIDDEN' } })
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  await wrapper.get('[data-testid="load-accounts"]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Accounts are restricted to administrators')
  expect(wrapper.text()).toContain('Draft review queue')
})

it('paginates read-only accounts without duplicates and recovers failed account reads', async () => {
  const account = {
    id: 'fixture-user',
    name: 'Synthetic Admin',
    email: 'synthetic@example.test',
    role: 'ADMIN',
    createdAt: '2026-01-01T00:00:00Z',
  }
  rpc.accounts
    .mockRejectedValueOnce(new Error('private DB response'))
    .mockResolvedValueOnce({ items: [account], nextCursor: 'next-account' })
    .mockResolvedValueOnce({
      items: [account, { ...account, id: 'fixture-user-2', name: 'Second synthetic user' }],
      nextCursor: null,
    })
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  await wrapper.get('[data-testid="load-accounts"]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('Unable to load accounts')
  await wrapper.get('[data-testid="load-accounts"]').trigger('click')
  await flushPromises()
  await wrapper.get('[data-testid="more-accounts"]').trigger('click')
  await flushPromises()
  expect(rpc.accounts).toHaveBeenLastCalledWith({ limit: 20, cursor: 'next-account' })
  expect(wrapper.get('[aria-labelledby="accounts-title"]').findAll('li')).toHaveLength(2)
  expect(wrapper.text()).toContain('Second synthetic user')
})

it('bounds review notes and OneMap queries to the procedure limits', async () => {
  rpc.dashboard.mockResolvedValue({
    ...dashboard,
    source: { ...dashboard.source, onemapConfigured: true },
  })
  rpc.queue.mockResolvedValue({ items: [draft], nextCursor: null })
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  await wrapper.get('[data-testid="view-draft-1"]').trigger('click')
  expect(wrapper.get('#review-note').attributes('maxlength')).toBe('1000')
  await wrapper.get('#review-note').setValue('x'.repeat(1001))
  await wrapper.get('[data-testid="reject-draft"]').trigger('click')
  expect(rpc.review).not.toHaveBeenCalled()
  expect(wrapper.get('#location-query').attributes('maxlength')).toBe('120')
  await wrapper.get('#location-query').setValue('x'.repeat(121))
  await wrapper.get('[data-testid="location-search"]').trigger('submit')
  expect(rpc.locations).not.toHaveBeenCalled()
})

it('honors an explicit server review-readiness veto in addition to frontend date checks', async () => {
  rpc.queue.mockResolvedValue({
    items: [
      {
        ...draft,
        reviewReady: false,
        validFrom: '2099-01-01T00:00:00Z',
        validUntil: '2099-12-01T00:00:00Z',
      },
    ],
    nextCursor: null,
  })
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  await wrapper.get('[data-testid="view-draft-1"]').trigger('click')
  await wrapper.get('#review-note').setValue('Checked dates')
  expect(wrapper.get('[data-testid="approve-draft"]').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain('The server requires source or offer clarification')
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeUndefined()
})

it('requires a new note when an automatic refresh changes the selected content version', async () => {
  rpc.queue.mockResolvedValueOnce({ items: [draft], nextCursor: null }).mockResolvedValueOnce({
    items: [{ ...draft, contentVersion: 8, description: 'Changed synthetic text' }],
    nextCursor: null,
  })
  const wrapper = mount(DraftQueue, { props: { revision: 0 } })
  await flushPromises()
  await wrapper.get('[data-testid="view-draft-1"]').trigger('click')
  await wrapper.get('#review-note').setValue('Review of version seven')
  await wrapper.setProps({ revision: 1 })
  await flushPromises()
  expect(wrapper.text()).toContain('Changed synthetic text')
  expect(wrapper.get('#review-note').element).toHaveProperty('value', '')
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeDefined()
  expect(wrapper.text()).toContain(
    'Draft content changed. Read it again and enter a new review note',
  )
})

it.each([
  [true, false],
  [false, true],
])(
  'keeps the run trigger disabled for enabled=%s reuseApproved=%s',
  async (enabled, reuseApproved) => {
    rpc.dashboard.mockResolvedValue({
      ...dashboard,
      source: { ...dashboard.source, enabled, reuseApproved },
    })
    const wrapper = mount(IngestionAdminPage)
    await flushPromises()
    await wrapper.get('[data-testid="run-ingestion"]').trigger('click')
    expect(wrapper.get('[data-testid="run-ingestion"]').attributes('disabled')).toBeDefined()
    expect(rpc.run).not.toHaveBeenCalled()
  },
)

it('recovers separate run and queue read errors without inventing records', async () => {
  rpc.runs.mockRejectedValueOnce(new Error('private runs error'))
  rpc.queue.mockRejectedValueOnce(new Error('private queue error'))
  const wrapper = mount(IngestionAdminPage)
  expect(wrapper.text()).toContain('Loading ingestion')
  await flushPromises()
  expect(wrapper.text()).toContain('Unable to load runs')
  expect(wrapper.text()).toContain('Unable to load drafts')
  expect(wrapper.text()).not.toContain('private')
  const buttons = wrapper.findAll('button')
  await buttons.find((button) => button.text() === 'Retry runs')?.trigger('click')
  await buttons.find((button) => button.text() === 'Retry drafts')?.trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('No ingestion runs yet')
  expect(wrapper.text()).toContain('No drafts match this status')
})

it('blocks duplicate sign-ins and clears the password after rejected authentication', async () => {
  rpc.dashboard.mockRejectedValue({ data: { code: 'UNAUTHORIZED' } })
  let complete: ((value: unknown) => void) | undefined
  rpc.signIn.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  )
  const wrapper = mount(IngestionAdminPage)
  await flushPromises()
  await wrapper.get('#admin-email').setValue('synthetic@example.test')
  await wrapper.get('#admin-password').setValue('synthetic-not-a-real-password')
  await wrapper.get('form').trigger('submit')
  await wrapper.get('form').trigger('submit')
  expect(rpc.signIn).toHaveBeenCalledTimes(1)
  complete?.({ error: { message: 'private auth detail' } })
  await flushPromises()
  expect(wrapper.text()).toContain('Sign-in failed')
  expect(wrapper.text()).not.toContain('private auth detail')
  expect(wrapper.get('#admin-password').element).toHaveProperty('value', '')
})
