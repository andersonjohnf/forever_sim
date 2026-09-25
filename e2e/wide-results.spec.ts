import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#results, the wide layout (D34): from 1440 px Cooldowns and buffs and the Character
// sheet open by default, and a reader who closes one keeps it closed (per browser); Assumptions
// stays collapsed. From 1920 px the headline card is a one-row strip and the details sit in two
// columns (three from a 64 rem pane, Assumptions open), by container queries on the results pane.
// The pane never runs past the viewport. Under 1440 px nothing changes (results-states.spec.ts).

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

async function simulate(panel: Locator) {
  await panel.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
  await expect(panel.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 60_000 })
}

const trigger = (panel: Locator, name: string | RegExp) => panel.getByRole('button', { name, exact: typeof name === 'string' })
const ASSUMPTIONS = /^Assumptions \(\d+\)$/

type Box = { x: number; y: number; width: number; height: number }
const box = async (l: Locator): Promise<Box> => (await l.boundingBox())!

/** The pane's details stay inside the viewport and scroll inside it (docs/ux.md#layout). */
async function expectInsideViewport(page: Page, panel: Locator) {
  await page.evaluate(() => window.scrollTo(0, 0))
  const details = panel.getByRole('region', { name: 'Result details' })
  const b = await box(details)
  expect(b.y + b.height, 'the details end inside the viewport').toBeLessThanOrEqual(HEIGHT)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no sideways scroll').toBe(true)
  return details
}

test.describe('the wide results pane, 1440 px', () => {
  test.use({ viewport: { width: 1440, height: HEIGHT } })

  test('Cooldowns and buffs and the Character sheet open by default; Assumptions stays collapsed', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    await expect(trigger(panel, 'Cooldowns and buffs')).toHaveAttribute('aria-expanded', 'true')
    await expect(trigger(panel, 'Character sheet')).toHaveAttribute('aria-expanded', 'true')
    await expect(trigger(panel, ASSUMPTIONS)).toHaveAttribute('aria-expanded', 'false')
    await expect(panel.getByRole('table')).toBeAttached()
    await expect(panel.getByText('Attack power', { exact: true })).toBeAttached()

    // The open details make the pane overflow: it scrolls inside, with its fade, not the page.
    const details = await expectInsideViewport(page, panel)
    expect(await details.evaluate((el) => el.scrollHeight > el.clientHeight), 'the details scroll').toBe(true)
    await expect(details).toHaveAttribute('tabindex', '0')
    await details.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await expect(trigger(panel, ASSUMPTIONS)).toBeInViewport()
    expect(await page.evaluate(() => window.scrollY), 'the page itself didn’t scroll').toBe(0)
  })

  test('a section the reader closes stays closed, and one reopened stays open, across reloads', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    await trigger(panel, 'Character sheet').click()
    await expect(trigger(panel, 'Character sheet')).toHaveAttribute('aria-expanded', 'false')

    await page.reload()
    await simulate(panel)
    await expect(trigger(panel, 'Character sheet')).toHaveAttribute('aria-expanded', 'false')
    await expect(trigger(panel, 'Cooldowns and buffs')).toHaveAttribute('aria-expanded', 'true')

    // Opening it again is remembered too, and a re-run leaves both as they are.
    await trigger(panel, 'Character sheet').click()
    await trigger(panel, 'Cooldowns and buffs').click()
    await simulate(panel)
    await expect(trigger(panel, 'Character sheet')).toHaveAttribute('aria-expanded', 'true')
    await expect(trigger(panel, 'Cooldowns and buffs')).toHaveAttribute('aria-expanded', 'false')
    await page.reload()
    await simulate(panel)
    await expect(trigger(panel, 'Character sheet')).toHaveAttribute('aria-expanded', 'true')
    await expect(trigger(panel, 'Cooldowns and buffs')).toHaveAttribute('aria-expanded', 'false')
  })

  test('a stored value it can’t read opens both, as for a first visit', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('forever-sim:results-closed', '{"not":"a list"'))
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    await expect(trigger(panel, 'Cooldowns and buffs')).toHaveAttribute('aria-expanded', 'true')
    await expect(trigger(panel, 'Character sheet')).toHaveAttribute('aria-expanded', 'true')
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

  test('Simulate names its keyboard shortcut, for assistive tech and in its tooltip', async ({ page }) => {
    await page.goto('./')
    const button = results(page).getByRole('button', { name: 'Simulate' })
    await expect(button).toHaveAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter')
    await button.hover()
    await expect(page.getByRole('tooltip')).toHaveText('Simulate (Ctrl+Enter or ⌘+Enter)')
  })
})

