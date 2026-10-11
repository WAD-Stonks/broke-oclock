import type {
  AccountVenue,
  Bookmark,
  MyMerchantRequest,
  Submission,
} from '@broke-oclock/contracts/account'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import MerchantAccessPage from '@web/pages/MerchantAccessPage.vue'
import MySubmissionsPage from '@web/pages/MySubmissionsPage.vue'
import SavedDealsPage from '@web/pages/SavedDealsPage.vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Component, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

type Page<T> = { items: T[]; nextCursor: string | null }

// Synthetic API boundary only: these tests check the pages, not backend behaviour.
const account = vi.hoisted(() => ({
  bookmarks: vi.fn(),
  unsaveDeal: vi.fn(),
  submissions: vi.fn(),
  venues: vi.fn(),
  requestMerchantAccess: vi.fn(),
  merchantRequests: vi.fn(),
}))
vi.mock('@web/lib/api-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
      message: string,
    ) {
      super(message)
    }
  },
  api: { account },
}))

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

const bookmark = (n: number): Bookmark => ({
  id: `bookmark-${n}`,
  dealId: `deal-${n}`,
  savedAt: '2026-01-01T00:00:00.000Z',
  deal: { title: `Deal ${n}`, category: 'food', description: 'Tasty', validUntil: null },
})
const submission = (n: number): Submission => ({
  id: `submission-${n}`,
  title: `Submission ${n}`,
  category: 'food',
  reviewStatus: 'PENDING',
  reviewNote: null,
  createdAt: '2026-01-01T00:00:00.000Z',
})
const request = (n: number): MyMerchantRequest => ({
  id: `request-${n}`,
  venueName: `Stall ${n}`,
  merchantName: 'Merchant',
  status: 'PENDING',
  reviewNote: null,
  createdAt: '2026-01-01T00:00:00.000Z',
})
const venue = (id: string, name: string): AccountVenue => ({
  id,
  name,
  merchantName: 'Merchant',
  address: '1 Test Road',
})

