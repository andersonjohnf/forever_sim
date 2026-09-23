import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'
import { pasteLink } from './links.ts'

// docs/ux.md#persistence-and-sharing: toasts are plain notices that go after 10 s, one of a kind
// at a time, and Alt+T reaches them; a tap or a swipe on one over a sheet leaves the sheet open;
// keyboard focus moving on under one, or that one comes up over, scrolls clear of it; and a
// select's list always drops from its trigger, clear of them.

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

/** Waits until no toast is moving. */
async function settled(page: Page) {
  await expect
    .poll(() => page.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].some((t) => t.getAnimations().length > 0)))
    .toBe(false)
}

async function resetSetup(page: Page) {
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: /Reset Fury/ }).click()
}

/**
 * Pastes a link to the default Fury setup into the tab, which says "Loaded a shared setup" and
 * leaves focus where it is, and waits for the notice to slide in. With `hold`, the mouse rests on
 * it, which keeps it up (sonner pauses its clock), so a long test doesn't outlast its 10 s.
 */
async function sharedLinkNotice(page: Page, { hold = false } = {}) {
  await pasteLink(page, { version: 1, spec: 'warrior-fury' })
  const notice = toasts(page).filter({ hasText: 'Loaded a shared setup' })
  await expect(notice).toBeVisible()
  await settled(page)
  if (hold) await notice.hover()
  return notice
}

/** How many px of the focused control the toasts cover. */
const covered = (page: Page) =>
  page.evaluate(() => {
    const box = document.activeElement!.getBoundingClientRect()
    const tops = [...document.querySelectorAll("[data-sonner-toast][data-removed='false']")].map((t) => t.getBoundingClientRect().top)
    return Math.max(0, box.bottom - Math.min(...tops))
  })

/** Scrolls the page so `target`'s bottom edge rests `gap` px above the top of the toasts. */
async function restAboveToasts(target: Locator, gap: number) {
  const off = () =>
    target.evaluate((el, gap) => {
      const top = Math.min(...[...document.querySelectorAll("[data-sonner-toast][data-removed='false']")].map((t) => t.getBoundingClientRect().top))
      return el.getBoundingClientRect().bottom - (top - gap)
    }, gap)
  const by = await off()
  await target.page().evaluate((by) => window.scrollBy(0, by), by)
  expect(Math.abs(await off()), 'the page scrolls far enough').toBeLessThan(1)
}

/** Waits for an opening sheet or dialog to finish sliding in. */
async function opened(page: Page, name: string) {
  const sheet = page.getByRole('dialog', { name })
  await expect(sheet).toBeVisible()
  await expect.poll(() => sheet.evaluate((el) => el.getAnimations().length)).toBe(0)
  return sheet
}

test.describe('notices', () => {
  test.use(DESKTOP)

  test('Reset setup says so in a plain notice, which goes after 10 s, or waits while hovered', async ({ page }) => {
    await page.clock.install()
    await page.goto('./')
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: 'Gnome' }).click()
    await resetSetup(page)
    await expect(page.getByRole('radio', { name: 'Human' })).toHaveAttribute('aria-checked', 'true')
    const notice = toasts(page).filter({ hasText: 'Fury Warrior reset to defaults' })
    await expect(notice).toBeVisible()
    await expect(notice.getByRole('button')).toHaveCount(0)
    await page.clock.runFor(8_000)
    await expect(notice).toBeVisible()
    await page.clock.runFor(3_000)
    await expect(notice).toHaveCount(0)

    await resetSetup(page)
    await notice.hover()
    await page.clock.runFor(30_000)
    await expect(notice).toBeVisible()
    await page.mouse.move(0, 0)
    await page.clock.runFor(11_000)
    await expect(notice).toHaveCount(0)
  })

  test('a newer notice of the same kind replaces the last', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: 'Orc' }).click()
    await expect(toasts(page).filter({ hasText: 'Swapped 2 items for their Horde versions' })).toBeVisible()
    await page.getByRole('radio', { name: 'Human' }).click()
    await expect(toasts(page).filter({ hasText: 'Swapped 2 items for their Alliance versions' })).toBeVisible()
    await expect(toasts(page)).toHaveCount(1)
  })

  test('Alt+T reaches them, and leaving them hands focus back', async ({ page }) => {
    await page.goto('./')
    await resetSetup(page)
    const notice = toasts(page).filter({ hasText: 'Fury Warrior reset to defaults' })
    await expect(notice).toBeVisible()
    const more = page.getByRole('button', { name: 'More' })
    await expect(more).toBeFocused()
    await page.keyboard.press('Alt+KeyT')
    await page.keyboard.press('Tab')
    await expect(notice).toBeFocused()
    await expect(notice).toHaveCSS('outline-style', 'solid')
    // Back out of them, towards the page: focus goes back to More, not to the page's last control.
    await page.keyboard.press('Shift+Tab')
    await expect(more).toBeFocused()
  })

  test('a click on one over the item picker lands on the notice and leaves the picker open', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: 'Head: Lionheart Helm' }).click()
    const picker = await opened(page, 'Choose head')
    const notice = await sharedLinkNotice(page)
    await notice.click()
    await expect(notice).toBeVisible()
    await frames(page)
    await expect(picker).toBeVisible()
    // Escape still closes the picker, and focus goes back to its slot.
    await page.keyboard.press('Escape')
    await expect(picker).toBeHidden()
    await expect(page.getByRole('button', { name: 'Head: Lionheart Helm' })).toBeFocused()
  })

  test('a tab clicked right after a notice stays open', async ({ page }) => {
    // Leaving the toasts hands focus back to the control focused before (here the Buffs tab),
    // which mustn't switch the tab back.
    await page.goto('./')
    await resetSetup(page)
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const notice = toasts(page).filter({ hasText: 'Fury Warrior reset to defaults' })
    await notice.click()
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Fight', exact: true })).toHaveAttribute('aria-selected', 'true')
    await frames(page)
    await expect(page.getByRole('tab', { name: 'Fight', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { level: 2, name: 'Fight', exact: true })).toBeVisible()
  })
})

