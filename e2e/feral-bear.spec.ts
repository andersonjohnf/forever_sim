import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The Feral bear (docs/classes/druid.md §4, §6.3, §7), shipped in B4: the switcher, its tabs in
// its own terms, its priority ("Tank duties first" or "Max TPS", decision D26), a run and its tank
// results, and a share link, on a desktop and on a phone (docs/ux.md).

const BEAR = /^Spec: Feral \(Bear\) Druid/

async function switchToBear(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('menuitem', { name: /Feral \(Bear\)/ }).click()
  await expect(page.getByRole('button', { name: BEAR })).toBeVisible()
}

const openTab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click()

async function simulate(page: Page) {
  const results = page.getByRole('complementary', { name: 'Results' })
  await results.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
  await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
  return results
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0)
}

/** A value with its ± 95% CI, e.g. "711.6± 2.1", in a headline group. */
const VALUE_WITH_CI = /\d[\d,]*\.\d\s*± \d[\d,]*\.\d/
/** What a screen reader hears of a change from the last run (docs/ux.md#results). */
const HEARD_CHANGE = /^(up|down) [\d,]+\.\d from the last run, (better|worse)$/
/** The priority's help: what Max TPS drops, what it gains and costs, when to pick it (D26). */
const PRIORITY_HELP =
  /^Tank duties first keeps Demoralizing Roar and Faerie Fire on the boss, so you take less damage\. Max TPS drops the roar for threat: about 3% more TPS and DPS, for 0\.7% more damage taken in the default setup\. It keeps Faerie Fire, whose armor makes your attacks, and so your threat, bigger\. Pick it when another tank or the raid covers your survival\. The Buffs tab’s Demoralizing Roar stays off unless you turn it on there for another druid’s\./

test.describe('Feral bear in the switcher', () => {
  test('is under Druid as a tank, with its own talent build, a Tauren and the Manual Crowd Pummeler', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: / }).click()
    const bear = page.getByRole('menuitem', { name: /Feral \(Bear\)/ })
    await expect(bear).toContainText('Tank')
    // Under the Druid heading, after the cat.
    const items = await page.getByRole('menuitem').allTextContents()
    expect(items.findIndex((t) => t.includes('Feral (Bear)'))).toBe(items.findIndex((t) => t.includes('Feral (Cat)')) + 1)
    await expect(page.getByRole('menu').getByText('Druid', { exact: true })).toBeVisible()
    await bear.click()
    await expect(page.getByRole('button', { name: BEAR })).toBeVisible()

    await openTab(page, 'Character')
    await expect(page.getByRole('radio', { name: /Tauren/ })).toHaveAttribute('aria-checked', 'true')
    await openTab(page, 'Gear')
    await expect(page.getByRole('button', { name: 'Main hand: Manual Crowd Pummeler' })).toBeVisible()
    await openTab(page, 'Talents')
    const presets = page.getByRole('combobox', { name: 'Talent build presets' })
    await expect(presets).toHaveText('Feral bear (default)')
    await expect(page.getByText('9 / 42 / 0')).toBeVisible()
    await presets.click()
    // Both druid builds now that both ship; only the bear's is marked "(default)" here.
    await expect(page.getByRole('option')).toHaveText(['Feral cat default', 'Feral bear (default)', 'Balance default'])
    await page.keyboard.press('Escape')
    // About names both druid specs.
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /About/ }).click()
    await expect(page.getByRole('dialog').getByText(/ · Druids: Feral\u00a0\(Cat\), Feral\u00a0\(Bear\) and Balance · /)).toBeVisible()
  })
})

