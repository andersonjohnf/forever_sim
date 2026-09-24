import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The Protection paladin, shipped in C3, as a visitor gets to it: from the spec switcher, its
// Rotation tab under both priorities (decision D26), the Buffs tab's Devotion Aura as yours or,
// with Max TPS, another paladin's, a run whose results read as a paladin tank's, and a share link
// that brings it back; on a desktop and on a phone. paladin-protection-rotation.spec.ts covers the
// Rotation tab's details from a share link.

/** Warrior or druid words a paladin screen must never show. */
const OTHER_CLASS = /\brage\b|\bstances?\b|Enrage|Energy|combo point|Cat Form|Bear Form/i

/** A value with its ± 95% CI in the headline, e.g. "425.1± 1.0". */
const VALUE_WITH_CI = /\d[\d,]*\.\d\s*± \d[\d,]*\.\d/

/** The Buffs tab's Devotion Aura: yours under tank duties, another paladin's under Max TPS. */
const YOURS = 'You keep it up yourself (see Rotation), so it isn’t added twice.'
const ANOTHER_PALADINS = 'You’re not keeping it up (see Rotation); turn this on if another paladin does.'

async function switchToProtection(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: Fury Warrior/ }).click()
  // Two classes have a Protection: the paladin's is under its own heading.
  await page.getByRole('group', { name: 'Paladin' }).getByRole('menuitem', { name: /Protection/ }).click()
  await expect(page.getByRole('button', { name: /^Spec: Protection Paladin/ })).toBeVisible()
}

async function openTab(page: Page, name: string): Promise<Locator> {
  await page.getByRole('tab', { name, exact: true }).click()
  return page.getByRole('tabpanel', { name })
}

async function simulate(scope: Locator | Page) {
  await scope.getByRole('button', { name: /^(Simulate|Run again)$/ }).first().click()
  await expect(scope.getByRole('button', { name: 'Run again' }).first()).toBeVisible({ timeout: 30_000 })
}

/** Opens a collapsed results section ("Character sheet") if it isn't open. */
async function openDetails(scope: Locator, title: RegExp) {
  const trigger = scope.getByRole('button', { name: title })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
}

/** The Rotation tab under tank duties, then under Max TPS, whose default drops Devotion Aura. */
async function expectBothPriorities(tab: Locator) {
  const priority = tab.getByRole('radiogroup', { name: 'Priority' })
  const devotion = tab.getByRole('switch', { name: 'Devotion Aura', exact: true })
  const holyShield = tab.getByRole('switch', { name: 'Holy Shield', exact: true })
  await expect(priority.getByRole('radio', { name: 'Tank duties first' })).toBeChecked()
  await expect(devotion).toBeChecked()
  await expect(holyShield).toBeChecked()
  await expect(tab).not.toContainText(OTHER_CLASS)

  await priority.getByRole('radio', { name: 'Max TPS' }).click()
  await expect(priority.getByRole('radio', { name: 'Max TPS' })).toBeChecked()
  // The duty's default follows the choice: off, not marked as changed, and it says so.
  await expect(devotion).not.toBeChecked()
  await expect(devotion).toHaveAccessibleDescription(/Off by default with Max TPS/)
  await expect(devotion).not.toHaveAccessibleDescription(/Changed/)
  // Holy Shield isn't a duty: it stays on for its threat.
  await expect(holyShield).toBeChecked()
  await expect(tab).not.toContainText(OTHER_CLASS)
}

