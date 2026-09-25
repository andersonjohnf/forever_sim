import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The Enhancement shaman (docs/classes/shaman.md), shipped in S1: the switcher, its Rotation, Talents
// and Buffs tabs, a run whose results say how its weapon imbue, Stormstrike, shocks and mana went, and
// a share link that brings it back, on a desktop and on a phone (docs/ux.md). Nothing on a shaman's
// screens may speak warrior, druid or paladin.

/**
 * Warrior, druid or paladin words a shaman screen must never show. "Rage of the Farseer" is the
 * shaman's own talent, Totem of Rage its relic, and Holy Strength the Crusader enchant's proc, so none counts.
 */
const OTHER_CLASS = /(?<!Totem of )\brage\b(?! of the Farseer)|\bstances?\b|Enrage|Energy|combo point|Cat Form|Bear Form|Seal of|Judgement|Consecration/i

/** A value with its ± 95% CI in the headline, e.g. "549.4± 1.4". */
const VALUE_WITH_CI = /\d[\d,]*\.\d\s*± \d[\d,]*\.\d/

const SPEC = /^Spec: Enhancement Shaman/

async function switchToShaman(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('menuitem', { name: /Enhancement/ }).click()
  await expect(page.getByRole('button', { name: SPEC })).toBeVisible()
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

async function noSideScroll(page: Page, what = 'no horizontal page scroll') {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, what).toBeLessThanOrEqual(0)
}

/** What the Rotation tab shows by default, at any width: the imbue and consumables above the priority list (D31). */
async function expectDefaultRotation(tab: Locator) {
  await expect(tab.getByText(/The defaults are the common priority\. There’s no totem twisting/)).toBeVisible()
  await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Cooldowns and buffs', 'Consumables', 'Priority list'])
  await expect(tab.getByRole('radio', { name: 'Windfury', exact: true })).toBeChecked()
  await expect(tab.getByRole('radio', { name: 'Rockbiter', exact: true })).not.toBeChecked()
  const list = tab.getByRole('list', { name: 'Priority list' })
  for (const name of ['Racial cooldown', 'Rage of the Farseer', 'On-use trinkets', 'Stormstrike', 'Lightning Bolt']) {
    await expect(list.getByRole('switch', { name, exact: true })).toBeChecked()
  }
  await expect(tab.getByRole('switch', { name: 'Major Mana Potion', exact: true })).toBeChecked()
  // Juju Flurry and the rune wait for the Buffs tab, which the Standard raid preset leaves off.
  await expect(tab.getByRole('switch', { name: 'Juju Flurry', exact: true })).toHaveAccessibleDescription(/Not used: turn on Juju Flurry in Buffs first/)
  await expect(tab.getByRole('switch', { name: 'Demonic Rune', exact: true })).toHaveAccessibleDescription(/Not used: turn on Demonic Rune in Buffs first/)
  // The rows say their thresholds: Lightning Bolt at 5 stacks, Earth Shock from 10% mana.
  await expect(list.locator('[data-apl-row="lightningBolt"]')).toContainText('At 5 stacks of Maelstrom Weapon')
  await expect(list.locator('[data-apl-row="shock"]')).toContainText('Earth Shock · from 10% mana')
  const consumables = tab.getByRole('region', { name: 'Consumables' })
  await consumables.getByRole('button', { name: /^Advanced settings for Consumables/ }).click()
  await expect(consumables.getByRole('textbox', { name: 'Major Mana Potion when missing', exact: true })).toHaveValue('2,250')
  await expect(tab).not.toContainText(OTHER_CLASS)
}

