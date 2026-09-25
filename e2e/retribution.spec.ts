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

/**
 * A priority-list row's settings (D31), beside the list on a desktop or in a sheet on a phone;
 * `close` closes the sheet.
 */
async function rowSettings(page: Page, tab: Locator, name: string) {
  await tab.getByRole('list', { name: 'Priority list' }).getByRole('button', { name, exact: true }).click()
  const sheet = page.getByRole('dialog', { name })
  const phone = (await sheet.count()) > 0
  return {
    scope: phone ? sheet : page.getByRole('complementary', { name: `${name} settings` }),
    close: async () => {
      if (!phone) return
      await page.getByRole('button', { name: 'Close', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    },
  }
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
  for (const label of ['At the pull', 'Regenerated', 'Sanctified Judgement', 'Major Mana Potion', 'Spent', 'Left at the end']) await expect(mana.getByText(label, { exact: true })).toBeVisible()
  await expect(mana).toContainText(/Spent\s*−[\d,]+/)
  // The seals, Judgement of the Crusader and the potion under Cooldowns and buffs.
  await openDetails(results, /^Cooldowns and buffs/)
  const cooldowns = results.getByRole('table')
  for (const name of ['Seal of Command', 'Seal of the Crusader', 'Judgement of the Crusader', 'Major Mana Potion']) {
    await expect(cooldowns.getByRole('rowheader', { name: new RegExp(`^${name}`) })).toBeVisible()
  }
  // Seal of the Crusader is up only until its judgement at the pull: a dash, and when it's cast (RU4).
  const sotc = cooldowns.getByRole('row', { name: /^Seal of the Crusader/ })
  await expect(sotc).toContainText('Before the pull, for its judgement')
  await expect(sotc.getByRole('cell').first()).toHaveText(/—\s*none/)
  // The character sheet's spell stats and mana.
  await openDetails(results, /^Character sheet/)
  for (const label of ['Spell damage', 'Spell crit', 'Spell hit', 'Intellect', 'Spirit', 'Mana', 'Mana per 5 s']) {
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
    // Protection's build since C3, read plainly: only this spec's is "(default)" (docs/ux.md "Talents").
    await expect(page.getByRole('option')).toHaveText(['Retribution (default)', 'Protection default', 'Protection popular build'])
    await page.keyboard.press('Escape')
    // About names the paladin, after the warriors and the druid (and before the rogue, since R1).
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /About/ }).click()
    await expect(page.getByRole('dialog').getByText(/^Covers Warriors: Fury, Arms and Protection · Druids: .+ · Paladins: Retribution and Protection( · .+)?\.$/)).toBeVisible()
  })

  test('its Rotation tab: the defaults’ note, the spec-wide settings above the priority list, the rune waiting for Buffs, and no warrior words', async ({ page }) => {
    await switchToRetribution(page)
    const tab = await openTab(page, 'Rotation')
    await expect(tab.getByText('The defaults were tuned on an earlier game build and had a quick search on this one.')).toBeVisible()
    // Juju Flurry and the mana consumables are spec-wide, above the list (D31), under Consumables as
    // every spec's; the on-use trinkets are a row of the list, as every spec's (UA-6).
    await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Consumables', 'Priority list'])
    const consumables = tab.getByRole('region', { name: 'Consumables' })
    await expect(consumables.getByRole('switch', { name: 'Major Mana Potion', exact: true })).toBeChecked()
    await expect(consumables.getByRole('switch', { name: 'Juju Flurry', exact: true })).toBeVisible()
    const list = tab.getByRole('list', { name: 'Priority list' })
    for (const name of ['Judgement', 'Holy Strike', 'Exorcism', 'Consecration', 'Consecration (Rank 1)', 'Hammer of Wrath', 'On-use trinkets']) {
      await expect(list.getByRole('switch', { name, exact: true })).toBeChecked()
    }
    await expect(list.locator('[data-apl-row="seal"]')).toContainText('Seal of Command · again with 1.5 s left')
    const prepull = await rowSettings(page, tab, 'Before the pull')
    await expect(prepull.scope.getByRole('switch', { name: 'Judgement of the Crusader', exact: true })).toBeChecked()
    await prepull.close()
    // The rune isn't in the Standard raid preset, so its row says so and links to Buffs.
    await expect(tab.getByText(/Not used: turn on Demonic Rune in/)).toBeVisible()
    await expect(tab).not.toContainText(OTHER_CLASS)
  })

  test('Exorcism waits for an Undead or Demon target, and its note opens Fight on the creature type (RU7)', async ({ page }) => {
    await switchToRetribution(page)
    const tab = await openTab(page, 'Rotation')
    await expect(tab.locator('[data-apl-row="exorcism"]')).toContainText('Not used: needs another creature type (Fight tab).')
    const exorcism = await rowSettings(page, tab, 'Exorcism')
    const note = exorcism.scope.getByText(/Not used: set Creature type to Undead or Demon in/)
    await expect(note).toBeVisible()
    await note.getByRole('button', { name: 'Fight' }).click()
    const fight = page.getByRole('tabpanel', { name: 'Fight' })
    const creature = fight.getByRole('combobox', { name: 'Creature type' })
    await expect(creature).toBeFocused()
    await page.keyboard.press('Enter')
    await page.getByRole('option', { name: 'Undead' }).click()
    await expect(creature).toHaveText('Undead')
    const rotation = await openTab(page, 'Rotation')
    await expect(rotation.locator('[data-apl-row="exorcism"]')).toContainText('Undead and Demons · from 20% mana')
  })

  test('Judgement of the Crusader’s bonus is an untested switch under Character → Advanced (RU1)', async ({ page }) => {
    await switchToRetribution(page)
    const character = await openTab(page, 'Character')
    await character.getByRole('button', { name: /^Advanced/ }).click()
    const bonus = character.getByRole('radiogroup', { name: 'Judgement of the Crusader’s bonus' })
    await expect(bonus.getByRole('radio', { name: 'A share' })).toBeChecked()
    await expect(bonus).toHaveAccessibleDescription(/Untested in Forever: how much of the \+161/)
    await bonus.getByRole('radio', { name: 'All of it' }).click()
    await expect(character.getByText(/Default: A share/)).toBeVisible()
    await character.getByRole('button', { name: /^Reset Judgement of the Crusader’s bonus/ }).click()
    await expect(bonus.getByRole('radio', { name: 'A share' })).toBeFocused()
    await expect(character.getByText(/Default: A share/)).toHaveCount(0)
    // With Judgement of the Crusader off in Rotation, it changes nothing, and says so.
    const rotation = await openTab(page, 'Rotation')
    await expect(rotation.getByText('Judgement of the Crusader’s bonus')).toHaveCount(0)
    const prepull = await rowSettings(page, rotation, 'Before the pull')
    await prepull.scope.getByRole('switch', { name: 'Judgement of the Crusader', exact: true }).click()
    await expect(rotation.locator('[data-apl-row="prepull"]')).toContainText('Your seal')
    await prepull.close()
    const again = await openTab(page, 'Character')
    await again.getByRole('button', { name: /^Advanced/ }).click()
    await expect(again.getByText('Not used: Judgement of the Crusader is off in Rotation.')).toBeVisible()
  })

  test('its own Judgement of the Crusader makes the Buffs tab’s, another paladin’s, its own (T2)', async ({ page }) => {
    await switchToRetribution(page)
    const buffs = await openTab(page, 'Buffs')
    const jotc = buffs.getByRole('switch', { name: 'Judgement of the Crusader', exact: true })
    await expect(jotc).toBeChecked()
    await expect(jotc).toBeDisabled()
    await expect(jotc).toHaveAccessibleDescription(/You keep it up yourself \(see Rotation\), so it isn’t added twice\./)
    const rotation = await openTab(page, 'Rotation')
    const prepull = await rowSettings(page, rotation, 'Before the pull')
    await prepull.scope.getByRole('switch', { name: 'Judgement of the Crusader', exact: true }).click()
    await prepull.close()
    const again = await openTab(page, 'Buffs')
    const off = again.getByRole('switch', { name: 'Judgement of the Crusader', exact: true })
    await expect(off).not.toBeChecked()
    await expect(off).toHaveAccessibleDescription(/You’re not keeping it up \(see Rotation\); turn this on if another paladin does\./)
  })

  test('a warrior’s Character tab has no Judgement of the Crusader rule', async ({ page }) => {
    await page.goto('./')
    const character = await openTab(page, 'Character')
    await character.getByRole('button', { name: /^Advanced/ }).click()
    await expect(character.getByText('Count untested ratings')).toBeVisible()
    await expect(character.getByText('Judgement of the Crusader’s bonus')).toHaveCount(0)
  })

  test('with no other paladin in the raid, the other blessings need one, and your own Might is still yours to switch (RU9)', async ({ page }) => {
    await switchToRetribution(page)
    const buffs = await openTab(page, 'Buffs')
    await buffs.getByRole('button', { name: 'Paladin', exact: true }).click()
    await expect(buffs.getByRole('switch', { name: 'Blessing of Kings' })).toBeDisabled()
    await expect(buffs.getByRole('switch', { name: 'Blessing of Kings' })).toHaveAccessibleDescription('Needs another paladin in the raid')
    // You bless yourself with Might, as a druid gives itself Mark of the Wild: on, and yours to turn off.
    const might = buffs.getByRole('switch', { name: 'Blessing of Might' })
    await expect(might).toBeChecked()
    await expect(might).toBeEnabled()
    await expect(might).toHaveAccessibleDescription('+133 attack power')
    await might.click()
    await expect(might).not.toBeChecked()
    // The Standard raid preset without a paladin still blesses you with Might.
    await buffs.getByRole('radio', { name: /^Standard raid/ }).click()
    await expect(might).toBeChecked()
    await expect(buffs.getByRole('switch', { name: 'Blessing of Kings' })).not.toBeChecked()
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
    for (const name of ['Prayer of Spirit', 'Arcane Brilliance', 'Blessing of Wisdom', 'Mana Spring Totem', 'Greater Arcane Elixir', 'Major Mana Potion']) await expect(buffs.getByRole('switch', { name })).toBeChecked()
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
    expect(url).toContain('/#s=')

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
    // Every number fits its field, its unit after it, never over it: a grouped mana value too
    // ("1,500 mana", RU6), as rotation-tab.spec.ts checks the other specs' (CU1). The consumables'
    // limits are spec-wide; the rows' thresholds are in their sheets (below).
    for (const button of await tab.getByRole('button', { name: /^Advanced settings for/ }).all()) await button.click()
    await expect(tab.getByRole('textbox', { name: 'Major Mana Potion early, when missing', exact: true })).toHaveValue('1,500')
    const fields = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-slot="input-group"]')]
        .filter((g) => g.offsetParent !== null)
        .map((group) => {
          const input = group.querySelector('input')!
          const unit = group.querySelector<HTMLElement>('[data-slot="input-group-addon"]')!
          return { name: input.getAttribute('aria-label'), fits: input.scrollWidth <= input.clientWidth, clear: unit.getBoundingClientRect().left >= input.getBoundingClientRect().right - 1 }
        }),
    )
    expect(fields.length).toBeGreaterThanOrEqual(4)
    for (const f of fields) expect(f, f.name ?? '').toMatchObject({ fits: true, clear: true })
    expect(await overflow(), 'no horizontal page scroll with Advanced open').toBeLessThanOrEqual(0)
    // A row's threshold in its sheet, the same way.
    const consecration = await rowSettings(page, tab, 'Consecration')
    const threshold = consecration.scope.getByRole('textbox', { name: 'Consecration from', exact: true })
    await expect(threshold).toHaveValue('20')
    const box = await threshold.evaluate((input) => ({ fits: input.scrollWidth <= input.clientWidth }))
    expect(box.fits).toBe(true)
    await consecration.close()

    await simulate(page)
    const bar = page.getByRole('button', { name: 'Show results' })
    await expect(bar).toContainText(/DPS\s*\d[\d,]*\.\d/)
    await bar.click()
    const sheet = page.getByRole('dialog', { name: 'Results' })
    await expectRetributionResult(sheet)
    expect(await overflow(), 'no horizontal page scroll').toBeLessThanOrEqual(0)
  })
})
