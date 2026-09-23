import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#persistence-and-sharing: one Undo at a time, never a stale one (TU1); a waiting toast
// never covers the focused control, and they don't pile up (TU2); on a touch screen, typing in a
// text field isn't keyboard use (TU3); and an Undo that takes away the item under an open enchant
// picker leaves focus on the slot (TU12).

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 900 } }

const toasts = (page: Page) => page.locator('[data-sonner-toast]')
const undoIn = (page: Page, title: string) => toasts(page).filter({ hasText: title }).getByRole('button', { name: 'Undo' })

/** Chooses a Gear menu item with the keyboard, so its toast waits for Dismiss. */
async function gearMenuByKeyboard(page: Page, item: 'Remove all gear' | 'Equip pre-raid best in slot') {
  await page.getByRole('tab', { name: 'Gear', exact: true }).click()
  await page.getByRole('button', { name: 'Gear options' }).click()
  await page.getByRole('menuitem', { name: item }).focus()
  await page.keyboard.press('Enter')
}

/** Chooses a Gear menu item with a tap or click, so its toast goes by itself. */
async function gearMenuByPointer(page: Page, item: 'Remove all gear' | 'Equip pre-raid best in slot') {
  await page.getByRole('tab', { name: 'Gear', exact: true }).click()
  await page.getByRole('button', { name: 'Gear options' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

test.describe('one Undo at a time, never stale (TU1)', () => {
  test.use(DESKTOP)

  test('a later change takes a waiting Undo away, so it can’t revert that change', async ({ page }) => {
    await page.goto('./')
    await gearMenuByKeyboard(page, 'Remove all gear')
    const toast = toasts(page).filter({ hasText: 'All gear removed' })
    await expect(toast).toContainText(/to reach Undo/)
    await expect(page.getByRole('button', { name: 'Main hand: empty' })).toBeVisible()

    // Then a race (no faction gear left to swap, so no toast of its own) and a position.
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: 'Orc' }).click()
    await expect(toast).toHaveCount(0)
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    await page.getByRole('radio', { name: 'In front' }).click()

    // Alt+T finds no Undo, and nothing was reverted.
    await page.keyboard.press('Alt+KeyT')
    await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0)
    await expect(page.getByRole('radio', { name: 'In front' })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await expect(page.getByRole('radio', { name: 'Orc' })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('tab', { name: 'Gear', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Main hand: empty' })).toBeVisible()
  })

  test('a spec switch takes an Undo toast away, so Undo can’t switch spec back', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /Reset Fury/ }).click()
    await expect(undoIn(page, 'Fury Warrior reset to defaults')).toBeVisible()

    await page.getByRole('button', { name: /^Spec: / }).click()
    await page.getByRole('menuitem', { name: /Arms/ }).click()
    await expect(page.getByRole('button', { name: /^Spec: Arms Warrior/ })).toBeVisible()
    await expect(toasts(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Spec: Arms Warrior/ })).toBeVisible()
  })

  test('a new Undo toast replaces the last, and undoes only its own change', async ({ page }) => {
    await page.goto('./')
    await gearMenuByKeyboard(page, 'Remove all gear')
    await expect(undoIn(page, 'All gear removed')).toBeVisible()
    await gearMenuByKeyboard(page, 'Equip pre-raid best in slot')
    await expect(undoIn(page, 'Pre-raid best in slot equipped')).toBeVisible()
    // No pile-up: the first is gone once it has slid out.
    await expect(toasts(page)).toHaveCount(1)

    await page.keyboard.press('Alt+KeyT')
    await expect(undoIn(page, 'Pre-raid best in slot equipped')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(toasts(page)).toHaveCount(0)
    // Back to where that change started: no gear.
    await expect(page.getByRole('button', { name: 'Main hand: empty' })).toBeVisible()
  })

  test('a talent build’s and Reset rotation’s Undo go with the next change too', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    await page.getByRole('combobox', { name: 'Talent build presets' }).click()
    await page.getByRole('option', { name: 'Fury + Precision' }).click()
    await expect(undoIn(page, 'Fury + Precision build loaded')).toBeVisible()
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    await page.getByRole('switch', { name: 'Slam', exact: true }).click()
    await expect(toasts(page)).toHaveCount(0)
    await expect(page.getByRole('switch', { name: 'Slam', exact: true })).toBeChecked()

    await page.getByRole('button', { name: 'Reset rotation' }).click()
    await expect(undoIn(page, 'Rotation reset to its defaults')).toBeVisible()
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    await page.getByRole('switch', { name: /Juju Flurry/ }).first().click()
    await expect(toasts(page)).toHaveCount(0)
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    // The build stayed: its Undo went unused.
    await expect(page.getByRole('combobox', { name: 'Talent build presets' })).toHaveText('Fury + Precision')
  })

  test('the race swap’s Undo goes when the next race is picked with the arrow keys', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    // Human → Orc swaps the faction gear, with an Undo; Orc → Undead doesn't, and takes that Undo away.
    await page.getByRole('radio', { name: 'Orc' }).click()
    await expect(undoIn(page, 'Swapped 2 items for their Horde versions')).toBeVisible()
    await page.getByRole('radio', { name: 'Orc' }).focus()
    await page.keyboard.press('ArrowRight')
    const next = page.locator('[aria-labelledby="race-label"] [aria-checked="true"]')
    await expect(next).not.toHaveAccessibleName('Orc')
    await expect(toasts(page)).toHaveCount(0)
  })
})