test.describe('the bear’s priority (druid.md §6.3, D26)', () => {
  test('tank duties first by default, above the headings, and its help says what Max TPS drops, costs and keeps', async ({ page }) => {
    await switchToBear(page)
    await openTab(page, 'Rotation')
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    const priority = tab.getByRole('radiogroup', { name: 'Priority' })
    await expect(priority.getByRole('radio', { name: 'Tank duties first' })).toBeChecked()
    await expect(priority.getByRole('radio', { name: 'Max TPS' })).not.toBeChecked()
    await expect(priority).toHaveAccessibleDescription(PRIORITY_HELP)
    expect((await priority.boundingBox())!.y).toBeLessThan((await tab.getByRole('heading', { name: 'Cooldowns and buffs' }).boundingBox())!.y)
    await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Cooldowns and buffs', 'Core abilities', 'Fillers', 'Consumables'])
    for (const name of ['Demoralizing Roar', 'Faerie Fire', 'Maul', 'Mangle', 'Lacerate', 'Faerie Fire as a filler']) {
      await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
    }
    const core = tab.getByRole('region', { name: 'Core abilities' })
    await core.getByRole('button', { name: /^Advanced settings for Core abilities/ }).click()
    await expect(core.getByRole('textbox', { name: 'Lacerate again with', exact: true })).toHaveValue('12')
  })

  test('Max TPS turns the roar off by default, keeps Faerie Fire and Lacerate’s refresh, and Reset brings the duties back', async ({ page }) => {
    await switchToBear(page)
    await openTab(page, 'Rotation')
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    const priority = tab.getByRole('radiogroup', { name: 'Priority' })
    await priority.getByRole('radio', { name: 'Max TPS' }).click()
    await expect(priority.getByRole('radio', { name: 'Max TPS' })).toBeChecked()
    await expect(priority).toHaveAccessibleDescription(/Changed\. Default: Tank duties first$/)
    // The roar's default follows the choice: off, and not marked as changed.
    const roar = tab.getByRole('switch', { name: 'Demoralizing Roar', exact: true })
    await expect(roar).not.toBeChecked()
    await expect(roar).not.toHaveAccessibleDescription(/Changed/)
    await expect(roar).toHaveAccessibleDescription(/Off by default with Max TPS\./)
    // Faerie Fire stays: its armor makes the bear's threat.
    const faerieFire = tab.getByRole('switch', { name: 'Faerie Fire', exact: true })
    await expect(faerieFire).toBeChecked()
    await expect(faerieFire).toHaveAccessibleDescription(/It stays on with Max TPS: its armor makes your attacks, and so your threat, bigger\./)
    await expect(tab.getByRole('switch', { name: 'Faerie Fire as a filler', exact: true })).toBeChecked()
    // Lacerate's refresh stays the default's, 12 s left (druid.md §6.3, T3's re-check).
    const core = tab.getByRole('region', { name: 'Core abilities' })
    await core.getByRole('button', { name: /^Advanced settings for Core abilities/ }).click()
    const lacerate = core.getByRole('textbox', { name: 'Lacerate again with', exact: true })
    await expect(lacerate).toHaveValue('12')
    await expect(lacerate).toHaveAccessibleDescription(/From 12 s, the global cooldowns Maul’s rage leaves free go to Lacerate, for its threat\./)

    // Turned back on yourself, the roar stays on, marked against its Max TPS default.
    await roar.click()
    await expect(roar).toBeChecked()
    await expect(roar).toHaveAccessibleDescription(/Changed\. Default: off$/)
    // The priority's own Reset brings the duties' defaults back, and keeps what you set.
    await tab.getByRole('button', { name: 'Reset Priority, default Tank duties first' }).click()
    await expect(priority.getByRole('radio', { name: 'Tank duties first' })).toBeChecked()
    await expect(priority.getByRole('radio', { name: 'Tank duties first' })).toBeFocused()
    await expect(roar).toBeChecked()
    await expect(roar).not.toHaveAccessibleDescription(/Changed/)
    await expect(lacerate).toHaveValue('12')
  })

  test('the Buffs tab: the roar and Faerie Fire are yours; with Max TPS the roar is off, for another druid’s, and Faerie Fire still yours', async ({ page }) => {
    await switchToBear(page)
    await openTab(page, 'Buffs')
    const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
    const roar = buffs.getByRole('switch', { name: 'Demoralizing Roar', exact: true })
    const faerieFire = buffs.getByRole('switch', { name: 'Faerie Fire', exact: true })
    for (const own of [roar, faerieFire]) {
      await expect(own).toBeChecked()
      await expect(own).toBeDisabled()
      await expect(own).toHaveAccessibleDescription(/\. You keep it up yourself \(see Rotation\), so it isn’t added twice\.$/)
    }
    await openTab(page, 'Rotation')
    await page.getByRole('tabpanel', { name: 'Rotation' }).getByRole('radiogroup', { name: 'Priority' }).getByRole('radio', { name: 'Max TPS' }).click()
    await openTab(page, 'Buffs')
    // The bear's own, in no preset: off by default once Max TPS drops it, and unlocked, with the note.
    await expect(roar).not.toBeChecked()
    await expect(roar).toBeEnabled()
    await expect(roar).toHaveAccessibleDescription(/\. You’re not keeping it up \(see Rotation\); turn this on if another druid does\.$/)
    await expect(faerieFire).toBeChecked()
    await expect(faerieFire).toBeDisabled()
    await expect(faerieFire).toHaveAccessibleDescription(/You keep it up yourself \(see Rotation\)/)
    // Turned on for another druid's, it counts; back on tank duties, your own replaces it.
    await roar.click()
    await expect(roar).toBeChecked()
    await openTab(page, 'Rotation')
    await page.getByRole('tabpanel', { name: 'Rotation' }).getByRole('button', { name: 'Reset Priority, default Tank duties first' }).click()
    await openTab(page, 'Buffs')
    await expect(roar).toBeChecked()
    await expect(roar).toBeDisabled()
    await expect(roar).toHaveAccessibleDescription(/You keep it up yourself \(see Rotation\)/)
  })

  test('Thorns is on for the bear, a damage shield only a tank feels; the cat’s Buffs tab says so (BR5)', async ({ page }) => {
    await switchToBear(page)
    await openTab(page, 'Buffs')
    const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
    const thorns = buffs.getByRole('switch', { name: 'Thorns', exact: true })
    await expect(thorns).toBeChecked()
    await expect(thorns).toBeEnabled()
    await expect(thorns).toHaveAccessibleDescription(/^22 Nature damage to the boss each time it hits you/)
    // A run lists its damage and threat on its own row.
    const results = await simulate(page)
    await expect(results.getByText('Thorns', { exact: true }).first()).toBeVisible()
    // For the cat it's there, off, and says why it does nothing.
    await page.getByRole('button', { name: /^Spec: / }).click()
    await page.getByRole('menuitem', { name: /Feral \(Cat\)/ }).click()
    await openTab(page, 'Buffs')
    const catThorns = page.getByRole('tabpanel', { name: 'Buffs' }).getByRole('switch', { name: 'Thorns', exact: true })
    await expect(catThorns).not.toBeChecked()
    await expect(catThorns).toHaveAccessibleDescription(/Only the tank takes the boss’s swings, so it changes nothing for you\.$/)
  })

  test('a Max TPS run makes more threat and damage than the default, and drops the roar’s row', async ({ page }) => {
    await switchToBear(page)
    const results = await simulate(page)
    await openTab(page, 'Rotation')
    await page.getByRole('tabpanel', { name: 'Rotation' }).getByRole('radiogroup', { name: 'Priority' }).getByRole('radio', { name: 'Max TPS' }).click()
    await expect(results.getByRole('group', { name: 'TPS' })).toContainText('Setup changed')
    await simulate(page)
    const heard = (metric: string) => results.getByRole('group', { name: metric }).getByText(HEARD_CHANGE)
    await expect(heard('TPS')).toHaveText(/^up [\d,]+\.\d from the last run, better$/)
    await expect(heard('DPS')).toHaveText(/^up [\d,]+\.\d from the last run, better$/)
    const breakdown = results.getByRole('region', { name: 'Threat by ability' })
    const row = (name: string) => breakdown.getByRole('listitem').filter({ hasText: new RegExp(`^${name}`) })
    await expect(row('Demoralizing Roar')).toHaveCount(0)
    for (const name of ['Maul', 'Mangle', 'Faerie Fire']) await expect(row(name).first()).toBeVisible()
  })
})

