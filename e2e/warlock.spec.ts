import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The Destruction and Affliction warlocks (docs/classes/warlock.md), shipped in K3: the switcher, their
// Rotation tabs (the common priority, Demonic Sacrifice, the filler and the Bane), a run whose results
// show the spells, DoTs and mana, the caster's sheet, and a share link, on a desktop and on a phone
// (docs/ux.md). Nothing on a warlock's screens may speak warrior, rogue or druid.

/** Words a warlock screen must never show. */
const OTHER_CLASS = /\brage\b|\bstances?\b|Energy|combo point|Cat Form|Bear Form|Seal of|Judgement|Glancing|Main hand swings/i

/** A value with its ± 95% CI in the headline, e.g. "397.8± 1.4". */
const VALUE_WITH_CI = /\d[\d,]*\.\d\s*± \d[\d,]*\.\d/

const DESTRUCTION = /^Spec: Destruction Warlock/
const AFFLICTION = /^Spec: Affliction Warlock/

async function switchTo(page: Page, spec: 'Destruction' | 'Affliction') {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('menuitem', { name: new RegExp(spec) }).click()
  await expect(page.getByRole('button', { name: spec === 'Destruction' ? DESTRUCTION : AFFLICTION })).toBeVisible()
}

async function openTab(page: Page, name: string): Promise<Locator> {
  await page.getByRole('tab', { name, exact: true }).click()
  return page.getByRole('tabpanel', { name })
}

async function openDetails(scope: Locator, title: RegExp) {
  const trigger = scope.getByRole('button', { name: title })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0)
}

/** What a Destruction run must show, in the desktop panel or the phone's sheet. */
async function expectDestructionResult(results: Locator) {
  await expect(results.getByRole('group', { name: 'DPS' })).toContainText(VALUE_WITH_CI)
  const breakdown = results.getByRole('region', { name: 'Damage by ability' })
  for (const name of ['Incinerate', 'Immolate', 'Immolate (DoT)', 'Conflagrate', 'Shadowburn']) {
    await expect(breakdown.getByText(name, { exact: true })).toBeVisible()
  }
  // A caster doesn't swing its weapon.
  await expect(breakdown.getByText('Main hand', { exact: true })).toHaveCount(0)
  const mana = results.getByRole('region', { name: 'Mana per fight' })
  for (const label of ['At the pull', 'Regenerated', 'Life Tap', 'Spent', 'Left at the end']) await expect(mana.getByText(label, { exact: true })).toBeVisible()
  await openDetails(results, /^Cooldowns and buffs/)
  const cooldowns = results.getByRole('table')
  for (const name of ['Demonic Sacrifice', 'Blood Fury', 'Curse of the Elements', 'Life Tap', 'Shadow and Flame']) {
    await expect(cooldowns.getByRole('rowheader', { name: new RegExp(`^${name}`) }).first()).toBeVisible()
  }
  await openDetails(results, /^Character sheet/)
  for (const label of ['Spell damage', 'Spell crit', 'Spell hit', 'Casting speed', 'Mana', 'Mana per 5 s']) {
    await expect(results.getByText(label, { exact: true })).toBeVisible()
  }
  await openDetails(results, /^Assumptions \(\d+\)$/)
  await expect(results.getByRole('heading', { name: 'Warlock mechanics' })).toBeVisible()
  await expect(results.getByText(/^Life Tap gives 424 mana plus your Spirit/)).toBeVisible()
  await expect(results.getByText(/^Conflagrate needs your Immolate/)).toBeVisible()
  await expect(results).not.toContainText(OTHER_CLASS)
}

