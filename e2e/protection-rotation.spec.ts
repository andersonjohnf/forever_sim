import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// Protection's Rotation tab (docs/ux.md "Rotation", "A tank's presets"; docs/classes/warrior.md
// §5.4): a priority list (decision D31) whose preset picker, at the top of the tab, is its Priority
// choice, Balanced by default, or Defensive or Max TPS (D28), each moving the defaults of the rows it
// drops; only the pre-pull pinned, the duties movable with their rule; editing the list reads
// "Custom"; and a run with each.

/** Protection's Rotation tab, from the spec switcher, as a visitor gets there. */
async function openProtectionRotation(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: /Spec: Fury Warrior/ }).click()
  await page.getByRole('group', { name: 'Warrior' }).getByRole('menuitem', { name: /Protection/ }).click()
  await expect(page.getByRole('button', { name: /Spec: Protection Warrior/ })).toBeVisible()
  await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
  return page.getByRole('tabpanel', { name: 'Rotation' })
}

/** §5.4's rows, in the list's default order, which the three presets share. */
const DEFAULT_ORDER = [
  'prepull',
  'shieldBlock',
  'bloodrage',
  'racial',
  'trinkets',
  'thunderClap',
  'demoShout',
  'shieldSlam',
  'revenge',
  'battleShout',
  'sunder',
  'sunderFiller',
  'heroicStrike',
  'execute',
]
/** The rows' ids in the list's order. */
const order = (page: Page) => page.locator('[data-apl-row]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-apl-row')))
const preset = (page: Page) => page.getByRole('combobox', { name: 'Rotation preset' })
/** A preset's name in the menu and the trigger: the default's is marked "(default)". */
const presetName = (name: string) => new RegExp(`^${name}( \\(default\\))?$`)
const pick = async (page: Page, name: string) => {
  await preset(page).click()
  await page.getByRole('option', { name: presetName(name) }).click()
  await expect(preset(page)).toHaveText(presetName(name))
}
/** A row on the list, by id. */
const row = (page: Page, id: string) => page.locator(`[data-apl-row="${id}"]`)
/** The row's switch on the list. */
const rowSwitch = (page: Page, id: string) => row(page, id).getByRole('switch')
/** A row's settings, in the panel beside the list (1280 px). */
const openRow = async (page: Page, name: string): Promise<Locator> => {
  await page.getByRole('list', { name: 'Priority list' }).getByRole('button', { name, exact: true }).click()
  return page.getByRole('complementary', { name: `${name} settings` })
}
/** What a screen reader hears of a change from the last run (docs/ux.md#results). */
const HEARD_CHANGE = /^(up|down) [\d,]+\.\d from the last run, (better|worse)$/

