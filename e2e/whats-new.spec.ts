import type { Locator, Page } from '@playwright/test'
import { LAST_SEEN_RELEASE_KEY, RELEASES } from '../src/app/releases.ts'
import { expect, test } from './fixtures.ts'
import { linkFor } from './links.ts'

// docs/ux.md "What's new": a returning visitor's first load of a newer release lists every release
// since the one they saw last, once; a first visit, or an id the list doesn't know, shows nothing;
// and the header's menu, or About's release stamp, opens the whole history.

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 900 } }

const OLDEST = RELEASES.at(-1)!.id
const whatsNew = (page: Page) => page.getByRole('dialog', { name: 'What’s new' })

/** Waits until the app is up: the setup's tabs are there. */
const loaded = (page: Page) => expect(page.getByRole('tab', { name: 'Character' })).toBeVisible()

/** The ISO times of the releases a dialog or sheet lists, in its order. */
const listedTimes = (within: Locator) => within.locator('article time').evaluateAll((els) => els.map((el) => el.getAttribute('datetime')))
const isoOf = (time: string) => new Date(time).toISOString()

/** Focus stays inside `dialog`, going forwards or backwards. */
async function trapsFocus(page: Page, dialog: Locator) {
  for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key)
    await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  }
}

for (const [name, device] of [
  ['desktop', DESKTOP],
  ['phone', PHONE],
] as const) {
  test.describe(`What’s new, ${name}`, () => {
    test.use(device)

    test.describe('a visitor who last saw the oldest release', () => {
      test.use({ lastSeenRelease: OLDEST })

      test('sees every newer release, newest first, once', async ({ page }) => {
        await page.goto('./')
        const dialog = whatsNew(page)
        await expect(dialog).toBeVisible()
        // Focus on its title, so the list is read from the top.
        await expect(dialog.getByRole('heading', { name: 'What’s new' })).toBeFocused()
        const newer = RELEASES.slice(0, -1)
        expect(await listedTimes(dialog)).toEqual(newer.map((r) => isoOf(r.time)))
        // Each release's groups and changes are there; the one already seen isn't.
        for (const group of newer[0].groups) await expect(dialog.getByRole('heading', { name: group.label }).first()).toBeVisible()
        await expect(dialog.getByText(newer[0].groups[0].items[0])).toBeVisible()
        await expect(dialog.getByText(RELEASES.at(-1)!.groups[0].items[0])).toHaveCount(0)
        expect(await page.evaluate((key) => localStorage.getItem(key), LAST_SEEN_RELEASE_KEY)).toBe(RELEASES[0].id)

        await trapsFocus(page, dialog)
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()

        // Seen: a reload shows nothing.
        await page.reload()
        await loaded(page)
        await page.waitForTimeout(500)
        await expect(whatsNew(page)).toHaveCount(0)
      })

      test('closes with Got it or its 44 px Close', async ({ page }) => {
        await page.goto('./')
        const dialog = whatsNew(page)
        const close = dialog.getByRole('button', { name: 'Close' })
        await expect(close).toBeVisible()
        // Once it has finished opening (the dialog zooms in).
        await expect.poll(async () => Math.min((await close.boundingBox())!.width, (await close.boundingBox())!.height)).toBeGreaterThanOrEqual(44)
        const gotIt = dialog.getByRole('button', { name: 'Got it' })
        await expect.poll(async () => (await gotIt.boundingBox())!.height).toBeGreaterThanOrEqual(44)
        await gotIt.click()
        await expect(dialog).toBeHidden()
      })
    })
  })
}