/** What an Enhancement run must show, in the desktop panel or the phone's sheet. */
async function expectShamanResult(results: Locator) {
  await expect(results.getByRole('group', { name: 'DPS' })).toContainText(VALUE_WITH_CI)
  const breakdown = results.getByRole('region', { name: 'Damage by ability' })
  for (const name of ['Main hand', 'Windfury Weapon', 'Stormstrike', 'Earth Shock', 'Lightning Bolt']) {
    await expect(breakdown.getByText(name, { exact: true })).toBeVisible()
  }
  // A two-hander: no off hand.
  await expect(breakdown.getByText('Off hand', { exact: true })).toHaveCount(0)
  // Mana per fight: the ledger, from the pull to the end, and no paladin lines.
  const mana = results.getByRole('region', { name: 'Mana per fight' })
  for (const label of ['At the pull', 'Regenerated', 'Major Mana Potion', 'Spent', 'Left at the end']) await expect(mana.getByText(label, { exact: true })).toBeVisible()
  await expect(mana).toContainText(/Spent\s*−[\d,]+/)
  await expect(mana.getByText('Sanctified Judgement')).toHaveCount(0)
  // Its cooldowns and procs.
  await openDetails(results, /^Cooldowns and buffs/)
  const cooldowns = results.getByRole('table')
  for (const name of ['Rage of the Farseer', 'Earthstrike', 'Major Mana Potion', 'Flurry', 'Maelstrom Weapon', 'Stormstrike']) {
    await expect(cooldowns.getByRole('rowheader', { name: new RegExp(`^${name}`) })).toBeVisible()
  }
  // The character sheet's spell stats and mana.
  await openDetails(results, /^Character sheet/)
  for (const label of ['Spell damage', 'Spell crit', 'Spell hit', 'Intellect', 'Spirit', 'Mana', 'Mana per 5 s']) {
    await expect(results.getByText(label, { exact: true })).toBeVisible()
  }
  // The assumptions: the shaman's own, and a rotation that waits for Maelstrom Weapon and mana.
  await openDetails(results, /^Assumptions \(\d+\)$/)
  await expect(results.getByRole('heading', { name: 'Shaman mechanics' })).toBeVisible()
  await expect(results.getByText(/^Maelstrom Weapon stacks on/)).toBeVisible()
  await expect(results.getByText(/^Your own totems \(Strength of Earth, Grace of Air, Mana Spring; see Buffs\)/)).toBeVisible()
  await expect(results.getByText(/a Maelstrom Weapon stack arrives or you have the mana, with no reaction time/)).toBeVisible()
  await expect(results).not.toContainText(OTHER_CLASS)
}