test.describe('the extra-wide results pane, 1920 px', () => {
  test.use({ viewport: { width: 1920, height: HEIGHT } })

  test('the headline is a strip: the value, its ±, the run and Simulate on one row', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    // Before a run: the empty value and Simulate side by side, the prompt under them.
    const value = panel.getByRole('group', { name: 'DPS' })
    let simulateBox = await box(panel.getByRole('button', { name: 'Simulate' }))
    let valueBox = await box(value)
    expect(simulateBox.x).toBeGreaterThan(valueBox.x + valueBox.width)
    expect(simulateBox.y).toBeLessThan(valueBox.y + valueBox.height)
    const prompt = await box(panel.getByText(/^Your setup is ready/))
    expect(prompt.y).toBeGreaterThan(valueBox.y + valueBox.height)

    await simulate(panel)
    await page.getByRole('button', { name: 'Run again' }).first().blur()
    valueBox = await box(value)
    simulateBox = await box(panel.getByRole('button', { name: 'Run again' }))
    const summary = await box(panel.getByText(/fights of \d+ s/))
    // Left to right: the value with its ±, the run's summary, then Simulate, all on one row.
    await expect(value.getByText(/^± \d/)).toBeVisible()
    expect(summary.x).toBeGreaterThanOrEqual(valueBox.x + valueBox.width)
    expect(simulateBox.x).toBeGreaterThanOrEqual(summary.x + summary.width)
    for (const b of [summary, simulateBox]) {
      expect(b.y + b.height).toBeGreaterThan(valueBox.y)
      expect(b.y).toBeLessThan(valueBox.y + valueBox.height)
    }
    // Simulate keeps its 44 px height.
    expect(simulateBox.height).toBeGreaterThanOrEqual(44)
  })

  test('the details sit in two columns, Assumptions under both, in ux.md’s reading order', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    const details = await expectInsideViewport(page, panel)
    const breakdown = await box(panel.getByRole('heading', { name: 'Damage by ability' }))
    const cooldowns = await box(trigger(panel, 'Cooldowns and buffs'))
    const sheet = await box(trigger(panel, 'Character sheet'))
    // Left, what the result is made of; right, what explains it, from the same top.
    expect(cooldowns.x).toBeGreaterThan(breakdown.x + 200)
    expect(sheet.x).toBe(cooldowns.x)
    expect(Math.abs(cooldowns.y - breakdown.y)).toBeLessThan(24)
    // Assumptions spans both columns, under them, and stays collapsed.
    const assumptions = trigger(panel, ASSUMPTIONS)
    await expect(assumptions).toHaveAttribute('aria-expanded', 'false')
    const detailsBox = await box(details)
    const a = await box(assumptions)
    expect(a.width).toBeGreaterThan(detailsBox.width - 24)
    // The DOM, and so a screen reader, keeps ux.md's order.
    const order = await panel.evaluate((el) =>
      [...el.querySelectorAll('h3, button[aria-expanded]')].map((n) => n.textContent?.trim()).filter((t) => t && !/^(Threat|Damage)$/.test(t)),
    )
    expect(order).toEqual(['Damage by ability', 'Cooldowns and buffs', 'Character sheet', expect.stringMatching(ASSUMPTIONS)])
  })

  test('a tank: TPS and DPS in the strip, damage taken and the breakdown left, the boss’s table right', async ({ page }) => {
    await seed(page, { spec: 'paladin-protection' })
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    const tps = await box(panel.getByRole('group', { name: 'TPS' }))
    const dps = await box(panel.getByRole('group', { name: 'DPS' }))
    const run = await box(panel.getByRole('button', { name: 'Run again' }))
    expect(dps.x).toBeGreaterThan(tps.x + tps.width - 1)
    expect(run.x).toBeGreaterThan(dps.x + dps.width)
    expect(Math.abs(dps.y - tps.y)).toBeLessThan(2)
    expect(run.y).toBeLessThan(tps.y + tps.height)

    const taken = await box(panel.getByRole('heading', { name: 'Damage taken per second' }))
    const threat = await box(panel.getByRole('heading', { name: 'Threat by ability' }))
    const swings = await box(panel.getByRole('heading', { name: 'How the boss’s swings landed' }))
    const bossTable = await box(panel.getByRole('heading', { name: 'Boss’s attack table' }))
    const cooldowns = await box(trigger(panel, 'Cooldowns and buffs'))
    expect(threat.x).toBe(taken.x)
    expect(swings.x).toBe(taken.x)
    expect(threat.y).toBeGreaterThan(taken.y)
    expect(cooldowns.x).toBeGreaterThan(taken.x + 200)
    expect(bossTable.x).toBeGreaterThan(taken.x + 200)
    await expectInsideViewport(page, panel)
  })

  test('with no damage to show, what explains the result takes both columns', async ({ page }) => {
    await seed(page, { gear: {} })
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    await expect(panel.getByText('No main-hand weapon')).toBeVisible()
    const details = await box(panel.getByRole('region', { name: 'Result details' }))
    const sheet = await box(trigger(panel, 'Character sheet'))
    expect(sheet.width).toBeGreaterThan(details.width - 24)
  })
})

