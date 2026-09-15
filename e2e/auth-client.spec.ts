import { expect, test } from '@playwright/test'

test('shared auth client reads the same-origin session endpoint', async ({ page }) => {
  let requests = 0
  // Client transport boundary only; real auth/session behaviour is tested against MongoDB in API integration tests.
  await page.route('**/api/auth/get-session*', async (route) => {
    requests += 1
    expect(route.request().method()).toBe('GET')
    expect(new URL(route.request().url()).origin).toBe(new URL(page.url()).origin)
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  })
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const path = '/src/lib/auth-client.ts'
    const { authClient } = await import(/* @vite-ignore */ path)
    const { data, error } = await authClient.getSession()
    return { data, error }
  })
  expect(requests).toBe(1)
  expect(result).toEqual({ data: null, error: null })
})
