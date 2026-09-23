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

/** Copies a link to an Arms Troll with the app's Share button, then saves your own Arms as an Orc and goes back to Fury. */
async function armsTrollLinkWithOwnArmsOrc(page: Page) {
  await page.goto('./')
  await switchSpec(page, 'Arms')
  await chooseRace(page, /Troll/)
  await page.getByRole('button', { name: /Share/ }).click()
  await expect(page.getByText('Link copied')).toBeVisible()
  const link = await page.evaluate(() => navigator.clipboard.readText())
  await chooseRace(page, /Orc/)
  await switchSpec(page, 'Fury')
  return link
}

async function undoRestoresOwnArms(page: Page) {
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Loaded a shared setup' })
  await expect(toast).toContainText('You’re on Arms Warrior now.')
  await expect(page.getByRole('button', { name: /^Spec: Arms Warrior/ })).toBeVisible()
  await expectRace(page, /Troll/)
  await toast.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('button', { name: /^Spec: Fury Warrior/ })).toBeVisible()
  await switchSpec(page, 'Arms')
  await expectRace(page, /Orc/)
}

test.describe('share links', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('undoing a link for your other spec gives your own setup for that spec back', async ({ page }) => {
    const link = await armsTrollLinkWithOwnArmsOrc(page)
    // A fresh page load of the link.
    await page.goto('about:blank')
    await page.goto(link)
    await undoRestoresOwnArms(page)
  })

  test('a link pasted into a tab that already has the app open loads it, with Undo', async ({ page }) => {
    const link = await armsTrollLinkWithOwnArmsOrc(page)
    // Only the hash changes, so the page doesn't reload.
    await page.evaluate(() => ((window as unknown as { stayed: boolean }).stayed = true))
    await page.evaluate((url) => (location.href = url), link)
    await undoRestoresOwnArms(page)
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

test.describe('undo toasts', () => {
  const resetFury = async (page: Page) => {
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /Reset Fury/ }).click()
  }

  test('stay up 10 s', async ({ page }) => {
    await page.clock.install()
    await page.goto('./')
    await resetFury(page)
    const undo = page.getByRole('button', { name: 'Undo' })
    await expect(undo).toBeVisible()
    await page.clock.runFor(8_000)
    await expect(undo).toBeVisible()
    await page.clock.runFor(3_000)
    await expect(undo).toBeHidden()
  })

  test('wait while hovered or focused', async ({ page }) => {
    await page.clock.install()
    await page.goto('./')
    await resetFury(page)
    const undo = page.getByRole('button', { name: 'Undo' })
    await undo.hover()
    await page.clock.runFor(30_000)
    await expect(undo).toBeVisible()
    await page.mouse.move(1, 1)
    await undo.focus()
    await page.clock.runFor(30_000)
    await expect(undo).toBeVisible()
    await page.getByRole('button', { name: 'More' }).focus()
    await page.clock.runFor(11_000)
    await expect(undo).toBeHidden()
  })

  test('Undo puts the setup back', async ({ page }) => {
    await page.goto('./')
    // Orc changes sides, so its gear swap shows a toast with its own Undo too.
    await chooseRace(page, /Orc/)
    await resetFury(page)
    await expectRace(page, /Human/)
    await page.locator('[data-sonner-toast]').filter({ hasText: 'Fury Warrior reset to defaults' }).getByRole('button', { name: 'Undo' }).click()
    await expectRace(page, /Orc/)
    await page.getByRole('tab', { name: 'Gear', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Shoulders: Champion\'s Plate Shoulders' })).toBeVisible()
  })

  test('a tab clicked right after Undo stays open', async ({ page }) => {
    // Leaving a toast hands focus back to the control focused before it (here the Buffs tab),
    // which mustn't switch the tab back.
    await page.goto('./')
    await resetFury(page)
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    await page.getByRole('button', { name: 'Undo' }).click()
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Fight', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Fight', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { level: 2, name: 'Fight', exact: true })).toBeVisible()
  })
})

test.describe('undo toasts on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('sit above the bottom bar, clear of the header', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /Reset Fury/ }).click()
    const toast = page.locator('[data-sonner-toast]')
    await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible()
    const header = (await page.locator('header').boundingBox())!
    const bar = (await page.getByRole('button', { name: 'Show results' }).boundingBox())!
    // Wait out the slide-in.
    await expect.poll(async () => (await toast.boundingBox())!.y + (await toast.boundingBox())!.height).toBeLessThanOrEqual(bar.y)
    expect((await toast.boundingBox())!.y).toBeGreaterThanOrEqual(header.y + header.height)
  })
})
