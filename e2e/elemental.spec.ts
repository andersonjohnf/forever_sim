import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The Elemental shaman (docs/classes/shaman.md#elemental), shipped in K5: the switcher, its Rotation,
// Talents and Buffs tabs, a run whose results say how its spells and mana went, and a share link that
// brings it back, on a desktop and on a phone (docs/ux.md). It casts from range: nothing on its
// screens may speak of swings, and no other class's words.

/** Words an Elemental screen must never show: another class's, or a melee spec's swings (its Royal Seal of Eldre'Thalas trinket isn't a paladin's seal). */
const OTHER_CLASS = /\brage\b|\bstances?\b|Enrage|Energy|combo point|Cat Form|Bear Form|(?<!Royal )Seal of|Judgement|Consecration|Stormstrike|Maelstrom|Windfury Weapon/i

/** A value with its ± 95% CI in the headline, e.g. "336.0± 0.8". */
const VALUE_WITH_CI = /\d[\d,]*\.\d\s*± \d[\d,]*\.\d/

const SPEC = /^Spec: Elemental Shaman/

async function switchToElemental(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('menuitem', { name: /Elemental/ }).click()
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

/** What the Rotation tab shows by default, at any width: the consumables above the priority list (D31). */
async function expectDefaultRotation(tab: Locator) {
  await expect(tab.getByText(/The defaults are the common priority, with a first quick search; they aren’t tuned yet\. Flame Shock is there for Lava Burst/)).toBeVisible()
  await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Consumables', 'Priority list'])
  const list = tab.getByRole('list', { name: 'Priority list' })
  for (const name of ['Racial cooldown', 'On-use trinkets', 'Mana Tide Totem', 'Flame Shock', 'Lava Burst']) {
    await expect(list.getByRole('switch', { name, exact: true })).toBeChecked()
  }
  await expect(list.getByRole('switch', { name: 'Earth Shock', exact: true })).not.toBeChecked()
  await expect(tab.getByRole('switch', { name: 'Major Mana Potion', exact: true })).toBeChecked()
  // The rows say their settings; Lightning Bolt, the filler, is a row without a switch.
  const row = (id: string) => list.locator(`[data-apl-row="${id}"]`)
  await expect(row('manaTide')).toContainText('When missing 3,000 mana')
  await expect(row('chainLightning')).toContainText('With Clearcasting')
  await expect(row('lightningBolt')).toContainText('Rank 10 · rank 4 below 10% mana')
  await expect(row('lightningBolt').getByRole('switch')).toHaveCount(0)
  // Power Infusion and the rune wait for the Buffs tab, which the Standard raid preset leaves off.
  await expect(list.getByRole('switch', { name: 'Power Infusion', exact: true })).toHaveAccessibleDescription(/Not used: turn on Power Infusion in Buffs first/)
  await expect(tab.getByRole('switch', { name: 'Demonic Rune', exact: true })).toHaveAccessibleDescription(/Not used: turn on Demonic Rune in Buffs first/)
  await expect(tab).not.toContainText(OTHER_CLASS)
}

/** What an Elemental run must show, in the desktop panel or the phone's sheet. */
async function expectElementalResult(results: Locator) {
  await expect(results.getByRole('group', { name: 'DPS' })).toContainText(VALUE_WITH_CI)
  const breakdown = results.getByRole('region', { name: 'Damage by ability' })
  for (const name of ['Lightning Bolt', 'Lightning Bolt (Rank 4)', 'Lava Burst', 'Flame Shock', 'Flame Shock (DoT)', 'Lightning Overload']) {
    await expect(breakdown.getByText(name, { exact: true })).toBeVisible()
  }
  // From range: no swings.
  await expect(breakdown.getByText('Main hand', { exact: true })).toHaveCount(0)
  // Mana per fight: the ledger with Mana Tide Totem.
  const mana = results.getByRole('region', { name: 'Mana per fight' })
  for (const label of ['At the pull', 'Regenerated', 'Mana Tide Totem', 'Major Mana Potion', 'Spent', 'Left at the end']) await expect(mana.getByText(label, { exact: true })).toBeVisible()
  await expect(mana).toContainText(/Spent\s*−[\d,]+/)
  // Its cooldowns and procs.
  await openDetails(results, /^Cooldowns and buffs/)
  const cooldowns = results.getByRole('table')
  for (const name of ['Blood Fury', 'Clearcasting', 'Major Mana Potion']) await expect(cooldowns.getByRole('rowheader', { name: new RegExp(`^${name}`) })).toBeVisible()
  // The caster's character sheet: spell damage and casting speed. (A school's own line shows only when
  // gear gives that school more; the default's Nature-only belt, Sash of the Windreaver, is event-only
  // since GV-6.)
  await openDetails(results, /^Character sheet/)
  for (const label of ['Spell damage', 'Spell crit', 'Spell hit', 'Casting speed', 'Intellect', 'Spirit', 'Mana', 'Mana per 5 s']) {
    await expect(results.getByText(label, { exact: true })).toBeVisible()
  }
  // The assumptions: the Elemental shaman's own.
  await openDetails(results, /^Assumptions \(\d+\)$/)
  await expect(results.getByRole('heading', { name: 'Shaman mechanics' })).toBeVisible()
  await expect(results.getByText(/^You cast from range and never swing your weapon\./)).toBeVisible()
  await expect(results.getByText(/^Rank 4 Lightning Bolt keeps rank 10’s 0\.714/)).toBeVisible()
  await expect(results.getByText(/^Your own Mana Spring Totem \(see Buffs\)/)).toBeVisible()
  await expect(results).not.toContainText(OTHER_CLASS)
}

test.describe('Elemental shaman', () => {
  test('is in the switcher under its class, with its default build in the Talents preset menu, and About names it', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: / }).click()
    await expect(page.getByRole('menuitem', { name: /Elemental/ })).toContainText('DPS')
    await page.getByRole('menuitem', { name: /Elemental/ }).click()
    await expect(page.getByRole('button', { name: SPEC })).toBeVisible()

    // Its pre-raid caster gear.
    const gear = await openTab(page, 'Gear')
    await expect(gear.getByRole('button', { name: "Head: Spellweaver's Turban" })).toBeVisible()
    // An Orc's Whiteout Staff, which the sim ranks above Mindfang and the off hand (EL-2).
    await expect(gear.getByRole('button', { name: /^Main hand: Whiteout Staff/ })).toBeVisible()

    const talents = await openTab(page, 'Talents')
    const presets = talents.getByRole('combobox', { name: 'Talent build presets' })
    await expect(presets).toHaveText('Elemental (default)')
    await presets.click()
    await expect(page.getByRole('option', { name: 'Elemental (default)' })).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /About/ }).click()
    await expect(page.getByRole('dialog').getByText(/^Covers .+ · Shamans: Enhancement and Elemental · Rogues: .+\.$/)).toBeVisible()
  })

  test('its Rotation tab: the consumables above the common priority’s list, the rows’ settings in their summaries, and no other class’s words', async ({ page }) => {
    await switchToElemental(page)
    await expectDefaultRotation(await openTab(page, 'Rotation'))
  })

  test('its Buffs tab: the casters’ debuff on, and no weapon stones or Windfury Totem since it never swings', async ({ page }) => {
    await switchToElemental(page)
    const buffs = await openTab(page, 'Buffs')
    await expect(buffs.getByRole('switch', { name: 'Curse of the Elements' })).toBeChecked()
    await expect(buffs.getByRole('switch', { name: 'Mana Spring Totem' })).toBeChecked()
    for (const name of ['Dense Sharpening Stone / Weightstone', 'Elemental Sharpening Stone', 'Windfury Totem']) await expect(buffs.getByRole('switch', { name })).toHaveCount(0)
  })

  test('a run reads as an Elemental shaman’s: its spells, the downrank and mana', async ({ page }) => {
    await switchToElemental(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await simulate(results)
    await expectElementalResult(results)
  })

  test('a share link brings back the Elemental shaman with its rotation settings', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await switchToElemental(page)
    const tab = await openTab(page, 'Rotation')
    // Chain Lightning's choice is its row's setting, beside the list on a desktop.
    await tab.getByRole('button', { name: 'Chain Lightning', exact: true }).click()
    const chain = page.getByRole('complementary', { name: 'Chain Lightning settings' })
    await chain.getByRole('radio', { name: 'Never', exact: true }).click()
    await tab.getByRole('switch', { name: 'Earth Shock', exact: true }).click()
    await expect(chain.getByRole('radio', { name: 'Never', exact: true })).toBeChecked()
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
    await expect(shared.locator('[data-apl-row="chainLightning"]')).toContainText('Never')
    await expect(shared.getByRole('switch', { name: 'Earth Shock', exact: true })).toBeChecked()
    await expect(shared.getByRole('switch', { name: 'Flame Shock', exact: true })).toBeChecked()
    expect(new URL(other.url()).hash).toBe('')
    await other.context().close()
  })
})

test.describe('Elemental shaman on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('switches to it, shows its Rotation tab without sideways scroll, and runs to a result in the sheet', async ({ page }) => {
    await switchToElemental(page)
    const tab = await openTab(page, 'Rotation')
    await noSideScroll(page)
    await expectDefaultRotation(tab)
    // The Chain Lightning choice fits its row's sheet.
    await tab.getByRole('button', { name: 'Chain Lightning', exact: true }).click()
    const choice = page.getByRole('dialog', { name: 'Chain Lightning' }).getByRole('radio', { name: 'Clearcasting', exact: true })
    await expect(choice).toBeChecked()
    const box = (await choice.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(await choice.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await noSideScroll(page, 'no horizontal page scroll with the sheet open')
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await simulate(page)
    const bar = page.getByRole('button', { name: 'Show results' })
    await expect(bar).toContainText(/DPS\s*\d[\d,]*\.\d/)
    await bar.click()
    const sheet = page.getByRole('dialog', { name: 'Results' })
    await expectElementalResult(sheet)
    await noSideScroll(page)
  })
})
