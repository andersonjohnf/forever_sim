import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#results, the wide layout's right panel (D34 as amended): from 1440 px it stacks the
// character sheet (always shown, live from the setup), Your setup (a line a section, each opening
// its tab, with Simulate), then the result once run, in one column: the headline, the breakdown,
// Cooldowns and buffs (open by default, remembered per browser), then Assumptions (collapsed). It
// never runs past the viewport and scrolls inside; the sheet and the summary stay put while the
// results scroll, unless they'd take more than 60% of the panel, when the sheet scrolls with them.
// Under 1440 px nothing changes (results-states.spec.ts, and the last test here).

const HEIGHT = 900

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

async function simulate(panel: Locator) {
  await panel.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
  await expect(panel.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 60_000 })
}

const trigger = (panel: Locator, name: string | RegExp) => panel.getByRole('button', { name, exact: typeof name === 'string' })
const ASSUMPTIONS = /^Assumptions \(\d+\)$/

type Box = { x: number; y: number; width: number; height: number }
const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!

/** A value in the sheet's grid, by its label. */
const stat = (panel: Locator, label: string) => sheetOf(panel).locator('dl > div', { has: panel.page().getByText(label, { exact: true }) }).locator('dd')

test.describe('the wide right panel, 1440 px', () => {
  test.use({ viewport: { width: 1440, height: HEIGHT } })

  test('before a run: the sheet and your setup with Simulate, and no empty result box', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    // The sheet shows before any run, in its two columns.
    await expect(sheetOf(panel).getByRole('heading', { name: 'Character sheet' })).toBeVisible()
    await expect(stat(panel, 'Attack power')).toHaveText(/^\d{1,3}(,\d{3})*$/)
    const [ap, crit] = await Promise.all([box(sheetOf(panel).getByText('Attack power')), box(sheetOf(panel).getByText('Crit', { exact: true }))])
    expect(crit.x).toBeGreaterThan(ap.x + 150)
    expect(Math.abs(crit.y - ap.y)).toBeLessThan(2)
    // It isn't collapsible here.
    await expect(trigger(panel, 'Character sheet')).toHaveCount(0)
    // Your setup: a line a section, in the Fury warrior's defaults, and Simulate with them.
    const setup = setupOf(panel)
    for (const name of ['Character Human', 'Talents 17/34/0', 'Gear Pre-raid best in slot', 'Buffs Standard raid', 'Rotation Default', 'Fight 3:00']) {
      await expect(setup.getByRole('button', { name, exact: true })).toBeVisible()
    }
    await expect(setup.getByRole('button', { name: 'Simulate' })).toBeVisible()
    await expect(setup.getByText('Your setup is ready. Simulate to see your DPS.')).toBeVisible()
    // Nothing of a result until there is one, and the panel ends where its content does.
    await expect(panel.getByRole('group', { name: 'DPS' })).toHaveCount(0)
    const scroller = scrollerOf(panel)
    expect(await scroller.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true)
    await expect(scroller).not.toHaveAttribute('tabindex')
  })

  test('Simulate is sized to its label, never stretched', async ({ page }) => {
    await page.goto('./')
    const setup = setupOf(results(page))
    for (const name of ['Simulate', 'Run again']) {
      const button = setup.getByRole('button', { name })
      const b = await box(button)
      expect(b.height).toBeGreaterThanOrEqual(44)
      // Its label and icon with the button's padding: far from the panel's 30 rem.
      expect(b.width).toBeLessThan(160)
      if (name === 'Simulate') await simulate(results(page))
    }
  })

  test('the sheet follows the setup, before any run', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    const before = await stat(panel, 'Attack power').textContent()
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    await page.getByRole('radio', { name: /^Self only/ }).click()
    await expect(stat(panel, 'Attack power')).not.toHaveText(before!)
    // And the summary with it.
    await expect(setupOf(panel).getByRole('button', { name: 'Buffs Self only', exact: true })).toBeVisible()
  })

  test('each setup line opens its section and moves focus there', async ({ page }) => {
    await page.goto('./')
    const setup = setupOf(results(page))
    await setup.getByRole('button', { name: /^Talents / }).click()
    await expect(page.getByRole('tab', { name: 'Talents', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('[data-section="talents"]')).toBeFocused()
    // By keyboard too.
    await setup.getByRole('button', { name: /^Fight / }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('tab', { name: 'Fight', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('[data-section="fight"]')).toBeFocused()
  })

  // docs/ux.md "Your setup": each line follows the setup, by its own section's rule.
  test('the setup lines follow the setup', async ({ page }) => {
    await page.goto('./')
    const setup = setupOf(results(page))
    const line = (name: string) => setup.getByRole('button', { name: new RegExp(`^${name} `) })
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    // Fight's Advanced settings are shown, not behind a disclosure, from 1440 px (docs/ux.md principle 4).
    await page.getByRole('button', { name: 'Decrease Boss level' }).click()
    await expect(line('Fight')).toHaveAccessibleName('Fight 3:00 · level 62')
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    await page.getByRole('radio', { name: /^Standard raid/ }).click()
    await expect(line('Buffs')).toHaveAccessibleName('Buffs Standard raid')
    // A buff switched off matches no preset.
    await page.getByRole('switch', { name: 'Blessing of Kings' }).click()
    await expect(line('Buffs')).toHaveAccessibleName('Buffs Custom')
  })

  test('after a run: one column, in ux.md’s order, Cooldowns open and Assumptions collapsed', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    await expect(trigger(panel, 'Cooldowns and buffs')).toHaveAttribute('aria-expanded', 'true')
    await expect(trigger(panel, ASSUMPTIONS)).toHaveAttribute('aria-expanded', 'false')
    await expect(panel.getByRole('table')).toBeAttached()
    await expect(panel.getByText('Your setup is ready.')).toHaveCount(0)
    // The DOM, and so a screen reader, keeps ux.md's order.
    const order = await panel.evaluate((el) =>
      [...el.querySelectorAll('h3, [role="group"][aria-labelledby], button[aria-expanded]')]
        .map((n) => (n.matches('[role="group"]') ? `group ${n.querySelector('span')?.textContent}` : n.textContent?.trim()))
        .filter((t) => t && !/^(Threat|Damage)$/.test(t)),
    )
    expect(order).toEqual(['Character sheet', 'Your setup', 'group DPS', 'Damage by ability', 'Cooldowns and buffs', expect.stringMatching(ASSUMPTIONS)])
    // Nothing sits beside the breakdown: every section starts at the same left edge.
    const lefts = await Promise.all(
      [panel.getByRole('group', { name: 'DPS' }), panel.getByRole('heading', { name: 'Damage by ability' }), trigger(panel, 'Cooldowns and buffs')].map(async (l) => (await box(l)).x),
    )
    for (const x of lefts) expect(x).toBeCloseTo(lefts[0], -1)
  })

  test('the sheet and your setup stay put while the result scrolls under them', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    const scroller = scrollerOf(panel)
    // The panel stays inside the viewport, and scrolls inside, not the page.
    const b = await box(scroller)
    expect(b.y + b.height).toBeLessThanOrEqual(HEIGHT)
    expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
    await expect(scroller).toHaveAttribute('tabindex', '0')
    const sheet = await box(sheetOf(panel))
    const setup = await box(setupOf(panel))
    await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await expect(trigger(panel, ASSUMPTIONS)).toBeInViewport()
    expect((await box(sheetOf(panel))).y).toBeCloseTo(sheet.y, 0)
    expect((await box(setupOf(panel))).y).toBeCloseTo(setup.y, 0)
    expect(await page.evaluate(() => window.scrollY), 'the page itself didn’t scroll').toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no sideways scroll').toBe(true)
  })

  test('Cooldowns closed stays closed, and reopened stays open, across reloads', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    await trigger(panel, 'Cooldowns and buffs').click()
    await expect(trigger(panel, 'Cooldowns and buffs')).toHaveAttribute('aria-expanded', 'false')
    await page.reload()
    await simulate(panel)
    await expect(trigger(panel, 'Cooldowns and buffs')).toHaveAttribute('aria-expanded', 'false')
    // Opening it again is remembered too, and a re-run leaves it as it is.
    await trigger(panel, 'Cooldowns and buffs').click()
    await simulate(panel)
    await expect(trigger(panel, 'Cooldowns and buffs')).toHaveAttribute('aria-expanded', 'true')
    await page.reload()
    await simulate(panel)
    await expect(trigger(panel, 'Cooldowns and buffs')).toHaveAttribute('aria-expanded', 'true')
  })

  test('a stored value it can’t read opens Cooldowns, as for a first visit', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('forever-sim:results-closed', '{"not":"a list"'))
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    await expect(trigger(panel, 'Cooldowns and buffs')).toHaveAttribute('aria-expanded', 'true')
  })

  test('each breakdown row’s outcomes keep to one line', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    const breakdown = panel.getByRole('region', { name: 'Damage by ability' })
    const lines = await breakdown.locator('li').evaluateAll((rows) =>
      rows.map((row) => {
        // The outcomes' first line (a bleed's uptime has a line of its own).
        const line = row.querySelector('[data-outcomes] > span:first-child') as HTMLElement | null
        if (!line) return { text: '', lines: 0 }
        const height = line.getBoundingClientRect().height
        const lineHeight = Number.parseFloat(getComputedStyle(line).lineHeight)
        return { text: line.textContent ?? '', lines: Math.round(height / lineHeight) }
      }),
    )
    expect(lines.length).toBeGreaterThan(5)
    for (const l of lines) if (l.text) expect(l.lines, l.text).toBe(1)
  })

  test('a tank: the boss’s table is in the sheet before a run; a run brings its result into view', async ({ page }) => {
    await seed(page, { spec: 'paladin-protection' })
    await page.goto('./')
    const panel = results(page)
    const sheet = sheetOf(panel)
    await expect(sheet.getByRole('heading', { name: 'Boss’s attack table' })).toBeVisible()
    await expect(sheet.getByText(/Your rotation keeps Holy Shield up most of the fight\./)).toBeVisible()
    await simulate(panel)
    // The run's own uptime, once it's this setup's.
    await expect(sheet.getByText(/Your rotation kept it up \d+\.\d% of the fight\./)).toBeAttached()
    // The sheet is too long to stay put at 1440×900, so it scrolled away and the result came into
    // view under your setup, which stays.
    await expect(panel.getByRole('group', { name: 'TPS' })).toBeInViewport()
    await expect(setupOf(panel).getByRole('button', { name: 'Run again' })).toBeInViewport()
    const scroller = scrollerOf(panel)
    const scrollerTop = (await box(scroller)).y
    // It scrolls smoothly: your setup ends up at the panel's top, under its rule and padding.
    await expect.poll(async () => Math.round((await box(setupOf(panel))).y - scrollerTop)).toBe(17)
    const setupTop = (await box(setupOf(panel))).y
    await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    expect((await box(setupOf(panel))).y).toBeCloseTo(setupTop, 0)
    // Back at the top the sheet is all there.
    await scroller.evaluate((el) => el.scrollTo(0, 0))
    await expect(sheet.getByRole('heading', { name: 'Character sheet' })).toBeInViewport()
  })

  test('a setup the run refuses keeps its sheet, and the refusal shows under your setup', async ({ page }) => {
    await seed(page, { race: 'alliance-skyborne-high-order' })
    await page.goto('./')
    const panel = results(page)
    // The sheet is the setup's, whatever a run makes of it: it names what it leaves out.
    await expect(sheetOf(panel)).toContainText('Not known for Forever yet, so left out: base attributes.')
    await setupOf(panel).getByRole('button', { name: 'Simulate' }).click()
    const alert = panel.getByRole('alert')
    await expect(alert).toContainText('a Skyborne warrior can’t be simulated')
    expect((await box(alert)).y).toBeGreaterThan((await box(setupOf(panel))).y)
    // No headline for a run with no result.
    await expect(panel.getByRole('group', { name: 'DPS' })).toHaveCount(0)
  })

  // Review finding DA-5: the tooltip names only this platform's key, and opens on hover alone.
  for (const { platform, key } of [
    { platform: 'Win32', key: 'Ctrl+Enter' },
    { platform: 'MacIntel', key: '⌘+Enter' },
  ]) {
    test(`Simulate names its keyboard shortcut, for assistive tech and in its tooltip (${platform})`, async ({ page }) => {
      await page.addInitScript((platform) => {
        Object.defineProperty(Navigator.prototype, 'platform', { get: () => platform })
        Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined })
      }, platform)
      await page.goto('./')
      const button = results(page).getByRole('button', { name: 'Simulate' })
      await expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter')
      await button.hover()
      await expect(page.getByRole('tooltip')).toHaveText(`Simulate (${key})`)
    })
  }

  test('keyboard focus doesn’t open the Simulate tooltip, before or after a keyboard run', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await panel.getByRole('button', { name: 'Simulate' }).focus()
    await page.waitForTimeout(1000)
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect(panel.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 60_000 })
    await panel.getByRole('button', { name: 'Run again' }).focus()
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(panel.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 60_000 })
    await page.waitForTimeout(1000)
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  })
})

