import type { CommunityResponse } from '@broke-oclock/contracts/community'
import { flushPromises, mount } from '@vue/test-utils'
import VoteControls from '@web/modules/community/VoteControls.vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), setVote: vi.fn() }))
vi.mock('@web/lib/api-client', async (original) => ({
  ...(await original<typeof import('@web/lib/api-client')>()),
  api: { community: mocks },
}))
const summary: CommunityResponse = {
  dealId: 'da0000000000000000000001',
  title: 'Synthetic deal',
  description: 'Not a real offer',
  validity: 'ACTIVE',
  validUntil: null,
  aliveCount: 0,
  deadCount: 0,
  recordedAliveCount: 0,
  recordedDeadCount: 0,
  currentVote: null,
  reconfirmAt: null,
  lastConfirmedAt: null,
  canVote: true,
  contentVersion: 1,
  evaluatedAt: new Date().toISOString(),
  status: 'UNVERIFIED',
  evidenceWindowHours: 72,
  reconfirmHours: 24,
  confirmThreshold: 3,
  deadThreshold: 2,
  voteBlockReason: null,
  outlets: [],
}
const render = (authenticated = true) =>
  mount(VoteControls, {
    props: { dealId: summary.dealId, userId: authenticated ? 'first-user' : null },
    global: { stubs: { BButton: { template: '<button><slot /></button>' } } },
  })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.get.mockResolvedValue(summary)
})

describe('community voting controls', () => {
  it('reloads the current vote when one signed-in user replaces another', async () => {
    mocks.get.mockResolvedValueOnce({ ...summary, currentVote: 'ALIVE', aliveCount: 1 })
    const wrapper = render()
    await flushPromises()
    expect(wrapper.text()).toContain('Your vote: Still available')
    mocks.get.mockResolvedValueOnce({ ...summary, currentVote: 'DEAD', deadCount: 1 })
    await wrapper.setProps({ userId: 'second-user' })
    await flushPromises()
    expect(mocks.get).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('Your vote: Ended / unavailable')
    expect(mocks.get).toHaveBeenLastCalledWith(summary.dealId)
    wrapper.unmount()
  })

  it('embeds several panels with distinct headings and optional deal details', async () => {
    const wrapper = mount(
      {
        components: { VoteControls },
        setup: () => ({ dealId: summary.dealId }),
        template:
          '<div><VoteControls :deal-id="dealId" user-id="first-user" :show-deal-details="false" /><VoteControls :deal-id="dealId" user-id="first-user" /></div>',
      },
      { global: { stubs: { BButton: { template: '<button><slot /></button>' } } } },
    )
    await flushPromises()
    const [first, second] = wrapper.findAllComponents(VoteControls)
    expect(first.get('section').attributes('aria-labelledby')).not.toBe(
      second.get('section').attributes('aria-labelledby'),
    )
    expect(first.get('h2').classes()).toContain('visually-hidden')
    expect(first.text()).not.toContain('Not a real offer')
    expect(second.text()).toContain('Not a real offer')
    wrapper.unmount()
  })

  it('updates selection and counts from saved API responses', async () => {
    mocks.setVote.mockResolvedValue({ ...summary, aliveCount: 1, currentVote: 'ALIVE' })
    const wrapper = render()
    await flushPromises()
    await wrapper.findAll('button')[0].trigger('click')
    await flushPromises()
    expect(mocks.setVote).toHaveBeenCalledWith(summary.dealId, {
      value: 'ALIVE',
      expectedVersion: 1,
    })
    expect(wrapper.findAll('button')[0].attributes('aria-pressed')).toBe('true')
    expect(wrapper.text()).toContain('Your vote: Still available')
    expect(wrapper.text()).toContain('Your vote has been saved.')
    expect(wrapper.emitted('updated')?.[0]).toEqual([
      { ...summary, aliveCount: 1, currentVote: 'ALIVE' },
    ])
    wrapper.unmount()
  })

  it('prevents duplicate submissions while a vote is pending', async () => {
    let finish: ((value: CommunityResponse) => void) | undefined
    mocks.setVote.mockImplementation(
      () =>
        new Promise<CommunityResponse>((resolve) => {
          finish = resolve
        }),
    )
    const wrapper = render()
    await flushPromises()
    await wrapper.findAll('button')[0].trigger('click')
    await wrapper.findAll('button')[1].trigger('click')
    expect(mocks.setVote).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('button')[1].attributes()).toHaveProperty('disabled')
    finish?.({ ...summary, aliveCount: 1, currentVote: 'ALIVE' })
    await flushPromises()
    wrapper.unmount()
  })

  it('disables logged-out and expired voting', async () => {
    const wrapper = render(false)
    await flushPromises()
    expect(wrapper.text()).toContain('Sign in to vote.')
    expect(wrapper.findAll('button')[0].attributes()).toHaveProperty('disabled')
    mocks.get.mockResolvedValue({ ...summary, validity: 'EXPIRED', canVote: false })
    await wrapper.setProps({ userId: 'first-user' })
    await flushPromises()
    expect(wrapper.text()).toContain('Voting is closed')
    expect(wrapper.findAll('button')[0].attributes()).toHaveProperty('disabled')
    wrapper.unmount()
  })

  it('ignores stale reads when the deal changes', async () => {
    let finish: ((value: CommunityResponse) => void) | undefined
    mocks.get.mockImplementationOnce(
      () =>
        new Promise<CommunityResponse>((resolve) => {
          finish = resolve
        }),
    )
    const wrapper = render()
    mocks.get.mockResolvedValue({ ...summary, title: 'Second deal' })
    await wrapper.setProps({ dealId: 'da0000000000000000000002' })
    await flushPromises()
    finish?.(summary)
    await flushPromises()
    expect(wrapper.text()).toContain('Second deal')
    expect(wrapper.text()).not.toContain('Synthetic deal')
    wrapper.unmount()
  })

  it('preserves counts and offers recovery after a failed write', async () => {
    mocks.setVote.mockRejectedValue(new Error('private details'))
    const wrapper = render()
    await flushPromises()
    await wrapper.findAll('button')[0].trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Could not reach the server. Try again.')
    expect(wrapper.text()).toContain('Your vote: Not voted')
    expect(wrapper.findAll('button')[0].attributes()).not.toHaveProperty('disabled')
    wrapper.unmount()
  })
})