test.describe('notices on a phone', () => {
  test.use(PHONE)

  test('sit above the bottom bar, clear of the header', async ({ page }) => {
    await page.goto('./')
    await resetSetup(page)
    const notice = toasts(page).filter({ hasText: 'Fury Warrior reset to defaults' })
    await expect(notice).toBeVisible()
    await settled(page)
    const header = (await page.locator('header').boundingBox())!
    const bar = (await page.getByRole('button', { name: 'Show results' }).boundingBox())!
    const box = (await notice.boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y)
    expect(box.y).toBeGreaterThanOrEqual(header.y + header.height)
  })

  test('a tap or a swipe on one over the results sheet leaves the sheet open', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Show results' }).tap()
    const sheet = await opened(page, 'Results')
    const title = sheet.getByRole('heading', { name: 'Results' })
    await expect(title).toBeFocused()
    const notice = await sharedLinkNotice(page)

    // A tap lands on the notice, not on the sheet under it, which stays open with focus in it.
    await notice.tap()
    await expect(notice).toBeVisible()
    await expect(sheet).toBeVisible()
    await expect(title).toBeFocused()

    // A swipe down sends it away; the sheet stays open.
    const box = (await notice.boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + 40, { steps: 5 })
    await page.mouse.move(x, y + 120, { steps: 5 })
    await page.mouse.up()
    await expect(notice).toHaveCount(0)
    await expect(sheet).toBeVisible()
    await expect(title).toBeFocused()
  })
})