for (const [width, device] of [
  [390, PHONE],
  [1280, DESKTOP],
] as const) {
  test.describe(`a waiting toast, ${width} px (TU2)`, () => {
    test.use(device)

    test('never covers the focused control as focus moves on under it (WCAG 2.4.11)', async ({ page }) => {
      await page.goto('./')
      await gearMenuByKeyboard(page, 'Remove all gear')
      const toast = toasts(page).filter({ hasText: 'All gear removed' })
      await expect(toast).toContainText(/to reach Undo/)
      // Once it has slid in, the page's bottom scroll padding clears it.
      await expect.poll(() => toast.evaluate((el) => el.getAnimations().length)).toBe(0)
      const spare = await toast.evaluate(
        (el) => Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom) - (window.innerHeight - el.getBoundingClientRect().top),
      )
      expect(spare).toBeGreaterThanOrEqual(7)

      await expect(page.getByRole('button', { name: 'Gear options' })).toBeFocused()
      let checked = 0
      for (let i = 0; i < 17; i++) {
        await page.keyboard.press('Tab')
        if (!(await page.evaluate(() => document.activeElement?.hasAttribute('data-gear-slot')))) continue
        const covered = () =>
          page.evaluate(() => {
            const box = document.activeElement!.getBoundingClientRect()
            const tops = [...document.querySelectorAll("[data-sonner-toast][data-removed='false']")].map((t) => t.getBoundingClientRect().top)
            return Math.max(0, box.bottom - Math.min(...tops))
          })
        const name = await page.evaluate(() => document.activeElement!.getAttribute('aria-label'))
        await expect.poll(covered, { message: `${name} is clear of the toast` }).toBe(0)
        checked++
      }
      expect(checked).toBeGreaterThan(10)
      // Still waiting for Dismiss.
      await expect(toast).toBeVisible()
    })

    test('leaves room for the page’s last control, the footer link, to scroll clear of it', async ({ page }) => {
      await page.goto('./')
      await gearMenuByKeyboard(page, 'Remove all gear')
      const toast = toasts(page).filter({ hasText: 'All gear removed' })
      await expect(toast).toContainText(/to reach Undo/)
      await expect.poll(() => toast.evaluate((el) => el.getAnimations().length)).toBe(0)
      await page.getByRole('link', { name: 'wago.tools' }).focus()
      const covered = () =>
        toast.evaluate((el) => Math.max(0, document.activeElement!.getBoundingClientRect().bottom - el.getBoundingClientRect().top))
      await expect.poll(covered).toBe(0)
      await expect(toast).toBeVisible()
    })

    test('clears the focused control even when focus moves on while it’s still sliding in', async ({ page }) => {
      await page.goto('./')
      // A tenth of the speed, so focus surely moves on mid-slide.
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Animation.enable')
      await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 })
      await gearMenuByKeyboard(page, 'Remove all gear')
      const toast = toasts(page).filter({ hasText: 'All gear removed' })
      await expect(page.getByRole('button', { name: 'Gear options' })).toBeFocused()
      // Slot by slot while it slides in: each focused slot ends up clear of where the toast will
      // stop, resting on the toaster's bottom edge.
      let checked = 0
      for (let i = 0; i < 17; i++) {
        await page.keyboard.press('Tab')
        const state = await toast.evaluate((el: HTMLElement) => {
          const focused = document.activeElement!
          const rest = el.parentElement!.getBoundingClientRect().bottom - el.offsetHeight
          return { slot: focused.hasAttribute('data-gear-slot'), sliding: el.getAnimations().length > 0, covered: Math.max(0, focused.getBoundingClientRect().bottom - rest) }
        })
        if (!state.slot) continue
        expect(state.sliding, 'still sliding in').toBe(true)
        expect(state.covered).toBe(0)
        checked++
      }
      expect(checked).toBeGreaterThan(10)
    })
  })
}

