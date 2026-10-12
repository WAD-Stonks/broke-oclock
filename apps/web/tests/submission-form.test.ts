import { enableAutoUnmount, mount } from '@vue/test-utils'
import SubmissionForm from '@web/pages/SubmissionForm.vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

enableAutoUnmount(afterEach)

const fetchMock = vi.fn()
const createObjectURL = vi.fn(() => 'blob:synthetic-deal-preview')

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('URL', { createObjectURL })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  localStorage.clear()
})

const mountForm = () => mount(SubmissionForm)
type FormWrapper = ReturnType<typeof mountForm>

async function fillValidForm(wrapper: FormWrapper) {
  await wrapper.get('#merchantName').setValue('  Campus cafe  ')
  await wrapper.get('#dealTitle').setValue('  Student lunch  ')
  await wrapper.get('#description').setValue('  Bring a student card.  ')
  await wrapper.get('#cuisine').setValue('Chinese')
  await wrapper.get('#originalPrice').setValue('10')
  await wrapper.get('#promotionalPrice').setValue('5')
  await wrapper.get('#location').setValue('  Stamford Road  ')
}

async function selectPhoto(wrapper: FormWrapper, file: File | null) {
  const input = wrapper.get<HTMLInputElement>('#photo')
  Object.defineProperty(input.element, 'files', { configurable: true, value: file ? [file] : [] })
  await input.trigger('change')
}

function savedEntries(): unknown {
  const entries: unknown = JSON.parse(localStorage.getItem('student_deals') ?? 'null')
  return entries
}

const validPreview = {
  merchantName: 'Campus cafe',
  title: 'Student lunch',
  description: 'Bring a student card.',
  cuisine: 'Chinese',
  originalPrice: 10,
  promotionalPrice: 5,
  location: 'Stamford Road',
  status: 'local-preview',
  photo: null,
}

