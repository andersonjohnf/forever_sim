import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The Protection paladin, shipped in C3, as a visitor gets to it: from the spec switcher, its
// Rotation tab's presets (decisions D26, D28: Balanced by default, Defensive and Max TPS), the Buffs
// tab's Devotion Aura as yours or, with Max TPS, another paladin's, a run whose results read as a
// paladin tank's, and a share link that brings it back; on a desktop and on a phone.
// paladin-protection-rotation.spec.ts covers the Rotation tab's details from a share link.

/** Warrior or druid words a paladin screen must never show. */
const OTHER_CLASS = /\brage\b|\bstances?\b|Enrage|Energy|combo point|Cat Form|Bear Form/i

/** A value with its ± 95% CI in the headline, e.g. "425.1± 1.0". */
const VALUE_WITH_CI = /\d[\d,]*\.\d\s*± \d[\d,]*\.\d/

/** The Buffs tab's Devotion Aura: yours under Balanced and Defensive, another paladin's under Max TPS. */
const YOURS = 'You keep it up yourself (see Rotation), so it isn’t added twice.'
const ANOTHER_PALADINS = 'You’re not keeping it up (see Rotation); turn this on if another paladin does.'
/** The Buffs tab's Judgement of the Crusader: yours from the opener, or another paladin's (T2). */
const YOURS_JOTC = `+161 Holy damage taken. ${YOURS}`
const ANOTHER_PALADINS_JOTC = `+161 Holy damage taken. ${ANOTHER_PALADINS}`

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

