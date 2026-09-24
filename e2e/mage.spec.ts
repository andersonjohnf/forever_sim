import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The mage (docs/classes/mage.md), shipped in K2: Fire, Frost and Arcane in the switcher, their
// Rotation tabs (the common priority, D27), runs whose results say how their spells, Ignite and mana
// went, the caster's character sheet (spell damage by school), and a share link that brings a mage
// back, on a desktop and on a phone (docs/ux.md). Nothing on a mage's screens may speak another class.

/** Warrior, druid, paladin, shaman or rogue words a mage screen must never show. */
const OTHER_CLASS = /\brage\b|\bstances?\b|Enrage|Energy|combo point|Cat Form|Bear Form|Seal of|Judgement|Consecration|Stormstrike|Maelstrom/i

/** A value with its ± 95% CI in the headline, e.g. "549.4± 1.4". */
const VALUE_WITH_CI = /\d[\d,]*\.\d\s*± \d[\d,]*\.\d/

/** A threshold's value: the first-pass defaults may move with tuning (D27), so only its form is checked. */
const NUMBER = /^\d[\d,]*$/

type MageSpec = 'Fire' | 'Frost' | 'Arcane'

const specButton = (spec: MageSpec) => new RegExp(`^Spec: ${spec} Mage`)

async function switchToMage(page: Page, spec: MageSpec) {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('group', { name: 'Mage' }).getByRole('menuitem', { name: new RegExp(`^${spec}`) }).click()
  await expect(page.getByRole('button', { name: specButton(spec) })).toBeVisible()
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

/** Opens every heading's Advanced thresholds on the Rotation tab. */
async function openAdvanced(tab: Locator) {
  for (const button of await tab.getByRole('button', { name: /^Advanced settings for/ }).all()) {
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click()
  }
}

async function noSideScroll(page: Page, what = 'no horizontal page scroll') {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, what).toBeLessThanOrEqual(0)
}

/** Makes sure the Major Mana Potion is selected in Buffs, whatever the preset brings. */
async function drinkPotions(page: Page) {
  const buffs = await openTab(page, 'Buffs')
  const potion = buffs.getByRole('switch', { name: 'Major Mana Potion' })
  if ((await potion.getAttribute('aria-checked')) !== 'true') await potion.click()
  await expect(potion).toBeChecked()
}

/** The number field's row, dimmed when what it tunes doesn't apply. */
const inactiveField = (tab: Locator, name: string) => tab.locator('[data-inactive]').filter({ has: tab.page().getByRole('textbox', { name, exact: true }) })

/** The settings every mage shares: Evocation, the mana gems, the potion and the rune. */
async function expectSharedRotation(tab: Locator) {
  await expect(tab.getByText(/^Which abilities the sim uses, and when\. The defaults are the common priority\.$/)).toBeVisible()
  for (const name of ['Racial cooldown', 'On-use trinkets', 'Evocation', 'Mana gems']) {
    await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
  }
  await expect(tab.getByRole('switch', { name: 'Major Mana Potion', exact: true })).toBeVisible()
  // The rune waits for the Buffs tab, where the Standard raid preset leaves it off.
  await expect(tab.getByRole('switch', { name: 'Demonic Rune', exact: true })).toHaveAccessibleDescription(/Not used: turn on Demonic Rune in Buffs first/)
  await openAdvanced(tab)
  await expect(tab.getByRole('textbox', { name: 'Evocation at', exact: true })).toHaveValue(NUMBER)
  await expect(tab.getByRole('textbox', { name: 'Major Mana Potion when missing', exact: true })).toHaveValue(NUMBER)
  await expect(tab).not.toContainText(OTHER_CLASS)
}