/** What a Protection paladin's run must show, in the desktop panel or the phone's sheet. */
async function expectProtectionResult(results: Locator) {
  // The tank headline: TPS and DPS, each with its CI.
  await expect(results.getByRole('group', { name: 'TPS' })).toContainText(VALUE_WITH_CI)
  await expect(results.getByRole('group', { name: 'DPS' })).toContainText(VALUE_WITH_CI)
  const taken = results.getByRole('region', { name: 'Damage taken per second' })
  await expect(taken).toContainText(VALUE_WITH_CI)
  // A warrior tank's debuffs are never a paladin's own (D26).
  await expect(taken).toContainText('Debuffs on it, such as a warrior tank’s Demoralizing Shout and Thunder Clap (Buffs), lower its damage and slow its swings.')
  await expect(taken).not.toContainText('yours')
  const threat = results.getByRole('region', { name: 'Threat by ability' })
  for (const name of ['Holy Shield', 'Seal of Fury', 'Judgement of Fury', 'Consecration', 'Holy Strike']) {
    await expect(threat.getByText(name, { exact: true })).toBeVisible()
  }
  // Mana per fight: the ledger, with Improved Seal of Fury's and Shield Specialization's mana.
  const mana = results.getByRole('region', { name: 'Mana per fight' })
  for (const label of ['At the pull', 'Regenerated', 'Improved Seal of Fury', 'Shield Specialization', 'Major Mana Potion', 'Spent', 'Left at the end']) {
    await expect(mana.getByText(label, { exact: true })).toBeVisible()
  }
  await expect(mana).toContainText(/Spent\s*−[\d,]+/)
  // The boss's table against you, with Holy Shield up as the rotation keeps it.
  await openDetails(results, /^Character sheet/)
  const boss = results.getByRole('region', { name: 'Boss’s attack table' })
  await boss.scrollIntoViewIfNeeded()
  await expect(boss).toContainText(/Its chances on each swing at you with Holy Shield up, from the stats above and its 20\.0% more block\. Your rotation kept it up \d+\.\d% of the fight\./)
  for (const label of ['Miss', 'Dodge', 'Parry', 'Block', 'Crit', 'Crushing', 'Normal hit']) await expect(boss.getByText(label, { exact: true })).toBeVisible()
  await expect(results).not.toContainText(OTHER_CLASS)
}

test.describe('Protection paladin', () => {
  test('is in the spec switcher under Paladin, with its default build in the Talents preset menu and About naming it', async ({ page }) => {
    await switchToProtection(page)
    const talents = await openTab(page, 'Talents')
    const presets = talents.getByRole('combobox', { name: 'Talent build presets' })
    await expect(presets).toHaveText('Protection (default)')
    await expect(talents.getByText('2 / 42 / 7')).toBeVisible()
    await presets.click()
    // Only this spec's default is "(default)": Retribution's reads plainly (TU10).
    await expect(page.getByRole('option')).toHaveText(['Retribution default', 'Protection (default)'])
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /About/ }).click()
    await expect(page.getByRole('dialog').getByText('Covers Warriors: Fury, Arms and Protection · Druids: Feral (Cat) and Feral (Bear) · Paladins: Retribution and Protection · Shamans: Enhancement · Rogues: Combat, Assassination and Subtlety · Mages: Fire, Frost and Arcane.', { exact: true })).toBeVisible()
  })

  test('its Rotation tab under tank duties and under Max TPS', async ({ page }) => {
    await switchToProtection(page)
    await expectBothPriorities(await openTab(page, 'Rotation'))
  })

  test('its Buffs tab: Devotion Aura locked as yours, and under Max TPS yours to turn on for another paladin’s', async ({ page }) => {
    await switchToProtection(page)
    const buffs = await openTab(page, 'Buffs')
    const devotion = buffs.getByRole('switch', { name: 'Devotion Aura', exact: true })
    await expect(devotion).toBeChecked()
    await expect(devotion).toBeDisabled()
    await expect(devotion).toHaveAccessibleDescription(`+735 armor. ${YOURS}`)

    const rotation = await openTab(page, 'Rotation')
    await rotation.getByRole('radiogroup', { name: 'Priority' }).getByRole('radio', { name: 'Max TPS' }).click()
    const again = await openTab(page, 'Buffs')
    const buff = again.getByRole('switch', { name: 'Devotion Aura', exact: true })
    await expect(buff).not.toBeChecked()
    await expect(buff).toBeEnabled()
    await expect(buff).toHaveAccessibleDescription(`+735 armor. ${ANOTHER_PALADINS}`)
    await expect(again.getByText(ANOTHER_PALADINS)).toBeVisible()
  })

  test('a run reads as a paladin tank’s: TPS and DPS, damage taken, Holy Shield, mana and the boss’s table', async ({ page }) => {
    await switchToProtection(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await expect(results).toContainText('Simulate to see your TPS and DPS.')
    await simulate(results)
    await expectProtectionResult(results)
  })

  test('a share link brings back the Protection paladin with its priority', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await switchToProtection(page)
    const tab = await openTab(page, 'Rotation')
    await tab.getByRole('radiogroup', { name: 'Priority' }).getByRole('radio', { name: 'Max TPS' }).click()
    await tab.getByRole('radio', { name: 'Righteousness' }).click()
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const url = await page.evaluate(() => navigator.clipboard.readText())
    expect(url).toContain('/forever_sim/#s=')

    // A fresh browser that has only ever seen the Fury warrior.
    const other = await (await context.browser()!.newContext()).newPage()
    await other.route('https://wow.zamimg.com/**', (route) => route.fulfill({ status: 204 }))
    await other.goto(url)
    await expect(other.getByText('Loaded a shared setup')).toBeVisible()
    await expect(other.getByRole('button', { name: /^Spec: Protection Paladin/ })).toBeVisible()
    const shared = await openTab(other, 'Rotation')
    await expect(shared.getByRole('radiogroup', { name: 'Priority' }).getByRole('radio', { name: 'Max TPS' })).toBeChecked()
    await expect(shared.getByRole('radio', { name: 'Righteousness' })).toBeChecked()
    await expect(shared.getByRole('switch', { name: 'Devotion Aura', exact: true })).not.toBeChecked()
    const buffs = await openTab(other, 'Buffs')
    await expect(buffs.getByRole('switch', { name: 'Devotion Aura', exact: true })).toBeEnabled()
    expect(new URL(other.url()).hash).toBe('')
    await other.context().close()
  })
})

