import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The hunters (docs/classes/hunter.md), shipped in H2: the switcher, the Talents presets, the Gear
// tab's ammo and quiver, the Rotation tab (the common priority, Aspect of the Hawk and Auto Shot always
// on), the Buffs tab's melee-only entries locked off, a run whose results show Auto Shot, the shots, the
// pet's rows and mana with the ranged sheet, and a share link, on a desktop and on a phone (docs/ux.md).

/** Words a hunter screen must never show. */
const OTHER_CLASS = /\brage\b|\bstances?\b|Energy|combo point|Cat Form|Bear Form|Seal of (the )?(Righteousness|Command|Crusader|Light|Wisdom)|Judgement|Main hand|Off hand|Spell damage/i

/** A value with its ± 95% CI in the headline, e.g. "485.1± 1.0". */
const VALUE_WITH_CI = /\d[\d,]*\.\d\s*± \d[\d,]*\.\d/

const MM = /^Spec: Marksmanship Hunter/
const BM = /^Spec: Beast\sMastery Hunter/

async function switchTo(page: Page, name: RegExp, spec: RegExp) {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('group', { name: 'Hunter' }).getByRole('menuitem', { name }).click()
  await expect(page.getByRole('button', { name: spec })).toBeVisible()
}

async function openTab(page: Page, name: string): Promise<Locator> {
  await page.getByRole('tab', { name, exact: true }).click()
  return page.getByRole('tabpanel', { name })
}

async function simulate(scope: Locator | Page) {
  await scope.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
  await expect(scope.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
}

async function openDetails(scope: Locator, title: RegExp) {
  const trigger = scope.getByRole('button', { name: title })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
}

async function noSideScroll(page: Page, what = 'no horizontal page scroll') {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, what).toBeLessThanOrEqual(0)
}

/** What the Marksmanship Rotation tab shows by default, at any width. */
async function expectDefaultRotation(tab: Locator) {
  await expect(
    tab.getByText('Which abilities the sim uses, and when. The defaults are the common priority, with a first quick search; they aren’t tuned yet.', { exact: true }),
  ).toBeVisible()
  await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Before the pull', 'Cooldowns and buffs', 'Core abilities', 'Consumables'])
  await expect(tab.getByRole('region', { name: 'Before the pull' })).toContainText(/Aspect of the Hawk.*Always on/s)
  await expect(tab.getByRole('region', { name: 'Cooldowns and buffs' })).toContainText(/Auto Shot.*Always on/s)
  for (const name of ['Racial cooldown', 'On-use trinkets', 'Rapid Fire', 'Hunter’s Mark', 'Wait for Auto Shot', 'Serpent Sting', 'Major Mana Potion']) {
    await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
  }
  // The first-pass defaults: no Arcane Shot or Sniper Shot for Marksmanship; its build has no Bestial Wrath.
  for (const name of ['Arcane Shot', 'Sniper Shot']) await expect(tab.getByRole('switch', { name, exact: true })).not.toBeChecked()
  await expect(tab.getByRole('switch', { name: 'Bestial Wrath', exact: true })).toHaveAccessibleDescription(/Not used: needs the Bestial Wrath talent/)
  await expect(tab.getByRole('radio', { name: 'Aimed Shot', exact: true })).toBeChecked()
  const core = tab.getByRole('region', { name: 'Core abilities' })
  await core.getByRole('button', { name: /^Advanced settings for Core abilities/ }).click()
  await expect(core.getByRole('textbox', { name: 'Serpent Sting until', exact: true })).toHaveValue('6')
  // Lone Wolf: no pet, so its Claw threshold does nothing.
  await expect(core.getByRole('textbox', { name: 'Pet: Claw at', exact: true })).toHaveAccessibleDescription(/Not used: with Lone Wolf you fight without a pet/)
  await expect(tab).not.toContainText(OTHER_CLASS)
}