test.describe('Protection rotation', () => {
  test('is Balanced by default: the preset picker first on the tab, its line and info, and §5.4’s rows with only the pre-pull pinned', async ({ page }) => {
    const tab = await openProtectionRotation(page)
    await expect(
      tab.getByText('Which abilities the sim uses, and when. Defensive and Max TPS are tuned for the default setup; Balanced, the default, is a first quick search and isn’t tuned yet.', {
        exact: true,
      }),
    ).toBeVisible()
    // The picker is the Priority choice (D28): no separate control, and the default marked in its menu.
    await expect(tab.getByRole('radiogroup', { name: 'Priority' })).toHaveCount(0)
    await expect(preset(page)).toHaveText('Balanced (default)')
    // The short line under it says what Balanced keeps and drops, with a number or two.
    await expect(preset(page)).toHaveAccessibleDescription(
      'Shield Block and 5 Sunders kept, no Thunder Clap or Shout, Sunder filler from 60 rage: +10% TPS, +6% DPS vs Defensive.',
    )
    await preset(page).click()
    await expect(page.getByRole('option')).toHaveText(['Defensive', 'Balanced (default)', 'Max TPS'])
    await page.keyboard.press('Escape')
    // The info lists all three with their full numbers.
    await tab.getByRole('button', { name: 'About the presets' }).click()
    const info = page.getByRole('dialog', { name: 'The presets' })
    await expect(info.getByRole('term')).toHaveText(['Defensive', 'Balanced (default)', 'Max TPS'])
    await expect(info).toContainText('9.5% more TPS, 6.4% more DPS and 21% more damage taken')
    await expect(info).toContainText('13.9% more TPS, 6.9% more DPS and 41% more damage taken')
    await page.keyboard.press('Escape')
    await expect(tab.getByRole('button', { name: 'About the presets' })).toBeFocused()
    // The preset first, then the consumables, spec-wide, above the list; nothing else is.
    await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Preset', 'Consumables', 'Priority list'])
    expect(await order(page)).toEqual(DEFAULT_ORDER)
    // Only the pre-pull is pinned (D31); the duties have handles like the rest.
    await expect(row(page, 'prepull').getByText('Fixed in place:')).toHaveCount(1)
    for (const id of ['shieldBlock', 'thunderClap', 'demoShout', 'bloodrage', 'shieldSlam', 'sunder', 'heroicStrike']) {
      await expect(row(page, id).getByRole('button', { name: /^Move / }), id).toHaveCount(1)
    }
    // Balanced's rows: Shield Block, Sunder Armor's upkeep and its filler from 60 on; Thunder Clap and Demoralizing Shout off.
    for (const id of ['shieldBlock', 'shieldSlam', 'revenge', 'sunder', 'sunderFiller', 'heroicStrike']) await expect(rowSwitch(page, id), id).toBeChecked()
    for (const id of ['thunderClap', 'demoShout', 'execute']) {
      await expect(rowSwitch(page, id), id).not.toBeChecked()
      await expect(row(page, id), id).toContainText('Off')
    }
    await expect(row(page, 'sunder')).toContainText('5 stacks · again with 1.5 s left')
    await expect(row(page, 'sunderFiller')).toContainText('From 60 rage')
    await expect(row(page, 'heroicStrike')).toContainText('From 84 rage · any rage in the last 12 s')
    // The default Protection warrior is a Human, whose racial cooldown isn't used, as for every spec.
    await expect(row(page, 'racial')).toContainText('Not used: Human has no racial cooldown that adds damage.')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('Defensive and Max TPS move the rows’ defaults, unmarked; editing the list reads Custom; a preset puts it back', async ({ page }) => {
    await openProtectionRotation(page)
    await pick(page, 'Defensive')
    await expect(page.locator('[data-announcer]')).toHaveText('Rotation set to Defensive.')
    // The duties on, Sunder Armor again with 3 s left, the filler from 9, Heroic Strike from 76: none marked.
    for (const id of ['shieldBlock', 'thunderClap', 'demoShout', 'sunderFiller']) {
      await expect(rowSwitch(page, id), id).toBeChecked()
      await expect(rowSwitch(page, id), id).not.toHaveAccessibleDescription(/Changed/)
    }
    await expect(preset(page)).toHaveAccessibleDescription('Shield Block, Thunder Clap and Demoralizing Shout kept up: the least damage taken. Tuned on threat.')
    await expect(row(page, 'sunder')).toContainText('5 stacks · again with 3 s left')
    await expect(row(page, 'sunderFiller')).toContainText('From 9 rage')
    await expect(row(page, 'heroicStrike')).toContainText('From 76 rage')
    await expect(row(page, 'thunderClap')).toContainText('Again with 6 s left')

    await pick(page, 'Max TPS')
    for (const id of ['shieldBlock', 'thunderClap', 'demoShout']) await expect(rowSwitch(page, id), id).not.toBeChecked()
    await expect(rowSwitch(page, 'sunderFiller')).toBeChecked()
    await expect(row(page, 'heroicStrike')).toContainText('From 45 rage')

    // A switch you turn back on stays on, marked against Max TPS's default, and the list is Custom.
    await rowSwitch(page, 'shieldBlock').click()
    await expect(rowSwitch(page, 'shieldBlock')).toBeChecked()
    await expect(rowSwitch(page, 'shieldBlock')).toHaveAccessibleDescription(/^Changed\./)
    await expect(preset(page)).toHaveText('Custom')
    await expect(preset(page)).toHaveAccessibleDescription('Custom: you’ve changed the list from every preset. Pick one to start again from it.')
    // So is a row moved: back to Max TPS, then Battle Shout above Shield Slam.
    await pick(page, 'Max TPS')
    await expect(rowSwitch(page, 'shieldBlock')).not.toBeChecked()
    const panel = await openRow(page, 'Battle Shout')
    await panel.getByRole('button', { name: 'Move up', exact: true }).click()
    await panel.getByRole('button', { name: 'Move up', exact: true }).click()
    await expect.poll(() => order(page)).toEqual([...DEFAULT_ORDER.slice(0, 7), 'battleShout', 'shieldSlam', 'revenge', ...DEFAULT_ORDER.slice(10)])
    await expect(preset(page)).toHaveText('Custom')
    // Picking Balanced puts the order and its rows back.
    await pick(page, 'Balanced')
    expect(await order(page)).toEqual(DEFAULT_ORDER)
    await expect(rowSwitch(page, 'thunderClap')).not.toBeChecked()
    await expect(rowSwitch(page, 'shieldBlock')).toBeChecked()
    await expect(page.getByRole('button', { name: 'Reset order' })).toBeDisabled()
  })

  test('a duty moves and keeps its refresh rule; the refresh times follow the duty rule, Balanced’s Sunder Armor too (D26, D28, D31)', async ({ page }) => {
    await openProtectionRotation(page)
    await pick(page, 'Defensive')
    const rule = 'follows the tank duties’ rule: refresh while a missed cast can still be tried again before it falls off.'
    const tc = await openRow(page, 'Thunder Clap')
    await expect(tc.getByText('Position 6 of 14')).toBeVisible()
    const thunderClap = tc.getByRole('textbox', { name: 'Thunder Clap again with' })
    await expect(thunderClap).toHaveValue('6')
    await expect(thunderClap).toHaveAccessibleDescription(new RegExp(`The default, 6 s \\(its cooldown\\), ${rule}$`))
    // Moved below Shield Slam, it keeps its rule, and the list is Custom.
    for (let i = 0; i < 2; i++) await tc.getByRole('button', { name: 'Move down', exact: true }).click()
    await expect.poll(() => order(page)).toEqual([...DEFAULT_ORDER.slice(0, 5), 'demoShout', 'shieldSlam', 'thunderClap', ...DEFAULT_ORDER.slice(8)])
    await expect(row(page, 'thunderClap')).toContainText('Again with 6 s left')
    await expect(preset(page)).toHaveText('Custom')
    await pick(page, 'Defensive')
    const demo = await openRow(page, 'Demoralizing Shout')
    const demoShout = demo.getByRole('textbox', { name: 'Demoralizing Shout again with' })
    await expect(demoShout).toHaveValue('1.5')
    await expect(demoShout).toHaveAccessibleDescription(new RegExp(`The default, 1\\.5 s \\(one global cooldown, as it has none\\), ${rule}$`))
    // Sunder Armor's is a threat ability's in Defensive, tuned by the search; Balanced keeps it by the rule.
    const sunder = await openRow(page, 'Sunder Armor')
    const refresh = sunder.getByRole('textbox', { name: 'Sunder Armor again with' })
    await expect(refresh).toHaveValue('3')
    await expect(refresh).toHaveAccessibleDescription(/With Balanced it’s 1\.5 s by default \(one global cooldown, as it has none\), the tank duties’ rule/)
    await pick(page, 'Balanced')
    await expect(refresh).toHaveValue('1.5')
    await expect(refresh).not.toHaveAccessibleDescription(/Changed/)
  })

  test('the Buffs tab’s Thunder Clap is off with Balanced and Max TPS, to turn on for another warrior’s; Defensive’s own replaces it', async ({ page }) => {
    await openProtectionRotation(page)
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
    const thunderClap = buffs.getByRole('switch', { name: 'Thunder Clap', exact: true })
    await expect(thunderClap).not.toBeChecked()
    await expect(thunderClap).toBeEnabled()
    await expect(thunderClap).toHaveAccessibleDescription(/\. You’re not keeping it up \(see Rotation\); turn this on if another warrior does\.$/)
    await thunderClap.click()
    await expect(thunderClap).toBeChecked()
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    await pick(page, 'Defensive')
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    await expect(thunderClap).toBeChecked()
    await expect(thunderClap).toBeDisabled()
    await expect(thunderClap).toHaveAccessibleDescription(/You keep it up yourself \(see Rotation\)/)
  })

  test('runs: Defensive makes less threat and less damage than Balanced, Max TPS more of both', async ({ page }) => {
    await openProtectionRotation(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    const run = async () => {
      await results.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
      await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    }
    const heard = (metric: string) => results.getByRole('group', { name: metric }).getByText(HEARD_CHANGE)
    const uptimeRow = (name: string) => results.getByRole('table').getByRole('row', { name: new RegExp(`^${name} \\d+\\.\\d% \\d+\\.\\d$`) })
    const breakdown = results.getByRole('region', { name: 'Threat by ability' })
    const threatRow = (name: string) => breakdown.getByRole('listitem').filter({ hasText: name })
    await run()
    // Balanced keeps Sunder Armor on the boss, and no Thunder Clap or Demoralizing Shout.
    await results.getByRole('button', { name: 'Cooldowns and buffs' }).click()
    await expect(uptimeRow('Sunder Armor')).toBeVisible()
    for (const name of ['Thunder Clap', 'Demoralizing Shout']) await expect(threatRow(name)).toHaveCount(0)

    await pick(page, 'Defensive')
    await expect(results.getByRole('group', { name: 'TPS' })).toContainText('Setup changed')
    await run()
    // Balanced's filler from 60 and Heroic Strike from 84 on a faster, harder boss's rage: more of both (§5.4 "Balanced").
    await expect(heard('TPS')).toHaveText(/^down [\d,]+\.\d from the last run, worse$/)
    await expect(heard('DPS')).toHaveText(/^down [\d,]+\.\d from the last run, worse$/)
    // The debuffs it keeps on the boss show their uptime and their attack's casts per fight (PU6).
    for (const name of ['Sunder Armor', 'Thunder Clap', 'Demoralizing Shout']) await expect(uptimeRow(name)).toBeVisible()

    await pick(page, 'Max TPS')
    await run()
    await expect(heard('TPS')).toHaveText(/^up [\d,]+\.\d from the last run, better$/)
    // It keeps Shield Slam, and the boss's faster, harder swings give more rage: more damage too (§5.4).
    await expect(heard('DPS')).toHaveText(/^up [\d,]+\.\d from the last run, better$/)
    for (const name of ['Sunder Armor', 'Revenge', 'Shield Slam']) await expect(threatRow(name)).toHaveCount(1)
    for (const name of ['Thunder Clap', 'Demoralizing Shout']) await expect(threatRow(name)).toHaveCount(0)
  })
})

test.describe('what Shield Block and Shield Slam need (docs/ux.md "Rotation", PU4)', () => {
  test('without a shield their rows are off and locked and say so, the link opens Gear on the off hand; the filler’s wait is dimmed', async ({ page }) => {
    // Protection with its sword and no shield, on Defensive (which has the filler), on the Rotation tab.
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      const config = { version: 1, spec: 'warrior-protection', gear: { mainHand: { itemId: 15806 } }, rotation: { 'warrior.protection.priority': 'duties' } }
      localStorage.setItem('forever-sim:setup', JSON.stringify({ state: { config, bySpec: {}, section: 'rotation' }, version: 1 }))
    })
    await page.goto('./')
    await expect(preset(page)).toHaveText('Defensive')
    for (const id of ['shieldBlock', 'shieldSlam']) {
      await expect(rowSwitch(page, id), id).not.toBeChecked()
      await expect(rowSwitch(page, id), id).toBeDisabled()
      await expect(row(page, id), id).toContainText('Not used: needs a shield.')
    }
    const filler = await openRow(page, 'Sunder Armor filler')
    await expect(filler.locator('[data-inactive]').filter({ has: page.getByRole('switch', { name: 'Sunder Armor filler waits for Shield Slam', exact: true }) })).toHaveCount(1)
    const slam = await openRow(page, 'Shield Slam')
    await expect(slam.getByRole('switch', { name: 'Use Shield Slam', exact: true })).toHaveAccessibleDescription(/Not used: needs a shield \( ?Gear ?\)\.$/)
    await slam.getByRole('button', { name: 'Gear', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Off hand: empty' })).toBeFocused()
  })
})

test.describe('Expose Armor over your Sunder Armor (warrior.md §5.4 notes, Q35)', () => {
  test('the Buffs row, the Rotation help and the result each say yours makes threat but removes no armor', async ({ page }) => {
    await openProtectionRotation(page)
    // The Sunder Armor row's help says what Expose Armor does to it, whatever the Buffs tab holds.
    const sunderRow = await openRow(page, 'Sunder Armor')
    await expect(sunderRow.getByRole('switch', { name: 'Use Sunder Armor', exact: true })).toHaveAccessibleDescription(
      /With Expose Armor on there, yours removes no armor, since only one applies, but still makes its threat \(untested\)\.$/,
    )
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
    const sunder = buffs.getByRole('switch', { name: 'Sunder Armor ×5', exact: true })
    await expect(sunder).toHaveAccessibleDescription(/You keep it up yourself \(see Rotation\)/)
    await buffs.getByRole('switch', { name: 'Expose Armor', exact: true }).click()
    // Still yours and locked, and it says Expose Armor takes its place.
    await expect(sunder).toBeChecked()
    await expect(sunder).toBeDisabled()
    await expect(sunder).toHaveAccessibleDescription(/\. Expose Armor takes its place on the boss, since only one applies; yours still makes its threat \(untested\)\.$/)
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate' }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await results.getByRole('button', { name: /^Assumptions \(\d+\)$/ }).click()
    await expect(results.getByText(/^Expose Armor \(Buffs\) takes the place of your Sunder Armor on the boss, since only one applies/)).toBeVisible()
  })
})

test.describe('Protection rotation on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the preset picker and its options are 44 px targets inside the screen, and picking one moves the rows', async ({ page }) => {
    await openProtectionRotation(page)
    const picker = (await preset(page).boundingBox())!
    expect(picker.x).toBeGreaterThanOrEqual(16)
    expect(picker.x + picker.width).toBeLessThanOrEqual(390 - 16)
    expect(picker.height).toBeGreaterThanOrEqual(44)
    await preset(page).tap()
    await expect(page.getByRole('option')).toHaveCount(3)
    // Measured once the menu's opening zoom has finished.
    for (const option of await page.getByRole('option').all()) await expect.poll(async () => (await option.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await page.getByRole('option', { name: 'Max TPS', exact: true }).tap()
    // The line under the picker fits in three lines at 390 px.
    const line = page.getByText(/^Shield Block, Thunder Clap and Demoralizing Shout dropped for threat/)
    expect((await line.boundingBox())!.height).toBeLessThanOrEqual(3 * 20 + 1)
    await expect(preset(page)).toHaveText('Max TPS')
    await expect(rowSwitch(page, 'shieldBlock')).not.toBeChecked()
    await expect(rowSwitch(page, 'sunderFiller')).toBeChecked()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0)
  })
})
