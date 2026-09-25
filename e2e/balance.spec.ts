import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The Balance druid (docs/classes/druid.md §11), shipped in K6: Balance in the switcher under Druid,
// its Rotation tab (the common priority, D27), a run whose results say how its spells and mana went,
// the caster's character sheet, and a share link that brings it back, on a desktop and on a phone
// (docs/ux.md). Nothing on a Balance screen may speak a feral's or another class's resources.

/** Words a Balance screen must never show: a feral's or another class's. */
const OTHER = /\brage\b|\bstances?\b|Energy|combo point|Cat Form|Bear Form|Shred|Maul|Seal of|Judgement|Stormstrike|Evocation|Main hand/i

/** A value with its ± 95% CI in the headline, e.g. "425.7± 1.1". */
const VALUE_WITH_CI = /\d[\d,]*\.\d\s*± \d[\d,]*\.\d/

/** A threshold's value: the first-pass defaults may move with tuning (D27), so only its form is checked. */
const NUMBER = /^\d[\d,]*$/

const SPEC_BUTTON = /^Spec: Balance Druid/

async function switchToBalance(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('group', { name: 'Druid' }).getByRole('menuitem', { name: /^Balance/ }).click()
  await expect(page.getByRole('button', { name: SPEC_BUTTON })).toBeVisible()
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

async function openAdvanced(tab: Locator) {
  for (const button of await tab.getByRole('button', { name: /^Advanced settings for/ }).all()) {
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click()
  }
}

async function noSideScroll(page: Page, what = 'no horizontal page scroll') {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, what).toBeLessThanOrEqual(0)
}

/** What the Balance Rotation tab shows by default, at any width: its priority list (D31, druid.md §11.5 "Balance's priority list"). */
async function expectRotation(tab: Locator) {
  await expect(tab.getByText(/^Which abilities the sim uses, and when\. The defaults are the common priority/)).toBeVisible()
  await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Consumables', 'Priority list'])
  const list = tab.getByRole('list', { name: 'Priority list' })
  const row = (id: string) => list.locator(`[data-apl-row="${id}"]`)
  for (const name of ['Innervate yourself', 'Insect Swarm', 'Moonfire', 'Wrath for Eclipse']) {
    await expect(list.getByRole('switch', { name, exact: true })).toBeChecked()
  }
  await expect(tab.getByRole('switch', { name: 'Major Mana Potion', exact: true })).toBeChecked()
  // Faerie Fire is a duty that costs a moonkin damage: off by default.
  await expect(list.getByRole('switch', { name: 'Faerie Fire', exact: true })).not.toBeChecked()
  await expect(row('filler')).toContainText('Not used while “Wrath for Eclipse” is on')
  await expect(row('prepull')).toContainText('Moonkin Form')
  // The thresholds are their rows' own.
  await expect(row('innervate')).toContainText(/^Innervate yourselfAt or below \d+% mana$/)
  await expect(row('moonfire')).toContainText(/When it’s off the boss · while the fight has \d+ s left/)
  await openAdvanced(tab)
  await expect(tab.getByRole('textbox', { name: 'Major Mana Potion when missing', exact: true })).toHaveValue(NUMBER)
  await expect(tab).not.toContainText(OTHER)
}

/** What a Balance run must show, in the desktop panel or the phone's sheet. */
async function expectResult(results: Locator) {
  await expect(results.getByRole('group', { name: 'DPS' })).toContainText(VALUE_WITH_CI)
  const breakdown = results.getByRole('region', { name: 'Damage by ability' })
  for (const name of ['Starfire', 'Wrath', 'Insect Swarm', 'Moonfire', 'Moonfire (DoT)']) {
    await expect(breakdown.getByText(name, { exact: true })).toBeVisible()
  }
  // Moonfire's and Insect Swarm's ticks crit in Forever.
  await expect(breakdown).toContainText(/tick crit/)
  const mana = results.getByRole('region', { name: 'Mana per fight' })
  for (const label of ['At the pull', 'Regenerated', 'Major Mana Potion', 'Spent', 'Left at the end']) {
    await expect(mana.getByText(label, { exact: true })).toBeVisible()
  }
  await expect(mana).toContainText(/Spent\s*−[\d,]+/)
  await openDetails(results, /^Character sheet/)
  for (const label of ['Spell damage', 'Arcane damage', 'Spell crit', 'Spell hit', 'Casting speed', 'Intellect', 'Mana', 'Mana per 5 s']) {
    await expect(results.getByText(label, { exact: true })).toBeVisible()
  }
  await expect(results.getByText('Attack power', { exact: true })).toHaveCount(0)
  await expect(results).not.toContainText(OTHER)
}