/** What a Beast Mastery run must show, in the desktop panel or the phone's sheet. */
async function expectHunterResult(results: Locator) {
  await expect(results.getByRole('group', { name: 'DPS' })).toContainText(VALUE_WITH_CI)
  const breakdown = results.getByRole('region', { name: 'Damage by ability' })
  for (const name of ['Auto Shot', 'Multi-Shot', 'Arcane Shot', 'Serpent Sting', 'Auto attack · Cat', 'Bite · Cat', 'Claw · Cat']) {
    await expect(breakdown.getByText(name, { exact: true })).toBeVisible()
  }
  await expect(breakdown.getByText(/tick crit/).first()).toBeVisible()
  const mana = results.getByRole('region', { name: 'Mana per fight' })
  for (const label of ['At the pull', 'Regenerated', 'Major Mana Potion', 'Spent', 'Left at the end']) await expect(mana.getByText(label, { exact: true })).toBeVisible()
  await openDetails(results, /^Cooldowns and buffs/)
  const cooldowns = results.getByRole('table')
  for (const name of ['Blood Fury', 'Rapid Fire', 'Bestial Wrath', 'Hunter’s Mark', 'Quick Shots', 'Frenzy']) {
    await expect(cooldowns.getByRole('rowheader', { name: new RegExp(`^${name}`) })).toBeVisible()
  }
  await openDetails(results, /^Character sheet/)
  for (const label of ['Ranged attack power', 'Ranged crit', 'Ranged hit', 'Shot speed', 'Ranged weapon skill', 'Ammo damage', 'Agility', 'Mana']) {
    await expect(results.getByText(label, { exact: true })).toBeVisible()
  }
  await expect(results.getByText('Dodge', { exact: true })).toHaveCount(0)
  await openDetails(results, /^Assumptions \(\d+\)$/)
  await expect(results.getByRole('heading', { name: 'Hunter mechanics' })).toBeVisible()
  await expect(results.getByText(/^Your cat’s base numbers aren’t in the client/)).toBeVisible()
  await expect(results.getByText(/^Auto Shot aims for its last 0\.5 s/)).toBeVisible()
  await expect(results).not.toContainText(OTHER_CLASS)
}

test.describe('Hunters', () => {
  test('are in the switcher under Hunter, an Orc with the pre-raid list, ammo and a quiver, their Talents presets, and About names them', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: / }).click()
    const hunters = page.getByRole('group', { name: 'Hunter' })
    await expect(hunters.getByRole('menuitem')).toHaveText([/^Marksmanship\s*DPS$/, /^Beast\sMastery\s*DPS$/, /^Survival\s*DPS$/])
    await hunters.getByRole('menuitem', { name: /Marksmanship/ }).click()
    await expect(page.getByRole('button', { name: MM })).toBeVisible()

    await openTab(page, 'Character')
    await expect(page.getByRole('radio', { name: /Orc/ })).toHaveAttribute('aria-checked', 'true')
    const gear = await openTab(page, 'Gear')
    await expect(gear.getByRole('button', { name: 'Ranged: Dwarven Hand Cannon' })).toBeVisible()
    await expect(gear.getByRole('button', { name: 'Ammo: Thorium Shells' })).toHaveAccessibleDescription(/\+17\.7 DPS/)
    await expect(gear.getByRole('button', { name: 'Quiver: Gnoll Skin Bandolier' })).toHaveAccessibleDescription(/15% Ranged speed/)

    const talents = await openTab(page, 'Talents')
    const presets = talents.getByRole('combobox', { name: 'Talent build presets' })
    await expect(presets).toHaveText('Marksmanship (default)')
    await expect(page.getByText('10 / 41 / 0')).toBeVisible()
    await presets.click()
    await expect(page.getByRole('option')).toHaveText([/^Marksmanship \(?default\)?$/, /^Marksmanship with a pet$/, /^Beast\sMastery \(?default\)?$/, /^Survival \(?default\)?$/])
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /About/ }).click()
    await expect(page.getByRole('dialog').getByText(/ · Hunters: Marksmanship, Beast\sMastery and Survival( · .+)?\.$/)).toBeVisible()
  })

  test('the Marksmanship Rotation tab: the common priority, Aspect of the Hawk and Auto Shot always on, the pet’s setting unused with Lone Wolf', async ({ page }) => {
    await switchTo(page, /Marksmanship/, MM)
    await expectDefaultRotation(await openTab(page, 'Rotation'))
  })

  test('the Buffs tab locks off what a hunter can’t use and keeps its Agility and mana entries on', async ({ page }) => {
    await switchTo(page, /Marksmanship/, MM)
    const buffs = await openTab(page, 'Buffs')
    for (const name of ['Windfury Totem', 'Blessing of Might']) {
      await expect(buffs.getByRole('switch', { name })).not.toBeChecked()
      await expect(buffs.getByRole('switch', { name })).toBeDisabled()
    }
    for (const name of ['Grace of Air Totem', 'Arcane Brilliance', 'Blessing of Wisdom', 'Sunder Armor ×5', 'Battle Shout']) await expect(buffs.getByRole('switch', { name })).toBeChecked()
    for (const name of ['Moonkin Aura', 'Curse of the Elements']) await expect(buffs.getByRole('switch', { name })).toHaveCount(0)
  })

  test('a Beast Mastery run reads as a hunter’s: Auto Shot, its shots, its cat’s rows, mana and the ranged sheet', async ({ page }) => {
    await switchTo(page, /Beast/, BM)
    const results = page.getByRole('complementary', { name: 'Results' })
    await simulate(results)
    await expectHunterResult(results)
  })

  test('a share link brings back the hunter with its rotation settings', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await switchTo(page, /Marksmanship/, MM)
    const tab = await openTab(page, 'Rotation')
    await tab.getByRole('switch', { name: 'Arcane Shot', exact: true }).click()
    await tab.getByRole('radio', { name: 'Multi-Shot', exact: true }).click()
    await expect(tab.getByRole('switch', { name: 'Arcane Shot', exact: true })).toBeChecked()
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const url = await page.evaluate(() => navigator.clipboard.readText())
    expect(url).toContain('/#s=')

    const other = await (await context.browser()!.newContext()).newPage()
    await other.route('https://wow.zamimg.com/**', (route) => route.fulfill({ status: 204 }))
    await other.goto(url)
    await expect(other.getByText('Loaded a shared setup')).toBeVisible()
    await expect(other.getByRole('button', { name: MM })).toBeVisible()
    await other.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const shared = other.getByRole('tabpanel', { name: 'Rotation' })
    await expect(shared.getByRole('switch', { name: 'Arcane Shot', exact: true })).toBeChecked()
    await expect(shared.getByRole('radio', { name: 'Multi-Shot', exact: true })).toBeChecked()
    await expect(shared.getByRole('switch', { name: 'Serpent Sting', exact: true })).toBeChecked()
    await other.getByRole('tab', { name: 'Gear', exact: true }).click()
    await expect(other.getByRole('button', { name: 'Quiver: Gnoll Skin Bandolier' })).toBeVisible()
    expect(new URL(other.url()).hash).toBe('')
    await other.context().close()
  })
})

