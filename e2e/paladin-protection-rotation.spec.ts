import { deflateRawSync } from 'node:zlib'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The Protection paladin's Rotation tab (docs/ux.md "Rotation"; docs/classes/paladin.md "Protection:
// model and rotation"): its priority choice first, "Tank duties first" by default or "Max TPS"
// (decision D26), which turns its duty, Devotion Aura, off for Retribution Aura; the Buffs tab's
// Devotion Aura as yours or, with Max TPS, off for another paladin's; and a run with each. The spec
// isn't offered yet, so these tests preview it (src/app/preview-specs.ts) from a share link.
const PROTECTION = `./?preview=paladin-protection#s=${deflateRawSync(JSON.stringify({ version: 1, spec: 'paladin-protection' })).toString('base64url')}`

async function openRotation(page: Page) {
  await page.goto(PROTECTION)
  await expect(page.getByText('Loaded a shared setup')).toBeVisible()
  await expect(page.getByRole('button', { name: /Spec: Protection Paladin/ })).toBeVisible()
  await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
  return page.getByRole('tabpanel', { name: 'Rotation' })
}

test.describe('Protection paladin rotation', () => {
  test('puts the priority first, tank duties by default with Devotion Aura up, and its headings under it', async ({ page }) => {
    const tab = await openRotation(page)
    await expect(tab.getByText('Which abilities the sim uses, and when. The defaults are tuned for the default setup.', { exact: true })).toBeVisible()
    const priority = tab.getByRole('radiogroup', { name: 'Priority' })
    await expect(priority.getByRole('radio', { name: 'Tank duties first' })).toBeChecked()
    await expect(priority.getByRole('radio', { name: 'Max TPS' })).not.toBeChecked()
    await expect(priority).toHaveAccessibleDescription(/^Tank duties first keeps your Devotion Aura up, \+735 armor, so you take less damage\. Max TPS runs Retribution Aura instead for threat/)
    expect((await priority.boundingBox())!.y).toBeLessThan((await tab.getByRole('heading', { name: 'Cooldowns and buffs' }).boundingBox())!.y)
    await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Cooldowns and buffs', 'Core abilities', 'Fillers', 'Execute phase', 'Consumables'])
    for (const name of ['Holy Shield', 'Devotion Aura', 'On-use trinkets', 'Judgement', 'Swift Judgement', 'Holy Strike', 'Consecration', 'Hammer of Wrath', 'Major Mana Potion']) {
      await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
    }
    await expect(tab.getByRole('switch', { name: 'Consecration (Rank 1)', exact: true })).not.toBeChecked()

    // Righteous Fury is always on: a row with no switch, first under Cooldowns and buffs.
    const buffs = tab.getByRole('region', { name: 'Cooldowns and buffs' })
    await expect(buffs.getByRole('listitem').first()).toContainText(/^Righteous Fury.*×1\.9 threat from your Holy damage.*Always on$/)
    await expect(buffs.getByRole('switch', { name: 'Righteous Fury' })).toHaveCount(0)
    // Exorcism against a boss that isn't Undead or a Demon: dimmed, and it says why.
    const exorcism = tab.getByRole('switch', { name: 'Exorcism', exact: true })
    await expect(exorcism).toHaveAccessibleDescription(/Not used: set Creature type to Undead or Demon in Fight/)
    await expect(tab.locator('[data-inactive]').filter({ has: page.getByRole('switch', { name: 'Exorcism', exact: true }) })).toHaveCount(1)
    // Mana thresholds read "% mana".
    const fillers = tab.getByRole('region', { name: 'Fillers' })
    await fillers.getByRole('button', { name: /^Advanced settings for Fillers/ }).click()
    await expect(fillers.getByText('% mana').first()).toBeVisible()

    // The Buffs tab's Devotion Aura is yours: on and locked.
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const devotion = page.getByRole('switch', { name: 'Devotion Aura', exact: true })
    await expect(devotion).toBeChecked()
    await expect(devotion).toBeDisabled()
    await expect(devotion).toHaveAccessibleDescription(/You keep it up yourself \(see Rotation\), so it isn’t added twice\./)
    // A warrior tank's Thunder Clap isn't in a paladin tank's raid (D26); you can add it.
    await expect(page.getByRole('switch', { name: 'Thunder Clap', exact: true })).not.toBeChecked()
  })

  test('Max TPS turns Devotion Aura off for Retribution Aura, leaves the Buffs tab’s off, and a run shows its damage', async ({ page }) => {
    const tab = await openRotation(page)
    const priority = tab.getByRole('radiogroup', { name: 'Priority' })
    await priority.getByRole('radio', { name: 'Max TPS' }).click()
    await expect(priority.getByRole('radio', { name: 'Max TPS' })).toBeChecked()
    const devotion = tab.getByRole('switch', { name: 'Devotion Aura', exact: true })
    // Its default follows the choice: off, and not marked as changed.
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

  test('with tank duties again, a Devotion Aura you turned on in Buffs leaves the preset as it was', async ({ page }) => {
    const tab = await openRotation(page)
    const priority = tab.getByRole('radiogroup', { name: 'Priority' })
    await priority.getByRole('radio', { name: 'Max TPS' }).click()
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const preset = page.getByRole('radiogroup', { name: 'Preset' })
    await expect(preset.getByRole('radio', { name: /^Standard raid/ })).toBeChecked()
    // Another paladin's Devotion Aura: a choice of your own, so the preset no longer matches.
    await page.getByRole('switch', { name: 'Devotion Aura', exact: true }).click()
    await expect(page.getByText('Custom selection.')).toBeVisible()
    // Back to tank duties: it's yours again, on whatever the preset says, so the preset matches.
    await page.getByRole('tab', { name: 'Rotation', exact: true }).click()
    await priority.getByRole('radio', { name: 'Tank duties first' }).click()
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    await expect(preset.getByRole('radio', { name: /^Standard raid/ })).toBeChecked()
    await expect(page.getByText('Custom selection.')).toHaveCount(0)
  })

  test('a run shows Righteous Fury up all fight, Holy Shield’s blocks, the mana rows’ mana, and the boss’s table with Holy Shield up', async ({ page }) => {
    await openRotation(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    const breakdown = results.getByRole('region', { name: 'Threat by ability' })
    const row = (name: string) => breakdown.getByRole('listitem').filter({ hasText: new RegExp(`^${name}\\d`) })
    await expect(row('Holy Shield')).toContainText(/\d+\.\d blocks a fight$/)
    await expect(row('Holy Shield')).not.toContainText('crit')
    await expect(row('Reckoning')).toContainText(/\d+\.\d extra attacks a fight · \d+\.\d% crit/)
    await expect(row('Improved Seal of Fury')).toContainText(/from [\d,]+ mana a fight$/)
    await expect(row('Shield Specialization')).toContainText(/from [\d,]+ mana a fight$/)

    await results.getByRole('button', { name: 'Cooldowns and buffs' }).click()
    const table = results.getByRole('table')
    await expect(table.getByRole('row', { name: /^Righteous Fury 100\.0% 1\.0$/ })).toBeVisible()
    await expect(table.getByRole('row', { name: /^Swift Judgement none \d+\.\d$/ })).toBeVisible()
    await expect(table.getByRole('row', { name: /^Iron Creed \d+\.\d% none$/ })).toBeVisible()

    // The mana ledger and the sheet's spell rows, as Retribution's (QU6).
    const ledger = results.getByRole('region', { name: 'Mana per fight' })
    for (const line of ['At the pull', 'Regenerated', 'Improved Seal of Fury', 'Shield Specialization', 'Major Mana Potion', 'Spent', 'Left at the end']) {
      await expect(ledger.getByText(line, { exact: true })).toBeVisible()
    }

    await results.getByRole('button', { name: 'Character sheet' }).click()
    for (const row of ['Spell damage', 'Spell crit', 'Spell hit', 'Mana', 'Mana per 5 s']) {
      await expect(results.getByText(row, { exact: true })).toBeVisible()
    }
    const boss = results.getByRole('region', { name: 'Boss’s attack table' })
    await expect(boss).toContainText(/Its chances on each swing at you with Holy Shield up, from the stats above and its 20\.0% more block\. Your rotation kept it up \d+\.\d% of the fight\./)
    await expect(boss).not.toContainText('a little')
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
