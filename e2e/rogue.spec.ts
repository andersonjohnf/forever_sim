import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The three rogues (docs/classes/rogue.md §3, §4, §6, §7), shipped in R1: the switcher, their tabs in
// their own terms (the common priority, poisons per hand, Mutilate and Venom, Subtlety's builder), a
// run and its results, and a share link, on a desktop and on a phone (docs/ux.md).

const COMBAT = /^Spec: Combat Rogue/
const ASSASSINATION = /^Spec: Assassination Rogue/
const SUBTLETY = /^Spec: Subtlety Rogue/
const BUTTON = { Combat: COMBAT, Assassination: ASSASSINATION, Subtlety: SUBTLETY }

async function switchTo(page: Page, spec: 'Combat' | 'Assassination' | 'Subtlety') {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('menuitem', { name: new RegExp(spec) }).click()
  await expect(page.getByRole('button', { name: BUTTON[spec] })).toBeVisible()
}
const switchToCombat = (page: Page) => switchTo(page, 'Combat')

const openTab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click()

/** Subtlety's builder choice, in the priority list's Builder row settings beside the list (a desktop's). */
async function builderChoice(page: Page) {
  await page.getByRole('list', { name: 'Priority list' }).getByRole('button', { name: 'Builder', exact: true }).click()
  return page.getByRole('complementary', { name: 'Builder settings' }).getByRole('radiogroup', { name: 'Builder' })
}

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
    await expect(page.getByRole('menuitem', { name: /Assassination/ })).toContainText('DPS')
    await expect(page.getByRole('menuitem', { name: /Subtlety/ })).toContainText('DPS')
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
    // Every rogue build; only this spec's reads "(default)".
    await expect(page.getByRole('option')).toHaveText(['Combat (default)', 'Assassination default', 'Subtlety default'])
    await page.keyboard.press('Escape')
    // About names the rogue, after the shaman (and before the mage, since K2).
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /About/ }).click()
    await expect(page.getByRole('dialog').getByText(/ · Rogues: Combat, Assassination and Subtlety( · .+)?\.$/)).toBeVisible()
  })

  test('its Rotation tab says its defaults are the common priority', async ({ page }) => {
    await switchToCombat(page)
    await openTab(page, 'Rotation')
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    await expect(
      tab.getByText('Which abilities the sim uses, and when. The defaults are the common priority, with a first quick search; they aren’t tuned yet.', { exact: true }),
    ).toBeVisible()
    // The priority list (D31, rogue-priority-list.spec.ts), with the consumables above it.
    await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Consumables', 'Priority list'])
    for (const name of ['Blade Flurry', 'Adrenaline Rush', 'Slice and Dice', 'Eviscerate', 'Thistle Tea']) {
      await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
    }
    for (const name of ['Expose Armor', 'Rupture']) await expect(tab.getByRole('switch', { name, exact: true })).not.toBeChecked()
    await expect(tab.getByRole('switch', { name: 'Racial cooldown', exact: true })).toHaveAccessibleDescription(/Not used: Human has no racial cooldown that adds damage\./)
    await expect(tab.locator('[data-apl-row="sliceAndDice"]')).toContainText('From 2 combo points · again with 0.5 s left')
    await expect(tab.locator('[data-apl-row="eviscerate"]')).toContainText('From 5 combo points')
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
    await expect(breakdown.getByRole('listitem').filter({ hasText: /^Deadly Poison/ })).toContainText(/\d+\.\d procs a fight · .*\d+\.\d% avoided · [\d,]+ avg tick/)

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
    // Its row on the priority list is marked changed.
    await expect(rupture).toHaveAccessibleDescription(/^Changed\. From 5 combo points/)
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

test.describe('Assassination rogue', () => {
  test('has daggers, Mutilate as its builder and Venom off by default, with the common priority', async ({ page }) => {
    await switchTo(page, 'Assassination')
    await openTab(page, 'Gear')
    await expect(page.getByRole('button', { name: /^Main hand: Felstriker$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Off hand: Alcor.s Sunrazor$/ })).toBeVisible()
    await openTab(page, 'Talents')
    await expect(page.getByRole('combobox', { name: 'Talent build presets' })).toHaveText('Assassination (default)')
    await openTab(page, 'Rotation')
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    await expect(tab.getByText(/The defaults are the common priority, with a first quick search/)).toBeVisible()
    for (const name of ['Slice and Dice', 'Cold Blood', 'Eviscerate', 'Thistle Tea']) {
      await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
    }
    // The priority list (D31, rogue-priority-list.spec.ts): Mutilate is the builder row's setting.
    await expect(tab.locator('[data-apl-row="builder"]')).toContainText('Mutilate with a dagger in each hand, else Sinister Strike')
    await expect(tab.locator('[data-apl-row="eviscerate"]')).toContainText('From 4 combo points')
    await expect(tab.getByRole('switch', { name: 'Venom', exact: true })).not.toBeChecked()
    await tab.getByRole('button', { name: 'Venom', exact: true }).click()
    await expect(page.getByRole('complementary', { name: 'Venom settings' }).getByText(/Off by default: its combo points do more in Eviscerate\./)).toBeVisible()
  })

  test('simulates, and its results show Mutilate’s two strikes and its assumptions', async ({ page }) => {
    await switchTo(page, 'Assassination')
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate' }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    const breakdown = results.getByRole('region', { name: 'Damage by ability' })
    for (const ability of ['Mutilate', 'Mutilate (off hand)', 'Eviscerate', 'Deadly Poison', 'Instant Poison']) {
      await expect(breakdown.getByText(ability, { exact: true })).toBeVisible()
    }
    await expect(breakdown.getByText('Sinister Strike', { exact: true })).toHaveCount(0)
    await results.getByRole('button', { name: /^Assumptions \(\d+\)$/ }).click()
    await expect(results.getByText(/^Mutilate’s off-hand strike deals off-hand damage/)).toBeVisible()
    await expect(results.getByText(/Raging Blows/)).toHaveCount(0)
  })
})

test.describe('Assassination rogue share link', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('carries Venom’s setting to a fresh page load', async ({ page }) => {
    await switchTo(page, 'Assassination')
    await openTab(page, 'Rotation')
    await page.getByRole('switch', { name: 'Venom', exact: true }).click()
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const link = await page.evaluate(() => navigator.clipboard.readText())
    await page.getByRole('switch', { name: 'Venom', exact: true }).click()
    await page.goto('about:blank')
    await page.goto(link)
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Loaded a shared setup' })).toBeVisible()
    await expect(page.getByRole('button', { name: ASSASSINATION })).toBeVisible()
    await openTab(page, 'Rotation')
    const venom = page.getByRole('switch', { name: 'Venom', exact: true })
    await expect(venom).toBeChecked()
    // Its row on the priority list is marked changed.
    await expect(venom).toHaveAccessibleDescription(/^Changed\. From 3 combo points/)
  })
})

test.describe('Assassination rogue on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('shows its Rotation tab, runs and shows its results, all without side scroll', async ({ page }) => {
    await switchTo(page, 'Assassination')
    await openTab(page, 'Rotation')
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    await expect(tab.locator('[data-apl-row="builder"]')).toContainText('Mutilate')
    await noSideScroll(page)
    await page.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Show results' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByRole('heading', { name: 'Results' })).toBeFocused()
    await expect(sheet.getByRole('region', { name: 'Damage by ability' }).getByText('Mutilate', { exact: true })).toBeVisible()
    await noSideScroll(page)
  })
})

