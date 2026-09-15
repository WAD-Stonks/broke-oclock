import { expect, test } from '@playwright/test'

test('typed RPC browser client uses the same-origin batch transport', async ({ page }) => {
  let requests = 0
  // Synthetic transport response only; real tRPC/auth/HTTP tests live in API integration tests.
  await page.route('**/api/trpc/health?**', async (route) => {
    requests += 1
    expect(route.request().method()).toBe('GET')
    expect(new URL(route.request().url()).origin).toBe(new URL(page.url()).origin)
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([{ result: { data: { ok: true } } }]),
    })
  })
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const path = '/src/lib/api-client.ts'
    const { api } = await import(/* @vite-ignore */ path)
    return api.health.query()
  })
  expect(result).toEqual({ ok: true })
  expect(requests).toBe(1)
})
