import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#persistence-and-sharing

const switchSpec = async (page: Page, name: 'Fury' | 'Arms') => {
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('menuitem', { name: new RegExp(name) }).click()
  await expect(page.getByRole('button', { name: new RegExp(`^Spec: ${name} Warrior`) })).toBeVisible()
}
const chooseRace = async (page: Page, race: RegExp) => {
  await page.getByRole('tab', { name: 'Character', exact: true }).click()
  await page.getByRole('radio', { name: race }).click()
}
const expectRace = async (page: Page, race: RegExp) => {
  await page.getByRole('tab', { name: 'Character', exact: true }).click()
  await expect(page.getByRole('radio', { name: race })).toHaveAttribute('aria-checked', 'true')
}

/**
 * Copies a link to an Arms Troll with the app's Share button, then saves your own Arms as an Orc,
 * and goes back to Fury as a Gnome.
 */
async function armsTrollLinkFromFuryGnome(page: Page) {
  await page.goto('./')
  await switchSpec(page, 'Arms')
  await chooseRace(page, /Troll/)
  await page.getByRole('button', { name: /Share/ }).click()
  await expect(page.getByText('Link copied')).toBeVisible()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  await chooseRace(page, /Orc/)
  await switchSpec(page, 'Fury')
  await chooseRace(page, /Gnome/)
  return link
}

/**
 * The link's Arms Troll replaces your own Arms, and a notice says it switched you to Arms. Your
 * Fury, the spec you were on, keeps its Gnome.
 */
async function loadedArmsKeepingOwnFury(page: Page) {
  const notice = page.locator('[data-sonner-toast]').filter({ hasText: 'Loaded a shared setup' })
  await expect(notice).toContainText('You’re on Arms Warrior now.')
  await expect(page.getByRole('button', { name: /^Spec: Arms Warrior/ })).toBeVisible()
  await expectRace(page, /Troll/)
  await switchSpec(page, 'Fury')
  await expectRace(page, /Gnome/)
}

test.describe('share links', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('a link for your other spec switches to it, and keeps your setup for the spec you were on', async ({ page }) => {
    const link = await armsTrollLinkFromFuryGnome(page)
    // A fresh page load of the link.
    await page.goto('about:blank')
    await page.goto(link)
    await loadedArmsKeepingOwnFury(page)
  })

  test('a link pasted into a tab that already has the app open loads it too', async ({ page }) => {
    const link = await armsTrollLinkFromFuryGnome(page)
    // Only the hash changes, so the page doesn't reload.
    await page.evaluate(() => ((window as unknown as { stayed: boolean }).stayed = true))
    await page.evaluate((url) => (location.href = url), link)
    await loadedArmsKeepingOwnFury(page)
    expect(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed)).toBe(true)
    expect(new URL(page.url()).hash).toBe('')
  })

  test('a broken link pasted into an open tab says so and changes nothing', async ({ page }) => {
    await page.goto('./')
    await page.evaluate(() => (location.hash = '#s=not-a-real-setup'))
    await expect(page.getByText('That share link is broken')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Spec: Fury Warrior/ })).toBeVisible()
    expect(new URL(page.url()).hash).toBe('')
  })
})

test.describe('Share button', () => {
  // Safari (iOS and macOS) only lets a page write to the clipboard during the tap itself, not
  // after an await. This clipboard refuses the same way.
  const strictClipboard = () => {
    const copied: Promise<string>[] = []
    const inTap = () => (window as unknown as { event?: Event }).event?.type === 'click'
    const refuse = () => Promise.reject(new DOMException('Not during a tap', 'NotAllowedError'))
    Object.defineProperty(window, 'copied', { value: copied })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        write: (items: ClipboardItem[]) => {
          if (!inTap()) return refuse()
          copied.push(items[0].getType('text/plain').then((blob) => blob.text()))
          return Promise.resolve()
        },
        writeText: (text: string) => {
          if (!inTap()) return refuse()
          copied.push(Promise.resolve(text))
          return Promise.resolve()
        },
      },
    })
  }

  test('copies the link during the tap, as Safari requires', async ({ page }) => {
    await page.addInitScript(strictClipboard)
    await page.goto('./')
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const link = await page.evaluate(() => (window as unknown as { copied: Promise<string>[] }).copied[0])
    expect(link).toContain('/forever_sim/#s=')
  })

  test('says so when the browser refuses the clipboard', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          write: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
          writeText: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
        },
      })
    })
    await page.goto('./')
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Couldn’t copy the link')).toBeVisible()
    await expect(page.getByText(/Allow clipboard access for this site/)).toBeVisible()
  })
})
