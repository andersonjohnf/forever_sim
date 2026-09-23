import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#persistence-and-sharing: a toast never hides the focused control. A waiting toast
// clears every control in a sheet or drawer, not just on the page (PV1); only a waiting toast
// grows the bottom padding, so nothing moves when a 10 s toast goes (PV5); focus a toast hands
// back is scrolled into view (PV6); focus a toast grows over scrolls clear of it (PV7); and
// neither scrolls anything after a click (QV4) or when the mouse spreads the toasts out (QV5).

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
const DESKTOP = { viewport: { width: 1280, height: 900 } }

const toasts = (page: Page) => page.locator('[data-sonner-toast]')

/** Waits `n` animation frames, so the toaster has measured whatever just changed. */
const frames = (page: Page, n = 2) =>
  page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        const step = (left: number) => (left === 0 ? resolve() : requestAnimationFrame(() => step(left - 1)))
        step(n)
      }),
    n,
  )

/** Scrolls the page so `target`'s bottom edge rests `gap` px above the top of the toasts (under it, if negative). */
async function restAboveToasts(target: Locator, gap: number) {
  // How far it is from resting there.
  const off = () =>
    target.evaluate((el, gap) => {
      const top = Math.min(...[...document.querySelectorAll("[data-sonner-toast][data-removed='false']")].map((t) => t.getBoundingClientRect().top))
      return el.getBoundingClientRect().bottom - (top - gap)
    }, gap)
  const by = await off()
  await target.page().evaluate((by) => window.scrollBy(0, by), by)
  expect(Math.abs(await off()), 'the page scrolls far enough').toBeLessThan(1)
}

/** Chooses a Gear menu item with the keyboard, so its toast waits for Dismiss. */
async function gearMenuByKeyboard(page: Page, item: 'Remove all gear' | 'Equip pre-raid best in slot') {
  await page.getByRole('tab', { name: 'Gear', exact: true }).click()
  await page.getByRole('button', { name: 'Gear options' }).click()
  await page.getByRole('menuitem', { name: item }).focus()
  await page.keyboard.press('Enter')
}

/** Chooses a Gear menu item with a tap or click, so its toast goes by itself in 10 s. */
async function gearMenuByPointer(page: Page, item: 'Remove all gear' | 'Equip pre-raid best in slot') {
  await page.getByRole('tab', { name: 'Gear', exact: true }).click()
  await page.getByRole('button', { name: 'Gear options' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

/** Raises a toast that waits for Dismiss, and waits for it to slide in. */
async function waitingToast(page: Page, item: 'Remove all gear' | 'Equip pre-raid best in slot' = 'Remove all gear') {
  await gearMenuByKeyboard(page, item)
  const toast = toasts(page).filter({ hasText: /to reach Undo/ })
  await expect(toast).toBeVisible()
  await settled(page)
  return toast
}

/**
 * Raises a 10 s toast shorter than a waiting one, and waits for it to slide in: Enter on a talent
 * when every point is spent says so.
 */
async function talentRefusal(page: Page) {
  await page.getByRole('tab', { name: 'Talents', exact: true }).click()
  await page.getByRole('button', { name: /, 0 of \d+$/ }).first().focus()
  await page.keyboard.press('Enter')
  const refusal = toasts(page).filter({ hasText: 'points are spent' })
  await expect(refusal).toBeVisible()
  await settled(page)
  return refusal
}

/** Waits until no toast is moving. */
async function settled(page: Page) {
  await expect
    .poll(() => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].some((t) => t.getAnimations().length > 0)))
    .toBe(false)
}

/** How many px of the focused control the toasts cover (TU2's measure, e2e/undo-toasts.spec.ts). */
const covered = (page: Page) =>
  page.evaluate(() => {
    const box = document.activeElement!.getBoundingClientRect()
    const tops = [...document.querySelectorAll("[data-sonner-toast][data-removed='false']")].map((t) => t.getBoundingClientRect().top)
    return Math.max(0, box.bottom - Math.min(...tops))
  })

/**
 * Tabs once round an open sheet or dialog (its focus trap brings Tab back to the first stop), or
 * through `limit` stops, and checks that no stop is left under a toast. With `expand`, it opens
 * each collapsed section on the way, with Enter, so the controls inside get their turn. Returns
 * how many stops it checked.
 */
async function tabClearOfToasts(page: Page, { expand = false, limit = 200 } = {}) {
  await page.evaluate(() => ((window as unknown as { tabbed: WeakSet<Element> }).tabbed = new WeakSet()))
  let checked = 0
  while (checked < limit) {
    await page.keyboard.press('Tab')
    const stop = await page.evaluate(() => {
      const el = document.activeElement!
      const { tabbed } = window as unknown as { tabbed: WeakSet<Element> }
      const again = tabbed.has(el)
      tabbed.add(el)
      const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 50) ?? el.tagName
      const collapsed = el.getAttribute('data-slot') === 'collapsible-trigger' && el.getAttribute('aria-expanded') === 'false'
      return { again, name, collapsed }
    })
    if (stop.again) break
    if (expand && stop.collapsed) await page.keyboard.press('Enter')
    await expect.poll(() => covered(page), { message: `${stop.name} is clear of the toast` }).toBe(0)
    checked++
  }
  return checked
}

