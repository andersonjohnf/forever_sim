import { deflateRawSync } from 'node:zlib'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The Protection paladin's Rotation tab (docs/ux.md "Rotation"; docs/classes/paladin.md "Protection:
// model and rotation"): its priority list (decision D31), with D28's three rotations as presets
// first on the tab, Balanced by default, Defensive (D26's "Tank duties first") and Max TPS, which
// turns its duty, Devotion Aura, off for Retribution Aura; editing the list makes it Custom; the
// Buffs tab's Devotion Aura as yours or, with Max TPS, off for another paladin's; and a run with
// each. These tests load it from a plain share link (paladin-protection.spec.ts gets there from the
// switcher).
const link = (config: object) => `./#s=${deflateRawSync(JSON.stringify({ version: 1, spec: 'paladin-protection', ...config })).toString('base64url')}`
const PROTECTION = link({})

const DEFAULT_ORDER = [
  'prepull',
  'seal',
  'holyShield',
  'judgement',
  'swiftJudgement',
  'hammerOfTheRighteous',
  'holyStrike',
  'exorcism',
  'consecration',
  'consecrationRank1',
  'hammerOfWrath',
]
const BALANCED_LINE = 'Plays as Defensive: Devotion Aura, Holy Shield and Holy Strike kept. Hammer of the Righteous is a row you can turn on.'

async function openRotation(page: Page, url = PROTECTION) {
  await page.goto(url)
  await expect(page.getByText('Loaded a shared setup')).toBeVisible()
  await expect(page.getByRole('button', { name: /Spec: Protection Paladin/ })).toBeVisible()
  await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
  return page.getByRole('tabpanel', { name: 'Rotation' })
}
const preset = (page: Page) => page.getByRole('combobox', { name: 'Rotation preset' })
const pick = async (page: Page, name: string) => {
  await preset(page).click()
  await page.getByRole('option', { name: new RegExp(`^${name}( \\(default\\))?$`) }).click()
}
const list = (tab: Locator) => tab.getByRole('list', { name: 'Priority list' })
const row = (tab: Locator, id: string) => tab.locator(`[data-apl-row="${id}"]`)
/** The rows' ids in the list's order. */
const order = (page: Page) => page.locator('[data-apl-row]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-apl-row')))
/** A row's settings in the desktop panel. */
const openRow = async (page: Page, tab: Locator, name: string) => {
  await list(tab).getByRole('button', { name, exact: true }).click()
  return page.getByRole('complementary', { name: `${name} settings` })
}