test.describe('Protection paladin on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

  test('switches to it, shows both priorities and its Buffs without sideways scroll, and runs to a result in the sheet', async ({ page }) => {
    await switchToProtection(page)
    const tab = await openTab(page, 'Rotation')
    expect(await overflow(page), 'no horizontal page scroll').toBeLessThanOrEqual(0)
    // Both priority buttons are full-size touch targets inside the screen.
    for (const name of ['Tank duties first', 'Max TPS']) {
      const box = (await tab.getByRole('radio', { name }).boundingBox())!
      expect(box.height, name).toBeGreaterThanOrEqual(44)
      expect(box.x + box.width, name).toBeLessThanOrEqual(390 - 16)
    }
    await expectBothPriorities(tab)
    expect(await overflow(page), 'no horizontal page scroll under Max TPS').toBeLessThanOrEqual(0)

    const buffs = await openTab(page, 'Buffs')
    await expect(buffs.getByRole('switch', { name: 'Devotion Aura', exact: true })).toHaveAccessibleDescription(`+735 armor. ${ANOTHER_PALADINS}`)
    await openTab(page, 'Rotation')
    await page.getByRole('radio', { name: 'Tank duties first' }).click()
    const locked = (await openTab(page, 'Buffs')).getByRole('switch', { name: 'Devotion Aura', exact: true })
    await expect(locked).toBeDisabled()
    await expect(locked).toHaveAccessibleDescription(`+735 armor. ${YOURS}`)
    expect(await overflow(page), 'no horizontal page scroll').toBeLessThanOrEqual(0)

    await simulate(page)
    const bar = page.getByRole('button', { name: 'Show results' })
    await expect(bar).toContainText(/TPS\s*\d[\d,]*\.\d/)
    await expect(bar).toContainText(/DPS\s*\d[\d,]*\.\d/)
    await bar.click()
    const sheet = page.getByRole('dialog', { name: 'Results' })
    await expectProtectionResult(sheet)
    expect(await overflow(page), 'no horizontal page scroll').toBeLessThanOrEqual(0)
  })
})