/** Picks a rotation preset (D28). */
async function pickPreset(page: Page, name: string) {
  await page.getByRole('combobox', { name: 'Rotation preset' }).click()
  await page.getByRole('option', { name, exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Rotation preset' })).toHaveText(name)
}

/** The pre-pull row's settings, beside the list on a desktop or in a sheet on a phone; `close` closes the sheet. */
async function prepullSettings(page: Page, tab: Locator) {
  await tab.getByRole('list', { name: 'Priority list' }).getByRole('button', { name: 'Before the pull', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Before the pull' })
  const phone = (await sheet.count()) > 0
  return {
    scope: phone ? sheet : page.getByRole('complementary', { name: 'Before the pull settings' }),
    close: async () => {
      if (!phone) return
      await page.getByRole('button', { name: 'Close', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    },
  }
}

/** The Rotation tab under Balanced, the default, then under Max TPS, whose default drops Devotion Aura. */
async function expectBothPriorities(page: Page, tab: Locator) {
  const preset = page.getByRole('combobox', { name: 'Rotation preset' })
  const holyShield = tab.getByRole('switch', { name: 'Holy Shield', exact: true })
  await expect(preset).toHaveText('Balanced (default)')
  await expect(holyShield).toBeChecked()
  let prepull = await prepullSettings(page, tab)
  await expect(prepull.scope.getByRole('switch', { name: 'Devotion Aura', exact: true })).toBeChecked()
  await prepull.close()
  await expect(tab).not.toContainText(OTHER_CLASS)

  await pickPreset(page, 'Max TPS')
  // The duty's default follows the preset: off, not marked as changed, and it says so.
  prepull = await prepullSettings(page, tab)
  const devotion = prepull.scope.getByRole('switch', { name: 'Devotion Aura', exact: true })
  await expect(devotion).not.toBeChecked()
  await expect(devotion).toHaveAccessibleDescription(/Off by default with Max TPS/)
  await expect(devotion).not.toHaveAccessibleDescription(/Changed/)
  await prepull.close()
  // Holy Shield isn't a duty: it stays on for its threat.
  await expect(holyShield).toBeChecked()
  await expect(tab).not.toContainText(OTHER_CLASS)
}

/** What a Protection paladin's run must show, in the desktop panel or the phone's sheet. */
/** `strike`: Holy Strike, which every preset plays (D28); Hammer of the Righteous when you turn it on. */
async function expectProtectionResult(results: Locator, strike = 'Holy Strike') {
  // The tank headline: TPS and DPS, each with its CI.
  await expect(results.getByRole('group', { name: 'TPS' })).toContainText(VALUE_WITH_CI)
  await expect(results.getByRole('group', { name: 'DPS' })).toContainText(VALUE_WITH_CI)
  const taken = results.getByRole('region', { name: 'Damage taken per second' })
  await expect(taken).toContainText(VALUE_WITH_CI)
  // A warrior tank's debuffs are never a paladin's own (D26).
  await expect(taken).toContainText('Debuffs on it, such as a warrior tank’s Demoralizing Shout and Thunder Clap (Buffs), lower its damage and slow its swings.')
  await expect(taken).not.toContainText('yours')
  const threat = results.getByRole('region', { name: 'Threat by ability' })
  for (const name of ['Holy Shield', 'Seal of Fury', 'Judgement of Fury', 'Consecration', strike]) {
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
    await expect(talents.getByText('8 / 35 / 8')).toBeVisible()
    await presets.click()
    // Only this spec's default is "(default)": Retribution's reads plainly (TU10). The popular build,
    // v1's default, stays a preset (T2).
    await expect(page.getByRole('option')).toHaveText(['Retribution default 9/8/34', 'Protection (default) 8/35/8', 'Protection popular build 2/42/7'])
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /About/ }).click()
    await expect(page.getByRole('dialog').getByText('Covers Warriors: Fury, Arms and Protection · Druids: Feral (Cat), Feral (Bear) and Balance · Paladins: Retribution and Protection · Shamans: Enhancement and Elemental · Rogues: Combat, Assassination and Subtlety · Mages: Fire, Frost and Arcane · Warlocks: Destruction, Affliction and Demonology · Priests: Shadow · Hunters: Marksmanship, Beast\u00a0Mastery and Survival.', { exact: true })).toBeVisible()
  })

  test('its Gear tab starts as the measured threat set, not a guide’s pre-raid list, and puts it back (T3R-7)', async ({ page }) => {
    await switchToProtection(page)
    const gear = await openTab(page, 'Gear')
    await expect(gear.getByText('Starts as the Protection Paladin threat set: pre-raid items measured for threat, keeping an effective-health floor. Choose a slot to change its item.', { exact: true })).toBeVisible()
    await expect(gear.getByText(/best in slot/)).toHaveCount(0)
    await gear.getByRole('button', { name: 'Gear options' }).click()
    await page.getByRole('menuitem', { name: 'Remove all gear' }).click()
    await gear.getByRole('button', { name: 'Equip the threat set' }).click()
    await expect(gear.getByText('Lionheart Helm')).toBeVisible()
    // A DPS spec's still starts as its pre-raid best in slot.
    await page.getByRole('button', { name: /^Spec: Protection Paladin/ }).click()
    await page.getByRole('group', { name: 'Paladin' }).getByRole('menuitem', { name: /Retribution/ }).click()
    await expect(gear.getByText('Starts as Retribution Paladin pre-raid best in slot. Choose a slot to change its item.', { exact: true })).toBeVisible()
  })

  test('its Rotation tab under Balanced and under Max TPS', async ({ page }) => {
    await switchToProtection(page)
    await expectBothPriorities(page, await openTab(page, 'Rotation'))
  })

  test('its Buffs tab: Devotion Aura locked as yours, and under Max TPS yours to turn on for another paladin’s', async ({ page }) => {
    await switchToProtection(page)
    const buffs = await openTab(page, 'Buffs')
    const devotion = buffs.getByRole('switch', { name: 'Devotion Aura', exact: true })
    await expect(devotion).toBeChecked()
    await expect(devotion).toBeDisabled()
    await expect(devotion).toHaveAccessibleDescription(`+735 armor. ${YOURS}`)

    await openTab(page, 'Rotation')
    await pickPreset(page, 'Max TPS')
    const again = await openTab(page, 'Buffs')
    const buff = again.getByRole('switch', { name: 'Devotion Aura', exact: true })
    await expect(buff).not.toBeChecked()
    await expect(buff).toBeEnabled()
    await expect(buff).toHaveAccessibleDescription(`+735 armor. ${ANOTHER_PALADINS}`)
    await expect(again.getByText(ANOTHER_PALADINS)).toBeVisible()
  })

  test('its own Judgement of the Crusader makes the Buffs tab’s its own, and the Advanced rules for it and Hammer of the Righteous (T2)', async ({ page }) => {
    await switchToProtection(page)
    const buffs = await openTab(page, 'Buffs')
    const jotc = buffs.getByRole('switch', { name: 'Judgement of the Crusader', exact: true })
    await expect(jotc).toBeChecked()
    await expect(jotc).toBeDisabled()
    await expect(jotc).toHaveAccessibleDescription(YOURS_JOTC)
    // Character → Advanced: the JotC rule is in use; Hammer of the Righteous's is dimmed while it's off
    // in Rotation, as every preset has it (D28).
    await openTab(page, 'Rotation')
    await pickPreset(page, 'Defensive')
    const character = await openTab(page, 'Character')
    await character.getByRole('button', { name: /^Advanced/ }).click()
    const bonus = character.getByRole('radiogroup', { name: 'Judgement of the Crusader’s bonus' })
    await expect(bonus).toHaveAccessibleDescription(/how much of the \+161 Holy damage each Holy hit gets.*Seal of Fury proc 10%/)
    await expect(character.getByText('Not used: Judgement of the Crusader is off in Rotation.')).toHaveCount(0)
    const hammer = character.getByRole('radiogroup', { name: 'Hammer of the Righteous’s weapon DPS' })
    await expect(hammer.getByRole('radio', { name: 'With attack power' })).toBeChecked()
    await expect(character.getByText('Not used: Hammer of the Righteous is off in Rotation.')).toBeVisible()
    await hammer.getByRole('radio', { name: 'Weapon only' }).click()
    await expect(character.getByText(/Default: With attack power/)).toBeVisible()
    await character.getByRole('button', { name: /^Reset Hammer of the Righteous’s weapon DPS/ }).click()
    await expect(hammer.getByRole('radio', { name: 'With attack power' })).toBeFocused()
    // With Hammer of the Righteous on in Rotation, its rule is in use; with your judgement off, the JotC rule isn't,
    // and the Buffs tab's becomes another paladin's, off.
    const rotation = await openTab(page, 'Rotation')
    await rotation.getByRole('switch', { name: 'Hammer of the Righteous', exact: true }).click()
    const prepull = await prepullSettings(page, rotation)
    await prepull.scope.getByRole('switch', { name: 'Judgement of the Crusader', exact: true }).click()
    const buffsAgain = await openTab(page, 'Buffs')
    const other = buffsAgain.getByRole('switch', { name: 'Judgement of the Crusader', exact: true })
    await expect(other).not.toBeChecked()
    await expect(other).toHaveAccessibleDescription(ANOTHER_PALADINS_JOTC)
    const again = await openTab(page, 'Character')
    await again.getByRole('button', { name: /^Advanced/ }).click()
    await expect(again.getByText('Not used: Hammer of the Righteous is off in Rotation.')).toHaveCount(0)
    await expect(again.getByText('Not used: Judgement of the Crusader is off in Rotation.')).toBeVisible()
  })

  test('a run reads as a paladin tank’s: TPS and DPS, damage taken, Holy Shield, mana and the boss’s table', async ({ page }) => {
    await switchToProtection(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await expect(results).toContainText('Simulate to see your TPS and DPS.')
    await simulate(results)
    await expectProtectionResult(results)
  })

  test('a share link brings back the Protection paladin with its preset and seal', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await switchToProtection(page)
    const tab = await openTab(page, 'Rotation')
    await pickPreset(page, 'Max TPS')
    await tab.getByRole('list', { name: 'Priority list' }).getByRole('button', { name: 'Seal', exact: true }).click()
    await page.getByRole('complementary', { name: 'Seal settings' }).getByRole('radio', { name: 'Righteousness' }).click()
    // The seal is one of the list's settings, so the list now matches no preset: Custom.
    await expect(page.getByRole('combobox', { name: 'Rotation preset' })).toHaveText('Custom')
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const url = await page.evaluate(() => navigator.clipboard.readText())
    expect(url).toContain('/#s=')

    // A fresh browser that has only ever seen the Fury warrior.
    const other = await (await context.browser()!.newContext()).newPage()
    await other.route('https://wow.zamimg.com/**', (route) => route.fulfill({ status: 204 }))
    await other.goto(url)
    await expect(other.getByText('Loaded a shared setup')).toBeVisible()
    await expect(other.getByRole('button', { name: /^Spec: Protection Paladin/ })).toBeVisible()
    const shared = await openTab(other, 'Rotation')
    await expect(other.getByRole('combobox', { name: 'Rotation preset' })).toHaveText('Custom')
    await expect(shared.locator('[data-apl-row="seal"]')).toContainText('Seal of Righteousness')
    await expect(shared.locator('[data-apl-row="prepull"]')).toContainText('Retribution Aura')
    const buffs = await openTab(other, 'Buffs')
    await expect(buffs.getByRole('switch', { name: 'Devotion Aura', exact: true })).toBeEnabled()
    expect(new URL(other.url()).hash).toBe('')
    await other.context().close()
  })
})

test.describe('Protection paladin on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

  test('switches to it, shows its presets and its Buffs without sideways scroll, and runs to a result in the sheet', async ({ page }) => {
    await switchToProtection(page)
    const tab = await openTab(page, 'Rotation')
    expect(await overflow(page), 'no horizontal page scroll').toBeLessThanOrEqual(0)
    // The preset picker is a full-size touch target inside the screen.
    const box = (await page.getByRole('combobox', { name: 'Rotation preset' }).boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.x + box.width).toBeLessThanOrEqual(390 - 16)
    await expectBothPriorities(page, tab)
    expect(await overflow(page), 'no horizontal page scroll under Max TPS').toBeLessThanOrEqual(0)

    const buffs = await openTab(page, 'Buffs')
    await expect(buffs.getByRole('switch', { name: 'Devotion Aura', exact: true })).toHaveAccessibleDescription(`+735 armor. ${ANOTHER_PALADINS}`)
    await openTab(page, 'Rotation')
    await pickPreset(page, 'Defensive')
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
    // Defensive, picked above: Holy Strike.
    await expectProtectionResult(sheet, 'Holy Strike')
    expect(await overflow(page), 'no horizontal page scroll').toBeLessThanOrEqual(0)
  })
})
