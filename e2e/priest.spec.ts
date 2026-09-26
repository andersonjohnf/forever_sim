import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The Shadow Priest (docs/classes/priest.md), shipped in K4: the switcher, its Talents preset, its
// Rotation tab (the common priority, Shadowform always on, the racial spells another race doesn't
// have), a run whose results show its spells and mana, and a share link that brings it back, on a
// desktop and on a phone (docs/ux.md). Nothing on a priest's screens may speak rage, stances or melee.

/** Words a priest screen must never show. */
const OTHER_CLASS = /\brage\b|\bstances?\b|Energy|combo point|Cat Form|Bear Form|Seal of|Judgement|Main hand|Off hand|Auto attack/i

/** A value with its ± 95% CI in the headline, e.g. "522.5± 1.0". */
const VALUE_WITH_CI = /\d[\d,]*\.\d\s*± \d[\d,]*\.\d/

const SPEC = /^Spec: Shadow Priest/

async function switchToPriest(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('group', { name: 'Priest' }).getByRole('menuitem', { name: /Shadow/ }).click()
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

async function openDetails(scope: Locator, title: RegExp) {
  const trigger = scope.getByRole('button', { name: title })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
}

async function noSideScroll(page: Page, what = 'no horizontal page scroll') {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, what).toBeLessThanOrEqual(0)
}

/** What the Rotation tab shows by default (a Troll), at any width: the priority list (D31; priest-priority-list.spec.ts moves its rows). */
async function expectDefaultRotation(tab: Locator) {
  await expect(
    tab.getByText('Which abilities the sim uses, and when. The defaults are the common priority, with a first quick search; they aren’t tuned yet.', { exact: true }),
  ).toBeVisible()
  // The mana consumables sit above the list, under their heading; Power Infusion is a row.
  await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Consumables', 'Priority list'])
  const list = tab.getByRole('list', { name: 'Priority list' })
  // Shadowform is the pinned row before the pull: always on, no switch.
  await expect(list.locator('[data-apl-row="prepull"]')).toContainText('Shadowform')
  await expect(list.locator('[data-apl-row="prepull"]').getByRole('switch')).toHaveCount(0)
  for (const name of ['Racial cooldown', 'On-use trinkets', 'Inner Focus', 'Shadow Word: Pain', 'Devouring Plague', 'Mind Blast', 'Mind Flay']) {
    await expect(list.getByRole('switch', { name, exact: true })).toBeChecked()
  }
  await expect(tab.getByRole('switch', { name: 'Major Mana Potion', exact: true })).toBeChecked()
  await expect(list.getByRole('switch', { name: 'Vampiric Embrace', exact: true })).not.toBeChecked()
  // A Troll has neither the Night Elf's Starshards nor the Undead's Dark Sacrifice.
  await expect(list.getByRole('switch', { name: 'Starshards', exact: true })).toHaveAccessibleDescription(/Not used: only Night Elf priests have Starshards, not Troll\./)
  await expect(list.getByRole('switch', { name: 'Dark Sacrifice', exact: true })).toHaveAccessibleDescription(/Not used: only Undead priests have Dark Sacrifice, not Troll\./)
  // Power Infusion waits for another priest's, in Buffs.
  await expect(tab.getByRole('switch', { name: 'Power Infusion', exact: true })).toHaveAccessibleDescription(/Not used: turn on Power Infusion in Buffs first/)
  // The rows' own settings, in their summaries.
  await expect(list.locator('[data-apl-row="mindFlay"]')).toContainText('Filler · 3 ticks')
  await expect(list.locator('[data-apl-row="devouringPlague"]')).toContainText('On cooldown · until 6 s left')
  await expect(tab).not.toContainText(OTHER_CLASS)
}

/** What a Shadow run must show, in the desktop panel or the phone's sheet. */
async function expectPriestResult(results: Locator) {
  await expect(results.getByRole('group', { name: 'DPS' })).toContainText(VALUE_WITH_CI)
  const breakdown = results.getByRole('region', { name: 'Damage by ability' })
  for (const name of ['Mind Flay', 'Mind Blast', 'Shadow Word: Pain', 'Devouring Plague']) {
    await expect(breakdown.getByText(name, { exact: true })).toBeVisible()
  }
  // It casts from range: no swings.
  await expect(breakdown.getByText('Main hand', { exact: true })).toHaveCount(0)
  await expect(breakdown.getByText(/tick crit/).first()).toBeVisible()
  const mana = results.getByRole('region', { name: 'Mana per fight' })
  for (const label of ['At the pull', 'Regenerated', 'Major Mana Potion', 'Spent', 'Left at the end']) await expect(mana.getByText(label, { exact: true })).toBeVisible()
  await expect(mana).toContainText(/Spent\s*−[\d,]+/)
  await openDetails(results, /^Cooldowns and buffs/)
  const cooldowns = results.getByRole('table')
  for (const name of ['Berserking', 'Inner Focus', 'Shadow Weaving']) {
    await expect(cooldowns.getByRole('rowheader', { name: new RegExp(`^${name}`) })).toBeVisible()
  }
  // The caster's character sheet: spell damage, Shadow's own, and mana.
  await openDetails(results, /^Character sheet/)
  for (const label of ['Spell damage', 'Shadow damage', 'Spell crit', 'Spell hit', 'Casting speed', 'Intellect', 'Spirit', 'Mana', 'Mana per 5 s']) {
    await expect(results.getByText(label, { exact: true })).toBeVisible()
  }
  await openDetails(results, /^Assumptions \(\d+\)$/)
  await expect(results.getByRole('heading', { name: 'Priest mechanics' })).toBeVisible()
  await expect(results.getByText(/^Shadow Weaving is a debuff on the boss that raises only your Shadow damage/)).toBeVisible()
  await expect(results.getByText(/^Shadowfiend isn’t simulated/)).toBeVisible()
  await expect(results).not.toContainText(OTHER_CLASS)
}

