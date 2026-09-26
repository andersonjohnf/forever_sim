import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// A priest's Power Infusion (buffs doc "Power Infusion"): a Buffs entry for the casters and the
// Protection paladin, off in every preset, cast on you once at the pull; not listed for a melee spec.

const SUMMARY = '+20% spell damage for 15 s, cast on you once by a priest'

async function switchSpec(page: Page, group: string, spec: RegExp, label: RegExp) {
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('group', { name: group }).getByRole('menuitem', { name: spec }).click()
  await expect(page.getByRole('button', { name: label })).toBeVisible()
}

test('a Protection paladin’s and a mage’s Buffs tab list it, off in every preset; turned on, the results say it’s cast once at the pull', async ({ page }) => {
  await page.goto('./')
  const buffs = page.getByRole('tabpanel', { name: 'Buffs' })

  for (const [group, spec, label] of [
    ['Paladin', /Protection/, /^Spec: Protection Paladin/],
    ['Mage', /^Fire/, /^Spec: Fire Mage/],
  ] as const) {
    await switchSpec(page, group, spec, label)
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const pi = buffs.getByRole('switch', { name: 'Power Infusion', exact: true })
    for (const preset of ['Self only', 'Dungeon group', 'Standard raid (default)', 'Max consumables']) {
      await buffs.getByRole('radio', { name: preset }).click()
      await expect(pi, `${label} ${preset}`).toHaveCount(1)
      await expect(pi, `${label} ${preset}`).not.toBeChecked()
    }
    await expect(pi).toBeEnabled()
    await expect(pi).toHaveAccessibleDescription(new RegExp(`^${SUMMARY.replace(/[+]/g, '\\+')}`))
  }

  // The Protection paladin, with it on: its results name the rule.
  await switchSpec(page, 'Paladin', /Protection/, /^Spec: Protection Paladin/)
  await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
  const pi = buffs.getByRole('switch', { name: 'Power Infusion', exact: true })
  await pi.click()
  await expect(pi).toBeChecked()
  const results = page.getByRole('complementary', { name: 'Results' })
  await results.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
  await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
  await expect(results.getByRole('alert')).toHaveCount(0)
  await results.getByRole('button', { name: /^Assumptions \(\d+\)$/ }).click()
  await expect(results.getByText(/A priest casts Power Infusion on you once, at the pull: \+20% spell damage from 0 to 15 s\./)).toBeVisible()
})

test('an Arcane mage’s comes as its Arcane Power ends, and the results say why', async ({ page }) => {
  await page.goto('./')
  await switchSpec(page, 'Mage', /^Arcane/, /^Spec: Arcane Mage/)
  await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
  const pi = page.getByRole('tabpanel', { name: 'Buffs' }).getByRole('switch', { name: 'Power Infusion', exact: true })
  await pi.click()
  await expect(pi).toBeChecked()
  const results = page.getByRole('complementary', { name: 'Results' })
  await results.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
  await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
  await expect(results.getByRole('alert')).toHaveCount(0)
  await results.getByRole('button', { name: /^Assumptions \(\d+\)$/ }).click()
  await expect(results.getByText(/A priest casts Power Infusion on you once, as your Arcane Power ends: \+20% spell damage for the 15 s after it\. The two don’t stack/)).toBeVisible()
})

test('a Fury warrior’s Buffs tab doesn’t list it', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('button', { name: /^Spec: Fury Warrior/ })).toBeVisible()
  await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
  const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
  await expect(buffs.getByRole('switch', { name: 'Battle Shout' })).toBeVisible()
  for (const preset of ['Self only', 'Standard raid (default)', 'Max consumables']) {
    await buffs.getByRole('radio', { name: preset }).click()
    await expect(buffs.getByRole('switch', { name: 'Power Infusion', exact: true }), preset).toHaveCount(0)
  }
})
