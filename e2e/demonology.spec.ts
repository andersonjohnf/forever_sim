import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The Demonology warlock (docs/classes/warlock.md §11), shipped in H3: the switcher and its Talents
// preset, its Rotation tab (the demon kept out beside the sacrificed one), a run whose results show its
// demon's rows by name, its passives and its assumptions, a share link, and the phone at 390 px
// (docs/ux.md). Nothing on its screens may speak warrior, rogue or druid.

/**
 * Words a warlock screen must never show. The paladin's seals by name, as the Destruction warlock's check
 * has them: Demonology's default trinket, Royal Seal of Eldre'Thalas, is named in its assumptions.
 */
const OTHER_CLASS = /\brage\b|\bstances?\b|Energy|combo point|Cat Form|Bear Form|Seal of (the )?(Righteousness|Command|Crusader|Light|Wisdom|Justice)|Judgement|Main hand swings/i

/** A value with its ± 95% CI in the headline, e.g. "492.8± 1.4". */
const VALUE_WITH_CI = /\d[\d,]*\.\d\s*± \d[\d,]*\.\d/

const DEMONOLOGY = /^Spec: Demonology Warlock/

async function switchToDemonology(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('menuitem', { name: /Demonology/ }).click()
  await expect(page.getByRole('button', { name: DEMONOLOGY })).toBeVisible()
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

const choice = (tab: Locator, setting: string, value: string) => tab.getByRole('radiogroup', { name: setting, exact: true }).getByRole('radio', { name: value, exact: true })

/** What a default Demonology run must show, in the desktop panel or the phone's sheet. */
async function expectDemonologyResult(results: Locator) {
  await expect(results.getByRole('group', { name: 'DPS' })).toContainText(VALUE_WITH_CI)
  const breakdown = results.getByRole('region', { name: 'Damage by ability' })
  for (const name of ['Shadow Bolt', 'Corruption', 'Bane of Doom', 'Immolate', 'Soul Fire']) await expect(breakdown.getByText(name, { exact: true })).toBeVisible()
  // Its demon's rows name it (docs/mechanics/ranged-and-pets.md §10): the default Imp's Firebolt.
  await expect(breakdown.getByText('Firebolt · Imp', { exact: true })).toBeVisible()
  await expect(breakdown.getByText(/· Succubus$/)).toHaveCount(0)
  await openDetails(results, /^Cooldowns and buffs/)
  const cooldowns = results.getByRole('table')
  for (const name of ['Demonic Sacrifice', 'Soul Link', 'Master Demonologist', 'Demonic Knowledge', 'Life Tap']) {
    await expect(cooldowns.getByRole('rowheader', { name: new RegExp(`^${name}`) }).first()).toBeVisible()
  }
  await openDetails(results, /^Assumptions \(\d+\)$/)
  await expect(results.getByRole('heading', { name: 'Warlock mechanics' })).toBeVisible()
  await expect(results.getByText(/^Your demon’s stats are placeholders/)).toBeVisible()
  await expect(results.getByText(/^Your demon is out from the pull and never dies/)).toBeVisible()
  await expect(results).not.toContainText('You fight with no demon')
  await expect(results).not.toContainText(OTHER_CLASS)
}

test.describe('Demonology warlock', () => {
  test('is in the switcher under Warlock, with its build preset, and About names it', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: / }).click()
    await expect(page.getByRole('group', { name: 'Warlock' }).getByRole('menuitem')).toHaveText([/^Destruction\s*DPS$/, /^Affliction\s*DPS$/, /^Demonology\s*DPS$/])
    await page.getByRole('menuitem', { name: /Demonology/ }).click()
    await expect(page.getByRole('button', { name: DEMONOLOGY })).toBeVisible()
    const talents = await openTab(page, 'Talents')
    await expect(talents.getByRole('combobox', { name: 'Talent build presets' })).toHaveText('Demonology (default)')
    await expect(page.getByText('0 / 31 / 20')).toBeVisible()
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /About/ }).click()
    await expect(page.getByRole('dialog').getByText(/ · Warlocks: Destruction, Affliction and Demonology( · .+)?\.$/)).toBeVisible()
  })

  test('its Rotation tab: the Imp kept out, the Succubus sacrificed, and why a sacrifice can do nothing', async ({ page }) => {
    await switchToDemonology(page)
    const tab = await openTab(page, 'Rotation')
    await expect(tab.getByText(/The defaults are the common priority, with a first quick search/)).toBeVisible()
    // The demons and the consumables above its priority list (D31, warlock.md §6.4).
    await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Before the pull', 'Consumables', 'Priority list'])
    await expect(choice(tab, 'Demonic Sacrifice', 'Succubus')).toBeChecked()
    await expect(choice(tab, 'Demon', 'Imp')).toBeChecked()
    const list = tab.getByRole('list', { name: 'Priority list' })
    await expect(list.locator('[data-apl-row="bane"]')).toContainText('Doom')
    for (const name of ['Curse of the Elements', 'Immolate', 'Corruption', 'Racial cooldown', 'Soul Fire']) await expect(list.getByRole('switch', { name, exact: true })).toBeChecked()
    await expect(tab).not.toContainText(OTHER_CLASS)
    // With the Imp out, the boss's armor debuffs meet nothing of yours: locked off, saying why.
    let buffs = await openTab(page, 'Buffs')
    await expect(buffs.getByRole('switch', { name: 'Curse of the Elements' })).toBeChecked()
    const sunder = buffs.getByRole('switch', { name: /^Sunder Armor/ })
    await expect(sunder).toBeDisabled()
    await expect(sunder).not.toBeChecked()
    await expect(buffs.getByText(/Not used: only your demon’s swings meet the boss’s armor, and your Imp \(see Rotation\) doesn’t swing\.$/).first()).toBeVisible()
    // And Gift of Arthas' +8, the same way (G5U-3).
    await expect(buffs.getByRole('switch', { name: 'Gift of Arthas' })).toBeDisabled()
    await expect(buffs.getByText('Not used: only your demon’s swings take the +8, and your Imp (see Rotation) doesn’t swing.')).toBeVisible()
    // Summoning the demon you sacrificed cancels its buff.
    const rotation = await openTab(page, 'Rotation')
    await choice(rotation, 'Demon', 'Succubus').click()
    await expect(rotation.getByText('Not used: summoning the demon you sacrificed cancels its buff.')).toBeVisible()
    // With the Succubus out, the Buffs tab keeps them for its swings (ranged-and-pets.md §8).
    buffs = await openTab(page, 'Buffs')
    await expect(buffs.getByRole('switch', { name: /^Sunder Armor/ })).toBeChecked()
    await expect(buffs).not.toContainText('Not used: only your demon’s swings')
    // With no demon out, they're locked off again, saying so.
    const none = await openTab(page, 'Rotation')
    await choice(none, 'Demon', 'None').click()
    buffs = await openTab(page, 'Buffs')
    const sunderNone = buffs.getByRole('switch', { name: /^Sunder Armor/ })
    await expect(sunderNone).toBeDisabled()
    await expect(sunderNone).not.toBeChecked()
    await expect(buffs.getByText(/Not used: only your demon’s swings meet the boss’s armor, and you keep no demon out \(see Rotation\)\.$/).first()).toBeVisible()
    await expect(buffs.getByText('Not used: only your demon’s swings take the +8, and you keep no demon out (see Rotation).')).toBeVisible()
  })

  test('simulates, and its results show the demon’s rows, its passives and its assumptions', { tag: '@smoke' }, async ({ page }) => {
    await switchToDemonology(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate' }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await expectDemonologyResult(results)
  })

  test('with the Succubus out, its swings and Lash of Pain are on their own rows', async ({ page }) => {
    await switchToDemonology(page)
    const tab = await openTab(page, 'Rotation')
    await choice(tab, 'Demonic Sacrifice', 'Imp').click()
    await choice(tab, 'Demon', 'Succubus').click()
    const results = page.getByRole('complementary', { name: 'Results' })
    await results.getByRole('button', { name: 'Simulate' }).click()
    await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    const breakdown = results.getByRole('region', { name: 'Damage by ability' })
    await expect(breakdown.getByText('Auto attack · Succubus', { exact: true })).toBeVisible()
    await expect(breakdown.getByText('Lash of Pain · Succubus', { exact: true })).toBeVisible()
    await expect(breakdown.getByText(/· Imp$/)).toHaveCount(0)
  })
})

