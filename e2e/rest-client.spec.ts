import { expect, test } from '@playwright/test'

test('typed REST browser client uses an explicit same-origin health request', async ({ page }) => {
  let requests = 0
  // Synthetic JSON response only; real Axios/Express tests live in API integration tests.
  await page.route('**/api/health', async (route) => {
    requests += 1
    expect(route.request().method()).toBe('GET')
    expect(new URL(route.request().url()).origin).toBe(new URL(page.url()).origin)
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  })
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const path = '/src/lib/api-client.ts'
    const { api } = await import(/* @vite-ignore */ path)
    return api.infrastructure.health()
  })
  expect(result).toEqual({ ok: true })
  expect(requests).toBe(1)
})