test.describe('the wide right panel, 1920 px', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })

  test('still one column, and your setup in three columns', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    const setup = setupOf(panel)
    const [character, talents, gear, buffs] = await Promise.all(
      ['Character', 'Talents', 'Gear', 'Buffs'].map((name) => box(setup.getByRole('button', { name: new RegExp(`^${name} `) }))),
    )
    expect(talents.y).toBeCloseTo(character.y, 0)
    expect(gear.y).toBeCloseTo(character.y, 0)
    expect(buffs.y).toBeGreaterThan(character.y + 40)
    expect(buffs.x).toBeCloseTo(character.x, 0)
    const lefts = await Promise.all(
      [panel.getByRole('group', { name: 'DPS' }), panel.getByRole('heading', { name: 'Damage by ability' }), trigger(panel, 'Cooldowns and buffs')].map(async (l) => (await box(l)).x),
    )
    for (const x of lefts) expect(x).toBeCloseTo(lefts[0], -1)
    // The whole result's top is in view under the sheet and setup, which stay put.
    await expect(panel.getByRole('group', { name: 'DPS' })).toBeInViewport()
  })

  test('a tank: TPS and DPS side by side, then damage taken, the breakdown and how the swings landed', async ({ page }) => {
    await seed(page, { spec: 'paladin-protection' })
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    const tps = await box(panel.getByRole('group', { name: 'TPS' }))
    const dps = await box(panel.getByRole('group', { name: 'DPS' }))
    expect(dps.x).toBeGreaterThan(tps.x + tps.width - 1)
    expect(Math.abs(dps.y - tps.y)).toBeLessThan(2)
    const ys = await Promise.all(
      ['Damage taken per second', 'Threat by ability', 'How the boss’s swings landed'].map(async (name) => (await box(panel.getByRole('heading', { name }))).y),
    )
    expect(ys[0]).toBeGreaterThan(tps.y)
    expect(ys[1]).toBeGreaterThan(ys[0])
    expect(ys[2]).toBeGreaterThan(ys[1])
  })
})

test('under 1440 px the panel is as it was: no setup summary, the sheet collapsed in the result', async ({ page }) => {
  await page.setViewportSize({ width: 1439, height: HEIGHT })
  await page.addInitScript(() => localStorage.setItem('forever-sim:results-closed', '[]'))
  await page.goto('./')
  const panel = results(page)
  await expect(setupOf(panel)).toHaveCount(0)
  await expect(sheetOf(panel)).toHaveCount(0)
  await simulate(panel)
  for (const name of ['Cooldowns and buffs', 'Character sheet']) await expect(trigger(panel, name)).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger(panel, ASSUMPTIONS)).toHaveAttribute('aria-expanded', 'false')
  // The headline card keeps its column: Simulate under the value, the width of the card.
  const value = await box(panel.getByRole('group', { name: 'DPS' }))
  const run = await box(panel.getByRole('button', { name: 'Run again' }))
  expect(run.y).toBeGreaterThan(value.y + value.height)
  expect(run.width).toBeGreaterThan(300)
})