test.describe('Shadow Priest', () => {
  test('is in the switcher under Priest, a Troll with its default build in the Talents preset menu, and About names it', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: / }).click()
    const shadow = page.getByRole('group', { name: 'Priest' }).getByRole('menuitem', { name: /Shadow/ })
    await expect(shadow).toContainText('DPS')
    await shadow.click()
    await expect(page.getByRole('button', { name: SPEC })).toBeVisible()

    await openTab(page, 'Character')
    await expect(page.getByRole('radio', { name: /Troll/ })).toHaveAttribute('aria-checked', 'true')
    const gear = await openTab(page, 'Gear')
    // Mindfang leads the list's main hand (priest.md §7.5): its +30 spell power (Classic Era's) and
    // Forever's crit rating pass the guide's Scepter of the Unholy.
    await expect(gear.getByRole('button', { name: 'Main hand: Mindfang' })).toBeVisible()
    await expect(gear.getByRole('button', { name: 'Ranged: Skul’s Ghastly Touch' }).or(gear.getByRole('button', { name: "Ranged: Skul's Ghastly Touch" }))).toBeVisible()

    const talents = await openTab(page, 'Talents')
    const presets = talents.getByRole('combobox', { name: 'Talent build presets' })
    await expect(presets).toHaveText('Shadow (default)')
    await expect(page.getByText('20 / 0 / 31')).toBeVisible()

    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /About/ }).click()
    await expect(page.getByRole('dialog').getByText(/ · Priests: Shadow( · .+)?\.$/)).toBeVisible()
  })

  test('its Rotation tab: the common priority as a priority list, Shadowform pinned first, and the other races’ spells marked unused', async ({ page }) => {
    await switchToPriest(page)
    await expectDefaultRotation(await openTab(page, 'Rotation'))
  })

  test('its Buffs tab offers no melee buffs, and has its caster entries and the Shadow elixir on', async ({ page }) => {
    await switchToPriest(page)
    const buffs = await openTab(page, 'Buffs')
    for (const name of ['Battle Shout', 'Windfury Totem', 'Sunder Armor ×5']) await expect(buffs.getByRole('switch', { name })).toHaveCount(0)
    for (const name of ['Arcane Brilliance', 'Moonkin Aura', 'Curse of the Elements', 'Elixir of Shadow Power']) await expect(buffs.getByRole('switch', { name })).toBeChecked()
  })

  test('a run reads as a priest’s: its spells, Shadow Weaving, and mana', async ({ page }) => {
    await switchToPriest(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await simulate(results)
    await expectPriestResult(results)
  })

  test('a share link brings back the priest with its rotation settings', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await switchToPriest(page)
    const tab = await openTab(page, 'Rotation')
    await tab.getByRole('switch', { name: 'Devouring Plague', exact: true }).click()
    await tab.getByRole('switch', { name: 'Vampiric Embrace', exact: true }).click()
    await expect(tab.getByRole('switch', { name: 'Devouring Plague', exact: true })).not.toBeChecked()
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const url = await page.evaluate(() => navigator.clipboard.readText())
    expect(url).toContain('/#s=')

    const other = await (await context.browser()!.newContext()).newPage()
    await other.route('https://wow.zamimg.com/**', (route) => route.fulfill({ status: 204 }))
    await other.goto(url)
    await expect(other.getByText('Loaded a shared setup')).toBeVisible()
    await expect(other.getByRole('button', { name: SPEC })).toBeVisible()
    await other.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const shared = other.getByRole('tabpanel', { name: 'Rotation' })
    await expect(shared.getByRole('switch', { name: 'Devouring Plague', exact: true })).not.toBeChecked()
    await expect(shared.getByRole('switch', { name: 'Vampiric Embrace', exact: true })).toBeChecked()
    await expect(shared.getByRole('switch', { name: 'Mind Blast', exact: true })).toBeChecked()
    expect(new URL(other.url()).hash).toBe('')
    await other.context().close()
  })
})

test.describe('Shadow Priest on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('switches to it, shows its Rotation tab without sideways scroll, and runs to a result in the sheet', async ({ page }) => {
    await switchToPriest(page)
    const tab = await openTab(page, 'Rotation')
    await noSideScroll(page)
    await expectDefaultRotation(tab)
    await noSideScroll(page, 'no horizontal page scroll with Advanced open')

    await simulate(page)
    const bar = page.getByRole('button', { name: 'Show results' })
    await expect(bar).toContainText(/DPS\s*\d[\d,]*\.\d/)
    await bar.click()
    const sheet = page.getByRole('dialog', { name: 'Results' })
    await expectPriestResult(sheet)
    await noSideScroll(page)
  })
})