const mountPage = async (component: Component) => {
  const stub = { render: () => h('div') }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: stub },
      { path: '/login', component: stub },
    ],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(component, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const buttonWithText = (wrapper: VueWrapper, text: string) =>
  wrapper.findAll('button').find((button) => button.text().includes(text))

beforeEach(() => {
  vi.resetAllMocks()
})

describe('Load more on the saved-deals and submissions pages', () => {
  it('ignores a second click while the first Load more is still running', async () => {
    account.bookmarks.mockResolvedValueOnce({ items: [bookmark(1)], nextCursor: 'cursor-1' })
    const wrapper = await mountPage(SavedDealsPage)

    const nextPage = deferred<Page<Bookmark>>()
    account.bookmarks.mockReturnValueOnce(nextPage.promise)
    const loadMore = buttonWithText(wrapper, 'Load more')
    // Two clicks before the page re-renders, like a real double click.
    await Promise.all([loadMore?.trigger('click'), loadMore?.trigger('click')])

    expect(account.bookmarks).toHaveBeenCalledTimes(2) // first page + exactly one Load more
    expect(account.bookmarks).toHaveBeenLastCalledWith({ cursor: 'cursor-1' })
    expect(buttonWithText(wrapper, 'Loading')?.attributes('disabled')).toBeDefined()

    nextPage.resolve({ items: [bookmark(2)], nextCursor: null })
    await flushPromises()
    expect(wrapper.findAll('h2').map((heading) => heading.text())).toEqual(['Deal 1', 'Deal 2'])
    expect(buttonWithText(wrapper, 'Load more')).toBeUndefined()
  })

  it('lets the user retry after Load more fails', async () => {
    account.bookmarks.mockResolvedValueOnce({ items: [bookmark(1)], nextCursor: 'cursor-1' })
    const wrapper = await mountPage(SavedDealsPage)

    account.bookmarks.mockRejectedValueOnce(new Error('offline'))
    await buttonWithText(wrapper, 'Load more')?.trigger('click')
    await flushPromises()

    account.bookmarks.mockResolvedValueOnce({ items: [bookmark(2)], nextCursor: null })
    await buttonWithText(wrapper, 'Load more')?.trigger('click')
    await flushPromises()
    expect(account.bookmarks).toHaveBeenCalledTimes(3)
  })

  it('ignores a second click on the submissions page too', async () => {
    account.submissions.mockResolvedValueOnce({ items: [submission(1)], nextCursor: 'cursor-1' })
    const wrapper = await mountPage(MySubmissionsPage)

    const nextPage = deferred<Page<Submission>>()
    account.submissions.mockReturnValueOnce(nextPage.promise)
    const loadMore = buttonWithText(wrapper, 'Load more')
    await Promise.all([loadMore?.trigger('click'), loadMore?.trigger('click')])

    expect(account.submissions).toHaveBeenCalledTimes(2)
    nextPage.resolve({ items: [submission(2)], nextCursor: null })
    await flushPromises()
    expect(wrapper.findAll('h2').map((heading) => heading.text())).toEqual([
      'Submission 1',
      'Submission 2',
    ])
  })

  it('keeps older deals reachable when the whole visible page is removed', async () => {
    account.bookmarks.mockResolvedValueOnce({ items: [bookmark(1)], nextCursor: 'cursor-1' })
    account.unsaveDeal.mockResolvedValue({ saved: false })
    const wrapper = await mountPage(SavedDealsPage)

    const nextPage = deferred<Page<Bookmark>>()
    account.bookmarks.mockReturnValueOnce(nextPage.promise)
    await buttonWithText(wrapper, 'Remove')?.trigger('click')
    await flushPromises()

    // Nothing is visible, but an older page exists: the page must not claim nothing is saved.
    expect(wrapper.text()).not.toContain("You haven't saved any deals yet")
    expect(account.bookmarks).toHaveBeenLastCalledWith({ cursor: 'cursor-1' })

    nextPage.resolve({ items: [bookmark(2)], nextCursor: null })
    await flushPromises()
    expect(wrapper.findAll('h2').map((heading) => heading.text())).toEqual(['Deal 2'])
  })

  it('still offers Load more if the automatic fetch after the last removal fails', async () => {
    account.bookmarks.mockResolvedValueOnce({ items: [bookmark(1)], nextCursor: 'cursor-1' })
    account.unsaveDeal.mockResolvedValue({ saved: false })
    const wrapper = await mountPage(SavedDealsPage)

    account.bookmarks.mockRejectedValueOnce(new Error('offline'))
    await buttonWithText(wrapper, 'Remove')?.trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain("You haven't saved any deals yet")

    account.bookmarks.mockResolvedValueOnce({ items: [bookmark(2)], nextCursor: null })
    await buttonWithText(wrapper, 'Load more')?.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('h2').map((heading) => heading.text())).toEqual(['Deal 2'])
  })

  it('shows the empty message after the last bookmark goes and nothing older exists', async () => {
    account.bookmarks.mockResolvedValueOnce({ items: [bookmark(1)], nextCursor: null })
    account.unsaveDeal.mockResolvedValue({ saved: false })
    const wrapper = await mountPage(SavedDealsPage)

    await buttonWithText(wrapper, 'Remove')?.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain("You haven't saved any deals yet")
    expect(account.bookmarks).toHaveBeenCalledTimes(1)
  })
})

