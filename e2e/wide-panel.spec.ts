import type { Locator, Page, Route } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#results "The wide layout's right panel" and "Scrolling" (D34, the panel and Gear after
// the user's look at the fixes): from 1440 px the character sheet is at the top of the right panel,
// Your setup under it, whose action row holds Simulate and, once run, the result's headline, then
// the rest of the result. Nothing is pinned: they scroll together inside the panel. A tank's sheet
// is compact enough that Simulate is in view on load at 1440×900 (review finding DU2-1), the boss's
// table with its explanation behind an info button. Review findings DU2-1 to DU2-6 and DL2-6.

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
const simulateOf = (panel: Locator) => setupOf(panel).getByRole('button', { name: /^(Simulate|Run again|Cancel)$/ })
const actionsOf = (panel: Locator) => setupOf(panel).locator('[data-setup-actions]')

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

/** The bottom fade's height (`FADE_PX` in results-panel.tsx), which covers the panel's foot while there's more below. */
const FADE = 48

/**
 * Whether a locator's whole box is inside the panel's scroll area, and so in view; clear of the
 * bottom fade too, when the panel has more below.
 */
async function inPanel(panel: Locator, target: Locator) {
  const scroller = scrollerOf(panel)
  const [s, t] = await Promise.all([box(scroller), box(target)])
  const more = await scroller.evaluate((el) => el.scrollTop + el.clientHeight < el.scrollHeight - 1)
  return t.y >= s.y - 0.5 && t.y + t.height <= s.y + s.height - (more ? FADE : 0) + 0.5
}

const TANKS = ['warrior-protection', 'paladin-protection', 'druid-feral-bear'] as const

/** Every spec (src/sim/specs.ts SPEC_IDS). */
const SPEC_IDS = ['warrior-fury', 'warrior-arms', 'warrior-protection', 'druid-feral-cat', 'druid-feral-bear', 'druid-balance', 'paladin-retribution', 'paladin-protection', 'shaman-enhancement', 'shaman-elemental', 'rogue-combat', 'rogue-assassination', 'rogue-subtlety', 'mage-fire', 'mage-frost', 'mage-arcane', 'warlock-destruction', 'warlock-affliction', 'warlock-demonology', 'priest-shadow', 'hunter-marksmanship', 'hunter-beast-mastery', 'hunter-survival']

