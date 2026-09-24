import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The Combat rogue (docs/classes/rogue.md §3, §4, §6.1, §7), shipped in R1: the switcher, its tabs in
// its own terms (the common priority, poisons per hand), a run and its results, and a share link, on a
// desktop and on a phone (docs/ux.md).

const COMBAT = /^Spec: Combat Rogue/

async function switchToCombat(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('menuitem', { name: /Combat/ }).click()
  await expect(page.getByRole('button', { name: COMBAT })).toBeVisible()
}

const openTab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click()

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0)
}

test.describe('Combat rogue', () => {
  test('is in the switcher under Rogue, with its talent build, a Human and dual swords', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: / }).click()
    const combat = page.getByRole('menuitem', { name: /Combat/ })
    await expect(combat).toContainText('DPS')
    // Assassination and Subtlety wait for their rotations (docs/ux.md principle 8).
    await expect(page.getByRole('menuitem', { name: /Assassination|Subtlety/ })).toHaveCount(0)
    await combat.click()
    await expect(page.getByRole('button', { name: COMBAT })).toBeVisible()

    await openTab(page, 'Character')
    await expect(page.getByRole('radio', { name: /Human/ })).toHaveAttribute('aria-checked', 'true')
    await openTab(page, 'Gear')
    await expect(page.getByRole('button', { name: /^Main hand: Dal.Rend.s Sacred Charge$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Off hand: Dal.Rend.s Tribal Guardian$/ })).toBeVisible()

    await openTab(page, 'Talents')
    const presets = page.getByRole('combobox', { name: 'Talent build presets' })
    await expect(presets).toHaveText('Combat (default)')
    await expect(page.getByText('18 / 33 / 0')).toBeVisible()
    await presets.click()
    // The Combat build, and the others' only once their specs ship.
    await expect(page.getByRole('option')).toHaveText(['Combat (default)'])
    await page.keyboard.press('Escape')
    // About names the rogue, after the paladin.
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /About/ }).click()
    await expect(page.getByRole('dialog').getByText(/ · Rogues: Combat\.$/)).toBeVisible()
  })

  test('its Rotation tab says its defaults are the common priority', async ({ page }) => {
    await switchToCombat(page)
    await openTab(page, 'Rotation')
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    await expect(
      tab.getByText('Which abilities the sim uses, and when. The defaults are the common priority, with a first quick search; they aren’t tuned yet.', { exact: true }),
    ).toBeVisible()
    await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Cooldowns and buffs', 'Core abilities', 'Consumables'])
    for (const name of ['Blade Flurry', 'Adrenaline Rush', 'Slice and Dice', 'Eviscerate', 'Thistle Tea']) {
      await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
    }
    for (const name of ['Expose Armor', 'Rupture']) await expect(tab.getByRole('switch', { name, exact: true })).not.toBeChecked()
    await expect(tab.getByRole('switch', { name: 'Racial cooldown', exact: true })).toHaveAccessibleDescription(/Not used: Human has no racial cooldown that adds damage\./)
    const cooldowns = tab.getByRole('region', { name: 'Cooldowns and buffs' })
    await cooldowns.getByRole('button', { name: /^Advanced settings for Cooldowns and buffs/ }).click()
    await expect(cooldowns.getByRole('textbox', { name: 'Slice and Dice at', exact: true })).toHaveValue('2')
    await expect(cooldowns.getByRole('textbox', { name: 'Slice and Dice again with' })).toHaveValue('0.5')
    const core = tab.getByRole('region', { name: 'Core abilities' })
    await core.getByRole('button', { name: /^Advanced settings for Core abilities/ }).click()
    await expect(core.getByRole('textbox', { name: 'Eviscerate at', exact: true })).toHaveValue('5')
  })

  test('its Buffs tab offers a poison per hand, Deadly on the main hand and Instant on the off hand', async ({ page }) => {
    await switchToCombat(page)
    await openTab(page, 'Buffs')
    const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
    await expect(buffs.getByRole('switch', { name: 'Deadly Poison V (main hand)' })).toBeChecked()
    await expect(buffs.getByRole('switch', { name: 'Instant Poison VI (off hand)' })).toBeChecked()
    await expect(buffs.getByRole('switch', { name: 'Instant Poison VI (main hand)' })).not.toBeChecked()
    await expect(buffs.getByRole('switch', { name: 'Thistle Tea' })).toBeChecked()
    await openTab(page, 'Fight')
    const fight = page.getByRole('tabpanel', { name: 'Fight' })
    // Nothing of the rogue's reads the execute phase or reacts to being hit.
    await expect(fight.getByRole('switch', { name: 'Execute phase' })).toHaveCount(0)
    await fight.getByRole('button', { name: /^Advanced/ }).click()
    await expect(fight.getByRole('textbox', { name: 'Damage you take' })).toHaveCount(0)
  })

  test('simulates, and its results name its abilities, poisons, cooldowns and assumptions', { tag: '@smoke' }, async ({ page }) => {
    await switchToCombat(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate' }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await expect(results.getByText('DPS', { exact: true })).toBeVisible()
    const breakdown = results.getByRole('region', { name: 'Damage by ability' })
    for (const ability of ['Sinister Strike', 'Main hand', 'Off hand', 'Eviscerate', 'Deadly Poison', 'Instant Poison']) {
      await expect(breakdown.getByText(ability, { exact: true })).toBeVisible()
    }
    await expect(breakdown.getByRole('listitem').filter({ hasText: /^Deadly Poison/ })).toContainText(/applications avoided/)

    await results.getByRole('button', { name: 'Cooldowns and buffs' }).click()
    const table = results.getByRole('table')
    for (const name of ['Slice and Dice', 'Blade Flurry', 'Adrenaline Rush', 'Thistle Tea']) {
      await expect(table.getByRole('row', { name: new RegExp(`^${name} `) })).toBeVisible()
    }

    await results.getByRole('button', { name: /^Assumptions \(\d+\)$/ }).click()
    await expect(results.getByRole('heading', { name: 'Rogue mechanics' })).toBeVisible()
    await expect(results.getByText(/^Energy comes 20 every 2 s, as in Classic Era, and Adrenaline Rush doubles each tick/)).toBeVisible()
    await expect(results.getByText(/^Poisons roll spell hit/)).toBeVisible()
    await expect(results.getByText(/^The rogue’s 1 s global cooldown/)).toBeVisible()
    // Nothing of the warrior's or the druid's: rage, Execute, Clearcasting or Cat Form.
    await expect(results.getByText(/rage arrives|Execute|Clearcasting|Cat Form/)).toHaveCount(0)
  })
})