for (const [width, device] of [
  [390, PHONE],
  [1280, DESKTOP],
] as const) {
  test.describe(`a notice and keyboard focus, ${width} px`, () => {
    test.use(device)

    test('focus moving on under it scrolls clear of it (WCAG 2.4.11)', async ({ page }) => {
      await page.goto('./')
      const options = page.getByRole('button', { name: 'Gear options' })
      await options.focus()
      const notice = await sharedLinkNotice(page, { hold: true })
      // The page's bottom scroll padding clears it, with 0.5rem to spare.
      const spare = () =>
        notice.evaluate(
          (el) => Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom) - (window.innerHeight - el.getBoundingClientRect().top),
        )
      await expect.poll(spare).toBeGreaterThanOrEqual(7)

      // Down the Gear tab, stop by stop (each slot, enchant and flag), to its end. (The footer's
      // link, the page's last control, can't scroll higher: docs/ux.md says so.)
      await expect(options).toBeFocused()
      let slots = 0
      for (;;) {
        await page.keyboard.press('Tab')
        const stop = await page.evaluate(() => {
          const el = document.activeElement!
          return {
            inGear: el.closest('[data-section="gear"]') !== null,
            slot: el.hasAttribute('data-gear-slot'),
            name: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 50),
          }
        })
        if (!stop.inGear) break
        await expect.poll(() => covered(page), { message: `${stop.name} is clear of the notice` }).toBe(0)
        if (stop.slot) slots++
      }
      expect(slots).toBe(17)
      await expect(notice).toBeVisible()
    })

    test('focus moving on while it’s still sliding in scrolls clear of where it stops', async ({ page }) => {
      await page.goto('./')
      // A tenth of the speed, so focus surely moves on mid-slide.
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Animation.enable')
      await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 })
      await page.getByRole('button', { name: 'Gear options' }).focus()
      // A link with no gear, so the slots are one tab stop each, and Tab gets through them all
      // while the notice slides in.
      await pasteLink(page, { version: 1, spec: 'warrior-fury', gear: {} })
      const notice = toasts(page).filter({ hasText: 'Loaded a shared setup' })
      await expect(notice).toHaveCount(1)
      // Slot by slot while it slides in: each focused slot ends up clear of where the notice will
      // stop, resting on the toaster's bottom edge.
      let checked = 0
      for (let i = 0; i < 17; i++) {
        await page.keyboard.press('Tab')
        const state = await notice.evaluate((el: HTMLElement) => {
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

    test('the item picker’s list can be focused clear of it', async ({ page }) => {
      await page.goto('./')
      await page.getByRole('button', { name: 'Head: Lionheart Helm' }).click()
      const picker = await opened(page, 'Choose head')
      await picker.getByRole('radio', { name: 'All items' }).click()
      const notice = await sharedLinkNotice(page, { hold: true })
      // Well past the first screenful of items, each stop clear of the notice.
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press('Tab')
        const name = await page.evaluate(() => document.activeElement!.getAttribute('aria-label') ?? document.activeElement!.textContent?.trim().slice(0, 50))
        await expect.poll(() => covered(page), { message: `${name} is clear of the notice` }).toBe(0)
      }
      await expect(picker).toBeVisible()
      await expect(notice).toBeVisible()
    })
  })
}

// A phone's talent cell opens a popover rather than refusing, so the narrow case is a 390 px
// window with a mouse: the notices are as wide as on a phone. The desktop window is short enough
// for the trees to reach its bottom edge.
for (const [name, device] of [
  ['390 px', { viewport: { width: 390, height: 844 } }],
  ['desktop', { viewport: { width: 1280, height: 700 } }],
] as const) {
  test.describe(`a notice that comes up over focus, ${name}`, () => {
    test.use(device)

    /**
     * Opens Talents and finds the last talent without a point, which refuses one with a notice
     * (every point is spent), and scrolls the page so the notice will come up over it: its bottom
     * edge 16 px above the phone's bar, or the window's bottom.
     */
    async function lowTalent(page: Page) {
      await page.getByRole('tab', { name: 'Talents', exact: true }).click()
      const talent = page.getByRole('button', { name: /, 0 of \d+$/ }).last()
      await talent.scrollIntoViewIfNeeded()
      const off = () =>
        talent.evaluate((el) => {
          const bar = document.querySelector('[data-sim-bar]')!.getBoundingClientRect()
          const floor = bar.height > 0 ? bar.top : window.innerHeight
          return el.getBoundingClientRect().bottom - (floor - 16)
        })
      const by = await off()
      await page.evaluate((by) => window.scrollBy(0, by), by)
      expect(Math.abs(await off()), 'the page scrolls far enough').toBeLessThan(1)
      return talent
    }

    test('keyboard focus scrolls clear of it', async ({ page }) => {
      await page.goto('./')
      const talent = await lowTalent(page)
      // Focused from the keyboard.
      await talent.focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      await expect(talent).toBeFocused()
      const before = await page.evaluate(() => window.scrollY)

      await page.keyboard.press('Enter')
      await expect(toasts(page).filter({ hasText: 'points are spent' })).toBeVisible()
      await settled(page)
      await expect.poll(() => covered(page)).toBe(0)
      await expect(talent).toBeFocused()
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before)
    })

    test('after a click nothing scrolls, so the talent stays under the mouse', async ({ page }) => {
      await page.goto('./')
      const talent = await lowTalent(page)
      const before = await page.evaluate(() => window.scrollY)
      await talent.click()
      await expect(toasts(page).filter({ hasText: 'points are spent' })).toBeVisible()
      await settled(page)
      await frames(page)
      await expect(talent).toBeFocused()
      expect(await covered(page)).toBeGreaterThan(0)
      expect(await page.evaluate(() => window.scrollY)).toBe(before)
    })
  })
}

/** How many px of the active option in an open select's list are hidden: under a toast, or off the window. */
const optionHidden = (page: Page) =>
  page.evaluate(() => {
    const option = document.activeElement!
    if (option.getAttribute('role') !== 'option') return Infinity
    const box = option.getBoundingClientRect()
    const tops = [...document.querySelectorAll("[data-sonner-toast][data-removed='false']")].map((t) => t.getBoundingClientRect().top)
    return Math.max(0, box.bottom - Math.min(window.innerHeight, ...tops)) + Math.max(0, -box.top)
  })

