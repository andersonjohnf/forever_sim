import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md "Gear", the wide layout (D34, as amended): from 1440 px every slot is in view with no
// scrolling at 1440×900 and up, by construction rather than for today's default sets (review findings
// DL2-1, DL2-2, DU1-1), in the game's character-pane order (the right side's eight slots and the
// weapons under them the tallest stack). Each row has a fixed height by the kind of slots in it (the
// name on one line, the stats on one, the enchant on one), the intro and the default set's line are one
// line each, and Classic Era's enchant note is a link on that line. These tests fill every slot with
// the longest real item name and enchant the slot offers, beside a classic 17 px scrollbar (Windows'),
// which headless Chromium hides.

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

/** The margin the last slot keeps from the window's bottom edge. */
const MARGIN = 16
/**
 * A slot's height at most (docs/ux.md "Gear"): a row with an enchant line, the left side's (which
 * share out the right side's height), and a row without.
 */
const ROW_WITH_ENCHANT = 76
const LEFT_ROW = 78
const ROW_WITHOUT = 48

async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  // A classic scrollbar, always there, 17 px wide.
  await page.addInitScript(() =>
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = '::-webkit-scrollbar{width:17px;height:17px}::-webkit-scrollbar-thumb{background:#888}html{overflow-y:scroll}'
      document.head.append(style)
    }),
  )
  await page.goto('./')
  expect(await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth)).toBe(17)
}

async function chooseSpec(page: Page, className: string, spec: RegExp) {
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('group', { name: className }).getByRole('menuitem', { name: spec }).click()
}

async function classicEra(page: Page) {
  await page.getByRole('tab', { name: 'Character', exact: true }).click()
  await page.getByRole('radio', { name: 'Classic Era' }).click()
}

const gearTab = (page: Page) => page.getByRole('tab', { name: 'Gear', exact: true }).click()

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Every slot gets the item with the widest name it offers (All items), and every enchant line the
 * enchant with the longest name and effect: the worst case the slots' budget is built for.
 *
 * Review finding V4-1: the picker's item buttons are named by an sr-only span, not an aria-label,
 * and ranking them by aria-label picked "Leave this slot empty" every time, so the test measured
 * empty slots and no enchants. Each pick is now checked on its slot, and every enchant line too.
 */