test.describe('Combat rogue share link', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('carries the rogue, its race, poisons and rotation to a fresh page load', async ({ page }) => {
    await switchToCombat(page)
    await openTab(page, 'Character')
    await page.getByRole('radio', { name: /Orc/ }).click()
    await openTab(page, 'Rotation')
    await page.getByRole('switch', { name: 'Rupture', exact: true }).click()
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const link = await page.evaluate(() => navigator.clipboard.readText())
    // Change it after copying, and go back to Fury: the link brings the copied rogue back.
    await page.getByRole('switch', { name: 'Rupture', exact: true }).click()
    await page.getByRole('button', { name: /^Spec: / }).click()
    await page.getByRole('menuitem', { name: /Fury/ }).click()

    await page.goto('about:blank')
    await page.goto(link)
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Loaded a shared setup' })).toBeVisible()
    await expect(page.getByRole('button', { name: COMBAT })).toBeVisible()
    await openTab(page, 'Character')
    await expect(page.getByRole('radio', { name: /Orc/ })).toHaveAttribute('aria-checked', 'true')
    await openTab(page, 'Rotation')
    const rupture = page.getByRole('switch', { name: 'Rupture', exact: true })
    await expect(rupture).toBeChecked()
    await expect(rupture).toHaveAccessibleDescription(/Changed\. Default: off/)
    // An Orc has Blood Fury, so the racial setting is in use.
    await expect(page.getByRole('switch', { name: 'Racial cooldown', exact: true })).not.toHaveAccessibleDescription(/Not used/)
  })
})

test.describe('Combat rogue on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('switches, shows its Rotation tab, runs and shows its results, all without side scroll', async ({ page }) => {
    await switchToCombat(page)
    await openTab(page, 'Talents')
    await expect(page.getByRole('radio', { name: /^Combat 33$/ })).toBeVisible()
    await noSideScroll(page)
    await openTab(page, 'Rotation')
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    await expect(tab.getByText(/the common priority/)).toBeVisible()
    await expect(tab.getByRole('switch', { name: 'Slice and Dice', exact: true })).toBeVisible()
    await noSideScroll(page)

    await page.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Show results' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByRole('heading', { name: 'Results' })).toBeFocused()
    const breakdown = sheet.getByRole('region', { name: 'Damage by ability' })
    for (const ability of ['Sinister Strike', 'Eviscerate', 'Deadly Poison']) await expect(breakdown.getByText(ability, { exact: true })).toBeVisible()
    await noSideScroll(page)
  })
})