test.describe('on a touch screen (TU3)', () => {
  test.use(PHONE)

  test.beforeEach(async ({ page }) => {
    // Headless Chromium can't emulate a coarse pointer, so answer that query the way a phone does.
    await page.addInitScript(() => {
      const original = window.matchMedia.bind(window)
      window.matchMedia = (query: string) => {
        if (!/\b(any-)?(hover|pointer)\b/.test(query)) return original(query)
        const matches = /hover:\s*none|pointer:\s*coarse/.test(query) && !/hover:\s*hover|pointer:\s*fine/.test(query)
        // A static list: phones don't switch input types mid-session.
        return {
          matches,
          media: query,
          onchange: null,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
          dispatchEvent: () => false,
        } as MediaQueryList
      }
    })
  })

  test('Enter in the paste dialog isn’t keyboard use: the toast has no Alt+T hint and goes in 10 s', async ({ page }) => {
    await page.clock.install()
    await page.goto('./')
    await page.getByRole('tab', { name: 'Talents', exact: true }).tap()
    await page.getByRole('button', { name: /Paste/ }).tap()
    const field = page.getByRole('dialog', { name: 'Paste a build code' }).getByRole('textbox', { name: 'Build code or link' })
    await field.fill('30305213132515201-05050103-')
    await field.press('Enter')
    const toast = toasts(page).filter({ hasText: 'Build imported' })
    await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible()
    await expect(toast).not.toContainText('to reach Undo')
    await expect(toast.getByRole('button', { name: 'Dismiss' })).toHaveCount(0)
    await page.clock.runFor(11_000)
    await expect(toast).toHaveCount(0)
  })
})

for (const [name, device] of [
  ['phone', PHONE],
  ['desktop', DESKTOP],
] as const) {
  test.describe(`Undo under an open enchant picker, ${name} (TU12)`, () => {
    test.use(device)

    test('takes the item away and leaves focus on its slot, not the page', async ({ page }) => {
      await page.goto('./')
      await gearMenuByPointer(page, 'Remove all gear')
      await gearMenuByPointer(page, 'Equip pre-raid best in slot')
      const undo = undoIn(page, 'Pre-raid best in slot equipped')
      await expect(undo).toBeVisible()

      await page.getByRole('button', { name: /, Hands enchant$/ }).click()
      const picker = page.getByRole('dialog', { name: 'Hands enchant' })
      await expect(picker.getByRole('listbox', { name: 'Hands enchants' })).toBeFocused()
      // The keyboard's way to Undo, over the open picker.
      await page.keyboard.press('Alt+KeyT')
      await expect(undo).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(picker).toBeHidden()
      await expect(page.getByRole('button', { name: 'Hands: empty' })).toBeFocused()
    })
  })
}