test.describe('Balance druid', () => {
  test('Balance is in the switcher under Druid, its Talents preset is the default, and About names it', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: / }).click()
    await expect(page.getByRole('group', { name: 'Druid' }).getByRole('menuitem')).toHaveText([/^Feral \(Cat\)\s*DPS$/, /^Feral \(Bear\)\s*Tank$/, /^Balance\s*DPS$/])
    await page.keyboard.press('Escape')
    await switchToBalance(page)
    const talents = await openTab(page, 'Talents')
    await expect(talents.getByRole('combobox', { name: 'Talent build presets' })).toHaveText('Balance (default)')
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /About/ }).click()
    await expect(page.getByRole('dialog').getByText(/ · Druids: Feral \(Cat\), Feral \(Bear\) and Balance · /)).toBeVisible()
  })

  test('its Rotation tab: the common priority, the DoTs, Eclipse, Innervate and the potion', async ({ page }) => {
    await switchToBalance(page)
    const tab = await openTab(page, 'Rotation')
    await expectRotation(tab)
    // Turning Eclipse off makes the filler count.
    await tab.getByRole('switch', { name: 'Wrath for Eclipse', exact: true }).click()
    const filler = tab.locator('[data-apl-row="filler"]')
    await expect(filler).not.toContainText('Not used')
    await expect(filler).toContainText('Starfire')
  })

  test('its Buffs: the casters’ entries and its own Moonkin Aura, no attack power', async ({ page }) => {
    await switchToBalance(page)
    const buffs = await openTab(page, 'Buffs')
    await expect(buffs.getByRole('switch', { name: 'Arcane Brilliance' })).toBeChecked()
    await expect(buffs.getByRole('switch', { name: 'Moonkin Aura' })).toBeChecked()
    await expect(buffs.getByRole('switch', { name: 'Moonkin Aura' })).toBeDisabled()
    await expect(buffs.getByRole('switch', { name: 'Battle Shout' })).toHaveCount(0)
    await expect(buffs.getByRole('switch', { name: 'Leader of the Pack' })).toHaveCount(0)
  })

  test('a run: Starfire, Wrath, the DoTs, the mana ledger and spell damage by school', async ({ page }) => {
    await switchToBalance(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await simulate(results)
    await expectResult(results)
    // Clearcasting waits for a Starfire, Moonfire or Insect Swarm, not a Wrath: the next ability it makes free (BD1).
    await results.getByRole('button', { name: 'Cooldowns and buffs' }).click()
    const clearcasting = results.getByRole('table').getByRole('row', { name: /^Clearcasting \d+\.\d a fight, each spent by the next ability it makes free \d+\.\d% none$/ })
    await expect(clearcasting).toBeVisible()
  })

  test('a share link brings back the Balance druid with its rotation settings', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await switchToBalance(page)
    const tab = await openTab(page, 'Rotation')
    await tab.getByRole('switch', { name: 'Faerie Fire', exact: true }).click()
    await expect(tab.getByRole('switch', { name: 'Faerie Fire', exact: true })).toBeChecked()
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const url = await page.evaluate(() => navigator.clipboard.readText())
    expect(url).toContain('/#s=')

    const other = await (await context.browser()!.newContext()).newPage()
    await other.route('https://wow.zamimg.com/**', (route) => route.fulfill({ status: 204 }))
    await other.goto(url)
    await expect(other.getByText('Loaded a shared setup')).toBeVisible()
    await expect(other.getByRole('button', { name: SPEC_BUTTON })).toBeVisible()
    await other.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const shared = other.getByRole('tabpanel', { name: 'Rotation' })
    await expect(shared.getByRole('switch', { name: 'Faerie Fire', exact: true })).toBeChecked()
    await expect(shared.getByRole('switch', { name: 'Moonfire', exact: true })).toBeChecked()
    await other.context().close()
  })
})

test.describe('Balance druid on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('switches to Balance, shows its Rotation tab without sideways scroll, and runs to a result in the sheet', async ({ page }) => {
    await switchToBalance(page)
    const tab = await openTab(page, 'Rotation')
    await noSideScroll(page)
    await expectRotation(tab)
    await noSideScroll(page, 'no horizontal page scroll with Advanced open')
    await simulate(page)
    const bar = page.getByRole('button', { name: 'Show results' })
    await expect(bar).toContainText(/DPS\s*\d[\d,]*\.\d/)
    await bar.click()
    const sheet = page.getByRole('dialog', { name: 'Results' })
    await expectResult(sheet)
    await noSideScroll(page)
  })
})
