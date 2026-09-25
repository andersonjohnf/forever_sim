import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md "Rotation" and "Talents", from 1440 px (D34): the setup pane is the container `setup`,
// so each tab lays itself out by the pane's width. The setup pane is 55 rem at 1440 px, about 62 at
// 1600, 75 at 1920, 80 at 2040 and about 102 at 2560 (e2e/wide-shell.spec.ts has the shell).
// Rotation: the row settings panel is 24 rem from a 53 rem pane and 28 rem from 64 rem (about
// 1,660 px); it names the ability once, with its place; the spec-wide settings above the list flow
// into two columns from 53 rem, every width from 1440 px (their choices' widths are checked in
// e2e/wide-sections.spec.ts). Talents: icons stay 44 px at every width, each tree's card
// stops at 18 rem, left-aligned; from a 73 rem pane (about 1,870 px, so every 1920 px window) a detail
// panel beside the trees shows the talent under the pointer or focused, and then the pointer no longer
// opens a talent's tooltip (focus still does). Under 1440 px nothing changes (the rest of the suite
// runs at 1280).

const REM = 16

const open = async (page: Page, width: number, tab: 'Rotation' | 'Talents') => {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('./')
  await page.getByRole('tab', { name: tab, exact: true }).click()
  return page.getByRole('tabpanel', { name: tab })
}

const noSidewaysScroll = async (page: Page) => {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(scroll).toBeLessThanOrEqual(client)
}

const width = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())!.width

