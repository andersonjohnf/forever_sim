import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// Retribution, the first paladin spec (track C, C2): switching to it, its Rotation, Fight and
// Buffs tabs, a run whose results say how its seals, judgements, Consecration and mana went, and a
// share link that brings it back. Nothing on a paladin's screens may speak warrior or druid.

/** Warrior or druid words a paladin screen must never show. */
const OTHER_CLASS = /\brage\b|\bstances?\b|Enrage|Energy|combo point|Cat Form|Bear Form/i

/** A value with its ± 95% CI in the headline, e.g. "607.5± 1.4". */
const VALUE_WITH_CI = /\d[\d,]*\.\d\s*± \d[\d,]*\.\d/

async function switchToRetribution(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: Fury Warrior/ }).click()
  await page.getByRole('menuitem', { name: /Retribution/ }).click()
  await expect(page.getByRole('button', { name: /^Spec: Retribution Paladin/ })).toBeVisible()
}

async function openTab(page: Page, name: string): Promise<Locator> {
  await page.getByRole('tab', { name, exact: true }).click()
  return page.getByRole('tabpanel', { name })
}

async function simulate(scope: Locator | Page) {
  await scope.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
  await expect(scope.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
}

/** Opens a collapsed results section ("Character sheet") if it isn't open. */
async function openDetails(scope: Locator, title: RegExp) {
  const trigger = scope.getByRole('button', { name: title })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
}

/** What a Retribution run must show, in the desktop panel or the phone's sheet. */
async function expectRetributionResult(results: Locator) {
  await expect(results.getByRole('group', { name: 'DPS' })).toContainText(VALUE_WITH_CI)
  const breakdown = results.getByRole('region', { name: 'Damage by ability' })
  for (const name of ['Seal of Command', 'Judgement of Command', 'Holy Strike', 'Consecration', 'Consecration (Rank 1)', 'Hammer of Wrath']) {
    await expect(breakdown.getByText(name, { exact: true })).toBeVisible()
  }
  // Mana per fight: the ledger, from the pull to the end.
  const mana = results.getByRole('region', { name: 'Mana per fight' })
  for (const label of ['At the pull', 'Regenerated', 'Restored', 'Spent', 'Left at the end']) await expect(mana.getByText(label, { exact: true })).toBeVisible()
  await expect(mana).toContainText(/Spent\s*−[\d,]+/)
  // The seals, Judgement of the Crusader and the potion under Cooldowns and buffs.
  await openDetails(results, /^Cooldowns and buffs/)
  const cooldowns = results.getByRole('table')
  for (const name of ['Seal of Command', 'Seal of the Crusader', 'Judgement of the Crusader', 'Major Mana Potion']) {
    await expect(cooldowns.getByRole('rowheader', { name: new RegExp(`^${name}`) })).toBeVisible()
  }
  // The character sheet's spell stats and mana.
  await openDetails(results, /^Character sheet/)
  for (const label of ['Holy spell damage', 'Spell crit', 'Spell hit', 'Intellect', 'Spirit', 'Mana', 'Mana per 5 s']) {
    await expect(results.getByText(label, { exact: true })).toBeVisible()
  }
  // The assumptions too: a paladin's rotation reacts to mana, not rage.
  await openDetails(results, /^Assumptions/)
  await expect(results.getByText(/you have the mana, with no reaction time/)).toBeVisible()
  await expect(results).not.toContainText(OTHER_CLASS)
}

test.describe('Retribution', () => {
  test('is in the spec switcher, with its default build in the Talents preset menu', async ({ page }) => {
    await switchToRetribution(page)
    const talents = await openTab(page, 'Talents')
    await expect(talents.getByRole('combobox', { name: 'Talent build presets' })).toContainText('Retribution (default)')
    await talents.getByRole('combobox', { name: 'Talent build presets' }).click()
    // Protection doesn't ship yet, so its build isn't offered (docs/ux.md "Talents").
    await expect(page.getByRole('option')).toHaveText(['Retribution (default)'])
    await page.keyboard.press('Escape')
    // About names the paladin.
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /About/ }).click()
    await expect(page.getByRole('dialog').getByText('Covers Warriors: Fury and Arms · Paladins: Retribution.')).toBeVisible()
  })

  test('its Rotation tab: tuned defaults under the usual headings, the rune waiting for Buffs, and no warrior words', async ({ page }) => {
    await switchToRetribution(page)
    const tab = await openTab(page, 'Rotation')
    await expect(tab.getByText('The defaults are tuned for the default setup.')).toBeVisible()
    for (const heading of ['Before the pull', 'Core abilities', 'Fillers', 'Execute phase', 'Consumables']) {
      await expect(tab.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    }
    for (const name of ['Judgement of the Crusader', 'Judgement', 'Holy Strike', 'Exorcism', 'Consecration', 'Consecration (Rank 1)', 'Hammer of Wrath', 'Major Mana Potion']) {
      await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
    }
    await expect(tab.getByRole('radio', { name: 'Command' })).toBeChecked()
    // The rune isn't in the Standard raid preset, so its row says so and links to Buffs.
    await expect(tab.getByText(/Not used: turn on Demonic Rune \/ Dark Rune in/)).toBeVisible()
    await expect(tab).not.toContainText(OTHER_CLASS)
  })

  test('its Fight and Buffs tabs: Hammer of Wrath’s execute phase, Exorcism’s creature types, and a paladin’s buffs', async ({ page }) => {
    await switchToRetribution(page)
    const fight = await openTab(page, 'Fight')
    await expect(fight.getByText(/The last 20% of the boss’s health, when Hammer of Wrath can be used\./)).toBeVisible()
    await fight.getByRole('button', { name: /^Advanced/ }).click()
    await expect(fight.getByText(/Exorcism can only be cast on Undead and Demons\./)).toBeVisible()
    // Nothing of a Retribution paladin's reacts to being hit.
    await expect(fight.getByRole('textbox', { name: 'Damage you take' })).toHaveCount(0)
    await expect(fight).not.toContainText(OTHER_CLASS)

    const buffs = await openTab(page, 'Buffs')
    for (const name of ['Blessing of Wisdom', 'Mana Spring Totem', 'Greater Arcane Elixir', 'Major Mana Potion']) await expect(buffs.getByRole('switch', { name })).toBeChecked()
    await expect(buffs.getByRole('switch', { name: 'Mighty Rage Potion' })).toHaveCount(0)
  })

  test('a run reads as a paladin’s: seals, judgements, Consecration, mana and the potion', async ({ page }) => {
    await switchToRetribution(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await simulate(results)
    await expectRetributionResult(results)
  })

  test('a share link brings back Retribution with its settings', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await switchToRetribution(page)
    const tab = await openTab(page, 'Rotation')
    await tab.getByRole('switch', { name: 'Consecration (Rank 1)', exact: true }).click()
    await expect(tab.getByRole('switch', { name: 'Consecration (Rank 1)', exact: true })).not.toBeChecked()
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const url = await page.evaluate(() => navigator.clipboard.readText())
    expect(url).toContain('/forever_sim/#s=')

    // A fresh browser that has only ever seen the Fury warrior.
    const other = await (await context.browser()!.newContext()).newPage()
    await other.route('https://wow.zamimg.com/**', (route) => route.fulfill({ status: 204 }))
    await other.goto(url)
    await expect(other.getByText('Loaded a shared setup')).toBeVisible()
    await expect(other.getByRole('button', { name: /^Spec: Retribution Paladin/ })).toBeVisible()
    await other.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const shared = other.getByRole('tabpanel', { name: 'Rotation' })
    await expect(shared.getByRole('switch', { name: 'Consecration (Rank 1)', exact: true })).not.toBeChecked()
    await expect(shared.getByRole('switch', { name: 'Consecration', exact: true })).toBeChecked()
    expect(new URL(other.url()).hash).toBe('')
    await other.context().close()
  })
})

test.describe('Retribution on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('switches to it, shows its Rotation tab without sideways scroll, and runs to a result in the sheet', async ({ page }) => {
    await switchToRetribution(page)
    const tab = await openTab(page, 'Rotation')
    await expect(tab.getByRole('switch', { name: 'Holy Strike', exact: true })).toBeChecked()
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(await overflow(), 'no horizontal page scroll').toBeLessThanOrEqual(0)

    await simulate(page)
    const bar = page.getByRole('button', { name: 'Show results' })
    await expect(bar).toContainText(/DPS\s*\d[\d,]*\.\d/)
    await bar.click()
    const sheet = page.getByRole('dialog', { name: 'Results' })
    await expectRetributionResult(sheet)
    expect(await overflow(), 'no horizontal page scroll').toBeLessThanOrEqual(0)
  })
})