test('from a 64 rem results pane, Assumptions is a third column, open', async ({ page }) => {
  // At 2560 px the pane is 38% of the page (about 60 rem), so a wider track stands in for the
  // pane this layout is for.
  await page.setViewportSize({ width: 2560, height: HEIGHT })
  await page.goto('./')
  await page.addStyleTag({ content: 'main { grid-template-columns: minmax(0, 1fr) 68rem !important }' })
  const panel = results(page)
  await simulate(panel)
  const assumptions = trigger(panel, ASSUMPTIONS)
  await expect(assumptions).toHaveAttribute('aria-expanded', 'true')
  const a = await box(assumptions)
  const cooldowns = await box(trigger(panel, 'Cooldowns and buffs'))
  const breakdown = await box(panel.getByRole('heading', { name: 'Damage by ability' }))
  expect(a.x).toBeGreaterThan(cooldowns.x + cooldowns.width)
  expect(Math.abs(a.y - cooldowns.y)).toBeLessThan(2)
  expect(cooldowns.x).toBeGreaterThan(breakdown.x)
  await expectInsideViewport(page, panel)
})

test('under 1440 px the details stay collapsed, whatever the wide pane remembers', async ({ page }) => {
  await page.setViewportSize({ width: 1439, height: HEIGHT })
  await page.goto('./')
  const panel = results(page)
  await simulate(panel)
  for (const name of ['Cooldowns and buffs', 'Character sheet']) await expect(trigger(panel, name)).toHaveAttribute('aria-expanded', 'false')
  await expect(trigger(panel, ASSUMPTIONS)).toHaveAttribute('aria-expanded', 'false')
  // The headline card keeps its column: Simulate under the value, the width of the card.
  const value = await box(panel.getByRole('group', { name: 'DPS' }))
  const run = await box(panel.getByRole('button', { name: 'Run again' }))
  expect(run.y).toBeGreaterThan(value.y + value.height)
})