test.describe('the Rotation tab at wide widths', () => {
  for (const { viewport, panel } of [
    // A 55 rem pane (54 with a scrollbar): over the 53 rem step. 1600's is about 62, under 64.
    { viewport: 1440, panel: 24 * REM },
    { viewport: 1600, panel: 24 * REM },
    // A 64 rem pane from about 1,660 px (1,690 beside a scrollbar).
    { viewport: 1700, panel: 28 * REM },
    { viewport: 1920, panel: 28 * REM },
    { viewport: 2560, panel: 28 * REM },
  ]) {
    test(`at ${viewport} px the row's settings panel is ${panel / REM} rem and names the ability once`, async ({ page }) => {
      const tab = await open(page, viewport, 'Rotation')
      await tab.getByRole('list', { name: 'Priority list' }).getByRole('button', { name: 'Bloodrage', exact: true }).click()
      const settings = page.getByRole('complementary', { name: 'Bloodrage settings' })
      await expect(settings.getByRole('heading', { name: 'Bloodrage' })).toBeFocused()
      expect(await width(settings)).toBeCloseTo(panel, 0)
      // The name shows once, in the heading with its place; the switch's line is its help, and its
      // name for a screen reader is still "Use Bloodrage".
      await expect(settings.getByText('Position 7 of 16')).toBeVisible()
      await expect(settings.getByText('Bloodrage', { exact: true })).toHaveCount(2)
      expect(await width(settings.getByText('Bloodrage', { exact: true }).last())).toBeLessThanOrEqual(1)
      const use = settings.getByRole('switch', { name: 'Use Bloodrage', exact: true })
      await expect(use).toBeChecked()
      await expect(settings.getByText(/^Use Bloodrage on cooldown/)).toBeVisible()
      // Behaviour as below 1440: Move up moves it and says where; Escape goes back to the row.
      await settings.getByRole('button', { name: 'Move up' }).click()
      await expect(settings.getByText('Position 6 of 16')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(tab.getByRole('button', { name: 'Bloodrage', exact: true })).toBeFocused()
      // The switch still works from the panel.
      await use.click()
      await expect(tab.getByRole('list', { name: 'Priority list' }).getByRole('switch', { name: 'Bloodrage', exact: true })).not.toBeChecked()
      await noSidewaysScroll(page)
    })
  }

  test('below 1440 px the panel is as it was: the name twice, the switch under its label', async ({ page }) => {
    const tab = await open(page, 1280, 'Rotation')
    await tab.getByRole('list', { name: 'Priority list' }).getByRole('button', { name: 'Bloodrage', exact: true }).click()
    const settings = page.getByRole('complementary', { name: 'Bloodrage settings' })
    expect(await width(settings)).toBeCloseTo(20 * REM, 0)
    expect(await width(settings.getByText('Bloodrage', { exact: true }).last())).toBeGreaterThan(40)
  })

  test('a row still moves by its handle from the keyboard at 2560 px', async ({ page }) => {
    const tab = await open(page, 2560, 'Rotation')
    const live = page.locator('[id^="DndLiveRegion"]')
    await tab.getByRole('button', { name: 'Move Whirlwind, position 11' }).focus()
    await page.keyboard.press('Space')
    await expect(live).toContainText(/Whirlwind is over position 11 of 16|Picked up Whirlwind/)
    await page.keyboard.press('ArrowUp')
    await expect(live).toHaveText('Whirlwind is over position 10 of 16.')
    await page.keyboard.press('Space')
    await expect(live).toHaveText('Whirlwind dropped at position 10 of 16.')
    await expect(tab.getByRole('button', { name: 'Move Whirlwind, position 10' })).toBeFocused()
  })

  test('the spec-wide settings are one column under 1440 px', async ({ page }) => {
    const tab = await open(page, 1280, 'Rotation')
    const [a, b] = [(await tab.getByRole('switch', { name: 'Mighty Rage Potion', exact: true }).boundingBox())!, (await tab.getByRole('switch', { name: 'Juju Flurry', exact: true }).boundingBox())!]
    expect(b.y).toBeGreaterThan(a.y + a.height)
  })

  for (const viewport of [1440, 1920, 2560]) {
    test(`at ${viewport} px the spec-wide settings flow into two columns, each switch near its name`, async ({ page }) => {
      const tab = await open(page, viewport, 'Rotation')
      const potion = tab.getByRole('switch', { name: 'Mighty Rage Potion', exact: true })
      const juju = tab.getByRole('switch', { name: 'Juju Flurry', exact: true })
      const [a, b] = [(await potion.boundingBox())!, (await juju.boundingBox())!]
      // Mighty Rage Potion beside Juju Flurry, each on its own half.
      expect(Math.abs(a.y - b.y)).toBeLessThan(24)
      expect(b.x).toBeGreaterThan(a.x + a.width)
      // A switch sits in its half of the pane, not a whole pane's width from its name (DB-5).
      const name = (await tab.getByText('Mighty Rage Potion', { exact: true }).first().boundingBox())!
      const pane = (await tab.boundingBox())!
      expect(a.x - name.x).toBeLessThan(pane.width / 2)
      // Opening Advanced puts the threshold under the potion, in its own cell.
      await tab.getByRole('button', { name: /^Advanced settings for Consumables/ }).click()
      const threshold = tab.getByLabel('Mighty Rage Potion up to', { exact: true })
      const t = (await threshold.boundingBox())!
      expect(t.x).toBeLessThan(b.x)
      expect(t.y).toBeGreaterThan(a.y + a.height)
      await noSidewaysScroll(page)
    })
  }
})

/** Every spec, as src/sim/specs.ts lists them. */
const SPEC_IDS = ['warrior-fury', 'warrior-arms', 'warrior-protection', 'druid-feral-cat', 'druid-feral-bear', 'druid-balance', 'paladin-retribution', 'paladin-protection', 'shaman-enhancement', 'shaman-elemental', 'rogue-combat', 'rogue-assassination', 'rogue-subtlety', 'mage-fire', 'mage-frost', 'mage-arcane', 'warlock-destruction', 'warlock-affliction', 'warlock-demonology', 'priest-shadow', 'hunter-marksmanship', 'hunter-beast-mastery', 'hunter-survival']

test.describe('every spec’s spec-wide settings in two columns', () => {
  // At 1440 px each column is about 27 rem, the narrowest: a choice's options go under its label
  // there, sharing the cell, so no label or help is squeezed beside them, and no option is clipped.
  for (const viewport of [1440, 1920]) {
    test(`at ${viewport} px every row keeps room for its words, and every option fits its cell`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width: viewport, height: 1000 })
      const problems: string[] = []
      await page.goto('./')
      for (const spec of SPEC_IDS) {
        // Each spec's default setup, opened on its Rotation tab.
        await page.evaluate(
          (spec) => localStorage.setItem('forever-sim:setup', JSON.stringify({ state: { config: { version: 1, spec }, bySpec: {}, section: 'rotation' }, version: 1 })),
          spec,
        )
        await page.reload()
        const tab = page.getByRole('tabpanel', { name: 'Rotation' })
        await expect(tab.getByRole('list', { name: 'Priority list' })).toBeVisible()
        const found = await tab.evaluate((root) => {
          const out: string[] = []
          // The flowing cards: lists laid out as grids above the priority list.
          const cells = [...root.querySelectorAll('ul')].filter((ul) => getComputedStyle(ul).display === 'grid').flatMap((ul) => [...ul.children])
          for (const cell of cells) {
            const box = cell.getBoundingClientRect()
            for (const label of cell.querySelectorAll('label, [id$="-label"]')) {
              const words = label.closest('div, span')!.getBoundingClientRect()
              if (words.width < 12 * 16) out.push(`${label.textContent}: ${Math.round(words.width)} px for its words`)
            }
            for (const item of cell.querySelectorAll('[data-slot="toggle-group-item"]')) {
              const r = item.getBoundingClientRect()
              if (item.scrollWidth > item.clientWidth + 0.5 || r.left < box.left - 0.5 || r.right > box.right + 0.5) out.push(`${item.textContent} clipped or outside its cell`)
            }
          }
          return out
        })
        problems.push(...found.map((f) => `${spec}: ${f}`))
      }
      expect(problems).toEqual([])
      await noSidewaysScroll(page)
    })
  }
})