/** Waits for an opening sheet or dialog to finish sliding in. */
async function opened(page: Page, name: string) {
  const sheet = page.getByRole('dialog', { name })
  await expect(sheet).toBeVisible()
  await expect.poll(() => sheet.evaluate((el) => el.getAnimations().length)).toBe(0)
  return sheet
}

test.describe('a waiting toast over a sheet or drawer (PV1)', () => {
  test.describe('phone', () => {
    test.use(PHONE)

    test('every control in the results sheet can be focused clear of it', async ({ page }) => {
      await page.goto('./')
      const toast = await waitingToast(page)
      await page.getByRole('button', { name: 'Simulate', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
      await page.getByRole('button', { name: 'Show results' }).click()
      await opened(page, 'Results')
      await expect(page.getByRole('heading', { name: 'Results' })).toBeFocused()
      // Close, Open Gear, Run again, the three sections (opened on the way, the Character sheet
      // among them) and every assumption in the last.
      expect(await tabClearOfToasts(page, { expand: true })).toBeGreaterThan(10)
      await expect(toast).toBeVisible()
    })

    test('every choice in the enchant drawer can be made active clear of it', async ({ page }) => {
      await page.goto('./')
      await gearMenuByPointer(page, 'Remove all gear')
      const toast = await waitingToast(page, 'Equip pre-raid best in slot')
      await page.getByRole('button', { name: /, Hands enchant$/ }).click()
      await opened(page, 'Hands enchant')
      const list = page.getByRole('listbox', { name: 'Hands enchants' })
      await expect(list).toBeFocused()
      const options = await list.getByRole('option').count()
      expect(options).toBeGreaterThan(8)
      // The list holds focus; the active option is what the keys move, so that's what must show.
      const activeCovered = () =>
        page.evaluate(() => {
          const box = document.querySelector('[role=option][data-active]')!.getBoundingClientRect()
          const tops = [...document.querySelectorAll("[data-sonner-toast][data-removed='false']")].map((t) => t.getBoundingClientRect().top)
          return Math.max(0, box.bottom - Math.min(...tops))
        })
      for (let i = 0; i < options; i++) {
        await page.keyboard.press('ArrowDown')
        await expect.poll(activeCovered, { message: `option ${i + 1} is clear of the toast` }).toBe(0)
      }
      await expect(toast).toBeVisible()
    })
  })

  for (const [width, device] of [
    [390, PHONE],
    [768, { viewport: { width: 768, height: 900 } }],
  ] as const) {
    test.describe(`${width} px`, () => {
      test.use(device)

      test('every control in About can be focused clear of it', async ({ page }) => {
        await page.goto('./')
        const toast = await waitingToast(page)
        await page.getByRole('button', { name: 'More' }).click()
        await page.getByRole('menuitem', { name: 'About & data' }).click()
        await opened(page, 'About Forever Sim')
        // Close, the wago.tools link, and the two links under "Source and docs".
        expect(await tabClearOfToasts(page)).toBe(4)
        await expect(toast).toBeVisible()
      })
    })
  }

  for (const [name, device] of [
    ['phone', PHONE],
    ['desktop', DESKTOP],
  ] as const) {
    test.describe(name, () => {
      test.use(device)

      test('the item picker’s list can be focused clear of it', async ({ page }) => {
        await page.goto('./')
        const toast = await waitingToast(page)
        await page.getByRole('button', { name: 'Main hand: empty' }).click()
        await opened(page, 'Choose main hand')
        await page.getByRole('radio', { name: 'All items' }).click()
        // Well past the first screenful of items.
        expect(await tabClearOfToasts(page, { limit: 40 })).toBe(40)
        await expect(toast).toBeVisible()
      })
    })
  }
})

/** How many px of the focused control are hidden: under a toast, the phone's bar or the sticky tabs. */
const obscured = (page: Page) =>
  page.evaluate(() => {
    const box = document.activeElement!.getBoundingClientRect()
    const tops = [...document.querySelectorAll("[data-sonner-toast][data-removed='false']")].map((t) => t.getBoundingClientRect().top)
    const bar = document.querySelector('[data-sim-bar]')!.getBoundingClientRect()
    const tabs = document.querySelector('[data-sticky-tabs]')!.getBoundingClientRect()
    const floor = Math.min(window.innerHeight, bar.height > 0 ? bar.top : Infinity, ...tops)
    return Math.max(0, box.bottom - floor) + Math.max(0, tabs.bottom - box.top)
  })

for (const [name, device] of [
  ['phone', PHONE],
  ['desktop', DESKTOP],
] as const) {
  test.describe(`toasts and the page, ${name}`, () => {
    test.use(device)

    test('a toast that goes by itself leaves the bottom padding alone, so nothing moves when it goes (PV5)', async ({ page }) => {
      await page.clock.install()
      await page.goto('./')
      const padding = () => page.locator('main').evaluate((el) => getComputedStyle(el).paddingBottom)
      const before = await padding()
      await gearMenuByPointer(page, 'Remove all gear')
      const toast = toasts(page).filter({ hasText: 'All gear removed' })
      await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible()
      await expect(toast.getByRole('button', { name: 'Dismiss' })).toHaveCount(0)
      await settled(page)
      expect(await padding()).toBe(before)

      // Scrolled to the end of the page as it times out.
      await page.mouse.move(0, 0)
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const end = await page.evaluate(() => window.scrollY)
      await page.clock.runFor(11_000)
      await expect(toast).toHaveCount(0)
      expect(await padding()).toBe(before)
      expect(await page.evaluate(() => window.scrollY)).toBe(end)
    })

    test('Undo hands focus back in view, clear of the toast and the bars, though the page grew (PV6)', async ({ page }) => {
      await page.goto('./')
      const toast = await waitingToast(page)
      const link = page.getByRole('link', { name: 'wago.tools' })
      await link.focus()
      await page.keyboard.press('Alt+KeyT')
      await expect(toast.getByRole('button', { name: 'Undo' })).toBeFocused()
      await page.keyboard.press('Enter')
      // The gear is back, so the page is longer above the link, and sonner hands focus back
      // without scrolling.
      await expect(page.getByRole('button', { name: 'Main hand: empty' })).toHaveCount(0)
      await expect(link).toBeFocused()
      await expect(link).toBeInViewport({ ratio: 1 })
      await expect.poll(() => obscured(page)).toBe(0)
    })
  })
}

// A phone's talent cell opens a popover rather than refusing, so the narrow case is a 390 px
// window with a mouse: the toasts are as wide as on a phone.
for (const [name, device] of [
  ['390 px', { viewport: { width: 390, height: 844 } }],
  ['desktop', DESKTOP],
] as const) {
  test.describe(`toasts and the page, ${name}`, () => {
    test.use(device)

    test('focus a waiting toast grows over, as the toast in front of it goes, scrolls clear of it (PV7)', async ({ page }) => {
      await page.clock.install()
      await page.goto('./')
      const waiting = await waitingToast(page)
      const refusal = await talentRefusal(page)

      // The footer's link, focused from the keyboard and just clear of the stack.
      const link = page.getByRole('link', { name: 'wago.tools' })
      await link.focus()
      await restAboveToasts(link, 2)
      expect(await covered(page)).toBe(0)
      const before = await page.evaluate(() => window.scrollY)

      // The refusal times out, and the waiting toast comes to the front at its full height.
      await page.mouse.move(0, 0)
      await page.clock.fastForward(10_000)
      await expect(refusal).toHaveCount(0)
      await settled(page)
      await expect.poll(() => covered(page)).toBe(0)
      await expect(link).toBeFocused()
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before)
      await expect(waiting).toBeVisible()
    })

    test('hovering the toasts spreads them out but scrolls nothing (QV5)', async ({ page }) => {
      await page.goto('./')
      await waitingToast(page)
      const refusal = await talentRefusal(page)
      // The footer's link, focused from the keyboard and just clear of the stack.
      const link = page.getByRole('link', { name: 'wago.tools' })
      await link.focus()
      await restAboveToasts(link, 2)
      expect(await covered(page)).toBe(0)
      const before = await page.evaluate(() => window.scrollY)

      // The mouse over the stack spreads it out, higher up the window.
      const box = (await refusal.boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await expect(refusal).toHaveAttribute('data-expanded', 'true')
      await settled(page)
      await frames(page)
      expect(await page.evaluate(() => window.scrollY)).toBe(before)
      await expect(link).toBeFocused()
    })

    test('after a click, a toast that hands focus back scrolls nothing, even to a text field (QV4)', async ({ page }) => {
      await page.goto('./')
      await gearMenuByPointer(page, 'Remove all gear')
      const toast = toasts(page).filter({ hasText: 'All gear removed' })
      await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible()
      await page.getByRole('tab', { name: 'Fight', exact: true }).click()
      await page.getByRole('button', { name: 'Advanced', exact: true }).click()
      await settled(page)

      // Seed, partly under the toast, clicked where it's clear of it. Chromium counts any focused
      // text field as :focus-visible, however it was focused.
      const seed = page.getByRole('textbox', { name: 'Random seed' })
      await restAboveToasts(seed, -12)
      const box = (await seed.boundingBox())!
      await page.mouse.click(box.x + box.width / 2, box.y + 8)
      await expect(seed).toBeFocused()
      expect(await covered(page)).toBeGreaterThan(0)
      const before = await page.evaluate(() => window.scrollY)

      await toast.getByRole('button', { name: 'Undo' }).click()
      await expect(toast).toHaveCount(0)
      await expect(seed).toBeFocused()
      await frames(page)
      expect(await page.evaluate(() => window.scrollY)).toBe(before)
    })
  })
}
