import type { Locator, Page } from '@playwright/test'
import { LAST_SEEN_RELEASE_KEY, RELEASES } from '../src/app/releases.ts'
import { expect, test } from './fixtures.ts'
import { linkFor, pasteLink } from './links.ts'

// docs/ux.md "What's new": a returning visitor's first load of a newer release lists every release
// since the one they saw last, once; a first visit, or an id the list doesn't know, shows nothing;
// a visitor from before What's New sees the newest alone; the load's notices wait until it closes;
// and the header's menu, About's release stamp, or What's New's All releases opens the whole history.

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 900 } }

const OLDEST = RELEASES.at(-1)!.id
const whatsNew = (page: Page) => page.getByRole('dialog', { name: 'What’s new' })
const toasts = (page: Page) => page.locator('[data-sonner-toast]')
const storedId = (page: Page) => page.evaluate((key) => localStorage.getItem(key), LAST_SEEN_RELEASE_KEY)

/** Whether screen readers can hear the toasts: nothing around them is aria-hidden or inert. */
const toastsHeard = (page: Page) =>
  page.locator('[data-sonner-toaster]').evaluate((el) => {
    for (let at: Element | null = el; at; at = at.parentElement) if (at.getAttribute('aria-hidden') === 'true' || at.hasAttribute('inert')) return false
    return true
  })

/** Whether a toast covers `button` at its left edge, middle or right edge. */
const coveredByToast = (button: Locator) =>
  button.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return [r.left + 4, r.left + r.width / 2, r.right - 4].some((x) => !!document.elementFromPoint(x, r.top + r.height / 2)?.closest('[data-sonner-toast]'))
  })

/**
 * A Protection paladin's automatic save from before the threat set and today's talents, the player's
 * own head kept (as e2e/follow-defaults.spec.ts's): its load moves the rest to the new defaults, and
 * says so. Seeded once per test, so a reload keeps what the app saved.
 */