test.describe('the Talents tab at wide widths', () => {
  /** The rendered size of a talent's icon. */
  const iconSize = (page: Page, name: string) =>
    page
      .getByRole('button', { name: new RegExp(`^${name}, \\d of \\d$`) })
      .locator('img, span[aria-hidden]')
      .first()
      .evaluate((el) => el.getBoundingClientRect().width)
  const cards = (page: Page) => page.locator('section[aria-label$=" tree"]')
  const setup = (page: Page) => page.evaluate(() => document.querySelector('main')!.firstElementChild!.getBoundingClientRect().toJSON() as DOMRect)

  test('at 1280 px the trees are as they were: 44 px icons and no detail panel', async ({ page }) => {
    await open(page, 1280, 'Talents')
    expect(await iconSize(page, 'Bloodthirst')).toBe(44)
    await expect(page.getByRole('complementary', { name: 'Talent details' })).toHaveCount(0)
  })

  for (const viewport of [1440, 1600, 1920, 2560]) {
    test(`at ${viewport} px the icons are 44 px and the cards 18 rem at most, left-aligned; the detail panel shows from a 73 rem pane`, async ({ page }) => {
      await open(page, viewport, 'Talents')
      const pane = await setup(page)
      // Never enlarged to fill the width (docs/ux.md principle 4).
      expect(await iconSize(page, 'Bloodthirst')).toBe(44)
      const boxes = await Promise.all((await cards(page).all()).map(async (card) => (await card.boundingBox())!))
      for (const box of boxes) expect(box.width).toBeLessThanOrEqual(18 * REM + 0.5)
      expect(boxes[0].x).toBeCloseTo(pane.left, 0)
      // Every talent fits its tree's card, and no two overlap.
      for (const card of await cards(page).all()) {
        const box = (await card.boundingBox())!
        const cells = await card.locator('button').evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().toJSON() as DOMRect))
        for (const cell of cells) expect(cell.right).toBeLessThanOrEqual(box.x + box.width)
        for (const a of cells) for (const b of cells) if (a !== b && a.top === b.top && a.left < b.left) expect(a.right).toBeLessThanOrEqual(b.left)
      }
      const details = page.getByRole('complementary', { name: 'Talent details' })
      if (pane.width >= 73 * REM) {
        await expect(details).toBeVisible()
        const panel = (await details.boundingBox())!
        const last = boxes[boxes.length - 1]
        expect(panel.x).toBeGreaterThan(last.x + last.width)
        expect(panel.x + panel.width).toBeLessThanOrEqual(pane.right + 0.5)
      } else {
        await expect(details).toBeHidden()
      }
      // A 1920 px window has the panel: its pane is 75 rem, 74 beside a scrollbar.
      if (viewport >= 1920) await expect(details).toBeVisible()
      await noSidewaysScroll(page)
    })
  }

  test('at 1440 px, with no panel, pointing at a talent opens its tooltip', async ({ page }) => {
    const tab = await open(page, 1440, 'Talents')
    await tab.getByRole('button', { name: /^Bloodthirst, 1 of 1$/ }).hover()
    await expect(page.getByRole('tooltip')).toContainText('Bloodthirst')
  })

  test('at 1920 px the detail panel follows the pointer, then focus; the pointer opens no tooltip, focus does', async ({ page }) => {
    const tab = await open(page, 1920, 'Talents')
    const details = page.getByRole('complementary', { name: 'Talent details' })
    await expect(details).toBeVisible()
    await expect(details).toHaveText('Point at a talent, or focus it, to see what it does and what it needs here.')

    // Pointing at Bloodthirst: its name, rank and what it needs, met; its tooltip still shows.
    const bloodthirst = tab.getByRole('button', { name: /^Bloodthirst, 1 of 1$/ })
    await bloodthirst.hover()
    await expect(details.getByRole('heading', { name: 'Bloodthirst' })).toBeVisible()
    await expect(details).toContainText('Rank 1/1')
    await expect(details).toContainText('Fury, tier 7')
    const needs = details.getByRole('region', { name: 'Needs' }).getByRole('listitem')
    await expect(needs).toHaveText([/^30 points in Fury, met\s*30 of 30$/, /^1 point in Death Wish, met\s*1 of 1$/])
    // The panel says it all, so the pointer doesn't also open the tooltip over the neighbours (DB-7).
    await page.waitForTimeout(1000)
    await expect(page.getByRole('tooltip')).toHaveCount(0)

    // Focus another talent with the pointer away: the panel follows focus.
    await page.mouse.move(0, 0)
    const shieldSlam = tab.getByRole('button', { name: /^Shield Slam, 0 of 1$/ })
    // Focus still opens the tooltip.
    await bloodthirst.focus()
    await expect(page.getByRole('tooltip')).toContainText('Bloodthirst')
    await shieldSlam.focus()
    await expect(details.getByRole('heading', { name: 'Shield Slam' })).toBeVisible()
    await expect(details.getByRole('region', { name: 'Needs' }).getByRole('listitem').first()).toHaveText(/^\d+ points in Protection, not met\s*0 of \d+$/)
    // Why a point can't go in yet, as the tooltip says: the default build spends all 51.
    await expect(details).toContainText('All 51 points are spent.')

    // Keys still add and remove points, and the panel keeps up: Cruelty, from a cleared build.
    await tab.getByRole('button', { name: 'Clear' }).click()
    await tab.getByRole('button', { name: /^Cruelty, 0 of 5$/ }).focus()
    await expect(details.getByRole('heading', { name: 'Cruelty' })).toBeVisible()
    await expect(details).toContainText('Nothing: it’s in the first tier.')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await expect(details).toContainText('Rank 2/5')
    await page.keyboard.press('Backspace')
    await expect(tab.getByRole('button', { name: /^Cruelty, 1 of 5$/ })).toBeFocused()
    await expect(details).toContainText('Rank 1/5')
    // With neither pointer nor focus on a talent, the last one stays.
    await tab.getByRole('button', { name: 'Paste code' }).focus()
    await expect(details.getByRole('heading', { name: 'Cruelty' })).toBeVisible()
    await noSidewaysScroll(page)
  })
})