async function openFightAdvanced(page: Page) {
  await page.getByRole('tab', { name: 'Fight', exact: true }).click()
  await page.getByRole('button', { name: 'Advanced', exact: true }).click()
}

for (const [name, device] of [
  ['phone', PHONE],
  ['desktop', DESKTOP],
] as const) {
  test.describe(`a select’s list, ${name}`, () => {
    test.use(device)

    test('drops from its trigger rather than covering it, with no notice up too', async ({ page }) => {
      await page.goto('./')
      await openFightAdvanced(page)
      const trigger = page.getByRole('combobox', { name: 'Creature type' })
      await trigger.focus()
      await trigger.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      const t = (await trigger.boundingBox())!
      await page.keyboard.press('Enter')
      const list = page.getByRole('listbox')
      await expect(list).toHaveAttribute('data-side', /^(top|bottom)$/)
      await expect.poll(() => list.evaluate((el) => el.getAnimations().length)).toBe(0)
      const l = (await list.boundingBox())!
      expect(l.y >= t.y + t.height || l.y + l.height <= t.y, 'the list is above or below its trigger').toBe(true)
    })

    test('every option made active with the arrow keys is clear of a notice', async ({ page }) => {
      await page.goto('./')
      await page.getByRole('tab', { name: 'Fight', exact: true }).click()
      const notice = await sharedLinkNotice(page, { hold: true })
      await page.getByRole('button', { name: 'Advanced', exact: true }).click()
      for (const select of ['Creature type', 'Zone']) {
        const trigger = page.getByRole('combobox', { name: select })
        await trigger.focus()
        // As low as focus moving on leaves it: the scroll padding's 0.5rem above the notice.
        await restAboveToasts(trigger, 8)
        await page.keyboard.press('Enter')
        const list = page.getByRole('listbox')
        await expect(list).toBeVisible()
        const options = await list.getByRole('option').count()
        expect(options).toBeGreaterThan(2)
        await page.keyboard.press('Home')
        for (let i = 0; i < options; i++) {
          if (i > 0) await page.keyboard.press('ArrowDown')
          await expect(list.getByRole('option').nth(i)).toBeFocused()
          await expect.poll(() => optionHidden(page), { message: `${select}: option ${i + 1} is clear of the notice` }).toBe(0)
        }
        await page.keyboard.press('Escape')
        await expect(list).toHaveCount(0)
        await expect(trigger).toBeFocused()
      }
      await expect(notice).toBeVisible()
    })

    test('a list opened while a notice is up stays put, and keeps its active option, when the notice goes', async ({ page }) => {
      await page.clock.install()
      await page.goto('./')
      await openFightAdvanced(page)
      const notice = await sharedLinkNotice(page)
      const trigger = page.getByRole('combobox', { name: 'Zone' })
      const list = page.getByRole('listbox')
      await trigger.focus()
      await trigger.evaluate((el) => el.scrollIntoView({ block: 'center' }))
      await page.keyboard.press('Enter')
      await expect.poll(() => list.evaluate((el) => el.getAnimations().length)).toBe(0)
      const { height } = (await list.boundingBox())!
      await page.keyboard.press('Escape')

      // Low enough that the list flips above its trigger to clear the notice, though it would fit
      // below it with the notice gone, with 20 px to spare (Radix's 10 px margin, the list's 4 px
      // offset).
      const off = await trigger.evaluate((el, height) => {
        const rest = () => window.innerHeight - 10 - 4 - 20 - height - el.getBoundingClientRect().bottom
        window.scrollBy(0, -rest())
        return rest()
      }, height)
      expect(Math.abs(off), 'the page scrolls far enough').toBeLessThan(1)
      await page.keyboard.press('Enter')
      await expect(list).toHaveAttribute('data-side', 'top')
      await page.keyboard.press('ArrowUp')
      const active = await page.evaluate(() => document.activeElement!.textContent)
      await expect.poll(() => list.evaluate((el) => el.getAnimations().length)).toBe(0)
      const box = await list.boundingBox()

      await page.mouse.move(0, 0)
      await page.clock.fastForward(10_000)
      await expect(notice).toHaveCount(0)
      await frames(page)
      await expect(list).toHaveAttribute('data-side', 'top')
      expect(await list.boundingBox()).toEqual(box)
      expect(await page.evaluate(() => document.activeElement!.textContent)).toBe(active)
    })
  })
}
