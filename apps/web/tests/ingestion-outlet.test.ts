import type {
  IngestionDraft,
  IngestionOutletAssociationResponse,
} from '@broke-oclock/contracts/ingestion'
import type { PlatformVenue } from '@broke-oclock/contracts/platform-admin'
import { flushPromises, mount } from '@vue/test-utils'
import { ApiClientError, api } from '@web/lib/api-client'
import DraftQueue from '@web/modules/ingestion-admin/DraftQueue.vue'
import type { InternalAxiosRequestConfig } from 'axios'
import { expect, it, type TestContext } from 'vitest'

// Synthetic Axios boundary with real client schemas and mounted Vue DOM.
// No live cookies, actor authorization, database or provider acceptance is claimed.
const id = '111111111111111111111111'
const otherId = '222222222222222222222222'
const venue: PlatformVenue = {
  id: '333333333333333333333333',
  name: '<img src=x> Outlet',
  address: '<script>address</script>',
  merchantName: 'Synthetic merchant',
}
const draft: IngestionDraft = {
  id,
  title: 'Synthetic imported offer',
  description: '<script>unsafe()</script>',
  terms: null,
  category: 'FOOD',
  offerType: 'OTHER',
  validFrom: '2099-01-01T00:00:00Z',
  validUntil: '2099-12-01T00:00:00Z',
  rawValidityText: null,
  applicability: 'NO_FIXED_LOCATION',
  merchantId: null,
  outlet: null,
  reviewStatus: 'PENDING',
  contentVersion: 7,
  sourceUrl: 'https://example.test/source',
  sourceName: 'Named synthetic source',
  reviewNote: null,
  reviewReady: true,
}
const associated: IngestionOutletAssociationResponse = {
  id,
  contentVersion: 8,
  reviewStatus: 'PENDING',
  applicability: 'SELECTED_OUTLETS',
  merchantId: '444444444444444444444444',
  outlet: venue,
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function setup(
  ctx: TestContext,
  handle: (config: InternalAxiosRequestConfig) => unknown,
  initialStatus?: 'PENDING' | 'APPROVED' | 'REJECTED',
) {
  const calls: InternalAxiosRequestConfig[] = []
  const previous = api.http.defaults.adapter
  api.http.defaults.adapter = async (config) => {
    calls.push(config)
    return { data: await handle(config), status: 200, statusText: 'OK', headers: {}, config }
  }
  const wrapper = mount(DraftQueue, {
    props: { revision: 0, ...(initialStatus ? { initialStatus } : {}) },
  })
  ctx.onTestFinished(() => {
    wrapper.unmount()
    api.http.defaults.adapter = previous
  })
  return { wrapper, calls }
}
const page = (items: IngestionDraft[] = [draft], nextCursor: string | null = null) => ({
  items,
  nextCursor,
})
async function choose(wrapper: ReturnType<typeof mount>) {
  await flushPromises()
  await wrapper.get(`[data-testid="view-${id}"]`).trigger('click')
  await wrapper.get('#outlet-query').setValue('  Synthetic  ')
  await wrapper.get('[data-testid="outlet-search"]').trigger('submit')
  await flushPromises()
  await wrapper.get('#outlet-choice').setValue(venue.id)
  await wrapper.get('#outlet-confirmation').setValue(true)
}

it('requires evidence confirmation and captures the exact draft version and existing venue once', async (ctx) => {
  const write = deferred<IngestionOutletAssociationResponse>()
  const { wrapper, calls } = setup(ctx, (config) =>
    config.url === '/admin/venues'
      ? { items: [venue], nextCursor: null }
      : config.method === 'patch'
        ? write.promise
        : page(),
  )
  await flushPromises()
  await wrapper.get(`[data-testid="view-${id}"]`).trigger('click')
  expect(wrapper.text()).toContain('No existing outlet associated')
  expect(wrapper.text()).toContain('Version 7')
  expect(wrapper.get('[data-testid="draft-source"]').attributes('href')).toBe(draft.sourceUrl)
  await wrapper.get('#outlet-query').setValue('  Synthetic  ')
  await wrapper.get('[data-testid="outlet-search"]').trigger('submit')
  await flushPromises()
  expect(calls.find((c) => c.url === '/admin/venues')?.params).toEqual({
    search: 'Synthetic',
    limit: 20,
  })
  expect(wrapper.find('script').exists()).toBe(false)
  expect(wrapper.find('img').exists()).toBe(false)
  expect(wrapper.get('#outlet-choice').element).toHaveProperty('value', '')
  await wrapper.get('#outlet-choice').setValue(venue.id)
  expect(wrapper.get('[data-testid="associate-outlet"]').attributes('disabled')).toBeDefined()
  await wrapper.get('#outlet-confirmation').setValue(true)
  await wrapper.get('[data-testid="outlet-association"]').trigger('submit')
  await wrapper.get('[data-testid="outlet-association"]').trigger('submit')
  expect(calls.filter((c) => c.method === 'patch')).toHaveLength(1)
  expect(JSON.parse(calls.find((c) => c.method === 'patch')?.data)).toEqual({
    expectedContentVersion: 7,
    venueId: venue.id,
  })
  expect(wrapper.get('#outlet-query').attributes('disabled')).toBeDefined()
  expect(wrapper.get('#review-note').attributes('disabled')).toBeDefined()
  write.resolve(associated)
  await flushPromises()
  expect(wrapper.emitted('changed')).toHaveLength(1)
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('#outlet-confirmation').element).toHaveProperty('checked', false)
})

