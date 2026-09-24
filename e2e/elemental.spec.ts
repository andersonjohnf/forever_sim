import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The Elemental shaman (docs/classes/shaman.md#elemental), shipped in K5: the switcher, its Rotation,
// Talents and Buffs tabs, a run whose results say how its spells and mana went, and a share link that
// brings it back, on a desktop and on a phone (docs/ux.md). It casts from range: nothing on its
// screens may speak of swings, and no other class's words.

/** Words an Elemental screen must never show: another class's, or a melee spec's swings. */
const OTHER_CLASS = /\brage\b|\bstances?\b|Enrage|Energy|combo point|Cat Form|Bear Form|Seal of|Judgement|Consecration|Stormstrike|Maelstrom|Windfury Weapon/i

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

/** What the Rotation tab shows by default, at any width. */
async function expectDefaultRotation(tab: Locator) {
  await expect(tab.getByText(/The defaults are the common priority, with a first quick search; they aren’t tuned yet\. Flame Shock is there for Lava Burst/)).toBeVisible()
  await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Cooldowns and buffs', 'Core abilities', 'Fillers', 'Consumables'])
  for (const name of ['Racial cooldown', 'On-use trinkets', 'Mana Tide Totem', 'Flame Shock', 'Lava Burst', 'Rank 4 Lightning Bolt', 'Major Mana Potion']) {
    await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
  }
  for (const name of ['Lava Burst only with Flame Shock', 'Earth Shock']) await expect(tab.getByRole('switch', { name, exact: true })).not.toBeChecked()
  await expect(tab.getByRole('radio', { name: 'Clearcasting', exact: true })).toBeChecked()
  // Lightning Bolt is the filler, always on, with no control.
  await expect(tab.getByRole('region', { name: 'Fillers' }).getByText('Always on')).toBeVisible()
  // Power Infusion and the rune wait for the Buffs tab, which the Standard raid preset leaves off.
  await expect(tab.getByRole('switch', { name: 'Power Infusion', exact: true })).toHaveAccessibleDescription(/Not used: turn on Power Infusion in Buffs first/)
  await expect(tab.getByRole('switch', { name: 'Demonic Rune', exact: true })).toHaveAccessibleDescription(/Not used: turn on Demonic Rune in Buffs first/)
  // The thresholds wait behind Advanced: Mana Tide at 3,000 missing, rank 10 from 10% mana.
  const cooldowns = tab.getByRole('region', { name: 'Cooldowns and buffs' })
  await cooldowns.getByRole('button', { name: /^Advanced settings for Cooldowns and buffs/ }).click()
  await expect(cooldowns.getByRole('textbox', { name: 'Mana Tide Totem when missing', exact: true })).toHaveValue('3,000')
  const fillers = tab.getByRole('region', { name: 'Fillers' })
  await fillers.getByRole('button', { name: /^Advanced settings for Fillers/ }).click()
  await expect(fillers.getByRole('textbox', { name: 'Rank 10 from', exact: true })).toHaveValue('10')
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
  // The caster's character sheet: spell damage by school and casting speed.
  await openDetails(results, /^Character sheet/)
  for (const label of ['Spell damage', 'Nature damage', 'Spell crit', 'Spell hit', 'Casting speed', 'Intellect', 'Spirit', 'Mana', 'Mana per 5 s']) {
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
    await expect(gear.getByRole('button', { name: /^Main hand: Mindfang/ })).toBeVisible()

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

  test('its Rotation tab: the common priority under the usual headings, its thresholds behind Advanced, and no other class’s words', async ({ page }) => {
    await switchToElemental(page)
    await expectDefaultRotation(await openTab(page, 'Rotation'))
  })

  test('its Buffs tab: the casters’ debuff on, and weapon stones locked off since it never swings', async ({ page }) => {
    await switchToElemental(page)
    const buffs = await openTab(page, 'Buffs')
    await expect(buffs.getByRole('switch', { name: 'Curse of the Elements' })).toBeChecked()
    await expect(buffs.getByRole('switch', { name: 'Mana Spring Totem' })).toBeChecked()
    for (const name of ['Dense Sharpening Stone / Weightstone', 'Elemental Sharpening Stone']) {
      const stone = buffs.getByRole('switch', { name })
      await expect(stone).not.toBeChecked()
      await expect(stone).toBeDisabled()
      await expect(stone).toHaveAccessibleDescription(/Not used: you cast from range and never swing your weapon\./)
    }
    await expect(buffs.getByRole('switch', { name: 'Windfury Totem' })).not.toBeChecked()
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
    await tab.getByRole('radio', { name: 'Never', exact: true }).click()
    await tab.getByRole('switch', { name: 'Earth Shock', exact: true }).click()
    await expect(tab.getByRole('radio', { name: 'Never', exact: true })).toBeChecked()
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const url = await page.evaluate(() => navigator.clipboard.readText())
    expect(url).toContain('/forever_sim/#s=')

    // A fresh browser that has only ever seen the Fury warrior.
    const other = await (await context.browser()!.newContext()).newPage()
    await other.route('https://wow.zamimg.com/**', (route) => route.fulfill({ status: 204 }))
    await other.goto(url)
    await expect(other.getByText('Loaded a shared setup')).toBeVisible()
    await expect(other.getByRole('button', { name: SPEC })).toBeVisible()
    await other.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const shared = other.getByRole('tabpanel', { name: 'Rotation' })
    await expect(shared.getByRole('radio', { name: 'Never', exact: true })).toBeChecked()
    await expect(shared.getByRole('radio', { name: 'Clearcasting', exact: true })).not.toBeChecked()
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
    await noSideScroll(page, 'no horizontal page scroll with Advanced open')
    // The Chain Lightning choice fits its row.
    const choice = tab.getByRole('radio', { name: 'Clearcasting', exact: true })
    const box = (await choice.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(await choice.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)

    await simulate(page)
    const bar = page.getByRole('button', { name: 'Show results' })
    await expect(bar).toContainText(/DPS\s*\d[\d,]*\.\d/)
    await bar.click()
    const sheet = page.getByRole('dialog', { name: 'Results' })
    await expectElementalResult(sheet)
    await noSideScroll(page)
  })
})