async function equipLongest(page: Page) {
  const slots = await page.locator('[data-gear-slot]').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.gearSlot!))
  let filled = 0
  for (const slot of slots) {
    const button = page.locator(`[data-gear-slot="${slot}"]`)
    // An off hand beside a two-handed weapon.
    if (await button.isDisabled()) continue
    // From the keyboard: a click could land on a flag, which sits over the slot's button.
    await button.press('Enter')
    const picker = page.getByRole('dialog', { name: /^Choose / })
    // Every item, not just the guides' picks: wait for the list to show them all.
    const all = picker.getByRole('radio', { name: 'All items' })
    await all.click()
    await expect(all).toBeChecked()
    const items = picker.getByRole('list', { name: 'Items' }).getByRole('listitem').getByRole('button')
    await expect(items.first()).toBeVisible()
    // The widest name as the picker draws it: the text of its name line alone (not the button's
    // whole name, which carries the stats too; not the line's box, which fills the row).
    const longest = await items.evaluateAll((buttons) => {
      let best = { index: -1, width: -1, name: '' }
      buttons.forEach((b, index) => {
        if ((b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true') return
        const name = b.parentElement?.querySelector<HTMLElement>('span.truncate')
        // "Leave this slot empty" has no name line; one that moves from the other slot of a pair
        // would empty that slot (its words joined by no-break spaces).
        if (!name || /moves\sfrom/.test(b.textContent ?? '')) return
        const range = document.createRange()
        range.selectNodeContents(name)
        const width = range.getBoundingClientRect().width
        if (width > best.width) best = { index, width, name: name.textContent ?? '' }
      })
      return best
    })
    expect(longest.index, `${slot}: an item to pick`).toBeGreaterThanOrEqual(0)
    await items.nth(longest.index).click()
    await expect(picker).toHaveCount(0)
    // The slot holds it now.
    await expect(button, slot).toHaveAttribute('aria-label', new RegExp(`: ${escape(longest.name)}$`))
    filled++
  }
  expect(filled, 'slots filled').toBeGreaterThanOrEqual(16)
  // None emptied by a later pick.
  await expect(page.getByRole('button', { name: /: empty$/ })).toHaveCount(0)
  const chips = page.getByRole('button', { name: / enchant$|^Add an enchant, / })
  const count = await chips.count()
  expect(count, 'enchant lines').toBeGreaterThanOrEqual(8)
  for (let i = 0; i < count; i++) {
    await chips.nth(i).click()
    const list = page.getByRole('listbox')
    await expect(list).toBeVisible()
    const options = list.getByRole('option')
    const longest = await options.evaluateAll((els) => {
      // "Name · effect", as the chip shows it.
      const text = (el: Element) => [...el.querySelectorAll('span > span')].map((s) => s.textContent).join(' · ')
      const index = els.reduce((best, el, i, all) => (text(el).length > text(all[best]).length ? i : best), 0)
      return { index, text: text(els[index]) }
    })
    await options.nth(longest.index).click()
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(chips.nth(i)).toHaveAttribute('aria-label', new RegExp(`^${escape(longest.text)}, `))
  }
  // Every enchant line holds one.
  await expect(page.getByRole('button', { name: /^Add an enchant, / })).toHaveCount(0)
}

/**
 * The page isn't scrolled, one line each for the intro and the default set's line, every slot
 * within its budget, and the last one at least MARGIN px clear of the window's bottom edge.
 */
async function expectFits(page: Page, height: number) {
  await page.evaluate(() => window.scrollTo(0, 0))
  const m = await page.evaluate(() => {
    const status = document.getElementById('gear-default-status')!
    const intro = document.querySelector('[data-section="gear"] h2')!.parentElement!.querySelector('p')!
    const slots = [...document.querySelectorAll('[data-gear-slot]')].map((button) => {
      const li = button.closest('li')!
      const box = li.getBoundingClientRect()
      return { slot: (button as HTMLElement).dataset.gearSlot!, height: box.height, bottom: box.bottom }
    })
    // The name on one line, the stats line on one.
    const lines = [...document.querySelectorAll('[data-section="gear"] li span[title]')].map((el) => ({
      text: el.getAttribute('title'),
      height: el.getBoundingClientRect().height,
    }))
    return { status: status.getBoundingClientRect().height, intro: intro.getBoundingClientRect().height, slots, lines }
  })
  expect(m.status, 'the default set’s line is one line').toBe(20)
  expect(m.intro, 'the intro is one line').toBe(20)
  expect(m.slots.length).toBeGreaterThanOrEqual(17)
  const budget: Record<string, number> = { head: LEFT_ROW, neck: LEFT_ROW, shoulder: LEFT_ROW, back: LEFT_ROW, chest: LEFT_ROW, wrist: LEFT_ROW }
  for (const slot of ['waist', 'finger1', 'finger2', 'trinket1', 'trinket2', 'ammo', 'quiver']) budget[slot] = ROW_WITHOUT
  for (const slot of m.slots) expect(slot.height, slot.slot).toBeLessThanOrEqual((budget[slot.slot] ?? ROW_WITH_ENCHANT) + 0.5)
  for (const line of m.lines) expect(line.height, line.text ?? '').toBeLessThanOrEqual(18)
  expect(Math.max(...m.slots.map((slot) => slot.bottom)), 'the last slot’s bottom').toBeLessThanOrEqual(height - MARGIN)
  await expect(page.getByRole('heading', { name: 'Gear', level: 2 })).toBeInViewport()
}

test.describe('the wide Gear tab fits the window whatever it holds', () => {
  test.describe.configure({ timeout: 90_000 })

  test('a hunter, the most slots, with the longest names and enchants, under Classic Era rules', async ({ page }) => {
    await open(page, 1440, 900)
    await chooseSpec(page, 'Hunter', /Beast Mastery/)
    await classicEra(page)
    await gearTab(page)
    await equipLongest(page)
    // Every slot filled and enchanted, and more than three changed: the line names none of them.
    await expect(page.locator('#gear-default-status')).toContainText(/^\d+ slots differ\. Equipping /)
    await expect(page.getByRole('button', { name: 'Classic Era enchants' })).toBeVisible()
    await expectFits(page, 900)
    // The note's link and the Equip button share the line, their 44 px hit areas apart.
    const hits = await page.evaluate(() => {
      const hit = (el: Element) => {
        const box = el.getBoundingClientRect()
        const after = getComputedStyle(el, '::after')
        const px = (v: string) => (v === 'auto' ? 0 : -Number.parseFloat(v))
        return { left: box.left - px(after.left), right: box.right + px(after.right), top: box.top - px(after.top), bottom: box.bottom + px(after.bottom) }
      }
      const buttons = [...document.querySelectorAll('button')]
      return {
        link: hit(buttons.find((b) => b.textContent?.startsWith('Classic Era enchants'))!),
        equip: hit(buttons.find((b) => b.textContent === 'Equip pre-raid best in slot')!),
      }
    })
    expect(hits.link.bottom - hits.link.top).toBeGreaterThanOrEqual(44)
    expect(hits.equip.bottom - hits.equip.top).toBeGreaterThanOrEqual(44)
    expect(hits.link.right).toBeLessThan(hits.equip.left)
  })

  test('a bear tank, the longest intro, with the longest names and enchants, under Classic Era rules', async ({ page }) => {
    await open(page, 1440, 900)
    await chooseSpec(page, 'Druid', /Feral \(Bear\)/)
    await classicEra(page)
    await gearTab(page)
    await equipLongest(page)
    await expectFits(page, 900)
  })

  test('a Classic Era bear’s threat set, with the enchant note on the default set’s line', async ({ page }) => {
    await open(page, 1440, 900)
    await chooseSpec(page, 'Druid', /Feral \(Bear\)/)
    await classicEra(page)
    await gearTab(page)
    await expect(page.locator('#gear-default-status')).toHaveText('Wearing the threat set.')
    // The note's box is gone from above the slots; its link sits on the line.
    await expect(page.getByText('Classic Era values.')).toHaveCount(0)
    await expectFits(page, 900)
    // The link opens Character on the rules.
    const link = page.getByRole('button', { name: 'Classic Era enchants' })
    await expect(link).toHaveAccessibleDescription('Enchants use Classic Era’s numbers, as set in Character → Advanced.')
    const hit = await link.evaluate((el) => Number.parseFloat(getComputedStyle(el, '::after').height))
    expect(hit).toBeGreaterThanOrEqual(44)
    await link.click()
    await expect(page.getByRole('radio', { name: 'Classic Era' })).toBeFocused()
  })

  test('a caster, the longest names and enchants in cloth, under Classic Era rules', async ({ page }) => {
    await open(page, 1440, 900)
    await chooseSpec(page, 'Mage', /Fire/)
    await classicEra(page)
    await gearTab(page)
    await equipLongest(page)
    await expectFits(page, 900)
  })

  test('at 1920×900, the longest names and enchants still fit', async ({ page }) => {
    await open(page, 1920, 900)
    await chooseSpec(page, 'Hunter', /Beast Mastery/)
    await gearTab(page)
    await equipLongest(page)
    await expectFits(page, 900)
  })

  test('every spec’s intro is one whole line at 1440 px beside a scrollbar', async ({ page }) => {
    await open(page, 1440, 900)
    await gearTab(page)
    await page.getByRole('button', { name: /^Spec: / }).click()
    const count = await page.getByRole('menuitem').count()
    await page.keyboard.press('Escape')
    for (let i = 0; i < count; i++) {
      await page.getByRole('button', { name: /^Spec: / }).click()
      const item = page.getByRole('menuitem').nth(i)
      const name = await item.textContent()
      await item.click()
      const intro = page.getByRole('heading', { name: 'Gear', level: 2 }).locator('xpath=..').locator('p')
      await expect(intro).toContainText('Starts as')
      const box = await intro.locator('span').evaluate((el) => ({ height: el.getBoundingClientRect().height, cut: el.scrollWidth > el.clientWidth }))
      expect(box, name ?? '').toEqual({ height: 20, cut: false })
    }
  })
})