describe('merchant access page', () => {
  beforeEach(() => {
    account.venues.mockResolvedValue([])
    account.merchantRequests.mockResolvedValue({ items: [], nextCursor: null })
  })

  it('shows older merchant requests with Load more and fetches each page once', async () => {
    account.merchantRequests.mockResolvedValueOnce({ items: [request(1)], nextCursor: 'cursor-1' })
    const wrapper = await mountPage(MerchantAccessPage)
    expect(wrapper.text()).toContain('Stall 1')

    const nextPage = deferred<Page<MyMerchantRequest>>()
    account.merchantRequests.mockReturnValueOnce(nextPage.promise)
    const loadMore = buttonWithText(wrapper, 'Load more')
    await Promise.all([loadMore?.trigger('click'), loadMore?.trigger('click')])

    expect(account.merchantRequests).toHaveBeenCalledTimes(2)
    expect(account.merchantRequests).toHaveBeenLastCalledWith({ cursor: 'cursor-1' })
    nextPage.resolve({ items: [request(2)], nextCursor: null })
    await flushPromises()
    expect(wrapper.text()).toContain('Stall 1')
    expect(wrapper.text()).toContain('Stall 2')
    expect(buttonWithText(wrapper, 'Load more')).toBeUndefined()
  })

  it('ignores an older stall search that finishes last', async () => {
    const wrapper = await mountPage(MerchantAccessPage) // the search on open returns nothing
    const searchA = deferred<AccountVenue[]>()
    const searchB = deferred<AccountVenue[]>()
    account.venues.mockReturnValueOnce(searchA.promise).mockReturnValueOnce(searchB.promise)

    const searchBox = wrapper.find('#venue-search')
    const searchButton = buttonWithText(wrapper, 'Search')
    await searchBox.setValue('A')
    await searchButton?.trigger('click')
    await searchBox.setValue('B')
    await searchButton?.trigger('click')

    // The newer search (B) finishes first and the user picks a stall from it.
    searchB.resolve([venue('venue-b', 'Stall B')])
    await flushPromises()
    await wrapper.find('#venue').setValue('venue-b')

    // The older search (A) finishes last and must change nothing.
    searchA.resolve([venue('venue-a', 'Stall A')])
    await flushPromises()

    const options = wrapper.findAll('#venue option').map((option) => option.text())
    expect(options).toEqual(['Choose a stall', 'Stall B (Merchant)'])
    expect((wrapper.find('#venue').element as HTMLSelectElement).value).toBe('venue-b')
  })

  it('does not show an error from an older search that failed after a newer one succeeded', async () => {
    const wrapper = await mountPage(MerchantAccessPage)
    const searchA = deferred<AccountVenue[]>()
    account.venues
      .mockReturnValueOnce(searchA.promise)
      .mockResolvedValueOnce([venue('venue-b', 'Stall B')])

    const searchButton = buttonWithText(wrapper, 'Search')
    await searchButton?.trigger('click')
    await searchButton?.trigger('click')
    await flushPromises()

    searchA.reject(new Error('offline'))
    await flushPromises()
    expect(wrapper.text()).not.toContain('Could not search stalls')
    expect(wrapper.findAll('#venue option').map((option) => option.text())).toContain(
      'Stall B (Merchant)',
    )
  })

  it('discards a Load more response that finishes after a refresh', async () => {
    account.venues.mockResolvedValue([venue('venue-1', 'Stall V')])
    account.requestMerchantAccess.mockResolvedValue({ id: 'new-request', version: 0 })
    account.merchantRequests.mockResolvedValueOnce({ items: [request(1)], nextCursor: 'cursor-1' })
    const wrapper = await mountPage(MerchantAccessPage)

    // The user clicks Load more, and that slow request is still pending...
    const stale = deferred<Page<MyMerchantRequest>>()
    account.merchantRequests.mockReturnValueOnce(stale.promise)
    await buttonWithText(wrapper, 'Load more')?.trigger('click')

    // ...when they send a new request, which refreshes the first page.
    account.merchantRequests.mockResolvedValueOnce({
      items: [request(9), request(1)],
      nextCursor: 'cursor-new',
    })
    await wrapper.find('#venue').setValue('venue-1')
    await wrapper.find('#why').setValue('Please approve')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Stall 9')

    // The old Load more now finishes. It belongs to the old list and must change nothing.
    stale.resolve({ items: [request(21)], nextCursor: 'cursor-stale' })
    await flushPromises()
    expect(wrapper.text()).not.toContain('Stall 21')

    // The cursor still points at the refreshed list.
    account.merchantRequests.mockResolvedValueOnce({ items: [request(10)], nextCursor: null })
    await buttonWithText(wrapper, 'Load more')?.trigger('click')
    await flushPromises()
    expect(account.merchantRequests).toHaveBeenLastCalledWith({ cursor: 'cursor-new' })
  })

  it('does not start Load more while the first page is being refreshed', async () => {
    account.venues.mockResolvedValue([venue('venue-1', 'Stall V')])
    account.requestMerchantAccess.mockResolvedValue({ id: 'new-request', version: 0 })
    account.merchantRequests.mockResolvedValueOnce({ items: [request(1)], nextCursor: 'cursor-1' })
    const wrapper = await mountPage(MerchantAccessPage)

    const refresh = deferred<Page<MyMerchantRequest>>()
    account.merchantRequests.mockReturnValueOnce(refresh.promise)
    await wrapper.find('#venue').setValue('venue-1')
    await wrapper.find('#why').setValue('Please approve')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(buttonWithText(wrapper, 'Load more')?.attributes('disabled')).toBeDefined()
    expect(account.merchantRequests).toHaveBeenCalledTimes(2) // first page + the refresh

    refresh.resolve({ items: [request(9)], nextCursor: 'cursor-new' })
    await flushPromises()
    expect(buttonWithText(wrapper, 'Load more')?.attributes('disabled')).toBeUndefined()
  })
})