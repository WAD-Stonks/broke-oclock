import { expect, test } from '@playwright/test'

test('photo uploader uses the same-origin SDK route and surfaces unavailable storage', async ({
  page,
}) => {
  let requests = 0
  await page.route('**/api/uploadthing?**', async (route) => {
    requests += 1
    expect(route.request().method()).toBe('POST')
    expect(new URL(route.request().url()).searchParams.get('slug')).toBe('photoUploader')
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Photo storage is not configured' }),
    })
  })
  await page.goto('/')
  const result = await page.evaluate(async () => {
    // Load the actual client module through Vite; only the provider/HTTP boundary is stubbed.
    const path = '/src/lib/photo-upload.ts'
    const { uploadPhoto } = await import(/* @vite-ignore */ path)
    try {
      await uploadPhoto(
        new File(['test-fixture-not-a-real-image'], 'test.jpg', { type: 'image/jpeg' }),
      )
      return 'unexpected success'
    } catch (error) {
      return error instanceof Error ? error.message : 'unknown failure'
    }
  })
  expect(requests).toBe(1)
  expect(result).toContain('Photo storage is not configured')
})
