import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'
import { linkFor } from './links.ts'

// Share links over the size caps in src/app/share.ts (docs/ux.md#persistence-and-sharing).

/**
 * A fresh page load of the link, as from a click elsewhere. (A link pasted into an open tab
 * loads on hashchange, before any reload; e2e/shell-sharing.spec.ts covers that.)
 */
async function open(page: Page, hash: string) {
  await page.goto('about:blank')
  await page.goto(`./${hash}`)
}

test.describe('oversized share links', () => {
  test('a link that inflates past the cap is refused, and a reload doesn’t try it again', async ({ page }) => {
    await page.goto('./')
    // About 4 MB of JSON that deflates to a few kilobytes.
    const hash = await linkFor(page, { version: 1, spec: 'warrior-arms', padding: ' '.repeat(4 * 1024 * 1024) })
    expect(hash.length).toBeLessThan(8 * 1024)
    await open(page, hash)
    await expect(page.getByText('That share link is broken')).toBeVisible()
    await expect(page.getByRole('button', { name: /Spec: Fury Warrior/ })).toBeVisible()
    expect(new URL(page.url()).hash).toBe('')

    await page.reload()
    await expect(page.getByRole('button', { name: 'Head: Lionheart Helm' })).toBeVisible()
    await expect(page.getByText('That share link is broken')).toHaveCount(0)
  })

  test('a link over the length cap is refused', async ({ page }) => {
    await page.goto('./')
    await open(page, `#s=${'A'.repeat(9000)}`)
    await expect(page.getByText('That share link is broken')).toBeVisible()
    await expect(page.getByRole('button', { name: /Spec: Fury Warrior/ })).toBeVisible()
    expect(new URL(page.url()).hash).toBe('')
  })
})

// Chat apps append tracking parameters to a link they pass on (#6): around the fragment, or inside it.
test.describe('share links with tracking parameters', () => {
  const ARMS = { version: 1, spec: 'warrior-arms', race: 'horde-orc' }

  for (const [where, url] of [
    ['after the code', (hash: string) => `${hash}&fbclid=IwAR0abc-_123&utm_source=messenger`],
    ['as a query inside the fragment', (hash: string) => `${hash}?utm_source=discord`],
    ['before the fragment', (hash: string) => `?utm_source=whatsapp&utm_medium=chat${hash}`],
    ['before the code, inside the fragment', (hash: string) => `#fbclid=IwAR0abc&${hash.slice(1)}`],
  ] as const) {
    test(`loads a link with them ${where}`, async ({ page }) => {
      await page.goto('./')
      await open(page, url(await linkFor(page, ARMS)))
      await expect(page.getByText('Loaded a shared setup')).toBeVisible()
      await expect(page.getByRole('button', { name: /Spec: Arms Warrior/ })).toBeVisible()
      await page.getByRole('tab', { name: 'Character', exact: true }).click()
      await expect(page.getByRole('radio', { name: 'Orc', exact: true })).toBeChecked()
      // The fragment leaves the URL, tracking parameters and all.
      expect(new URL(page.url()).hash).toBe('')
    })
  }

  test('loads one pasted into an open tab', async ({ page }) => {
    await page.goto('./')
    const hash = await linkFor(page, ARMS)
    await page.evaluate((h) => (location.hash = h), `${hash}&fbclid=IwAR0abc`)
    await expect(page.getByText('Loaded a shared setup')).toBeVisible()
    await expect(page.getByRole('button', { name: /Spec: Arms Warrior/ })).toBeVisible()
  })

  test('still refuses a damaged code with them, and leaves your setup alone', async ({ page }) => {
    await page.goto('./')
    const hash = await linkFor(page, ARMS)
    await open(page, `${hash.slice(0, hash.length / 2)}&fbclid=IwAR0abc`)
    await expect(page.getByText('That share link is broken')).toBeVisible()
    await expect(page.getByRole('button', { name: /Spec: Fury Warrior/ })).toBeVisible()
  })
})