async function seedOldPaladin(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    const config = {
      version: 1,
      spec: 'paladin-protection',
      talents: '2-4530513321301551-502',
      gear: {
        head: { itemId: 16731, enchantId: 'arcanumFocus' },
        neck: { itemId: 13091 },
        shoulder: { itemId: 14552 },
        back: { itemId: 11930, enchantId: 'cloakSuperiorDefense' },
        chest: { itemId: 14624, enchantId: 'chestGreaterStats' },
        wrist: { itemId: 13951, enchantId: 'bracerSuperiorStamina' },
        hands: { itemId: 14622, enchantId: 'gloveThreat' },
        waist: { itemId: 14620 },
        legs: { itemId: 14623 },
        feet: { itemId: 14621, enchantId: 'bootsGreaterAgility' },
        finger1: { itemId: 11669 },
        finger2: { itemId: 15855 },
        trinket1: { itemId: 11810 },
        trinket2: { itemId: 4130 },
        mainHand: { itemId: 871 },
        offHand: { itemId: 12602, enchantId: 'shieldGreaterStamina' },
      },
    }
    localStorage.setItem('forever-sim:setup', JSON.stringify({ state: { config, bySpec: {}, section: 'gear' }, version: 1 }))
  })
}

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

      test('All releases opens Release history in its place, which gives focus to the menu’s button and lets the load’s notice go', async ({ page }) => {
        const hash = await linkFor(page, { version: 1, spec: 'warrior-arms' })
        await page.goto(`./${hash}`)
        const dialog = whatsNew(page)
        const all = dialog.getByRole('button', { name: 'All releases' })
        await expect(all).toBeVisible()
        await expect.poll(async () => (await all.boundingBox())!.height).toBeGreaterThanOrEqual(44)
        await all.focus()
        await page.keyboard.press('Enter')

        const sheet = page.getByRole('dialog', { name: 'Release history' })
        await expect(sheet).toBeVisible()
        await expect(dialog).toBeHidden()
        await expect(sheet.getByRole('heading', { name: 'Release history' })).toBeFocused()
        await expect(sheet.locator('article')).toHaveCount(RELEASES.length)
        // The link's notice still waits: the sheet hides the page from screen readers too.
        await page.waitForTimeout(500)
        await expect(toasts(page)).toHaveCount(0)
        await page.keyboard.press('Escape')
        await expect(sheet).toBeHidden()
        await expect(page.getByRole('button', { name: 'More' })).toBeFocused()
        await expect(toasts(page).filter({ hasText: 'Loaded a shared setup' })).toBeVisible()
        expect(await toastsHeard(page)).toBe(true)
      })

      // A notice that comes up while it's open (a link pasted in) doesn't cover its buttons.
      test('a link pasted in while it’s open says so at once, clear of Got it and All releases', async ({ page }) => {
        await page.goto('./')
        const dialog = whatsNew(page)
        await expect(dialog).toBeVisible()
        await pasteLink(page, { version: 1, spec: 'warrior-arms' })
        const notice = toasts(page).filter({ hasText: 'Loaded a shared setup' })
        await expect(notice).toBeVisible()
        // Once the toast has slid in and settled, and the footer has made room for it.
        await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--toast-clearance'))).not.toBe('')
        await page.waitForTimeout(1000)
        for (const button of ['Got it', 'All releases']) expect(await coveredByToast(dialog.getByRole('button', { name: button })), button).toBe(false)
        await expect(notice).toBeVisible()
        await expect(dialog).toBeVisible()
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

    test('loads the link’s setup under it, and its notice waits until it closes, to be heard', async ({ page }) => {
      const hash = await linkFor(page, { version: 1, spec: 'warrior-arms' })
      await page.goto(`./${hash}`)
      const dialog = whatsNew(page)
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('heading', { name: 'What’s new' })).toBeFocused()
      // Held: nothing over the dialog while it's open.
      await page.waitForTimeout(1000)
      await expect(toasts(page)).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(toasts(page).filter({ hasText: 'Loaded a shared setup' })).toBeVisible()
      expect(await toastsHeard(page)).toBe(true)
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
      expect(await storedId(page)).toBe(RELEASES[0].id)
    })

    // The link's setup is saved as it loads. What's New checked before then, so it's still a first
    // visit, not one from before What's New.
    test('from a shared link shows nothing, and the link’s notice at once', async ({ page }) => {
      const hash = await linkFor(page, { version: 1, spec: 'warrior-arms' })
      await page.goto(`./${hash}`)
      await expect(toasts(page).filter({ hasText: 'Loaded a shared setup' })).toBeVisible()
      await expect(page.getByRole('button', { name: /^Spec: Arms Warrior/ })).toBeVisible()
      await expect.poll(() => page.evaluate(() => localStorage.getItem('forever-sim:setup') !== null)).toBe(true)
      await expect(whatsNew(page)).toHaveCount(0)
      expect(await storedId(page)).toBe(RELEASES[0].id)
    })
  })

  // docs/ux.md "What's new": a browser with an automatic save or named setups, but no release id,
  // was here before What's New shipped.
  test.describe('a visitor from before What’s New', () => {
    test.use({ lastSeenRelease: null })

    test('with an automatic save sees the newest release alone, and the defaults notice once it closes', async ({ page }) => {
      await seedOldPaladin(page)
      await page.goto('./')
      const dialog = whatsNew(page)
      await expect(dialog).toBeVisible()
      expect(await listedTimes(dialog)).toEqual([isoOf(RELEASES[0].time)])
      expect(await storedId(page)).toBe(RELEASES[0].id)
      // The load moved the paladin to the new defaults; that notice waits for What's New.
      await page.waitForTimeout(1000)
      await expect(toasts(page)).toHaveCount(0)
      await dialog.getByRole('button', { name: 'Got it' }).click()
      await expect(dialog).toBeHidden()
      await expect(toasts(page).filter({ hasText: 'Updated to the new default gear and talents for Protection Paladin' })).toBeVisible()
      expect(await toastsHeard(page)).toBe(true)

      // Seen, and the move said once: a reload shows neither.
      await page.reload()
      await loaded(page)
      await page.waitForTimeout(500)
      await expect(whatsNew(page)).toHaveCount(0)
      await expect(toasts(page)).toHaveCount(0)
    })

    test('with only named setups sees the newest release alone', async ({ page }) => {
      await page.addInitScript(() => {
        if (localStorage.getItem('forever-sim:last-seen-release') === null) localStorage.setItem('forever-sim:saved-setups', '[]')
      })
      await page.goto('./')
      const dialog = whatsNew(page)
      await expect(dialog).toBeVisible()
      expect(await listedTimes(dialog)).toEqual([isoOf(RELEASES[0].time)])
    })
  })

  test.describe('an id from a newer release', () => {
    test.use({ lastSeenRelease: '2099-01-01.1' })

    test('shows nothing, and keeps it', async ({ page }) => {
      await page.goto('./')
      await loaded(page)
      await page.waitForTimeout(500)
      await expect(whatsNew(page)).toHaveCount(0)
      expect(await storedId(page)).toBe('2099-01-01.1')
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
      // The newest is labelled Latest, and only it.
      await expect(sheet.locator('article').first().getByRole('heading', { level: 3 })).toContainText('Latest')
      await expect(sheet.getByText(/Latest/)).toHaveCount(1)
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