/** What the Fire Rotation tab shows by default, at any width. */
async function expectFireRotation(tab: Locator) {
  await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Cooldowns and buffs', 'Core abilities', 'Consumables'])
  for (const name of ['Combustion', 'Scorch for Fire Vulnerability', 'Pyroblast on Hot Streak', 'Fire Blast']) {
    await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
  }
  await expectSharedRotation(tab)
  await expect(tab.getByRole('textbox', { name: 'Scorch again with', exact: true })).toHaveValue(NUMBER)
  await expect(tab.getByRole('textbox', { name: 'Pyroblast at', exact: true })).toHaveValue(NUMBER)
}

/** What a Fire run must show, in the desktop panel or the phone's sheet. */
async function expectFireResult(results: Locator) {
  await expect(results.getByRole('group', { name: 'DPS' })).toContainText(VALUE_WITH_CI)
  const breakdown = results.getByRole('region', { name: 'Damage by ability' })
  for (const name of ['Fireball', 'Scorch', 'Ignite', 'Fire Blast']) {
    await expect(breakdown.getByText(name, { exact: true })).toBeVisible()
  }
  // No melee swings: a mage casts.
  await expect(breakdown.getByText('Main hand', { exact: true })).toHaveCount(0)
  await expectManaLedger(results)
  await expectCasterSheet(results, 'Fire')
  await expect(results).not.toContainText(OTHER_CLASS)
}

/** Mana per fight: the ledger from the pull to the end, with the Mana Ruby and the potion, and no paladin lines. */
async function expectManaLedger(results: Locator) {
  const mana = results.getByRole('region', { name: 'Mana per fight' })
  for (const label of ['At the pull', 'Regenerated', 'Mana Ruby', 'Major Mana Potion', 'Spent', 'Left at the end']) {
    await expect(mana.getByText(label, { exact: true })).toBeVisible()
  }
  await expect(mana).toContainText(/Regenerated\s*\+[\d,]+/)
  await expect(mana).toContainText(/Mana Ruby\s*\+[\d,]+/)
  await expect(mana).toContainText(/Spent\s*−[\d,]+/)
  await expect(mana.getByText('Sanctified Judgement')).toHaveCount(0)
}

/** The caster's character sheet: spell damage, its school's own line, crit, hit, casting speed and mana. */
async function expectCasterSheet(results: Locator, school: string) {
  await openDetails(results, /^Character sheet/)
  for (const label of ['Spell damage', `${school} damage`, 'Spell crit', 'Spell hit', 'Casting speed', 'Intellect', 'Spirit', 'Mana', 'Mana per 5 s']) {
    await expect(results.getByText(label, { exact: true })).toBeVisible()
  }
  // No melee lines on a caster's sheet.
  await expect(results.getByText('Attack power', { exact: true })).toHaveCount(0)
}