test.describe('Feral bear share link', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('carries the bear and its Max TPS priority to a fresh page load', async ({ page }) => {
    await switchToBear(page)
    await openTab(page, 'Rotation')
    const maxTps = () => page.getByRole('radiogroup', { name: 'Priority' }).getByRole('radio', { name: 'Max TPS' })
    await maxTps().click()
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const link = await page.evaluate(() => navigator.clipboard.readText())
    // Back to tank duties, then Fury: the link brings the copied bear back.
    await page.getByRole('radiogroup', { name: 'Priority' }).getByRole('radio', { name: 'Tank duties first' }).click()
    await page.getByRole('button', { name: /^Spec: / }).click()
    await page.getByRole('menuitem', { name: /Fury/ }).click()

    await page.goto('about:blank')
    await page.goto(link)
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Loaded a shared setup' })).toBeVisible()
    await expect(page.getByRole('button', { name: BEAR })).toBeVisible()
    await openTab(page, 'Rotation')
    await expect(maxTps()).toBeChecked()
    await expect(page.getByRole('switch', { name: 'Demoralizing Roar', exact: true })).not.toBeChecked()
  })
})

test.describe('Feral bear', () => {
  test('simulates TPS and DPS, its abilities in the threat breakdown', async ({ page }) => {
    await switchToBear(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await expect(results.getByRole('group', { name: 'TPS' })).toContainText(/\d[\d,]*\.\d\s*± /)
    await expect(results.getByRole('group', { name: 'DPS' })).toContainText(/\d[\d,]*\.\d\s*± /)
    // A tank's results: the damage the boss's swings cost it, and how they landed.
    await expect(results.getByRole('region', { name: 'Damage taken per second' })).toContainText(VALUE_WITH_CI)
    await expect(results.getByRole('region', { name: 'How the boss’s swings landed' })).toBeVisible()
    const breakdown = results.getByRole('region', { name: /by ability$/ })
    await expect(breakdown.getByRole('heading')).toHaveText('Threat by ability')
    // Demoralizing Roar deals no damage, so it's in the threat view only.
    for (const name of ['Maul', 'Mangle', 'Faerie Fire', 'Demoralizing Roar']) {
      await expect(breakdown.getByRole('listitem').filter({ hasText: name }).first()).toBeVisible()
    }
  })

  test('keeps the tank’s duties by default, and the Buffs tab shows its own debuffs as kept up', async ({ page }) => {
    await switchToBear(page)
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    await expect(tab.getByText('Which abilities the sim uses, and when. The defaults are tuned for the default setup.', { exact: true })).toBeVisible()
    for (const name of ['Demoralizing Roar', 'Faerie Fire', 'Maul', 'Mangle', 'Lacerate']) await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
    await expect(tab.getByRole('switch', { name: 'Enrage in combat', exact: true })).toBeChecked()
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    for (const name of ['Demoralizing Roar', 'Faerie Fire']) {
      const own = page.getByRole('switch', { name, exact: true })
      await expect(own).toBeChecked()
      await expect(own).toBeDisabled()
    }
    await expect(page.getByText('−204 boss attack power (instead of Demoralizing Shout). You keep it up yourself (see Rotation), so it isn’t added twice.')).toBeVisible()
  })

  test('times its duties by the tank duties’ rule: Faerie Fire from 6 s left, the roar from 1.5 s (PW4)', async ({ page }) => {
    await switchToBear(page)
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    const cooldowns = tab.getByRole('region', { name: 'Cooldowns and buffs' })
    await cooldowns.getByRole('button', { name: /^Advanced settings for Cooldowns and buffs/ }).click()
    const faerieFire = cooldowns.getByRole('textbox', { name: 'Faerie Fire again with', exact: true })
    const roar = cooldowns.getByRole('textbox', { name: 'Demoralizing Roar again with', exact: true })
    await expect(faerieFire).toHaveValue('6')
    await expect(roar).toHaveValue('1.5')
    await expect(faerieFire).toHaveAccessibleDescription(/The default, 6 s \(its cooldown\), follows the tank duties’ rule: refresh while a missed cast can still be tried again before it falls off\./)
    await expect(roar).toHaveAccessibleDescription(/The default, 1\.5 s \(one global cooldown, as it has none\), follows the tank duties’ rule/)
  })

  test('with its roar off, the Buffs tab’s is off and unlocked, for another druid’s; without another druid it needs one (BU3, BU14)', async ({ page }) => {
    await switchToBear(page)
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    await page.getByRole('tabpanel', { name: 'Rotation' }).getByRole('switch', { name: 'Demoralizing Roar', exact: true }).click()
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
    const roar = buffs.getByRole('switch', { name: 'Demoralizing Roar', exact: true })
    // A duty is the bear's own, in no preset: off by default once its rotation drops it.
    await expect(roar).not.toBeChecked()
    await expect(roar).toBeEnabled()
    await expect(roar).toHaveAccessibleDescription(/You’re not keeping it up \(see Rotation\); turn this on if another druid does\./)
    // No other druid in the raid: the roar needs one, and your own Mark of the Wild (Gift of the Wild) is still yours.
    await buffs.getByRole('button', { name: 'Druid', exact: true }).click()
    await expect(roar).toBeDisabled()
    await expect(roar).toHaveAccessibleDescription('Needs another druid in the raid')
    const mark = buffs.getByRole('switch', { name: 'Gift of the Wild', exact: true })
    await expect(mark).toBeChecked()
    await expect(mark).toBeEnabled()
  })

  test('with a Demoralizing Shout from Buffs, its roar shows off, naming the Shout, and Rotation says it isn’t cast (BU2)', async ({ page }) => {
    await switchToBear(page)
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
    const roar = buffs.getByRole('switch', { name: 'Demoralizing Roar', exact: true })
    await expect(roar).toBeChecked()
    await buffs.getByRole('switch', { name: 'Demoralizing Shout', exact: true }).click()
    await expect(roar).not.toBeChecked()
    await expect(roar).toBeDisabled()
    await expect(roar).toHaveAccessibleDescription(
      '−204 boss attack power (instead of Demoralizing Shout). Your raid’s Demoralizing Shout is on the boss instead, so you don’t cast it (see Rotation).',
    )
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    await expect(tab.getByText('Not used: the Demoralizing Shout in Buffs is on the boss instead, so you don’t cast the roar.')).toBeVisible()
    await expect(tab.getByRole('switch', { name: 'Demoralizing Roar', exact: true })).toBeChecked()
  })

  test('says why Lacerate does nothing while it waits for no other bleeds in a raid with warriors, as the cat’s Rake does (BU4)', async ({ page }) => {
    await switchToBear(page)
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    const alone = tab.getByRole('switch', { name: 'Lacerate only when nothing else bleeds', exact: true })
    await expect(alone).not.toBeChecked()
    const note = tab.getByText('Not used in this raid: its warriors keep the boss bleeding. Turn off “Lacerate only when nothing else bleeds” to use it anyway.')
    await expect(note).toHaveCount(0)
    await alone.click()
    await expect(note).toBeVisible()
    // Lacerate's switch stays on and usable; the one that makes it wait stays live.
    await expect(tab.getByRole('switch', { name: 'Lacerate', exact: true })).toBeChecked()
    await expect(alone).toBeEnabled()
  })

  test('shows Lacerate’s uptime and stacks on its bleed row, spells’ misses, its own roar under damage taken, and no parry or block (BU5, BU7, BU8, BU15)', async ({ page }) => {
    await switchToBear(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    const breakdown = results.getByRole('region', { name: /by ability$/ })
    const row = (name: string) => breakdown.getByRole('listitem').filter({ hasText: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) })
    await expect(row('Lacerate (bleed)')).toContainText(/\d+\.\d% uptime on the boss, \d\.\d stacks on average/)
    for (const name of ['Faerie Fire', 'Demoralizing Roar']) {
      await expect(row(name)).toContainText(/\d+\.\d% missed/)
      await expect(row(name)).not.toContainText('crit')
    }
    await expect(results.getByText(/Debuffs on it, such as your Demoralizing Roar \(Rotation\) and a warrior tank’s Thunder Clap \(Buffs\), lower its damage and slow its swings\./)).toBeVisible()
    // Lacerate's marker is on the boss: its uptime is on the bleed's row, not under Cooldowns and buffs.
    await results.getByRole('button', { name: 'Cooldowns and buffs' }).click()
    await expect(results.getByRole('rowheader', { name: 'Faerie Fire' })).toBeVisible()
    await expect(results.getByRole('rowheader', { name: 'Lacerate' })).toHaveCount(0)
    await results.getByRole('button', { name: 'Character sheet' }).click()
    const labels = await results.locator('dl').first().locator('dt').allTextContents()
    expect(labels).toEqual(expect.arrayContaining(['Defense', 'Dodge']))
    for (const label of ['Parry', 'Block', 'Block value']) expect(labels).not.toContain(label)
  })

  test('leaves the execute phase off the Fight tab, and the Buffs tab shows what the bear brings itself (BU13, BU14, BU16)', async ({ page }) => {
    await switchToBear(page)
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    await expect(page.getByRole('switch', { name: 'Execute phase' })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const lotp = page.getByRole('switch', { name: 'Leader of the Pack', exact: true })
    await expect(lotp).toBeChecked()
    await expect(lotp).toBeDisabled()
    await expect(page.getByText('+3% crit (feral druid in your party). Your talents bring it (see Talents), so it isn’t added twice.')).toBeVisible()
    await expect(page.getByText('+8 weapon damage on each weapon. Not used in Dire Bear Form: your attacks there don’t use your weapon’s damage.')).toBeVisible()
    const presets = page.getByRole('radiogroup', { name: 'Preset' })
    await expect(presets.getByRole('radio', { name: 'Standard raid (default)' })).toHaveAttribute('aria-checked', 'true')
    // Self only leaves only what the bear brings itself on, and still matches its preset.
    await presets.getByRole('radio', { name: 'Self only' }).click()
    await expect(presets.getByRole('radio', { name: 'Self only' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText('Custom selection.')).toHaveCount(0)
    await expect(page.getByRole('switch', { name: 'Demoralizing Roar', exact: true })).toBeChecked()
  })
})

test.describe('Feral bear on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('switches, picks Max TPS on a full-width choice, runs and shows its tank results, all without side scroll', async ({ page }) => {
    await switchToBear(page)
    await openTab(page, 'Rotation')
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    const priority = tab.getByRole('radiogroup', { name: 'Priority' })
    await expect(priority).toHaveAccessibleDescription(PRIORITY_HELP)
    const group = (await priority.boundingBox())!
    expect(group.x).toBeGreaterThanOrEqual(16)
    expect(group.x + group.width).toBeLessThanOrEqual(390 - 16)
    const max = priority.getByRole('radio', { name: 'Max TPS' })
    for (const item of [priority.getByRole('radio', { name: 'Tank duties first' }), max]) {
      const box = (await item.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    await max.tap()
    await expect(max).toBeChecked()
    await expect(tab.getByRole('switch', { name: 'Demoralizing Roar', exact: true })).not.toBeChecked()
    await noSideScroll(page)

    await openTab(page, 'Buffs')
    await expect(page.getByRole('switch', { name: 'Demoralizing Roar', exact: true })).toHaveAccessibleDescription(/turn this on if another druid does\.$/)
    await noSideScroll(page)

    await page.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    const bar = page.getByRole('button', { name: 'Show results' })
    await expect(bar).toContainText(/TPS\s*\d[\d,]*\.\d/)
    await expect(bar).toContainText(/DPS\s*\d[\d,]*\.\d/)
    await bar.click()
    const sheet = page.getByRole('dialog', { name: 'Results' })
    await expect(sheet.getByRole('group', { name: 'TPS' })).toContainText(VALUE_WITH_CI)
    await expect(sheet.getByRole('region', { name: 'Damage taken per second' })).toContainText(VALUE_WITH_CI)
    const breakdown = sheet.getByRole('region', { name: 'Threat by ability' })
    await expect(breakdown.getByRole('listitem').filter({ hasText: /^Lacerate \(bleed\)/ })).toContainText(/\d+\.\d% uptime on the boss, \d\.\d stacks on average/)
    await noSideScroll(page)
  })
})