test.describe('Subtlety rogue', () => {
  test('has daggers, its build, Hemorrhage as its builder and Ghostly Strike off, with the common priority', async ({ page }) => {
    await switchTo(page, 'Subtlety')
    await openTab(page, 'Gear')
    await expect(page.getByRole('button', { name: /^Main hand: .+/ })).toBeVisible()
    await openTab(page, 'Talents')
    await expect(page.getByRole('combobox', { name: 'Talent build presets' })).toHaveText('Subtlety (default)')
    await expect(page.getByText('15 / 0 / 36')).toBeVisible()
    await openTab(page, 'Rotation')
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    await expect(tab.getByText(/The defaults are the common priority, with a first quick search/)).toBeVisible()
    // The priority list (D31, rogue-priority-list.spec.ts), with the consumables above it.
    await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Consumables', 'Priority list'])
    for (const name of ['Premeditation', 'Slice and Dice', 'Rupture', 'Eviscerate', 'Hemorrhage on a bleeding boss', 'Ambush', 'Thistle Tea']) {
      await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
    }
    await expect(tab.getByRole('switch', { name: 'Ghostly Strike', exact: true })).not.toBeChecked()
    await tab.getByRole('button', { name: 'Ghostly Strike', exact: true }).click()
    await expect(page.getByRole('complementary', { name: 'Ghostly Strike settings' }).getByText(/Off by default: its Energy does as much in Hemorrhage\./)).toBeVisible()
    await expect(tab.locator('[data-apl-row="builder"]')).toContainText('Hemorrhage')
    const builder = await builderChoice(page)
    await expect(builder.getByRole('radio', { name: 'Hemorrhage' })).toBeChecked()
    await expect(builder.getByRole('radio', { name: 'Backstab' })).not.toBeChecked()
    // With Hemorrhage building, Ambush and the debuff line can't do anything, and say so.
    await expect(tab.getByRole('switch', { name: 'Ambush', exact: true })).toHaveAccessibleDescription(/Not used: only Backstab opens Cutthroat’s Ambush/)
    await expect(tab.getByRole('switch', { name: 'Hemorrhage on a bleeding boss', exact: true })).toHaveAccessibleDescription(/Not used: Hemorrhage is your builder/)
    await builder.getByRole('radio', { name: 'Backstab' }).click()
    await expect(tab.getByRole('switch', { name: 'Ambush', exact: true })).not.toHaveAccessibleDescription(/Not used/)
    await builder.getByRole('radio', { name: 'Hemorrhage' }).click()
    await expect(tab.locator('[data-apl-row="rupture"]')).toContainText('From 3 combo points')
    await expect(tab.locator('[data-apl-row="eviscerate"]')).toContainText('From 5 combo points')
  })

  test('simulates, and its results show Hemorrhage, Rupture and its talents’ assumptions', async ({ page }) => {
    await switchTo(page, 'Subtlety')
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate' }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    const breakdown = results.getByRole('region', { name: 'Damage by ability' })
    for (const ability of ['Hemorrhage', 'Rupture', 'Eviscerate', 'Deadly Poison', 'Instant Poison']) {
      await expect(breakdown.getByText(ability, { exact: true })).toBeVisible()
    }
    await expect(breakdown.getByText('Backstab', { exact: true })).toHaveCount(0)
    await results.getByRole('button', { name: 'Cooldowns and buffs' }).click()
    const table = results.getByRole('table')
    for (const name of ['Slice and Dice', 'Hemorrhage', 'Thousand Cuts']) await expect(table.getByRole('row', { name: new RegExp(`^${name} `) })).toBeVisible()
    await results.getByRole('button', { name: /^Assumptions \(\d+\)$/ }).click()
    await expect(results.getByText(/^Hemorrhage’s \+15% counts on each Rupture tick/)).toBeVisible()
    await expect(results.getByText(/^Quietus’s bonus starts when the boss reaches 35% health/)).toBeVisible()
    await expect(results.getByText(/^Thousand Cuts gains a stack from every Rupture tick/)).toBeVisible()
  })

  test('with Backstab building, it Backstabs and Ambushes in Cutthroat’s window', async ({ page }) => {
    await switchTo(page, 'Subtlety')
    await openTab(page, 'Rotation')
    await (await builderChoice(page)).getByRole('radio', { name: 'Backstab' }).click()
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate' }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    const breakdown = results.getByRole('region', { name: 'Damage by ability' })
    for (const ability of ['Backstab', 'Ambush', 'Hemorrhage', 'Rupture']) await expect(breakdown.getByText(ability, { exact: true })).toBeVisible()
    await results.getByRole('button', { name: /^Assumptions \(\d+\)$/ }).click()
    await expect(results.getByText(/^Cutthroat’s chance rolls on each Backstab that lands/)).toBeVisible()
  })
})