it('never unlocks a successful association with lower-version reload or unrelated pagination', async (ctx) => {
  let read = 0
  const current = { ...draft, ...associated }
  const { wrapper, calls } = setup(ctx, (config) => {
    if (config.url === '/admin/venues') return { items: [venue], nextCursor: null }
    if (config.method === 'patch') return associated
    read++
    return read === 1
      ? page()
      : read === 2
        ? page([draft], otherId)
        : read === 3
          ? page([{ ...draft, id: otherId }])
          : page([current])
  })
  await choose(wrapper)
  await wrapper.get('[data-testid="outlet-association"]').trigger('submit')
  await flushPromises()
  await wrapper.get('[data-testid="reload-draft"]').trigger('click')
  await flushPromises()
  await wrapper.get('#review-note').setValue('Must not authorize old version')
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeDefined()
  await wrapper.get('[data-testid="more-drafts"]').trigger('click')
  await flushPromises()
  await wrapper.get(`[data-testid="view-${otherId}"]`).trigger('click')
  await wrapper.get(`[data-testid="view-${id}"]`).trigger('click')
  await wrapper.get('#review-note').setValue('Still stale')
  await wrapper.get('article > form').trigger('submit')
  expect(calls.filter((c) => c.method === 'post')).toHaveLength(0)
  await wrapper.get('[data-testid="reload-draft"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('article').text()).toContain(venue.address)
  expect(wrapper.get('#review-note').element).toHaveProperty('value', '')
  await wrapper.get('#review-note').setValue('Read current outlet and evidence')
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeUndefined()
})

it('locks an uncertain association until evidence fetched after its completion and retains highest version', async (ctx) => {
  const write = deferred<IngestionOutletAssociationResponse>()
  const oldRead = deferred<ReturnType<typeof page>>()
  let read = 0
  const { wrapper } = setup(ctx, (config) => {
    if (config.url === '/admin/venues') return { items: [venue], nextCursor: null }
    if (config.method === 'patch') return write.promise
    read++
    return read === 1
      ? page()
      : read === 2
        ? oldRead.promise
        : read === 3
          ? page([{ ...draft, contentVersion: 9 }], otherId)
          : page([draft])
  })
  await choose(wrapper)
  await wrapper.get('[data-testid="outlet-association"]').trigger('submit')
  await wrapper.setProps({ revision: 1 })
  write.reject(new Error('synthetic timeout: commitment unknown'))
  await flushPromises()
  oldRead.resolve(page())
  await flushPromises()
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeDefined()
  await wrapper.get('[data-testid="reload-draft"]').trigger('click')
  await flushPromises()
  await wrapper.get('#review-note').setValue('Fresh version nine')
  await wrapper.get('[data-testid="more-drafts"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('article').text()).toContain('Version 9')
  expect(wrapper.get('#review-note').element).toHaveProperty('value', 'Fresh version nine')
})

it.for(['association', 'review', 'search'] as const)(
  'ignores late %s completion after parent unmount',
  async (operation, ctx) => {
    const held = deferred<unknown>()
    const { wrapper } = setup(ctx, (config) => {
      if (config.url === '/admin/venues')
        return operation === 'search' ? held.promise : { items: [venue], nextCursor: null }
      if (config.method === 'patch' || config.method === 'post') return held.promise
      return page()
    })
    await flushPromises()
    await wrapper.get(`[data-testid="view-${id}"]`).trigger('click')
    if (operation === 'review') {
      await wrapper.get('#review-note').setValue('Captured review')
      await wrapper.get('[data-testid="reject-draft"]').trigger('click')
    } else {
      await wrapper.get('[data-testid="outlet-search"]').trigger('submit')
      if (operation === 'association') {
        await flushPromises()
        await wrapper.get('#outlet-choice').setValue(venue.id)
        await wrapper.get('#outlet-confirmation').setValue(true)
        await wrapper.get('[data-testid="outlet-association"]').trigger('submit')
      }
    }
    wrapper.unmount()
    held.resolve(
      operation === 'association'
        ? associated
        : operation === 'review'
          ? { id, reviewStatus: 'REJECTED' }
          : { items: [venue], nextCursor: null },
    )
    await flushPromises()
    expect(wrapper.emitted('changed')).toBeUndefined()
    expect(wrapper.emitted('denied')).toBeUndefined()
  },
)

it.for(['UNAUTHORIZED', 'FORBIDDEN'] as const)(
  'clears all protected evidence on %s and cannot revive it after revision',
  async (code, ctx) => {
    let read = 0
    const { wrapper } = setup(ctx, (config) => {
      if (config.url === '/admin/venues')
        throw new ApiClientError(code, code === 'FORBIDDEN' ? 403 : 401, 'Synthetic actor denied')
      read++
      return page()
    })
    await flushPromises()
    await wrapper.get(`[data-testid="view-${id}"]`).trigger('click')
    await wrapper.get('#review-note').setValue('Protected note')
    await wrapper.get('[data-testid="outlet-search"]').trigger('submit')
    await flushPromises()
    expect(wrapper.emitted('denied')).toEqual([[code]])
    expect(wrapper.find('article').exists()).toBe(false)
    expect(wrapper.text()).not.toContain(draft.title)
    await wrapper.setProps({ revision: 1 })
    await flushPromises()
    expect(read).toBe(1)
    expect(wrapper.text()).not.toContain(draft.title)
  },
)

it('captures review identity/version/note and does not clear a new target after revision', async (ctx) => {
  const write = deferred<{ id: string; reviewStatus: string }>()
  let read = 0
  const { wrapper, calls } = setup(ctx, (config) => {
    if (config.method === 'post') return write.promise
    read++
    return read === 1 ? page() : page([{ ...draft, id: otherId, title: 'New target' }])
  })
  await flushPromises()
  await wrapper.get(`[data-testid="view-${id}"]`).trigger('click')
  await wrapper.get('#review-note').setValue('  Captured note  ')
  await wrapper.get('[data-testid="reject-draft"]').trigger('click')
  await wrapper.setProps({ revision: 1 })
  await flushPromises()
  await wrapper.get(`[data-testid="view-${otherId}"]`).trigger('click')
  write.resolve({ id, reviewStatus: 'REJECTED' })
  await flushPromises()
  expect(JSON.parse(calls.find((c) => c.method === 'post')?.data)).toEqual({
    expectedContentVersion: 7,
    decision: 'REJECT',
    note: 'Captured note',
  })
  expect(wrapper.get('article').text()).toContain('New target')
  expect(wrapper.emitted('changed')).toBeUndefined()
})

it('clears review consent and outlet choices on same-version revision before fresh reads arrive', async (ctx) => {
  const held = deferred<ReturnType<typeof page>>()
  let read = 0
  const { wrapper } = setup(ctx, (config) =>
    config.url === '/admin/venues'
      ? { items: [venue], nextCursor: null }
      : ++read === 1
        ? page()
        : held.promise,
  )
  await choose(wrapper)
  await wrapper.get('#review-note').setValue('Old context consent')
  await wrapper.setProps({ revision: 1 })
  expect(wrapper.get('#review-note').element).toHaveProperty('value', '')
  expect(wrapper.get('#outlet-choice').element).toHaveProperty('value', '')
  held.resolve(page())
  await flushPromises()
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeDefined()
})

it('supports only allowlisted initial statuses and keeps reviewed association read-only', async (ctx) => {
  const { wrapper, calls } = setup(
    ctx,
    () => page([{ ...draft, ...associated, reviewReady: false, reviewStatus: 'APPROVED' }]),
    'APPROVED',
  )
  await flushPromises()
  expect(calls[0]?.params.status).toBe('APPROVED')
  await wrapper.get(`[data-testid="view-${id}"]`).trigger('click')
  expect(wrapper.find('[data-testid="outlet-association"]').exists()).toBe(false)
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeDefined()
})

it('explains missing canonical records and paginates bounded active outlets without auto-selection', async (ctx) => {
  let venueRead = 0
  const { wrapper, calls } = setup(ctx, (config) => {
    if (config.url === '/admin/venues')
      return ++venueRead === 1
        ? { items: [], nextCursor: null }
        : { items: [venue], nextCursor: venueRead === 2 ? otherId : null }
    return page()
  })
  await flushPromises()
  await wrapper.get(`[data-testid="view-${id}"]`).trigger('click')
  await wrapper.get('[data-testid="outlet-search"]').trigger('submit')
  await flushPromises()
  expect(wrapper.text()).toContain('Association requires an existing merchant and outlet')
  await wrapper.get('[data-testid="outlet-search"]').trigger('submit')
  await flushPromises()
  await wrapper.get('#outlet-choice').setValue(venue.id)
  await wrapper.get('#outlet-confirmation').setValue(true)
  await wrapper.get('[data-testid="more-outlets"]').trigger('click')
  await flushPromises()
  expect(calls.filter((c) => c.url === '/admin/venues').at(-1)?.params).toEqual({
    search: '',
    limit: 20,
    cursor: otherId,
  })
  expect(wrapper.findAll('#outlet-choice option')).toHaveLength(2)
  expect(wrapper.get('#outlet-choice').element).toHaveProperty('value', '')
  expect(wrapper.get('#outlet-confirmation').element).toHaveProperty('checked', false)
  expect(calls.filter((c) => c.method === 'patch')).toHaveLength(0)
})

it.for(['search', 'queue', 'association', 'review'] as const)(
  'ignores late denied %s response after unmount through real parent listeners',
  async (operation, ctx) => {
    const held = deferred<unknown>()
    const events: string[] = []
    const { wrapper } = setup(ctx, (config) => {
      if (config.url === '/admin/venues')
        return operation === 'search' ? held.promise : { items: [venue], nextCursor: null }
      if (config.method === 'patch' || config.method === 'post' || operation === 'queue')
        return held.promise
      return page()
    })
    await wrapper.setProps({
      onChanged: () => events.push('changed'),
      onDenied: () => events.push('denied'),
    })
    if (operation !== 'queue') {
      await flushPromises()
      await wrapper.get(`[data-testid="view-${id}"]`).trigger('click')
      if (operation === 'review') {
        await wrapper.get('#review-note').setValue('Observed source')
        await wrapper.get('[data-testid="reject-draft"]').trigger('click')
      } else {
        await wrapper.get('[data-testid="outlet-search"]').trigger('submit')
        if (operation === 'association') {
          await flushPromises()
          await wrapper.get('#outlet-choice').setValue(venue.id)
          await wrapper.get('#outlet-confirmation').setValue(true)
          await wrapper.get('[data-testid="outlet-association"]').trigger('submit')
        }
      }
    }
    wrapper.unmount()
    held.reject(new ApiClientError('FORBIDDEN', 403, 'Synthetic actor revoked'))
    await flushPromises()
    expect(events).toEqual([])
  },
)

it.for(['queue', 'association', 'review'] as const)(
  'clears protected state for explicit actor denial at %s boundary',
  async (operation, ctx) => {
    const { wrapper } = setup(ctx, (config) => {
      if (config.url === '/admin/venues') return { items: [venue], nextCursor: null }
      if (operation === 'queue' || config.method === 'patch' || config.method === 'post')
        throw new ApiClientError('FORBIDDEN', 403, 'Synthetic current actor revoked')
      return page()
    })
    if (operation === 'association') {
      await choose(wrapper)
      await wrapper.get('[data-testid="outlet-association"]').trigger('submit')
    } else if (operation === 'review') {
      await flushPromises()
      await wrapper.get(`[data-testid="view-${id}"]`).trigger('click')
      await wrapper.get('#review-note').setValue('Actor-specific review')
      await wrapper.get('[data-testid="reject-draft"]').trigger('click')
    }
    await flushPromises()
    expect(wrapper.emitted('denied')).toEqual([['FORBIDDEN']])
    expect(wrapper.find('article').exists()).toBe(false)
    expect(wrapper.find(`[data-testid="view-${id}"]`).exists()).toBe(false)
  },
)

it('requires new confirmation after a conflict and fresh same-version evidence, without automatic retry', async (ctx) => {
  const { wrapper, calls } = setup(ctx, (config) => {
    if (config.url === '/admin/venues') return { items: [venue], nextCursor: null }
    if (config.method === 'patch')
      throw new ApiClientError('CONFLICT', 409, 'Synthetic version/source CAS conflict')
    return page()
  })
  await choose(wrapper)
  await wrapper.get('[data-testid="outlet-association"]').trigger('submit')
  await flushPromises()
  await wrapper.get('[data-testid="outlet-association"]').trigger('submit')
  expect(calls.filter((c) => c.method === 'patch')).toHaveLength(1)
  await wrapper.get('[data-testid="reload-draft"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('#review-note').element).toHaveProperty('value', '')
  expect(wrapper.get('#outlet-confirmation').element).toHaveProperty('checked', false)
  expect(wrapper.get('#outlet-choice').element).toHaveProperty('value', '')
  expect(wrapper.get('[data-testid="associate-outlet"]').attributes('disabled')).toBeDefined()
  expect(calls.filter((c) => c.method === 'patch')).toHaveLength(1)
})

it('suppresses successful late review callback to real parent listener after unmount', async (ctx) => {
  const held = deferred<{ id: string; reviewStatus: string }>()
  const events: string[] = []
  const { wrapper } = setup(ctx, (config) => (config.method === 'post' ? held.promise : page()))
  await wrapper.setProps({ onChanged: () => events.push('changed') })
  await flushPromises()
  await wrapper.get(`[data-testid="view-${id}"]`).trigger('click')
  await wrapper.get('#review-note').setValue('Verified before parent close')
  await wrapper.get('[data-testid="reject-draft"]').trigger('click')
  wrapper.unmount()
  held.resolve({ id, reviewStatus: 'REJECTED' })
  await flushPromises()
  expect(events).toEqual([])
})

it('cannot unlock a context-shifted uncertain review with evidence requested before completion', async (ctx) => {
  const write = deferred<{ id: string; reviewStatus: string }>()
  const read = deferred<ReturnType<typeof page>>()
  let reads = 0
  const { wrapper } = setup(ctx, (config) =>
    config.method === 'post' ? write.promise : ++reads === 1 ? page() : read.promise,
  )
  await flushPromises()
  await wrapper.get(`[data-testid="view-${id}"]`).trigger('click')
  await wrapper.get('#review-note').setValue('Old review evidence')
  await wrapper.get('[data-testid="reject-draft"]').trigger('click')
  await wrapper.setProps({ revision: 1 })
  write.resolve({ id, reviewStatus: 'REJECTED' })
  await flushPromises()
  read.resolve(page())
  await flushPromises()
  await wrapper.get('#review-note').setValue('Pre-completion read cannot authorize')
  expect(wrapper.get('[data-testid="reject-draft"]').attributes('disabled')).toBeDefined()
  expect(wrapper.find('[data-testid="reload-draft"]').exists()).toBe(true)
})