test.describe('the wide panel at 1440×900', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  // DU2-1: a tank's sheet above Your setup must still leave Simulate in view, with nothing to scroll.
  for (const spec of TANKS) {
    for (const profile of ['forever', 'classicEra'] as const) {
      test(`${spec} (${profile}): before a run the sheet is first, your setup under it, and Simulate is in view`, async ({ page }) => {
        await seed(page, { spec, rules: { profile, unmeasuredRatings: 'ignore' } })
        await page.goto('./')
        const panel = results(page)
        const run = simulateOf(panel)
        await expect(run).toHaveAccessibleName('Simulate')
        expect((await box(sheetOf(panel))).y).toBeLessThan((await box(setupOf(panel))).y)
        // The sheet and Your setup fit whole, so there's no fade over Simulate.
        expect(await scrollerOf(panel).evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true)
        expect(await inPanel(panel, setupOf(panel))).toBe(true)
        await expect(run).toBeInViewport({ ratio: 1 })
      })
    }
  }

  test('every spec: Simulate is in view on load', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    for (const spec of SPEC_IDS) {
      await page.evaluate((spec) => {
        const state = { config: { version: 1, spec }, bySpec: {}, section: 'gear' }
        localStorage.setItem('forever-sim:setup', JSON.stringify({ state, version: 1 }))
      }, spec)
      await page.reload()
      await expect(simulateOf(panel)).toHaveAccessibleName('Simulate')
      await expect.poll(() => inPanel(panel, simulateOf(panel)), { message: spec }).toBe(true)
      expect(await scrollerOf(panel).evaluate((el) => el.scrollHeight <= el.clientHeight), spec).toBe(true)
    }
  })

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

  test('after a tank’s run its headline is in your setup’s action row, beside Run again, in view and clear of the fade', async ({ page }) => {
    await seed(page, { spec: 'paladin-protection' })
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    const actions = actionsOf(panel)
    const [tps, dps] = [actions.getByRole('group', { name: 'TPS' }), actions.getByRole('group', { name: 'DPS' })]
    await expect(tps).toContainText(/^TPS[\d,]+\.\d± [\d.]+/)
    await expect(dps).toContainText(/^DPS[\d,]+\.\d± [\d.]+/)
    await expect(actions).toContainText(/[\d,]+ runs, (under )?\d+\.\d s/)
    // TPS over DPS, both left of Run again.
    const [t, d, run] = await Promise.all([box(tps), box(dps), box(setupOf(panel).getByRole('button', { name: 'Run again' }))])
    expect(d.y).toBeGreaterThan(t.y)
    expect(Math.max(t.x + t.width, d.x + d.width)).toBeLessThan(run.x)
    // The result is under the sheet and the setup, so the panel scrolled just far enough for the
    // row to clear the bottom fade.
    await expect.poll(() => inPanel(panel, actions)).toBe(true)
    // No separate headline anywhere else in the panel.
    await expect(panel.getByRole('group', { name: 'TPS' })).toHaveCount(1)
  })

  test('Ctrl+Enter from deep in a result brings the action row back into view', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    await panel.getByRole('button', { name: /^Assumptions \(\d+\)$/ }).click()
    await scrollerOf(panel).evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await expect.poll(() => inPanel(panel, actionsOf(panel))).toBe(false)
    await page.getByRole('tab', { name: 'Talents', exact: true }).click()
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect.poll(() => inPanel(panel, actionsOf(panel))).toBe(true)
    await expect(setupOf(panel).getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 60_000 })
    await expect.poll(() => inPanel(panel, actionsOf(panel))).toBe(true)
  })

  test('nothing is pinned: the sheet, your setup and the result scroll together', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    const scroller = scrollerOf(panel)
    await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await expect(panel.getByRole('button', { name: /^Assumptions \(\d+\)$/ })).toBeInViewport()
    await expect(sheetOf(panel).getByRole('heading', { name: 'Character sheet' })).not.toBeInViewport()
    await expect(setupOf(panel).getByRole('heading', { name: 'Your setup' })).not.toBeInViewport()
    // Nothing in the panel sticks.
    const sticky = await scroller.evaluate((el) => [...el.querySelectorAll('*')].filter((e) => getComputedStyle(e).position === 'sticky').length)
    expect(sticky).toBe(0)
    // The fade at the top shows there's more above.
    await expect(results(page).locator('[data-fade-above]')).toHaveClass(/opacity-100/)
  })

  // DU2-6: the action row always says where things stand, and Simulate keeps its place in every state.
  test('the action row says where things stand in every state, Simulate in the same place', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    const setup = setupOf(panel)
    await expect(setup.getByText('Your setup is ready. Simulate to see your DPS.')).toBeVisible()
    const before = await box(simulateOf(panel))
    await simulate(panel)
    // After a run: the headline, "DPS 713.7 ± 1.8", large, with the run's size short to its right
    // (user decision): no fight length or rules at Forever's.
    const dps = actionsOf(panel).getByRole('group', { name: 'DPS' })
    await expect(dps).toContainText(/^DPS[\d,]+\.\d± [\d.]+$/)
    const size = actionsOf(panel).getByText(/^[\d,]+ runs, (under 0\.1|\d+\.\d) s$/)
    await expect(size).toBeVisible()
    await expect(actionsOf(panel)).not.toContainText(/fights of|Forever rules/)
    const [value, sizeBox] = await Promise.all([box(dps.locator('span.text-4xl')), box(size)])
    expect(value.height).toBeGreaterThanOrEqual(36)
    expect(sizeBox.x).toBeGreaterThan(value.x + value.width)
    // A screen reader hears it from the run's live region.
    await expect(page.locator('[role="status"][aria-label="Simulation status"]')).toHaveText(/^Done: [\d,]+\.\d DPS$/)
    const after = await box(simulateOf(panel))
    expect(after.y).toBeCloseTo(before.y, 0)
    expect(after.x + after.width).toBeCloseTo(before.x + before.width, 0)
    // A change makes it stale: the old headline, marked, with Simulate.
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    await page.getByRole('radio', { name: /^Self only/ }).click()
    await expect(actionsOf(panel).getByText('Setup changed', { exact: true })).toBeVisible()
    await expect(dps).toBeVisible()
    await expect(simulateOf(panel)).toHaveAccessibleName('Simulate')
    expect((await box(simulateOf(panel))).y).toBeCloseTo(before.y, 0)
    // Run again: the change from the last run shows beside the value.
    await simulate(panel)
    await expect(actionsOf(panel).getByText('Setup changed', { exact: true })).toHaveCount(0)
    await expect(dps).toContainText(/down [\d.]+ from the last run, worse/)
  })

  test('a run that fails says so in the action row, its message below', async ({ page }) => {
    // A hunter with no ranged weapon: the engine refuses it (ranged-and-pets.md §12).
    await seed(page, { spec: 'hunter-marksmanship', gear: {} })
    await page.goto('./')
    const panel = results(page)
    await setupOf(panel).getByRole('button', { name: 'Simulate' }).click()
    await expect(panel.getByRole('alert')).toBeVisible()
    // A refused setup never ran, so the row doesn't say the run didn't finish (DU-9).
    await expect(setupOf(panel).getByText('This setup can’t be simulated. See why below.')).toBeVisible()
    expect(await inPanel(panel, panel.getByRole('alert'))).toBe(true)
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

  test('“Character sheet” and “Your setup” are section headings, larger than the rows, with no icon', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    for (const heading of [sheetOf(panel).getByRole('heading', { name: 'Character sheet' }), setupOf(panel).getByRole('heading', { name: 'Your setup' })]) {
      await expect(heading).toHaveCSS('font-size', '16px')
      await expect(heading).toHaveCSS('font-weight', '600')
      await expect(heading.locator('svg')).toHaveCount(0)
    }
    // The setup lines keep their icons.
    await expect(setupOf(panel).getByRole('button', { name: /^Gear / }).locator('svg')).toHaveCount(2)
  })

  test('the boss’s table explains itself behind an info button: by click, by keyboard, and not on hover', async ({ page }) => {
    await seed(page, { spec: 'paladin-protection' })
    await page.goto('./')
    const table = sheetOf(results(page)).getByRole('region', { name: 'Boss’s attack table' })
    const info = table.getByRole('button', { name: 'About the boss’s attack table' })
    // Nothing of the explanation under the heading at wide.
    await expect(table.getByText(/Its chances/)).toHaveCount(0)
    // Its 44 px target overhangs the heading's line, rather than making the row taller.
    const [b, heading] = await Promise.all([box(info), box(table.getByRole('heading', { name: 'Boss’s attack table' }))])
    expect(b.height).toBeGreaterThanOrEqual(44)
    expect(b.width).toBeGreaterThanOrEqual(44)
    expect(Math.abs(b.y + b.height / 2 - (heading.y + heading.height / 2))).toBeLessThan(2)
    // Hovering opens nothing.
    await info.hover()
    await page.waitForTimeout(500)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    // A click opens it: what the table is, Holy Shield's uptime, and the crushing line.
    await info.click()
    const popover = page.getByRole('dialog', { name: 'Boss’s attack table' })
    await expect(popover).toContainText('Your rotation keeps Holy Shield up most of the fight.')
    await expect(popover).toContainText(/crushing blows/)
    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden()
    await expect(info).toBeFocused()
    // And by keyboard.
    await page.keyboard.press('Enter')
    await expect(popover).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden()
  })

  test('a paladin’s sheet is in three columns at 1440 px, crit reduction on one line, the boss’s table in three', async ({ page }) => {
    await seed(page, { spec: 'paladin-protection' })
    await page.goto('./')
    const sheet = sheetOf(results(page))
    const lefts = await sheet.locator('h4').evaluateAll((hs) => [...new Set(hs.map((h) => Math.round(h.getBoundingClientRect().left)))])
    expect(lefts).toHaveLength(3)
    const crit = sheet.locator('dt', { hasText: /^Crit reduction/ })
    const lines = await crit.evaluate((el) => Math.round(el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).lineHeight)))
    expect(lines).toBe(1)
    const table = sheet.getByRole('region', { name: 'Boss’s attack table' })
    const cells = await table.locator('dl > div').evaluateAll((rows) => [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().left)))])
    expect(cells).toHaveLength(3)
    // Every label on one line: nothing wraps in a column a third of the panel.
    const wrapped = await sheet.locator('dl > div > dt').evaluateAll((dts) =>
      dts.filter((dt) => dt.getBoundingClientRect().height > Number.parseFloat(getComputedStyle(dt).lineHeight) * 1.5).map((dt) => dt.textContent),
    )
    expect(wrapped).toEqual([])
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