test.describe('What’s new, desktop', () => {
  test.use(DESKTOP)

  test.describe('the release before the newest', () => {
    test.use({ lastSeenRelease: RELEASES[1].id })

    test('lists only the newest', async ({ page }) => {
      await page.goto('./')
      const dialog = whatsNew(page)
      await expect(dialog).toBeVisible()
      expect(await listedTimes(dialog)).toEqual([isoOf(RELEASES[0].time)])
    })
  })

  test.describe('with a shared link', () => {
    test.use({ lastSeenRelease: OLDEST })

    test('shows over the page, with the link’s notice over it and its setup loaded', async ({ page }) => {
      const hash = await linkFor(page, { version: 1, spec: 'warrior-arms' })
      await page.goto(`./${hash}`)
      const dialog = whatsNew(page)
      await expect(dialog).toBeVisible()
      const notice = page.locator('[data-sonner-toast]').filter({ hasText: 'Loaded a shared setup' })
      await expect(notice).toBeVisible()
      await expect(dialog.getByRole('heading', { name: 'What’s new' })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(page.getByRole('button', { name: /^Spec: Arms Warrior/ })).toBeVisible()
    })
  })

  test.describe('a first visit', () => {
    test.use({ lastSeenRelease: null })

    test('shows nothing, and remembers the newest release', async ({ page }) => {
      await page.goto('./')
      await loaded(page)
      await page.waitForTimeout(500)
      await expect(whatsNew(page)).toHaveCount(0)
      expect(await page.evaluate((key) => localStorage.getItem(key), LAST_SEEN_RELEASE_KEY)).toBe(RELEASES[0].id)
    })
  })

  test.describe('an id the list doesn’t know', () => {
    test.use({ lastSeenRelease: 'not-a-release' })

    test('shows nothing, as a first visit', async ({ page }) => {
      await page.goto('./')
      await loaded(page)
      await page.waitForTimeout(500)
      await expect(whatsNew(page)).toHaveCount(0)
      expect(await page.evaluate((key) => localStorage.getItem(key), LAST_SEEN_RELEASE_KEY)).toBe(RELEASES[0].id)
    })
  })
})

for (const [name, device] of [
  ['desktop', DESKTOP],
  ['phone', PHONE],
] as const) {
  test.describe(`Release history, ${name}`, () => {
    test.use(device)

    test('the menu opens it from the keyboard, it lists every release, and Escape gives focus back', async ({ page }) => {
      await page.goto('./')
      const more = page.getByRole('button', { name: 'More' })
      await more.focus()
      await page.keyboard.press('Enter')
      const item = page.getByRole('menuitem', { name: 'Release history' })
      await expect(item).toBeVisible()
      // Just after About & data.
      const items = await page.getByRole('menuitem').allInnerTexts()
      expect(items.indexOf('Release history')).toBe(items.findIndex((t) => t.includes('About')) + 1)
      // Once the menu has finished zooming in.
      await expect.poll(async () => (await item.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await item.focus()
      await page.keyboard.press('Enter')

      const sheet = page.getByRole('dialog', { name: 'Release history' })
      await expect(sheet).toBeVisible()
      await expect(sheet.getByRole('heading', { name: 'Release history' })).toBeFocused()
      expect(await listedTimes(sheet)).toEqual(RELEASES.map((r) => isoOf(r.time)))
      await expect(sheet.locator('article')).toHaveCount(RELEASES.length)
      await trapsFocus(page, sheet)
      await page.keyboard.press('Escape')
      await expect(sheet).toBeHidden()
      await expect(more).toBeFocused()
    })

    test('About’s release stamp opens it in About’s place', async ({ page }) => {
      await page.goto('./')
      const more = page.getByRole('button', { name: 'More' })
      await more.click()
      await page.getByRole('menuitem', { name: /About/ }).click()
      const about = page.getByRole('dialog', { name: 'About Forever Sim' })
      const link = about.getByRole('button', { name: 'What changed in each release' })
      await expect(link).toBeVisible()
      await expect.poll(async () => (await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await link.click()

      const sheet = page.getByRole('dialog', { name: 'Release history' })
      await expect(sheet).toBeVisible()
      await expect(about).toBeHidden()
      await expect(sheet.getByRole('heading', { name: 'Release history' })).toBeFocused()
      await sheet.getByRole('button', { name: 'Close' }).click()
      await expect(sheet).toBeHidden()
      await expect(more).toBeFocused()
    })
  })
}
