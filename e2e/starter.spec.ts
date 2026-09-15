import { expect, test } from '@playwright/test'

test('starter identifies its scope and navigation works', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Student deals, less guesswork.' })).toBeVisible()
  await expect(
    page.getByText('Project starter — deal features are not implemented yet.'),
  ).toBeVisible()
  await page.locator('a[href="/getting-started"]').first().click()
  await expect(page).toHaveURL(/getting-started$/)
  await expect(page.getByRole('main')).toBeVisible()
  await page.locator('a[href="/"]').first().click()
  await expect(page.getByRole('heading', { name: 'Student deals, less guesswork.' })).toBeVisible()
})

test('unknown route has a usable recovery link', async ({ page }) => {
  await page.goto('/does-not-exist')
  await expect(page.getByRole('main')).toContainText(/not found|404/i)
  await page.locator('a[href="/"]').first().click()
  await expect(page.getByRole('heading', { name: 'Student deals, less guesswork.' })).toBeVisible()
})

for (const width of [390, 1280]) {
  test(`starter routes fit ${width}px without runtime errors`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 850 })
    for (const route of ['/', '/getting-started']) {
      await page.goto(route)
      await expect(page.getByRole('main')).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      )
      expect(overflow).toBe(false)
      await page.screenshot({
        path: info.outputPath(`${route === '/' ? 'home' : 'setup'}-${width}.png`),
        fullPage: true,
      })
    }
    expect(errors).toEqual([])
  })
}