test.describe('Subtlety rogue share link', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('carries its builder to a fresh page load', async ({ page }) => {
    await switchTo(page, 'Subtlety')
    await openTab(page, 'Rotation')
    const builder = await builderChoice(page)
    await builder.getByRole('radio', { name: 'Backstab' }).click()
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const link = await page.evaluate(() => navigator.clipboard.readText())
    await builder.getByRole('radio', { name: 'Hemorrhage' }).click()
    await page.goto('about:blank')
    await page.goto(link)
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Loaded a shared setup' })).toBeVisible()
    await expect(page.getByRole('button', { name: SUBTLETY })).toBeVisible()
    await openTab(page, 'Rotation')
    await expect((await builderChoice(page)).getByRole('radio', { name: 'Backstab' })).toBeChecked()
  })
})

test.describe('Subtlety rogue on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('switches, shows its Rotation tab, runs and shows its results, all without side scroll', async ({ page }) => {
    await switchTo(page, 'Subtlety')
    await openTab(page, 'Rotation')
    const tab = page.getByRole('tabpanel', { name: 'Rotation' })
    await expect(tab.locator('[data-apl-row="builder"]')).toContainText('Hemorrhage')
    await expect(tab.getByRole('switch', { name: 'Premeditation', exact: true })).toBeVisible()
    await noSideScroll(page)
    await page.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Show results' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByRole('heading', { name: 'Results' })).toBeFocused()
    await expect(sheet.getByRole('region', { name: 'Damage by ability' }).getByText('Hemorrhage', { exact: true })).toBeVisible()
    await noSideScroll(page)
  })
})
