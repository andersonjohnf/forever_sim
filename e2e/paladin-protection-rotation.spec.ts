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
    await expect(priority).toHaveAccessibleDescription(/^Tank duties first keeps your Devotion Aura up, for its 735 armor\. Max TPS runs Retribution Aura instead/)
    expect((await priority.boundingBox())!.y).toBeLessThan((await tab.getByRole('heading', { name: 'Cooldowns and buffs' }).boundingBox())!.y)
    await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Cooldowns and buffs', 'Core abilities', 'Fillers', 'Execute phase'])
    for (const name of ['Holy Shield', 'Devotion Aura', 'Judgement', 'Swift Judgement', 'Holy Strike', 'Consecration', 'Hammer of Wrath']) {
      await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
    }
    await expect(tab.getByRole('switch', { name: 'Consecration (Rank 1)', exact: true })).not.toBeChecked()

    // The Buffs tab's Devotion Aura is yours: on and locked.
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const devotion = page.getByRole('switch', { name: 'Devotion Aura', exact: true })
    await expect(devotion).toBeChecked()
    await expect(devotion).toBeDisabled()
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

    await page.getByRole('button', { name: /^(Simulate|Run again)$/ }).first().click()
    await expect(page.getByRole('button', { name: 'Run again' }).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Retribution Aura', { exact: true }).first()).toBeVisible()
  })
})
