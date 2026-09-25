import type { Locator, Page, Route } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#results "Scrolling" and "Your setup" (D34, the panel's order after the final review):
// from 1440 px Your setup, with Simulate, is pinned at the top of the right panel, the character
// sheet and then the result scroll beneath it, and once the sheet's key stats have scrolled away a
// one-line strip of them stays under Your setup. Review findings DU2-1 to DU2-6 and DL2-6.

/** Seeds a saved setup before the first load: a partial SimConfig, normalized by the app. */
async function seed(page: Page, config: Record<string, unknown>) {
  await page.addInitScript((config) => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    const state = { config: { version: 1, spec: 'warrior-fury', ...config }, bySpec: {}, section: 'gear' }
    localStorage.setItem('forever-sim:setup', JSON.stringify({ state, version: 1 }))
  }, config)
}

const results = (page: Page) => page.getByRole('complementary', { name: 'Results' })
const sheetOf = (panel: Locator) => panel.getByRole('region', { name: 'Character sheet' })
const setupOf = (panel: Locator) => panel.getByRole('region', { name: 'Your setup' })
const scrollerOf = (panel: Locator) => panel.getByRole('region', { name: 'Sheet, setup and result' })
const stripOf = (panel: Locator) => panel.locator('[data-key-stats]')
const simulateOf = (panel: Locator) => setupOf(panel).getByRole('button', { name: /^(Simulate|Run again|Cancel)$/ })

type Box = { x: number; y: number; width: number; height: number }
const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!

async function simulate(panel: Locator) {
  await panel.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
  await expect(panel.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 60_000 })
}

/** Holds the workers' script until `release()`, so the first run stays under way (shortcuts.spec.ts). */
async function holdWorkers(page: Page) {
  const held: Route[] = []
  let holding = true
  await page.route('**/assets/sim.worker*.js', (route) => (holding ? void held.push(route) : route.continue()))
  return async () => {
    holding = false
    for (const route of held.splice(0)) await route.continue()
  }
}

/** Whether a locator's whole box is inside the panel's scroll area, and so in view. */
async function inPanel(panel: Locator, target: Locator) {
  const [s, t] = await Promise.all([box(scrollerOf(panel)), box(target)])
  return t.y >= s.y - 0.5 && t.y + t.height <= s.y + s.height + 0.5
}

const TANKS = ['warrior-protection', 'paladin-protection', 'druid-feral-bear'] as const