test.describe('the wide panel beside a classic scrollbar', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  // Once a run makes the panel scroll, a classic (Windows) scrollbar takes up to 17 px from its
  // content; headless Chromium draws overlay scrollbars, so padding of that width stands in for it,
  // as for the setup lines above.
  test('a paladin’s three columns and the tank headline still fit beside it', async ({ page }) => {
    await seed(page, { spec: 'paladin-protection' })
    await page.goto('./')
    const panel = results(page)
    await expect(simulateOf(panel)).toBeInViewport({ ratio: 1 })
    await simulate(panel)
    await scrollerOf(panel).evaluate((el) => (el.style.paddingRight = `${4 + 17}px`))
    const wrapped = await sheetOf(panel)
      .locator('dl > div > dt')
      .evaluateAll((dts) => dts.filter((dt) => dt.getBoundingClientRect().height > Number.parseFloat(getComputedStyle(dt).lineHeight) * 1.5).map((dt) => dt.textContent))
    expect(wrapped).toEqual([])
    // Each value on its line: TPS and DPS each one line of its value tall, not wrapped; TPS leads,
    // its DPS a step smaller (review finding V5-4).
    const size = (name: string) => actionsOf(panel).getByRole('group', { name }).locator('span.font-semibold').first().evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))
    expect(await size('TPS')).toBeGreaterThan(await size('DPS'))
    for (const name of ['TPS', 'DPS']) {
      const group = actionsOf(panel).getByRole('group', { name })
      const line = await group.locator('span.font-semibold').first().evaluate((el) => Number.parseFloat(getComputedStyle(el).lineHeight))
      expect((await box(group)).height).toBeLessThan(line * 1.5)
    }
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
      const cells = await table.locator('dl > div').evaluateAll((rows) => [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().left)))])
      expect(cells).toHaveLength(columns)
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