test.describe('Mage', () => {
  test('Fire, Frost and Arcane are in the switcher under Mage, each switches, and About names the Mages', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: / }).click()
    await expect(page.getByRole('group', { name: 'Mage' }).getByRole('menuitem')).toHaveText([/^Fire\s*DPS$/, /^Frost\s*DPS$/, /^Arcane\s*DPS$/])
    await page.keyboard.press('Escape')
    for (const spec of ['Fire', 'Frost', 'Arcane'] as const) {
      await page.getByRole('button', { name: /^Spec: / }).click()
      await page.getByRole('group', { name: 'Mage' }).getByRole('menuitem', { name: new RegExp(`^${spec}`) }).click()
      await expect(page.getByRole('button', { name: specButton(spec) })).toBeVisible()
      const talents = await openTab(page, 'Talents')
      await expect(talents.getByRole('combobox', { name: 'Talent build presets' })).toHaveText(`${spec} (default)`)
    }
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /About/ }).click()
    await expect(page.getByRole('dialog').getByText(/^Covers .+ · Mages: Fire, Frost and Arcane( · .+)?\.$/)).toBeVisible()
  })

  test('Fire’s Rotation tab: the common priority, Combustion, Scorch, Pyroblast and Fire Blast, and the mana settings', async ({ page }) => {
    await switchToMage(page, 'Fire')
    const tab = await openTab(page, 'Rotation')
    await expectFireRotation(tab)
    // "Scorch again with" follows its switch: dimmed while Scorch is off, live again when it's back on.
    const scorch = tab.getByRole('switch', { name: 'Scorch for Fire Vulnerability', exact: true })
    await expect(inactiveField(tab, 'Scorch again with')).toHaveCount(0)
    await scorch.click()
    await expect(scorch).not.toBeChecked()
    await expect(inactiveField(tab, 'Scorch again with')).toHaveCount(1)
    await scorch.click()
    await expect(inactiveField(tab, 'Scorch again with')).toHaveCount(0)
    // Evocation's threshold follows Evocation's switch too.
    await expect(inactiveField(tab, 'Evocation at')).toHaveCount(0)
    await tab.getByRole('switch', { name: 'Evocation', exact: true }).click()
    await expect(inactiveField(tab, 'Evocation at')).toHaveCount(1)
  })

  test('the potion and the Demonic Rune apply once they’re selected in Buffs', async ({ page }) => {
    await switchToMage(page, 'Fire')
    let tab = await openTab(page, 'Rotation')
    await openAdvanced(tab)
    // Until the rune is selected, its threshold is dimmed with it.
    await expect(inactiveField(tab, 'Demonic Rune when missing')).toHaveCount(1)
    await drinkPotions(page)
    const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
    await buffs.getByRole('switch', { name: 'Demonic Rune' }).click()
    await expect(buffs.getByRole('switch', { name: 'Demonic Rune' })).toBeChecked()
    tab = await openTab(page, 'Rotation')
    for (const name of ['Major Mana Potion', 'Demonic Rune']) {
      const consumable = tab.getByRole('switch', { name, exact: true })
      await expect(consumable).toBeChecked()
      await expect(consumable).toBeEnabled()
      await expect(consumable).not.toHaveAccessibleDescription(/Not used/)
    }
    await openAdvanced(tab)
    await expect(tab.getByRole('textbox', { name: 'Demonic Rune when missing', exact: true })).toHaveValue(NUMBER)
    await expect(inactiveField(tab, 'Demonic Rune when missing')).toHaveCount(0)
  })

  test('Frost’s and Arcane’s Rotation tabs: their cooldowns and the shared mana settings', async ({ page }) => {
    await switchToMage(page, 'Frost')
    let tab = await openTab(page, 'Rotation')
    await expect(tab.getByRole('switch', { name: 'Presence of Mind', exact: true })).toBeVisible()
    // Ice Barrier's shield does nothing here (the sim deals you no damage), so it starts off.
    await expect(tab.getByRole('switch', { name: 'Ice Barrier', exact: true })).not.toBeChecked()
    await expect(tab.getByRole('switch', { name: 'Combustion', exact: true })).toHaveCount(0)
    await expectSharedRotation(tab)

    await page.getByRole('button', { name: /^Spec: / }).click()
    await page.getByRole('group', { name: 'Mage' }).getByRole('menuitem', { name: /^Arcane/ }).click()
    await expect(page.getByRole('button', { name: specButton('Arcane') })).toBeVisible()
    tab = await openTab(page, 'Rotation')
    for (const name of ['Arcane Power', 'Presence of Mind']) await expect(tab.getByRole('switch', { name, exact: true })).toBeChecked()
    await expect(tab.getByRole('switch', { name: 'Ice Barrier', exact: true })).toHaveCount(0)
    await expectSharedRotation(tab)
  })

  test('a Fire run: Fireball, Scorch, Ignite, the mana ledger and spell damage by school', async ({ page }) => {
    await switchToMage(page, 'Fire')
    await drinkPotions(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await simulate(results)
    await expectFireResult(results)
  })

  test('a Frost run: Frostbolt, the mana ledger and Frost spell damage', async ({ page }) => {
    await switchToMage(page, 'Frost')
    await drinkPotions(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await simulate(results)
    await expect(results.getByRole('group', { name: 'DPS' })).toContainText(VALUE_WITH_CI)
    const breakdown = results.getByRole('region', { name: 'Damage by ability' })
    await expect(breakdown.getByText('Frostbolt', { exact: true })).toBeVisible()
    await expect(breakdown.getByText('Ignite', { exact: true })).toHaveCount(0)
    await expectManaLedger(results)
    await expectCasterSheet(results, 'Frost')
    await expect(results).not.toContainText(OTHER_CLASS)
  })

  test('a share link brings back the Fire mage with its rotation settings', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await switchToMage(page, 'Fire')
    const tab = await openTab(page, 'Rotation')
    await tab.getByRole('switch', { name: 'Fire Blast', exact: true }).click()
    await expect(tab.getByRole('switch', { name: 'Fire Blast', exact: true })).not.toBeChecked()
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const url = await page.evaluate(() => navigator.clipboard.readText())
    expect(url).toContain('/forever_sim/#s=')

    // A fresh browser that has only ever seen the Fury warrior.
    const other = await (await context.browser()!.newContext()).newPage()
    await other.route('https://wow.zamimg.com/**', (route) => route.fulfill({ status: 204 }))
    await other.goto(url)
    await expect(other.getByText('Loaded a shared setup')).toBeVisible()
    await expect(other.getByRole('button', { name: specButton('Fire') })).toBeVisible()
    await other.getByRole('tab', { name: 'Rotation', exact: true }).click()
    const shared = other.getByRole('tabpanel', { name: 'Rotation' })
    await expect(shared.getByRole('switch', { name: 'Fire Blast', exact: true })).not.toBeChecked()
    await expect(shared.getByRole('switch', { name: 'Combustion', exact: true })).toBeChecked()
    expect(new URL(other.url()).hash).toBe('')
    await other.context().close()
  })
})

