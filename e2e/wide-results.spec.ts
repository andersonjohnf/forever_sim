import type { Locator, Page, Route } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// docs/ux.md#results, the wide layout's right panel (D34 as amended): from 1440 px it stacks the
// character sheet (always shown, live from the setup, its stats in groups), then Your setup (a line
// a section, each opening its tab, and an action row with Simulate and, once run, the result's
// headline), each a card, then the rest of the result in one column: the breakdown, Cooldowns and
// buffs (open by default, remembered per browser), then Assumptions (collapsed). It never runs past
// the viewport and scrolls inside as one, nothing pinned (wide-panel.spec.ts). Under 1440 px nothing
// changes but weapon skill's single number (results-states.spec.ts, and the last tests here).

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

/** Fury with a Sceptre of Smiting (+2 maces) in the main hand and Mirah's Song in the off hand: 302 and 300. */
const UNEVEN_HANDS = { gear: { mainHand: { itemId: 19908 }, offHand: { itemId: 15806 } } }

test.describe('the wide right panel, 1440 px', () => {
  test.use({ viewport: { width: 1440, height: HEIGHT } })

  test('before a run: the sheet, then your setup with Simulate, and no empty result box', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    // The sheet shows before any run, whose it is in the class's colour, its stats in groups as a
    // player reads them: Offense in the first column, Attributes then Defense in the second.
    const sheet = sheetOf(panel)
    await expect(sheet.getByRole('heading', { name: 'Character sheet' })).toBeVisible()
    await expect(sheet.getByText('Fury Warrior', { exact: true })).toBeVisible()
    await expect(stat(panel, 'Attack power')).toHaveText(/^\d{1,3}(,\d{3})*$/)
    const group = (name: string) => sheet.getByRole('heading', { name, exact: true })
    const [offense, attributes, defense, ap, crit, expertise] = await Promise.all([
      box(group('Offense')),
      box(group('Attributes')),
      box(group('Defense')),
      box(sheet.getByText('Attack power')),
      box(sheet.getByText('Crit', { exact: true })),
      box(sheet.getByText('Expertise', { exact: true })),
    ])
    expect(attributes.x).toBeGreaterThan(offense.x + 150)
    expect(Math.abs(attributes.y - offense.y)).toBeLessThan(2)
    expect(defense.x).toBeCloseTo(attributes.x, 0)
    expect(defense.y).toBeGreaterThan(attributes.y)
    expect(crit.x).toBeCloseTo(ap.x, 0)
    expect(crit.y).toBeGreaterThan(ap.y)
    expect(expertise.y).toBeGreaterThan(defense.y)
    // The first column's numbers line up on the right, in tabular figures.
    const dds = await sheet.locator('dl').first().locator('dd').evaluateAll((els) => els.map((el) => [Math.round(el.getBoundingClientRect().right), getComputedStyle(el).fontVariantNumeric] as const))
    for (const [right, numeric] of dds) {
      expect(right).toBe(dds[0][0])
      expect(numeric).toContain('tabular-nums')
    }
    // It isn't collapsible here.
    await expect(trigger(panel, 'Character sheet')).toHaveCount(0)
    // Your setup, under the sheet: a line a section, in the Fury warrior's defaults, and Simulate with them.
    const setup = setupOf(panel)
    expect((await box(setup)).y).toBeGreaterThan((await box(sheet)).y + (await box(sheet)).height - 1)
    for (const name of ['Character Human', 'Talents 17/34/0', 'Gear Pre-raid best in slot', 'Buffs Standard raid', 'Rotation Default', 'Fight 3:00']) {
      await expect(setup.getByRole('button', { name, exact: true })).toBeVisible()
    }
    // Simulate sits in the card's action row under the lines, on the right, with the status on its left.
    const simulateButton = setup.getByRole('button', { name: 'Simulate' })
    const ready = setup.getByText('Your setup is ready. Simulate to see your DPS.')
    await expect(simulateButton).toBeVisible()
    await expect(ready).toBeVisible()
    const [run, note, fight, card] = await Promise.all([box(simulateButton), box(ready), box(setup.getByRole('button', { name: /^Fight / })), box(setup)])
    expect(run.y).toBeGreaterThanOrEqual(fight.y + fight.height)
    expect(card.x + card.width - (run.x + run.width)).toBeLessThan(16)
    expect(note.x + note.width).toBeLessThan(run.x)
    expect(Math.abs(note.y + note.height / 2 - (run.y + run.height / 2))).toBeLessThan(4)
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
    // From 1440 px Fight shows Advanced open, with no button to press (docs/ux.md "Fight").
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
    // The headline is in Your setup's action row, so it's read right after the setup's lines.
    expect(order).toEqual(['Character sheet', 'Your setup', 'group DPS', 'Damage by ability', 'Cooldowns and buffs', expect.stringMatching(ASSUMPTIONS)])
    await expect(setupOf(panel).getByRole('group', { name: 'DPS' })).toBeVisible()
    // Nothing sits beside the breakdown: every section after the cards starts at the same left edge, the cards' own.
    const lefts = await Promise.all(
      [sheetOf(panel), setupOf(panel), panel.getByRole('heading', { name: 'Damage by ability' }), trigger(panel, 'Cooldowns and buffs')].map(async (l) => (await box(l)).x),
    )
    for (const x of lefts) expect(x).toBeCloseTo(lefts[0], -1)
  })

  test('at 1440×900 the sheet and your setup scroll away with the result', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    const scroller = scrollerOf(panel)
    // The panel stays inside the viewport, and scrolls inside, not the page.
    const b = await box(scroller)
    expect(b.y + b.height).toBeLessThanOrEqual(HEIGHT)
    expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
    await expect(scroller).toHaveAttribute('tabindex', '0')
    // Nothing is pinned: the sheet and Your setup scroll with the result (docs/ux.md#results "Scrolling").
    await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await expect(trigger(panel, ASSUMPTIONS)).toBeInViewport()
    await expect(sheetOf(panel).getByRole('heading', { name: 'Character sheet' })).not.toBeInViewport()
    await expect(setupOf(panel).getByRole('heading', { name: 'Your setup' })).not.toBeInViewport()
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
    const info = sheet.getByRole('button', { name: 'About the boss’s attack table' })
    await info.click()
    await expect(page.getByRole('dialog', { name: 'Boss’s attack table' })).toContainText('Your rotation keeps Holy Shield up most of the fight.')
    await page.keyboard.press('Escape')
    await simulate(panel)
    // The run's own uptime, once it's this setup's.
    await info.click()
    await expect(page.getByRole('dialog', { name: 'Boss’s attack table' })).toContainText(/Your rotation kept it up \d+\.\d% of the fight\./)
    await page.keyboard.press('Escape')
    // The headline is in Your setup's action row, in view beside Run again.
    await expect(setupOf(panel).getByRole('group', { name: 'TPS' })).toBeInViewport()
    await expect(setupOf(panel).getByRole('button', { name: 'Run again' })).toBeInViewport()
    const scroller = scrollerOf(panel)
    // Back at the top the sheet is all there.
    await scroller.evaluate((el) => el.scrollTo(0, 0))
    await expect(sheet.getByRole('heading', { name: 'Character sheet' })).toBeInViewport()
  })

  test('a setup the run refuses keeps its sheet, and the refusal shows under your setup', async ({ page }) => {
    // A hunter with no ranged weapon shoots nothing, so the engine refuses it (ranged-and-pets.md §12).
    await seed(page, { spec: 'hunter-marksmanship', gear: {} })
    await page.goto('./')
    const panel = results(page)
    // The sheet is the setup's, whatever a run makes of it: it says there's nothing to shoot.
    await expect(sheetOf(panel)).toContainText('No ranged weapon')
    await setupOf(panel).getByRole('button', { name: 'Simulate' }).click()
    const alert = panel.getByRole('alert')
    await expect(alert).toContainText('This setup can’t be simulated')
    await expect(alert).toContainText('Add a ranged weapon')
    expect((await box(alert)).y).toBeGreaterThan((await box(setupOf(panel))).y)
    // No headline for a run with no result.
    await expect(panel.getByRole('group', { name: 'DPS' })).toHaveCount(0)
  })

  test('a run under way shows its progress beside Cancel, in your setup’s action row', async ({ page }) => {
    const release = await holdWorkers(page)
    await page.goto('./')
    const panel = results(page)
    const setup = setupOf(panel)
    await setup.getByRole('button', { name: 'Simulate' }).click()
    const cancel = setup.getByRole('button', { name: 'Cancel' })
    const progress = setup.getByText(/^Simulating…/)
    await expect(cancel).toBeVisible()
    await expect(progress).toBeVisible()
    await expect(setup.getByRole('progressbar', { name: 'Simulation progress' })).toBeVisible()
    const [c, p] = await Promise.all([box(cancel), box(progress)])
    expect(p.x + p.width).toBeLessThan(c.x)
    expect(p.y).toBeGreaterThanOrEqual(c.y - 4)
    expect(p.y + p.height).toBeLessThanOrEqual(c.y + c.height + 4)
    // Once, there: the first run has no result box yet.
    await expect(panel.getByText(/^Simulating…/)).toHaveCount(1)
    await expect(panel.getByRole('group', { name: 'DPS' })).toHaveCount(0)
    await release()
    await expect(setup.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 60_000 })
    await expect(panel.getByText(/^Simulating…/)).toHaveCount(0)
  })

  test('each setup line shows its section’s icon and a faint chevron, and on hover a darker one and an underline', async ({ page }) => {
    await page.goto('./')
    const setup = setupOf(results(page))
    const line = setup.getByRole('button', { name: /^Gear / })
    await expect(line.locator('svg').first()).toBeVisible()
    const chevron = line.locator('svg').last()
    const value = line.getByText('Pre-raid best in slot', { exact: true })
    // It looks like something to press before it's hovered (review finding DU2-3).
    await expect(chevron).toHaveCSS('opacity', '0.6')
    await expect(value).toHaveCSS('text-decoration-line', 'none')
    await line.hover()
    await expect(chevron).toHaveCSS('opacity', '1')
    await expect(value).toHaveCSS('text-decoration-line', 'underline')
    expect((await box(line)).height).toBeGreaterThanOrEqual(44)
  })

  test('weapon skill is one number with both hands at the same skill, beside its counterpart at every width', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await expect(stat(panel, 'Weapon skill')).toHaveText('300')
    await expect(stat(panel, 'Weapon skill')).not.toHaveAttribute('title')
    // Under 1440 px too, where it used to take a row of its own: "300 main hand / 300 off hand".
    await page.setViewportSize({ width: 1280, height: HEIGHT })
    await simulate(panel)
    await trigger(panel, 'Character sheet').click()
    const row = (label: string) => panel.locator('dl > div', { has: page.getByText(label, { exact: true }) })
    await expect(row('Weapon skill').locator('dd')).toHaveText('300')
    const [skill, expertise] = await Promise.all([box(row('Weapon skill')), box(row('Expertise'))])
    expect(Math.abs(skill.y - expertise.y)).toBeLessThan(2)
  })

  test('weapon skill with the hands at different skills: "302 · 300" on one line, its hands named', async ({ page }) => {
    await seed(page, UNEVEN_HANDS)
    await page.goto('./')
    const value = stat(results(page), 'Weapon skill')
    await expect(value).toHaveText('302 · 300302 main hand, 300 off hand')
    await expect(value).toHaveAttribute('title', 'Main hand 302, off hand 300')
    await expect(value.getByText('302 · 300')).toHaveAttribute('aria-hidden', 'true')
    const lines = await value.evaluate((el) => el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).lineHeight))
    expect(Math.round(lines)).toBe(1)
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
      [sheetOf(panel), setupOf(panel), panel.getByRole('heading', { name: 'Damage by ability' }), trigger(panel, 'Cooldowns and buffs')].map(async (l) => (await box(l)).x),
    )
    for (const x of lefts) expect(x).toBeCloseTo(lefts[0], -1)
    // The sheet, the headline and the breakdown's top are all in view.
    await expect(setupOf(panel).getByRole('group', { name: 'DPS' })).toBeInViewport()
    await expect(sheetOf(panel).getByRole('heading', { name: 'Character sheet' })).toBeInViewport()
    await expect(panel.getByRole('heading', { name: 'Damage by ability' })).toBeInViewport()
  })

  test('nothing is pinned: the sheet, your setup and the result scroll together', async ({ page }) => {
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    const scroller = scrollerOf(panel)
    const b = await box(scroller)
    expect(b.y + b.height).toBeLessThanOrEqual(1080)
    expect(await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
    await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight))
    await expect(trigger(panel, ASSUMPTIONS)).toBeInViewport()
    await expect(sheetOf(panel).getByRole('heading', { name: 'Character sheet' })).not.toBeInViewport()
    await expect(setupOf(panel).getByRole('heading', { name: 'Your setup' })).not.toBeInViewport()
    expect(await page.evaluate(() => window.scrollY), 'the page itself didn’t scroll').toBe(0)
  })

  test('the sheet’s groups run in three columns, and a tank’s Defense spans them above the boss’s table', async ({ page }) => {
    await seed(page, { spec: 'paladin-protection' })
    await page.goto('./')
    const sheet = sheetOf(results(page))
    const group = (name: string) => box(sheet.getByRole('heading', { name, exact: true }))
    const [melee, spells, mana, attributes, defense, table] = await Promise.all(
      ['Melee', 'Spells', 'Mana', 'Attributes', 'Defense', 'Boss’s attack table'].map((name) => group(name)),
    )
    // Melee | Spells, then Mana | Attributes.
    expect(spells.x).toBeGreaterThan(melee.x + 150)
    expect(attributes.x).toBeGreaterThan(spells.x + 150)
    expect(Math.abs(spells.y - melee.y)).toBeLessThan(2)
    expect(Math.abs(attributes.y - melee.y)).toBeLessThan(2)
    expect(mana.x).toBeCloseTo(spells.x, 0)
    expect(mana.y).toBeGreaterThan(spells.y)
    expect(defense.x).toBeCloseTo(melee.x, 0)
    expect(table.y).toBeGreaterThan(defense.y)
    // Its rows run across the columns: Health, Armor and Defense side by side.
    const [health, armor, def] = await Promise.all(['Health', 'Armor', 'Defense'].map((label) => box(sheet.locator('dt', { hasText: new RegExp(`^${label}$`) }))))
    expect(Math.abs(armor.y - health.y)).toBeLessThan(2)
    expect(Math.abs(def.y - health.y)).toBeLessThan(2)
    expect(def.x).toBeGreaterThan(armor.x)
  })

  test('a tank: TPS over DPS in the action row, then damage taken, the breakdown and how the swings landed', async ({ page }) => {
    await seed(page, { spec: 'paladin-protection' })
    await page.goto('./')
    const panel = results(page)
    await simulate(panel)
    const tps = await box(setupOf(panel).getByRole('group', { name: 'TPS' }))
    const dps = await box(setupOf(panel).getByRole('group', { name: 'DPS' }))
    expect(dps.y).toBeGreaterThanOrEqual(tps.y + tps.height - 1)
    expect(dps.x).toBeCloseTo(tps.x, 0)
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

// The one change under 1440 px: weapon skill is one number there too, beside its counterpart like
// every other stat, never "300 main hand / 300 off hand" across the row (docs/ux.md#results).
for (const { width, height, open } of [
  { width: 1280, height: HEIGHT, open: [] as string[] },
  { width: 390, height: 844, open: ['Show results and details'] },
]) {
  test(`under 1440 px weapon skill is one number too, and both hands’ on one line (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await seed(page, UNEVEN_HANDS)
    await page.goto('./')
    await page.getByRole('button', { name: 'Simulate', exact: true }).first().click()
    await expect(page.getByRole('button', { name: 'Run again', exact: true }).first()).toBeVisible({ timeout: 60_000 })
    for (const name of open) await page.getByRole('button', { name }).click()
    await page.getByRole('button', { name: 'Character sheet' }).click()
    const row = page.locator('dl > div', { has: page.getByText('Weapon skill', { exact: true }) })
    await expect(row.locator('dd')).toHaveText('302 · 300302 main hand, 300 off hand')
    await expect(row.locator('dd')).toHaveAttribute('title', 'Main hand 302, off hand 300')
    // A 9 rem column can't hold both beside the label, so the row has the width to itself, on one line.
    const [skill, attackPower] = await Promise.all([box(row), box(page.locator('dl > div', { has: page.getByText('Attack power', { exact: true }) }))])
    expect(skill.width).toBeGreaterThan(2 * attackPower.width)
    expect(skill.height).toBeLessThan(28)
  })
}
