import { flushPromises, mount } from '@vue/test-utils'
import ModerationQueue from '@web/modules/community/ModerationQueue.vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ reports: vi.fn(), reviewReport: vi.fn() }))
vi.mock('@web/lib/api-client', async (original) => ({
  ...(await original<typeof import('@web/lib/api-client')>()),
  api: { community: mocks },
}))

const report = {
  id: 'aa0000000000000000000001',
  targetType: 'COMMENT' as const,
  targetId: 'bb0000000000000000000001',
  deal: {
    id: 'cc0000000000000000000001',
    title: 'Synthetic lunch promotion',
    description: 'Synthetic deal terms',
    deletedAt: null,
  },
  comment: {
    id: 'bb0000000000000000000001',
    body: 'Reported comment text',
    authorName: 'Synthetic commenter',
    deletedAt: null,
    hiddenAt: null,
  },
  reason: 'SPAM' as const,
  details: null,
  status: 'OPEN' as const,
  createdAt: new Date().toISOString(),
  openCount: 1,
  priority: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.reports.mockResolvedValue({ items: [report], nextCursor: null })
  mocks.reviewReport.mockResolvedValue({ id: report.id, status: 'RESOLVED' })
})

describe('community moderation queue', () => {
  it('requires a note and explicit confirmation before deleting content', async () => {
    mocks.reports.mockResolvedValue({
      items: [report, { ...report, id: 'aa0000000000000000000002' }],
      nextCursor: null,
    })
    const wrapper = mount(ModerationQueue, {
      global: { stubs: { BButton: { template: '<button v-bind="$attrs"><slot /></button>' } } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('Deal: Synthetic lunch promotion')
    expect(wrapper.text()).toContain(`Deal ID: ${report.deal.id}`)
    expect(wrapper.text()).toContain('Reported comment text')
    expect(wrapper.text()).toContain('Reported comment by Synthetic commenter')
    const button = (label: string) =>
      wrapper.findAll('button').find((candidate) => candidate.text() === label)
    expect(button('Delete content')?.attributes()).toHaveProperty('disabled')
    await wrapper.get('textarea').setValue('Remove spam comment')
    expect(button('Delete content')?.attributes()).not.toHaveProperty('disabled')
    await button('Delete content')?.trigger('click')
    expect(mocks.reviewReport).not.toHaveBeenCalled()
    await button('Confirm delete')?.trigger('click')
    await flushPromises()
    expect(mocks.reviewReport).toHaveBeenCalledWith('COMMENT', report.id, {
      status: 'RESOLVED',
      note: 'Remove spam comment',
      delete: true,
    })
    expect(wrapper.text()).toContain('No open reports.')
    wrapper.unmount()
  })
})