/**
 * How far Your setup's card paints past the scroller's clip, in px (0 when it all shows): its ring
 * and shadow (box-shadows, drawn outside its box) at the bottom and sides, against the area the
 * scroller can scroll to (scrollHeight) and, while it has nothing to scroll, its visible box. `below`
 * is how far the ring and shadow reach under the card.
 */
function setupCardClip(panel: Locator) {
  return scrollerOf(panel).evaluate((scroller) => {
    const card = scroller.querySelector('[data-setup-actions]')!.closest('[data-slot="card"]')!
    // Each outer box-shadow's reach: below, offset-y + blur + spread; to the side, |offset-x| + blur + spread.
    const shadows = getComputedStyle(card)
      .boxShadow.split(/,(?![^(]*\))/)
      .filter((s) => s.trim() !== 'none' && !/\binset\b/.test(s))
      .map((s) => (s.replace(/[a-z]+\([^)]*\)/g, '').match(/-?[\d.]+px/g) ?? []).map(Number.parseFloat))
    const below = Math.max(0, ...shadows.map(([, y = 0, blur = 0, spread = 0]) => y + blur + spread))
    const side = Math.max(0, ...shadows.map(([x = 0, , blur = 0, spread = 0]) => Math.abs(x) + blur + spread))
    const s = scroller.getBoundingClientRect()
    const c = card.getBoundingClientRect()
    const top = s.top + scroller.clientTop
    const left = s.left + scroller.clientLeft
    const paintBottom = c.bottom + below - top + scroller.scrollTop
    const clips = [
      paintBottom - scroller.scrollHeight,
      left - (c.left - side),
      c.right + side - (left + scroller.clientWidth),
      scroller.scrollHeight <= scroller.clientHeight ? paintBottom - scroller.scrollTop - scroller.clientHeight : 0,
    ]
    return { clip: Math.max(0, ...clips), below }
  })
}