test.describe('Mage on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('switches to Fire, shows its Rotation tab without sideways scroll, and runs to a result in the sheet', async ({ page }) => {
    await switchToMage(page, 'Fire')
    const tab = await openTab(page, 'Rotation')
    await noSideScroll(page)
    await expectFireRotation(tab)
    // Every number fits its field, its unit after it, never over it ("2,250 mana", "5 s left").
    const fields = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-slot="input-group"]')]
        .filter((g) => g.offsetParent !== null)
        .map((group) => {
          const input = group.querySelector('input')!
          const unit = group.querySelector<HTMLElement>('[data-slot="input-group-addon"]')!
          return { name: input.getAttribute('aria-label'), fits: input.scrollWidth <= input.clientWidth, clear: unit.getBoundingClientRect().left >= input.getBoundingClientRect().right - 1 }
        }),
    )
    expect(fields.length).toBeGreaterThanOrEqual(5)
    for (const f of fields) expect(f, f.name ?? '').toMatchObject({ fits: true, clear: true })
    await noSideScroll(page, 'no horizontal page scroll with Advanced open')

    await drinkPotions(page)
    await simulate(page)
    const bar = page.getByRole('button', { name: 'Show results' })
    await expect(bar).toContainText(/DPS\s*\d[\d,]*\.\d/)
    await bar.click()
    const sheet = page.getByRole('dialog', { name: 'Results' })
    await expectFireResult(sheet)
    await noSideScroll(page)
  })

  test('switches to Arcane and Frost, their Rotation tabs without sideways scroll', async ({ page }) => {
    for (const spec of ['Arcane', 'Frost'] as const) {
      await switchToMage(page, spec)
      const tab = await openTab(page, 'Rotation')
      await expect(tab.getByRole('switch', { name: 'Presence of Mind', exact: true })).toBeVisible()
      await expectSharedRotation(tab)
      await noSideScroll(page, `${spec}: no horizontal page scroll`)
    }
  })
})