test.describe('the wide panel at 1440×900', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  // DU2-1: a tank's sheet alone is taller than the room under Your setup, so Simulate went under the panel's edge.
  for (const spec of TANKS) {
    test(`${spec}: before a run, your setup is first and Simulate is in view`, async ({ page }) => {
      await seed(page, { spec })
      await page.goto('./')
      const panel = results(page)
      const run = simulateOf(panel)
      await expect(run).toHaveAccessibleName('Simulate')
      expect(await inPanel(panel, run)).toBe(true)
      await expect(run).toBeInViewport({ ratio: 1 })
      expect((await box(setupOf(panel))).y).toBeLessThan((await box(sheetOf(panel))).y)
      // The sheet is taller than what's left, so the panel scrolls, and the strip waits until it has.
      expect(await scrollerOf(panel).evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
      await expect(stripOf(panel)).toBeHidden()
    })
  }

  test('Ctrl+Enter on a tank: the run’s progress shows beside Cancel, in view', async ({ page }) => {
    await seed(page, { spec: 'warrior-protection' })
    const release = await holdWorkers(page)
    await page.goto('./')
    const panel = results(page)
    await page.keyboard.press('ControlOrMeta+Enter')
    const progress = setupOf(panel).getByText(/^Simulating…/)
    await expect(progress).toBeInViewport({ ratio: 1 })
    await expect(setupOf(panel).getByRole('button', { name: 'Cancel' })).toBeInViewport({ ratio: 1 })
    expect(await inPanel(panel, progress)).toBe(true)
    await release()
    await expect(setupOf(panel).getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 60_000 })
  })

  test('after a tank’s run the result comes into view under your setup and the strip of its key stats', async ({ page }) => {
    await seed(page, { spec: 'warrior-protection' })
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    const headline = panel.getByRole('group', { name: 'TPS' })
    await expect(headline).toBeInViewport()
    const strip = stripOf(panel)
    // The sheet went up under Your setup, so its key stats are in the strip: health, armor and defense.
    await expect(strip).toBeVisible()
    await expect(strip).toHaveText(/^Health [\d,]+ ?Armor [\d,]+ ?Defense \d+$/)
    for (const label of ['Health', 'Armor', 'Defense']) {
      const value = await sheetOf(panel).locator('dl > div', { has: page.getByText(label, { exact: true }) }).locator('dd').textContent()
      await expect(strip).toContainText(`${label} ${value}`)
    }
    // It's an echo of the sheet's own rows, so assistive tech doesn't hear it twice.
    await expect(strip).toHaveAttribute('aria-hidden', 'true')
    // Your setup, the strip and the headline, in that order, none covering the next.
    await expect.poll(async () => (await box(headline)).y - ((await box(strip)).y + (await box(strip)).height)).toBeGreaterThanOrEqual(0)
    const [setup, s] = await Promise.all([box(setupOf(panel)), box(strip)])
    expect(s.y).toBeGreaterThanOrEqual(setup.y + setup.height - 0.5)
    expect(await inPanel(panel, setupOf(panel))).toBe(true)
    // One line.
    expect(s.height).toBeLessThan(40)
    // Scrolled back to the sheet, the strip goes.
    await scrollerOf(panel).evaluate((el) => el.scrollTo(0, 0))
    await expect(strip).toBeHidden()
  })

  test('a DPS spec: the strip shows once the sheet’s key stats scroll under your setup, and says them', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    const strip = stripOf(panel)
    // At the top the sheet's in view, and so no strip.
    await expect(sheetOf(panel).getByRole('heading', { name: 'Character sheet' })).toBeInViewport()
    await expect(strip).toBeHidden()
    await scrollerOf(panel).evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await expect(strip).toBeVisible()
    await expect(strip).toHaveText(/^AP [\d,]+ ?Crit [\d.]+% ?Hit [\d.]+%$/)
    await expect(setupOf(panel).getByRole('button', { name: 'Run again' })).toBeInViewport({ ratio: 1 })
    await expect(strip).toBeInViewport({ ratio: 1 })
  })

  // DU2-6: after a run the action row isn't an empty band, and Simulate keeps its place in every state.
  test('the action row says where things stand in every state, Simulate in the same place', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    const setup = setupOf(panel)
    const before = await box(simulateOf(panel))
    await simulate(panel)
    await expect(setup.getByText('Your result is up to date.')).toBeVisible()
    const after = await box(simulateOf(panel))
    expect(after.y).toBeCloseTo(before.y, 0)
    expect(after.x + after.width).toBeCloseTo(before.x + before.width, 0)
    // A change makes it stale.
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    await page.getByRole('radio', { name: /^Self only/ }).click()
    await expect(setup.getByText('Your setup changed since this run. Simulate to update it.')).toBeVisible()
    await expect(setup.getByText('Your result is up to date.')).toHaveCount(0)
  })

  test('a run that fails says so in the action row, its message below', async ({ page }) => {
    await seed(page, { race: 'alliance-skyborne-high-order' })
    await page.goto('./')
    const panel = results(page)
    await setupOf(panel).getByRole('button', { name: 'Simulate' }).click()
    await expect(panel.getByRole('alert')).toBeVisible()
    await expect(setupOf(panel).getByText('This run didn’t finish. See why below.')).toBeVisible()
  })

  // DU2-5: the hover fill is muted, so a hovered line's name takes the value's colour.
  test('a hovered setup line’s name is at least 4.5:1 against its hover fill', async ({ page }) => {
    await page.goto('./')
    const line = setupOf(results(page)).getByRole('button', { name: /^Gear / })
    await line.hover()
    const name = line.locator('span').first()
    await expect.poll(() => textContrast(name)).toBeGreaterThanOrEqual(4.5)
  })

  // DL2-6: the Fight line says when a setting it doesn't name has changed.
  test('the Fight line says a setting it doesn’t name has changed', async ({ page }) => {
    await page.goto('./')
    const setup = setupOf(results(page))
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    await page.getByRole('radio', { name: 'In front' }).click()
    await expect(setup.getByRole('button', { name: /^Fight / })).toHaveAccessibleName('Fight 3:00 · changed')
  })

  // section-summary.ts SUMMARY_MAX_CHARS: the longest real lines fit their column, uncut, even beside
  // a classic 17 px scrollbar in the panel. The page's own scrollbar takes nothing from the panel,
  // which follows the window's width (docs/ux.md "Layout"); headless Chromium draws overlay
  // scrollbars, so the panel's is stood in for by padding of its width.
  test('the longest real setup lines fit on one line, beside a classic scrollbar', async ({ page }) => {
    await seed(page, {
      spec: 'druid-feral-cat',
      race: 'horde-tauren',
      rules: { profile: 'classicEra', unmeasuredRatings: 'ignore' },
      fight: { durationSec: 900, bossLevel: 60, position: 'front' },
    })
    await page.goto('./')
    const panel = results(page)
    await scrollerOf(panel).evaluate((el) => (el.style.paddingRight = `${4 + 17}px`))
    const setup = setupOf(panel)
    await expect(setup.getByRole('button', { name: /^Character / })).toHaveAccessibleName('Character Tauren · Classic Era · changed')
    await expect(setup.getByRole('button', { name: /^Fight / })).toHaveAccessibleName('Fight 15:00 · level 60 · changed')
    const cut = await setup.getByRole('button').evaluateAll((buttons) =>
      buttons.filter((b) => b.lastElementChild && b.lastElementChild.scrollWidth > b.lastElementChild.clientWidth).map((b) => b.textContent),
    )
    expect(cut).toEqual([])
  })
})