/** Your setup's card, its ring and shadow whole, and its action row's bottom corners rounded. */
async function setupCardWhole(panel: Locator, state: string) {
  const { clip, below } = await setupCardClip(panel)
  expect(below, `${state}: the card draws a ring or shadow under it`).toBeGreaterThan(0)
  expect(clip, `${state}: px of the card's edge clipped`).toBeLessThanOrEqual(0.5)
  const radii = await actionsOf(panel).evaluate((el) => [getComputedStyle(el).borderBottomLeftRadius, getComputedStyle(el).borderBottomRightRadius].map(Number.parseFloat))
  for (const r of radii) expect(r, `${state}: the action row's bottom corner`).toBeGreaterThan(0)
}

// The user's report from the preview: before a run Your setup's bottom edge, rounded corners and
// shadow were cut off at the panel's foot, since the card's ring and shadow paint outside its box and
// the scroller clipped them. The panel's content keeps room for them under its last card
// (docs/ux.md#results "The wide layout's right panel").
for (const colorScheme of ['light', 'dark'] as const) {
  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
  ] as const) {
    test.describe(`Your setup’s card at ${width}×${height}, ${colorScheme}`, () => {
      test.use({ viewport: { width, height }, colorScheme })

      test('its whole edge, corners and shadow show before, during and after a run, and once stale', async ({ page }) => {
        await seed(page, { spec: 'warrior-protection' })
        const release = await holdWorkers(page)
        await page.goto('./')
        const panel = results(page)
        await expect(simulateOf(panel)).toHaveAccessibleName('Simulate')
        await setupCardWhole(panel, 'ready')
        await simulateOf(panel).click()
        await expect(setupOf(panel).getByText(/^Simulating…/)).toBeVisible()
        await setupCardWhole(panel, 'running')
        await release()
        await expect(simulateOf(panel)).toHaveAccessibleName('Run again', { timeout: 60_000 })
        await setupCardWhole(panel, 'done')
        await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
        await page.getByRole('radio', { name: /^Self only/ }).click()
        await expect(actionsOf(panel).getByText('Setup changed', { exact: true })).toBeVisible()
        await setupCardWhole(panel, 'stale')
      })

      test('its whole edge shows after a run that fails', async ({ page }) => {
        await seed(page, { spec: 'hunter-marksmanship', gear: {} })
        await page.goto('./')
        const panel = results(page)
        await setupOf(panel).getByRole('button', { name: 'Simulate' }).click()
        await expect(panel.getByRole('alert')).toBeVisible()
        await setupCardWhole(panel, 'failed')
      })
    })
  }
}