test.describe('Demonology share link', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('carries the demon and the sacrifice to a fresh page load', async ({ page }) => {
    await switchToDemonology(page)
    const rotation = await openTab(page, 'Rotation')
    await choice(rotation, 'Demonic Sacrifice', 'Imp').click()
    await choice(rotation, 'Demon', 'Succubus').click()
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const link = await page.evaluate(() => navigator.clipboard.readText())
    await page.getByRole('button', { name: /^Spec: / }).click()
    await page.getByRole('menuitem', { name: /Fury/ }).click()

    await page.goto('about:blank')
    await page.goto(link)
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Loaded a shared setup' })).toBeVisible()
    await expect(page.getByRole('button', { name: DEMONOLOGY })).toBeVisible()
    const back = await openTab(page, 'Rotation')
    await expect(choice(back, 'Demon', 'Succubus')).toBeChecked()
    await expect(choice(back, 'Demonic Sacrifice', 'Imp')).toBeChecked()
  })
})

test.describe('Demonology warlock on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('switches, shows its Rotation tab, runs and shows its demon’s rows, all without side scroll', async ({ page }) => {
    await switchToDemonology(page)
    const tab = await openTab(page, 'Rotation')
    await expect(tab.getByText(/the common priority/)).toBeVisible()
    await expect(choice(tab, 'Demon', 'Succubus')).toBeVisible()
    await noSideScroll(page)
    await page.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Show results' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByRole('heading', { name: 'Results' })).toBeFocused()
    await expectDemonologyResult(sheet)
    await noSideScroll(page)
  })
})