test.describe('the wide panel at 1920 and 2560', () => {
  // DU2-4 and DU1's note: crit reduction's label on one line, and at 2560 four columns, so no value
  // sits far from its label.
  for (const [width, height, columns] of [
    [1920, 1080, 3],
    [2560, 1440, 4],
  ] as const) {
    test(`${width} px: the sheet's groups in ${columns} columns, each value near its label, crit reduction on one line`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await seed(page, { spec: 'paladin-protection' })
      await page.goto('./')
      const sheet = sheetOf(results(page))
      const lefts = await sheet.locator('h4').evaluateAll((hs) => [...new Set(hs.map((h) => Math.round(h.getBoundingClientRect().left)))])
      expect(lefts).toHaveLength(columns)
      // Every row, the boss's table's too, is a column wide at most: crit reduction alone takes two,
      // its value in the second.
      const gap = await sheet.locator('dl > div').evaluateAll((rows) =>
        Math.max(
          ...rows
            .filter((r) => !r.textContent!.startsWith('Crit reduction'))
            .map((r) => r.querySelector('dd')!.getBoundingClientRect().right - r.querySelector('dt')!.getBoundingClientRect().left),
        ),
      )
      expect(gap).toBeLessThan(220)
      const crit = sheet.locator('dt', { hasText: /^Crit reduction/ })
      const lines = await crit.evaluate((el) => Math.round(el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).lineHeight)))
      expect(lines).toBe(1)
      // The boss's table keeps the sheet's columns, never stretched across the panel.
      const table = sheet.getByRole('region', { name: 'Boss’s attack table' })
      const miss = await box(table.locator('dl > div').first())
      expect(miss.width).toBeLessThan(220)
    })
  }
})

/** The contrast of an element's text against what's behind it, composited as a browser draws it. */
function textContrast(target: Locator) {
  return target.evaluate((el) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const parse = (css: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return [r, g, b, a / 255]
    }
    const over = (top: number[], bottom: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1)
    const chain: Element[] = []
    for (let e: Element | null = el; e; e = e.parentElement) chain.unshift(e)
    const behind = chain.reduce((color, e) => over(parse(getComputedStyle(e).backgroundColor), color), [255, 255, 255, 1])
    const text = over(parse(getComputedStyle(el).color), behind)
    const lum = (c: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
    }
    const [hi, lo] = [lum(text), lum(behind)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  })
}