test.describe('Enhancement shaman', () => {
  test('is in the switcher under its class, with its default build in the Talents preset menu, and About names it', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: / }).click()
    await expect(page.getByRole('menuitem', { name: /Enhancement/ })).toContainText('DPS')
    // Its class's heading sits over it.
    await expect(page.getByRole('menu').getByText('Shaman', { exact: true })).toBeVisible()
    await page.getByRole('menuitem', { name: /Enhancement/ }).click()
    await expect(page.getByRole('button', { name: SPEC })).toBeVisible()

    // Its pre-raid gear: a stat an item takes away reads with a minus sign, never "+-".
    const gear = await openTab(page, 'Gear')
    await expect(gear.getByRole('button', { name: 'Head: Crown of Tyranny' })).toContainText('+20 Sta · −10 Spi')
    await expect(gear).not.toContainText('+-')

    const talents = await openTab(page, 'Talents')
    const presets = talents.getByRole('combobox', { name: 'Talent build presets' })
    await expect(presets).toHaveText('Enhancement (default)')
    await presets.click()
    await expect(page.getByRole('option', { name: 'Enhancement (default)' })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /About/ }).click()
    await expect(page.getByRole('dialog').getByText(/^Covers .+ · Shamans: Enhancement and Elemental · Rogues: .+\.$/)).toBeVisible()
  })

  test('its Rotation tab: the imbue and consumables above the common priority’s list, the rows’ thresholds in their summaries, and no other class’s words', async ({ page }) => {
    await switchToShaman(page)
    await expectDefaultRotation(await openTab(page, 'Rotation'))
  })

  test('its Buffs tab: its own totems without another shaman, Windfury Totem and the weapon stones locked off by the imbue', async ({ page }) => {
    await switchToShaman(page)
    const buffs = await openTab(page, 'Buffs')
    // No other shaman in the raid: you drop your own totems.
    const shaman = buffs.getByRole('button', { name: 'Shaman', exact: true })
    if ((await shaman.getAttribute('aria-pressed')) === 'true') await shaman.click()
    await expect(shaman).toHaveAttribute('aria-pressed', 'false')
    for (const name of ['Grace of Air Totem', 'Strength of Earth Totem', 'Mana Spring Totem']) {
      const totem = buffs.getByRole('switch', { name })
      await expect(totem).toBeChecked()
      await expect(totem).toBeEnabled()
      await expect(totem).not.toHaveAccessibleDescription(/Needs/)
    }
    // Windfury Weapon turns off Windfury Totem for you: off and locked, saying so.
    const windfuryTotem = buffs.getByRole('switch', { name: 'Windfury Totem' })
    await expect(windfuryTotem).not.toBeChecked()
    await expect(windfuryTotem).toBeDisabled()
    await expect(windfuryTotem).toHaveAccessibleDescription(/Not used: your Windfury Weapon \(see Rotation\) turns it off for you\./)
    // The imbue is the main hand's temporary enchant, so no stone goes on it.
    for (const name of ['Dense Sharpening Stone / Weightstone', 'Elemental Sharpening Stone']) {
      const stone = buffs.getByRole('switch', { name })
      await expect(stone).not.toBeChecked()
      await expect(stone).toBeDisabled()
      await expect(stone).toHaveAccessibleDescription(/Not used: your weapon imbue is your main hand’s temporary enchant\./)
    }
    // With Rockbiter, the totem is another shaman's to bring, off unless you turn it on.
    const rotation = await openTab(page, 'Rotation')
    await rotation.getByRole('radio', { name: 'Rockbiter', exact: true }).click()
    await openTab(page, 'Buffs')
    await expect(windfuryTotem).toBeDisabled()
    await expect(windfuryTotem).toHaveAccessibleDescription('Needs another shaman in the raid')
    await shaman.click()
    await expect(windfuryTotem).toBeEnabled()
    await expect(windfuryTotem).not.toBeChecked()
    await expect(windfuryTotem).not.toHaveAccessibleDescription(/Not used/)
    await windfuryTotem.click()
    await expect(windfuryTotem).toBeChecked()
    await expect(buffs).not.toContainText(OTHER_CLASS)
  })

  test('a run reads as a shaman’s: its imbue, Stormstrike, shocks, Lightning Bolt and mana', async ({ page }) => {
    await switchToShaman(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await simulate(results)
    await expectShamanResult(results)
  })

  test('a share link brings back the shaman with its rotation settings', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await switchToShaman(page)
    const tab = await openTab(page, 'Rotation')
    // The shock is the Shock row's setting, beside the list on a desktop.
    await tab.getByRole('button', { name: 'Shock', exact: true }).click()
    const shock = page.getByRole('complementary', { name: 'Shock settings' })
    await shock.getByRole('radio', { name: 'Frost Shock', exact: true }).click()
    await tab.getByRole('switch', { name: 'Rage of the Farseer', exact: true }).click()
    await expect(shock.getByRole('radio', { name: 'Frost Shock', exact: true })).toBeChecked()
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const url = await page.evaluate(() => navigator.clipboard.readText())
    expect(url).toContain('/#s=')

    // A fresh browser that has only ever seen the Fury warrior.
    const other = await (await context.browser()!.newContext()).newPage()
    await other.route('https://wow.zamimg.com/**', (route) => route.fulfill({ status: 204 }))
    await other.goto(url)
    await expect(other.getByText('Loaded a shared setup')).toBeVisible()
    await expect(other.getByRole('button', { name: SPEC })).toBeVisible()
    await other.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const shared = other.getByRole('tabpanel', { name: 'Rotation' })
    await expect(shared.locator('[data-apl-row="shock"]')).toContainText('Frost Shock · from 10% mana')
    await expect(shared.getByRole('switch', { name: 'Rage of the Farseer', exact: true })).not.toBeChecked()
    await expect(shared.getByRole('switch', { name: 'Stormstrike', exact: true })).toBeChecked()
    expect(new URL(other.url()).hash).toBe('')
    await other.context().close()
  })
})

test.describe('Enhancement shaman on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('switches to it, shows its Rotation tab without sideways scroll, and runs to a result in the sheet', async ({ page }) => {
    await switchToShaman(page)
    const tab = await openTab(page, 'Rotation')
    await noSideScroll(page)
    await expectDefaultRotation(tab)
    await noSideScroll(page, 'no horizontal page scroll with Advanced open')

    await simulate(page)
    const bar = page.getByRole('button', { name: 'Show results' })
    await expect(bar).toContainText(/DPS\s*\d[\d,]*\.\d/)
    await bar.click()
    const sheet = page.getByRole('dialog', { name: 'Results' })
    await expectShamanResult(sheet)
    await noSideScroll(page)
  })
})