test.describe('Hunters on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('switches to Marksmanship, shows its Rotation tab without sideways scroll, and runs Beast Mastery to a result in the sheet', async ({ page }) => {
    await switchTo(page, /Marksmanship/, MM)
    const tab = await openTab(page, 'Rotation')
    await noSideScroll(page)
    await expectDefaultRotation(tab)
    await noSideScroll(page, 'no horizontal page scroll with Advanced open')

    await switchTo(page, /Beast/, BM)
    await simulate(page)
    const bar = page.getByRole('button', { name: 'Show results' })
    await expect(bar).toContainText(/DPS\s*\d[\d,]*\.\d/)
    await bar.click()
    const sheet = page.getByRole('dialog', { name: 'Results' })
    await expectHunterResult(sheet)
    await noSideScroll(page)
  })

  test('the Ammo picker lists what the gun fires first and dims arrows with the reason; a bow swaps in arrows and a quiver', async ({ page }) => {
    // docs/classes/hunter.md#73-gear, docs/ux.md "Gear". A row's flag badges can sit mid-row, so tap its icon.
    const onIcon = { position: { x: 24, y: 24 } }
    await switchTo(page, /Marksmanship/, MM)
    const gear = await openTab(page, 'Gear')
    await gear.getByRole('button', { name: 'Ammo: Thorium Shells' }).click(onIcon)
    const picker = page.getByRole('dialog', { name: 'Choose ammo' })
    // Each row's item button comes first; a Classic stats badge is a button after it.
    const rows = picker.getByRole('list', { name: 'Items' }).getByRole('listitem')
    const item = (i: number) => rows.nth(i).getByRole('button').first()
    // Leave this slot empty, the 7 bullets, then the 5 arrows (item level order within each).
    await expect(rows).toHaveCount(13)
    await expect(item(1)).toHaveAccessibleName(/^Swiftstrike Shot\. Bullet/)
    for (let i = 1; i <= 7; i++) await expect(item(i)).toHaveAccessibleName(/\. Bullet · /)
    await expect(item(8)).toHaveAccessibleName(/^Swiftfeather Arrow\. .*For bows and crossbows: your gun fires bullets$/)
    for (let i = 8; i <= 12; i++) await expect(rows.nth(i)).toContainText('For bows and crossbows: your gun fires bullets')
    await noSideScroll(page, 'no horizontal page scroll with the picker open')
    await picker.getByRole('button', { name: 'Close' }).click()

    await gear.getByRole('button', { name: /^Ranged: / }).click(onIcon)
    const ranged = page.getByRole('dialog', { name: 'Choose ranged' })
    await ranged.getByLabel('Search items').fill('riphook')
    await ranged.getByRole('button', { name: /^Riphook/ }).click(onIcon)
    await expect(ranged).toBeHidden()
    await expect(gear.getByRole('button', { name: 'Ammo: Thorium Headed Arrow' })).toBeVisible()
    await expect(gear.getByRole('button', { name: 'Quiver: Harpy Hide Quiver' })).toBeVisible()

    // Bullets can still be picked with a bow: they add nothing, and the slot says why.
    await gear.getByRole('button', { name: 'Ammo: Thorium Headed Arrow' }).click(onIcon)
    await picker.getByRole('button', { name: /^Swiftstrike Shot\./ }).click(onIcon)
    await expect(picker).toBeHidden()
    await expect(gear.getByRole('button', { name: 'Ammo: Swiftstrike Shot' })).toHaveAccessibleDescription(/For guns: your bow fires arrows$/)
    await expect(gear.getByText('For guns: your bow fires arrows', { exact: true })).toBeVisible()
    await noSideScroll(page)
  })
})