test.describe('Destruction warlock', () => {
  test('is in the switcher under Warlock, with its build, an Orc and its gear, and About names it', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: / }).click()
    await expect(page.getByRole('group', { name: 'Warlock' }).getByRole('menuitem')).toHaveText([/^Destruction\s*DPS$/, /^Affliction\s*DPS$/])
    await page.getByRole('menuitem', { name: /Destruction/ }).click()
    await expect(page.getByRole('button', { name: DESTRUCTION })).toBeVisible()

    await openTab(page, 'Character')
    await expect(page.getByRole('radio', { name: /Orc/ })).toHaveAttribute('aria-checked', 'true')
    await openTab(page, 'Gear')
    await expect(page.getByRole('button', { name: /^Main hand: Blade of the New Moon$/ })).toBeVisible()
    const talents = await openTab(page, 'Talents')
    const presets = talents.getByRole('combobox', { name: 'Talent build presets' })
    await expect(presets).toHaveText('Destruction (default)')
    await expect(page.getByText('7 / 11 / 33')).toBeVisible()
    await presets.click()
    await expect(page.getByRole('option')).toHaveText(['Destruction (default)', 'Affliction default'])
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /About/ }).click()
    await expect(page.getByRole('dialog').getByText(/ · Warlocks: Destruction and Affliction\.$/)).toBeVisible()
  })

  test('its Rotation tab: the common priority, the Succubus, Incinerate and its own curse', async ({ page }) => {
    await switchTo(page, 'Destruction')
    const tab = await openTab(page, 'Rotation')
    await expect(tab.getByText(/The defaults are the common priority, with a first quick search/)).toBeVisible()
    await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Cooldowns and buffs', 'Core abilities', 'Fillers', 'Consumables'])
    await expect(tab.getByRole('radio', { name: 'Succubus', exact: true })).toBeChecked()
    await expect(tab.getByRole('radio', { name: 'Incinerate', exact: true })).toBeChecked()
    for (const name of ['Curse of the Elements', 'Immolate', 'Conflagrate', 'Shadowburn', 'Racial cooldown']) {
      await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
    }
    await expect(tab).not.toContainText(OTHER_CLASS)
    // Its own curse: the Buffs tab's is on and locked, kept up by the rotation.
    const buffs = await openTab(page, 'Buffs')
    await expect(buffs.getByRole('switch', { name: 'Curse of the Elements' })).toBeChecked()
    await expect(buffs.getByRole('switch', { name: 'Elixir of Shadow Power' })).toBeChecked()
  })

  test('simulates, and its results show its spells, mana, sheet and assumptions', { tag: '@smoke' }, async ({ page }) => {
    await switchTo(page, 'Destruction')
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate' }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await expectDestructionResult(results)
  })
})

test.describe('Affliction warlock', () => {
  test('its Rotation tab: Corruption, Bane of Doom and Siphon Life, and a run with its DoTs', async ({ page }) => {
    await switchTo(page, 'Affliction')
    const tab = await openTab(page, 'Rotation')
    await expect(tab.getByRole('radio', { name: 'Imp', exact: true })).toBeChecked()
    await expect(tab.getByRole('radio', { name: 'Doom', exact: true })).toBeChecked()
    for (const name of ['Curse of the Elements', 'Corruption', 'Siphon Life']) await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
    await expect(tab).not.toContainText(OTHER_CLASS)
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate' }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    const breakdown = results.getByRole('region', { name: 'Damage by ability' })
    for (const name of ['Shadow Bolt', 'Corruption', 'Bane of Doom', 'Siphon Life']) await expect(breakdown.getByText(name, { exact: true })).toBeVisible()
    await expect(results.getByRole('region', { name: 'Mana per fight' })).toBeVisible()
  })
})

test.describe('Warlock share link', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('carries the warlock, its race and rotation to a fresh page load', async ({ page }) => {
    await switchTo(page, 'Destruction')
    await openTab(page, 'Character')
    await page.getByRole('radio', { name: /Troll/ }).click()
    const rotation = await openTab(page, 'Rotation')
    await rotation.getByRole('radio', { name: 'Shadow Bolt', exact: true }).click()
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const link = await page.evaluate(() => navigator.clipboard.readText())
    await page.getByRole('button', { name: /^Spec: / }).click()
    await page.getByRole('menuitem', { name: /Fury/ }).click()

    await page.goto('about:blank')
    await page.goto(link)
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Loaded a shared setup' })).toBeVisible()
    await expect(page.getByRole('button', { name: DESTRUCTION })).toBeVisible()
    await openTab(page, 'Character')
    await expect(page.getByRole('radio', { name: /Troll/ })).toHaveAttribute('aria-checked', 'true')
    const back = await openTab(page, 'Rotation')
    await expect(back.getByRole('radio', { name: 'Shadow Bolt', exact: true })).toBeChecked()
  })
})

test.describe('Destruction warlock on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('switches, shows its Rotation tab, runs and shows its results, all without side scroll', async ({ page }) => {
    await switchTo(page, 'Destruction')
    const tab = await openTab(page, 'Rotation')
    await expect(tab.getByText(/the common priority/)).toBeVisible()
    await expect(tab.getByRole('radio', { name: 'Succubus', exact: true })).toBeVisible()
    await noSideScroll(page)
    await page.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Show results' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByRole('heading', { name: 'Results' })).toBeFocused()
    await expectDestructionResult(sheet)
    await noSideScroll(page)
  })
})