describe('student local-only submission prototype', () => {
  it('keeps its warning, labels, cuisine choices and unconnected location notice', () => {
    const wrapper = mountForm()
    expect(wrapper.get('h1').text()).toBe('Add a Deal')
    expect(wrapper.text()).toContain(
      'Prototype only: deals are saved in this browser and are not submitted to a server.',
    )
    expect(wrapper.text()).toContain('OneMap suggestions are not connected yet.')
    expect(wrapper.findAll('label').map((label) => label.text())).toEqual([
      'Merchant name *',
      'Deal title *',
      'Description',
      'Cuisine *',
      'Original price (S$) *',
      'Promo price (S$) *',
      'Deal photo',
      'Search or add location *',
    ])
    expect(wrapper.findAll('#cuisine option').map((option) => option.text())).toEqual([
      'Select cuisine',
      'Chinese',
      'Japanese',
      'Korean',
      'Western',
      'Indian',
      'Thai',
      'Malay',
      'Cafe & Desserts',
      'Other',
    ])
    expect(wrapper.get('#photo').attributes('accept')).toBe('image/*')
    expect(wrapper.findAll('button').map((button) => button.text())).toEqual([
      'Save draft',
      'Save local preview',
    ])
  })

  it('saves an incomplete local draft without preview validation or network requests', async () => {
    const wrapper = mountForm()
    await wrapper.get('button[type="button"]').trigger('click')
    expect(savedEntries()).toEqual([
      {
        merchantName: '',
        title: '',
        description: '',
        cuisine: '',
        originalPrice: null,
        promotionalPrice: null,
        location: '',
        status: 'draft',
        photo: null,
      },
    ])
    expect(wrapper.get('[role="status"]').text()).toBe('Local draft saved!')
    expect(wrapper.find('.is-invalid').exists()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('validates the original required fields before storing a local preview', async () => {
    const wrapper = mountForm()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.findAll('.invalid-feedback').map((error) => error.text())).toEqual([
      'Enter a merchant name.',
      'Enter a deal title.',
      'Choose a cuisine.',
      'Enter a valid original price.',
      'Promo price must be below the original price.',
      'Enter a location.',
    ])
    expect(wrapper.get('#merchantName').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#merchantName').attributes('aria-describedby')).toBe('merchantNameError')
    expect(localStorage.getItem('student_deals')).toBeNull()
  })

  it('trims text and stores numeric prices as an explicitly local preview', async () => {
    const wrapper = mountForm()
    await fillValidForm(wrapper)
    await wrapper.get('form').trigger('submit')
    expect(savedEntries()).toEqual([validPreview])
    expect(wrapper.get('[role="status"]').text()).toBe(
      'Local preview saved! This deal has not been submitted to the community.',
    )
    expect(wrapper.get('#dealTitle').element).toHaveProperty('value', '  Student lunch  ')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['', '0', '-1'])('rejects original price %j for a preview', async (price) => {
    const wrapper = mountForm()
    await fillValidForm(wrapper)
    await wrapper.get('#originalPrice').setValue(price)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('#originalPriceError').text()).toBe('Enter a valid original price.')
    expect(localStorage.getItem('student_deals')).toBeNull()
  })

  it.each(['', '-1', '10', '11'])('rejects promotional price %j for a preview', async (price) => {
    const wrapper = mountForm()
    await fillValidForm(wrapper)
    await wrapper.get('#promotionalPrice').setValue(price)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('#promoPriceError').text()).toBe(
      'Promo price must be below the original price.',
    )
    expect(localStorage.getItem('student_deals')).toBeNull()
  })

  it('accepts a zero promotional price', async () => {
    const wrapper = mountForm()
    await fillValidForm(wrapper)
    await wrapper.get('#promotionalPrice').setValue('0')
    await wrapper.get('form').trigger('submit')
    expect(savedEntries()).toEqual([{ ...validPreview, promotionalPrice: 0 }])
  })

  it('preserves every existing array entry without imposing a new storage schema', async () => {
    const existing = [null, 'legacy', { title: 'Previous draft', extra: true }]
    localStorage.setItem('student_deals', JSON.stringify(existing))
    const wrapper = mountForm()
    await fillValidForm(wrapper)
    await wrapper.get('form').trigger('submit')
    expect(savedEntries()).toEqual([...existing, validPreview])
  })

  it('resets valid JSON that is not an array with the original message', () => {
    localStorage.setItem('student_deals', '{"title":"not a list"}')
    const wrapper = mountForm()
    expect(savedEntries()).toEqual([])
    expect(wrapper.get('[role="status"]').text()).toBe(
      'Saved deals were invalid. Starting with an empty list.',
    )
  })

  it('recovers from malformed stored JSON with the original message', () => {
    localStorage.setItem('student_deals', 'invalid JSON')
    const wrapper = mountForm()
    expect(savedEntries()).toEqual([])
    expect(wrapper.get('[role="status"]').text()).toBe(
      'Unable to load saved deals. Starting with an empty list.',
    )
  })

  it('keeps fields and restores buttons after a storage write fails', async () => {
    const wrapper = mountForm()
    await fillValidForm(wrapper)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Synthetic quota failure')
    })
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="status"]').text()).toBe('Unable to save the deal locally.')
    expect(wrapper.get('#dealTitle').element).toHaveProperty('value', '  Student lunch  ')
    expect(
      wrapper.findAll<HTMLButtonElement>('button').every((button) => !button.element.disabled),
    ).toBe(true)
    expect(consoleError).toHaveBeenCalledOnce()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ignores an empty photo selection', async () => {
    const wrapper = mountForm()
    await selectPhoto(wrapper, null)
    expect(wrapper.find('img').exists()).toBe(false)
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('rejects non-image photos without creating a preview', async () => {
    const wrapper = mountForm()
    await selectPhoto(wrapper, new File(['text'], 'notes.txt', { type: 'text/plain' }))
    expect(wrapper.get('#photoError').text()).toBe('Please select an image.')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('rejects photos larger than 5 MB', async () => {
    const wrapper = mountForm()
    const file = new File(['image'], 'too-large.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: 5 * 1024 * 1024 + 1 })
    await selectPhoto(wrapper, file)
    expect(wrapper.get('#photoError').text()).toBe('Image must be smaller than 5 MB.')
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('accepts a 5 MB image, clears its error and stores only its filename', async () => {
    const wrapper = mountForm()
    await fillValidForm(wrapper)
    await selectPhoto(wrapper, new File(['text'], 'notes.txt', { type: 'text/plain' }))
    const file = new File(['image'], 'lunch.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: 5 * 1024 * 1024 })
    await selectPhoto(wrapper, file)
    expect(wrapper.find('#photoError').exists()).toBe(false)
    expect(wrapper.get('img').attributes()).toMatchObject({
      src: 'blob:synthetic-deal-preview',
      alt: 'Deal preview',
    })
    expect(createObjectURL).toHaveBeenCalledWith(file)
    await wrapper.get('form').trigger('submit')
    expect(savedEntries()).toEqual([{ ...validPreview, photo: 'lunch.png' }])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('preserves the previous valid photo after an invalid replacement', async () => {
    const wrapper = mountForm()
    await fillValidForm(wrapper)
    await selectPhoto(wrapper, new File(['image'], 'first.png', { type: 'image/png' }))
    await selectPhoto(wrapper, new File(['text'], 'notes.txt', { type: 'text/plain' }))
    expect(wrapper.get('#photoError').text()).toBe('Please select an image.')
    await wrapper.get('form').trigger('submit')
    expect(savedEntries()).toEqual([{ ...validPreview, photo: 'first.png' }])
    expect(wrapper.find('#photoError').exists()).toBe(false)
  })
})