test.describe('Protection paladin rotation', () => {
  test('puts the preset first, Balanced by default, and the list in paladin.md’s order', async ({ page }) => {
    const tab = await openRotation(page)
    await expect(tab.getByText('Which abilities the sim uses, and when. Defensive and Max TPS are tuned for the default setup; Balanced, the default, plays as Defensive.', { exact: true })).toBeVisible()
    await expect(preset(page)).toHaveText('Balanced (default)')
    await expect(preset(page)).toHaveAccessibleDescription(BALANCED_LINE)
    // The info says why Balanced keeps Holy Strike (D28), with each preset's numbers.
    await tab.getByRole('button', { name: 'About the presets' }).click()
    const info = page.getByRole('dialog', { name: 'The presets' })
    await expect(info).toContainText('Holy Strike too, since Iron Creed’s 10% lower damage taken is active mitigation')
    await expect(info).toContainText('3% more TPS and 3% more DPS than Defensive, for 6% more damage taken')
    await page.keyboard.press('Escape')
    await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Preset', 'Cooldowns and buffs', 'Consumables', 'Priority list'])
    // The preset comes before everything else on the tab, as a tank's priority choice always did.
    expect((await preset(page).boundingBox())!.y).toBeLessThan((await tab.getByRole('heading', { name: 'Cooldowns and buffs' }).boundingBox())!.y)
    await preset(page).click()
    await expect(page.getByRole('option')).toHaveText(['Defensive', 'Balanced (default)', 'Max TPS'])
    await page.keyboard.press('Escape')

    expect(await order(page)).toEqual(DEFAULT_ORDER)
    await expect(row(tab, 'prepull')).toContainText('Devotion Aura · Righteous Fury · Judgement of the Crusader at the pull')
    await expect(row(tab, 'prepull').getByText('Fixed in place:')).toHaveCount(1)
    await expect(row(tab, 'seal')).toContainText('Seal of Fury · again with 2.5 s left')
    for (const name of ['Holy Shield', 'Judgement', 'Swift Judgement', 'Holy Strike', 'Consecration', 'Consecration (Rank 1)', 'Hammer of Wrath']) {
      await expect(list(tab).getByRole('switch', { name, exact: true })).toBeChecked()
    }
    await expect(tab.getByRole('switch', { name: 'On-use trinkets', exact: true })).toBeChecked()
    await expect(tab.getByRole('switch', { name: 'Major Mana Potion', exact: true })).toBeChecked()
    // Balanced keeps Holy Strike (D28); Hammer of the Righteous is off just above it. Turned on, it takes
    // Holy Strike's place with the default axe, and Holy Strike's row says so; moved below it, it says why it isn't used.
    const hammer = list(tab).getByRole('switch', { name: 'Hammer of the Righteous', exact: true })
    await expect(hammer).not.toBeChecked()
    await expect(row(tab, 'holyStrike')).toContainText('On cooldown')
    await hammer.click()
    await expect(row(tab, 'hammerOfTheRighteous')).toContainText('On cooldown, in Holy Strike’s place')
    await expect(row(tab, 'holyStrike')).toContainText('Not used: Hammer of the Righteous, above it, takes its place (they share a cooldown).')
    await expect(row(tab, 'holyStrike')).toHaveAttribute('data-inactive')
    await expect(preset(page)).toHaveText('Custom')
    const hammerRow = await openRow(page, tab, 'Hammer of the Righteous')
    await hammerRow.getByRole('button', { name: 'Move down', exact: true }).click()
    await expect(row(tab, 'hammerOfTheRighteous')).toContainText(
      'Not used: Holy Strike, above it, takes its place (they share a cooldown). Move it above Holy Strike to use it instead.',
    )
    await expect(row(tab, 'holyStrike')).toContainText('On cooldown')
    await pick(page, 'Balanced')
    await expect(hammer).not.toBeChecked()
    expect(await order(page)).toEqual(DEFAULT_ORDER)
    await expect(row(tab, 'consecration')).toContainText('Rank 5 · from 20% mana')

    // Righteous Fury is always on: a row with no switch, first under Cooldowns and buffs.
    const buffs = tab.getByRole('region', { name: 'Cooldowns and buffs' })
    await expect(buffs.getByRole('listitem').first()).toContainText(/^Righteous Fury.*×1\.9 threat from your Holy damage.*Always on$/)
    await expect(buffs.getByRole('switch', { name: 'Righteous Fury' })).toHaveCount(0)
    // Exorcism against a boss that isn't Undead or a Demon: dimmed, and it says why.
    await expect(row(tab, 'exorcism')).toContainText('Not used: needs another creature type (Fight tab).')
    await expect(row(tab, 'exorcism')).toHaveAttribute('data-inactive')

    // The pre-pull's settings: Devotion Aura, the duty, and the opener; mana thresholds read "% mana".
    const prepull = await openRow(page, tab, 'Before the pull')
    await expect(prepull.getByRole('switch', { name: 'Devotion Aura', exact: true })).toBeChecked()
    await expect(prepull.getByRole('switch', { name: 'Judgement of the Crusader', exact: true })).toBeChecked()
    await expect(prepull.getByRole('button', { name: /^Move (up|down)$/ })).toHaveCount(0)
    const consecration = await openRow(page, tab, 'Consecration')
    await expect(consecration.getByText('% mana').first()).toBeVisible()

    // The Buffs tab's Devotion Aura is yours: on and locked.
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const devotion = page.getByRole('switch', { name: 'Devotion Aura', exact: true })
    await expect(devotion).toBeChecked()
    await expect(devotion).toBeDisabled()
    await expect(devotion).toHaveAccessibleDescription(/You keep it up yourself \(see Rotation\), so it isn’t added twice\./)
    // A warrior tank's Thunder Clap isn't in a paladin tank's raid (D26); you can add it.
    await expect(page.getByRole('switch', { name: 'Thunder Clap', exact: true })).not.toBeChecked()
  })

  test('Defensive plays Holy Strike; Max TPS turns Devotion Aura off for Retribution Aura, and the Buffs tab’s is then another paladin’s', async ({ page }) => {
    const tab = await openRotation(page)
    await pick(page, 'Defensive')
    await expect(preset(page)).toHaveText('Defensive')
    await expect(preset(page)).toHaveAccessibleDescription('Devotion Aura, Holy Shield and Holy Strike’s Iron Creed kept: the most survival. Tuned on threat.')
    await expect(page.locator('[data-announcer]')).toHaveText('Rotation set to Defensive.')
    await expect(list(tab).getByRole('switch', { name: 'Hammer of the Righteous', exact: true })).not.toBeChecked()
    await expect(row(tab, 'holyStrike')).toContainText('On cooldown')
    // A preset moves defaults: nothing is marked changed.
    await expect(list(tab).getByRole('button', { name: 'Hammer of the Righteous', exact: true })).not.toHaveAccessibleDescription(/Changed/)

    await pick(page, 'Max TPS')
    await expect(preset(page)).toHaveText('Max TPS')
    await expect(preset(page)).toHaveAccessibleDescription('Retribution Aura instead of Devotion Aura, for threat: +3% TPS and 6% more damage taken than Defensive.')
    await expect(row(tab, 'prepull')).toContainText('Retribution Aura · Righteous Fury')
    const prepull = await openRow(page, tab, 'Before the pull')
    const devotion = prepull.getByRole('switch', { name: 'Devotion Aura', exact: true })
    // Its default follows the preset: off, and not marked as changed.
    await expect(devotion).not.toBeChecked()
    await expect(devotion).not.toHaveAccessibleDescription(/Changed/)
    await expect(devotion).toHaveAccessibleDescription(/Off by default with Max TPS/)

    // The Buffs tab's Devotion Aura is now off, and yours to turn on for another paladin's.
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const buff = page.getByRole('switch', { name: 'Devotion Aura', exact: true })
    await expect(buff).not.toBeChecked()
    await expect(buff).toBeEnabled()
    await expect(buff).toHaveAccessibleDescription(/You’re not keeping it up \(see Rotation\); turn this on if another paladin does\./)

    await page.getByRole('button', { name: /^(Simulate|Run again)$/ }).first().click()
    await expect(page.getByRole('button', { name: 'Run again' }).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Retribution Aura', { exact: true }).first()).toBeVisible()
  })

  test('editing the list after picking a preset makes it Custom, and picking one again puts it back', async ({ page }) => {
    const tab = await openRotation(page)
    await pick(page, 'Defensive')
    await list(tab).getByRole('switch', { name: 'Consecration (Rank 1)', exact: true }).click()
    await expect(preset(page)).toHaveText('Custom')
    await expect(preset(page)).toHaveAccessibleDescription('Custom: you’ve changed the list from every preset. Pick one to start again from it.')
    await pick(page, 'Defensive')
    await expect(list(tab).getByRole('switch', { name: 'Consecration (Rank 1)', exact: true })).toBeChecked()
    // Moving a row makes it Custom too; Reset order hands focus to the list's first row.
    const holyShield = await openRow(page, tab, 'Holy Shield')
    await holyShield.getByRole('button', { name: 'Move down', exact: true }).click()
    await expect(preset(page)).toHaveText('Custom')
    await page.getByRole('button', { name: 'Reset order' }).click()
    await expect(preset(page)).toHaveText('Defensive')
    await expect(list(tab).getByRole('button', { name: 'Before the pull', exact: true })).toBeFocused()
    // Reset rotation: Balanced again, with focus on the preset.
    await page.getByRole('button', { name: 'Reset rotation' }).click()
    await expect(preset(page)).toHaveText('Balanced (default)')
    await expect(preset(page)).toBeFocused()
  })

  test('a setup saved with D26’s rotations loads them by their new names (D28)', async ({ page }) => {
    await openRotation(page, link({ rotation: { 'paladin.protection.priority': 'duties' } }))
    await expect(preset(page)).toHaveText('Defensive')
    await openRotation(page, link({ rotation: { 'paladin.protection.priority': 'maxTps' } }))
    await expect(preset(page)).toHaveText('Max TPS')
  })

  test('with Defensive again, a Devotion Aura you turned on in Buffs leaves the Buffs preset as it was', async ({ page }) => {
    await openRotation(page)
    await pick(page, 'Max TPS')
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const buffPreset = page.getByRole('radiogroup', { name: 'Preset' })
    await expect(buffPreset.getByRole('radio', { name: /^Standard raid/ })).toBeChecked()
    // Another paladin's Devotion Aura: a choice of your own, so the preset no longer matches.
    await page.getByRole('switch', { name: 'Devotion Aura', exact: true }).click()
    await expect(page.getByText('Custom selection.')).toBeVisible()
    // Back to Defensive: it's yours again, on whatever the preset says, so the preset matches.
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    await pick(page, 'Defensive')
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    await expect(buffPreset.getByRole('radio', { name: /^Standard raid/ })).toBeChecked()
    await expect(page.getByText('Custom selection.')).toHaveCount(0)
  })

  test('a Balanced run shows Holy Strike and not Hammer of the Righteous, Righteous Fury up all fight, Holy Shield’s blocks, the mana rows’ mana, and the boss’s table with Holy Shield up', async ({ page }) => {
    await openRotation(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    const breakdown = results.getByRole('region', { name: 'Threat by ability' })
    const line = (name: string) => breakdown.getByRole('listitem').filter({ hasText: new RegExp(`^${name}\\d`) })
    await expect(line('Hammer of the Righteous')).toHaveCount(0)
    await expect(line('Holy Strike')).toHaveCount(1)
    await expect(line('Holy Shield')).toContainText(/\d+\.\d blocks a fight$/)
    await expect(line('Holy Shield')).not.toContainText('crit')
    await expect(line('Reckoning')).toContainText(/\d+\.\d extra attacks a fight · \d+\.\d% crit/)
    await expect(line('Improved Seal of Fury')).toContainText(/from [\d,]+ mana a fight$/)
    await expect(line('Shield Specialization')).toContainText(/from [\d,]+ mana a fight$/)

    await results.getByRole('button', { name: 'Cooldowns and buffs' }).click()
    const table = results.getByRole('table')
    await expect(table.getByRole('row', { name: /^Righteous Fury 100\.0% 1\.0$/ })).toBeVisible()
    await expect(table.getByRole('row', { name: /^Swift Judgement none \d+\.\d$/ })).toBeVisible()

    // The mana ledger and the sheet's spell rows, as Retribution's (QU6).
    const ledger = results.getByRole('region', { name: 'Mana per fight' })
    for (const label of ['At the pull', 'Regenerated', 'Improved Seal of Fury', 'Shield Specialization', 'Major Mana Potion', 'Spent', 'Left at the end']) {
      await expect(ledger.getByText(label, { exact: true })).toBeVisible()
    }

    await results.getByRole('button', { name: 'Character sheet' }).click()
    for (const label of ['Spell damage', 'Spell crit', 'Spell hit', 'Mana', 'Mana per 5 s']) {
      await expect(results.getByText(label, { exact: true })).toBeVisible()
    }
    const boss = results.getByRole('region', { name: 'Boss’s attack table' })
    await expect(boss).toContainText(/Its chances on each swing at you with Holy Shield up, from the stats above and its 20\.0% more block\. Your rotation kept it up \d+\.\d% of the fight\./)
    await expect(boss).not.toContainText('a little')
  })

  test('a Defensive run shows Iron Creed from Holy Strike', async ({ page }) => {
    await openRotation(page)
    await pick(page, 'Defensive')
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await results.getByRole('button', { name: 'Cooldowns and buffs' }).click()
    await expect(results.getByRole('table').getByRole('row', { name: /^Iron Creed \d+\.\d% none$/ })).toBeVisible()
  })
})

test.describe('another tank’s Buffs tab (D26)', () => {
  test('a paladin tank’s raid leaves out a warrior tank’s Thunder Clap, and says whose duty it is', async ({ page }) => {
    await page.goto(PROTECTION)
    await expect(page.getByText('Loaded a shared setup')).toBeVisible()
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    await expect(page.getByRole('radiogroup', { name: 'Preset' }).getByRole('radio', { name: /^Standard raid/ })).toBeChecked()
    for (const name of ['Thunder Clap', 'Demoralizing Shout']) {
      const buff = page.getByRole('switch', { name, exact: true })
      await expect(buff).not.toBeChecked()
      await expect(buff).toBeEnabled()
      await expect(buff).toHaveAccessibleDescription(/\. A warrior tank’s duty, so presets leave it out; turn this on if one keeps it up\.$/)
    }
  })
})
