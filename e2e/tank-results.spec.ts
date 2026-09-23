import { deflateRawSync } from 'node:zlib'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// Tank specs report TPS and DPS as equals (decision D18), beside the damage the boss's swings
// cost them. Protection, the first tank, ships (P2), so these tests load it from a plain share
// link (#s=…, deflated JSON; see docs/ux.md#persistence-and-sharing) for the default Protection
// warrior, as a visitor would.
const shareLink = (spec: string) => `./#s=${deflateRawSync(JSON.stringify({ version: 1, spec })).toString('base64url')}`
const PROTECTION = shareLink('warrior-protection')

/** A value with its ± 95% CI, e.g. "212.9± 0.5" in the text of a headline group. */
const VALUE_WITH_CI = /\d[\d,]*\.\d\s*± \d[\d,]*\.\d/
/** …followed by a change from the previous run: a sign and a value. */
const WITH_CHANGE = /± \d[\d,]*\.\d\s*[+−]\d[\d,]*\.\d/
/** The boss's outcomes, in its table's roll order (docs/mechanics/combat-tables.md#8-boss--player-tanks). */
const OUTCOMES = ['Miss', 'Dodge', 'Parry', 'Block', 'Crit', 'Crushing', 'Normal hit']
/** What a screen reader hears of a change from the last run (docs/ux.md#results). */
const HEARD_CHANGE = /^(up|down) [\d,]+\.\d from the last run, (better|worse)$/
/** The section after the breakdown with the boss's swings as they landed. */
const LANDED = 'How the boss’s swings landed'

async function openProtection(page: Page) {
  await page.goto(PROTECTION)
  await expect(page.getByText('Loaded a shared setup')).toBeVisible()
  await expect(page.getByRole('button', { name: /Spec: Protection Warrior/ })).toBeVisible()
}

async function simulate(scope: Locator | Page) {
  await scope.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
  await expect(scope.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
}

/** A share in the results, "12.3%", as a number. */
const pct = (text: string | null) => Number(/(\d+\.\d)%/.exec(text ?? '')![1])

/** The seven outcomes a list or table shows, as [label, share] in its order. */
async function outcomes(items: Locator): Promise<[string, number][]> {
  return (await items.allTextContents()).map((text) => [/^[A-Za-z ]*[A-Za-z]/.exec(text.trim())![0], pct(text)])
}

/** A regex matching exactly this text. */
function exactly(text: string) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped}$`)
}

/** Weakens the boss: every swing at 4,500, the bottom of the default range (Fight → Advanced). */
async function weakenBoss(page: Page) {
  await page.getByRole('tab', { name: 'Fight', exact: true }).click()
  await page.getByRole('button', { name: 'Advanced' }).click()
  const max = page.getByRole('textbox', { name: 'Maximum damage per swing' })
  // Focused first, as a person would: focusing swaps "5,500" for "5500" (docs/ux.md, Fight).
  await max.focus()
  await max.fill('4500')
  await max.press('Enter')
  await expect(max).toHaveValue('4500')
}

test.describe('tank results', () => {
  test('headline TPS and DPS side by side, each with its CI and its own change', async ({ page }) => {
    await openProtection(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    const tps = results.getByRole('group', { name: 'TPS' })
    const dps = results.getByRole('group', { name: 'DPS' })
    await expect(tps).toContainText('—')
    await expect(dps).toContainText('—')
    await expect(results).toContainText('Simulate to see your TPS and DPS.')

    await simulate(results)
    await expect(tps).toContainText(VALUE_WITH_CI)
    await expect(dps).toContainText(VALUE_WITH_CI)
    // DPS has its own headline now, so the run summary no longer repeats it.
    await expect(results.getByText(/fights of \d+ s · Forever rules/)).not.toContainText('DPS')
    // TPS comes first.
    const [tpsBox, dpsBox] = [await tps.boundingBox(), await dps.boundingBox()]
    expect(tpsBox!.x).toBeLessThan(dpsBox!.x)

    // A different race changes both numbers; each shows its own change from the last run.
    await page.getByRole('tab', { name: 'Character', exact: true }).click()
    await page.getByRole('radio', { name: /Night Elf/ }).click()
    await expect(tps).toContainText('Setup changed')
    await simulate(results)
    await expect(tps).toContainText(WITH_CHANGE)
    await expect(dps).toContainText(WITH_CHANGE)
    await expect(tps).not.toContainText('Setup changed')
    // A screen reader hears each change in words, and more is better for both (TU3).
    for (const group of [tps, dps]) {
      const heard = group.getByText(HEARD_CHANGE)
      const shown = heard.locator('..')
      const up = (await shown.textContent())!.includes('+')
      await expect(heard).toHaveText(up ? /^up .*, better$/ : /^down .*, worse$/)
      await expect(shown).toHaveClass(up ? /text-positive/ : /text-negative/)
    }
  })

  test('damage taken per second, and how the boss’s swings landed', async ({ page }) => {
    await openProtection(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    const taken = results.getByRole('region', { name: 'Damage taken per second' })
    await expect(taken).toHaveCount(0)

    await simulate(results)
    await expect(taken).toContainText(VALUE_WITH_CI)
    // What it counts, and what sets the swings (TU4). The arrow has non-breaking spaces around it.
    await expect(taken).toContainText(
      new RegExp(
        'The health the boss’s melee swings cost you, after avoidance, armor, block and other reductions\\. ' +
          'It swung \\d+\\.\\d times a fight on average, set to 4,500 to 5,500 a swing before armor \\(Fight\\s→\\sAdvanced\\)\\. ' +
          'Debuffs on it, such as Demoralizing Shout and Thunder Clap, lower its damage and slow its swings, whether yours \\(Rotation\\) or the raid’s \\(Buffs\\)\\.',
      ),
    )
    // Damage taken comes first, above the breakdown, and how the swings landed after it (TU6).
    const breakdown = results.getByRole('region', { name: /by ability$/ })
    const landedSection = results.getByRole('region', { name: LANDED })
    expect((await taken.boundingBox())!.y).toBeLessThan((await breakdown.boundingBox())!.y)
    expect((await breakdown.boundingBox())!.y).toBeLessThan((await landedSection.boundingBox())!.y)
    // Its heading names it once; the list has no second name to read (TU9).
    await expect(landedSection.getByRole('heading', { name: LANDED, level: 3 })).toBeVisible()
    await expect(landedSection.getByRole('list')).toHaveAccessibleName('')

    // Every outcome of the boss's one roll, in its order, as shares of its swings.
    const landed = landedSection.getByRole('listitem')
    const shares = await outcomes(landed)
    expect(shares.map(([label]) => label)).toEqual(OUTCOMES)
    const total = shares.reduce((n, [, share]) => n + share, 0)
    expect(total).toBeGreaterThan(99.6)
    expect(total).toBeLessThan(100.4)
    // A shield and a weapon: the default Protection warrior dodges, parries and blocks, and the
    // boss crushes it.
    for (const [label, share] of shares) if (label !== 'Crit') expect(share, label).toBeGreaterThan(0)

    // A bigger boss hits harder: the change is up, and colored and heard as worse, since less is
    // better (TU3).
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    await page.getByRole('button', { name: 'Advanced' }).click()
    const max = page.getByRole('textbox', { name: 'Maximum damage per swing' })
    // Focused first, as a person would: focusing swaps "5,500" for "5500" (docs/ux.md, Fight).
    await max.focus()
    await max.fill('9000')
    await max.press('Enter')
    await expect(max).toHaveValue('9000')
    await simulate(results)
    await expect(taken).toContainText(WITH_CHANGE)
    await expect(taken).toContainText('set to 4,500 to 9,000 a swing before armor')
    const heard = taken.getByText(HEARD_CHANGE)
    await expect(heard).toHaveText(/^up [\d,]+\.\d from the last run, worse$/)
    const shown = heard.locator('..')
    await expect(shown).toHaveClass(/text-negative/)
    await expect(shown).toContainText(/\+\d/)
    await expect(shown.locator('svg.lucide-arrow-up')).toHaveCount(1)
  })

  test('a drop in damage taken is green, and heard as better (TU7)', async ({ page }) => {
    await openProtection(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    const taken = results.getByRole('region', { name: 'Damage taken per second' })
    await simulate(results)
    await expect(taken).toContainText(VALUE_WITH_CI)

    // A weaker boss: every swing at 4,500 rather than 4,500 to 5,500.
    await weakenBoss(page)
    await simulate(results)
    await expect(taken).toContainText(WITH_CHANGE)
    const heard = taken.getByText(HEARD_CHANGE)
    await expect(heard).toHaveText(/^down [\d,]+\.\d from the last run, better$/)
    const shown = heard.locator('..')
    await expect(shown).toHaveClass(/text-positive/)
    await expect(shown).toContainText(/−\d/)
    await expect(shown.locator('svg.lucide-arrow-down')).toHaveCount(1)
  })

  test('the character sheet has crit reduction, and the boss’s table against you', async ({ page }) => {
    await openProtection(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await simulate(results)
    await results.getByRole('button', { name: 'Character sheet' }).click()

    // Defense takes 0.04% a point above 300 off the boss's crit chance (character-stats#defense-skill).
    const stat = (name: string) => results.locator('dl > div').filter({ has: page.locator('dt', { hasText: exactly(name) }) }).locator('dd')
    const defense = Number(await stat('Defense').textContent())
    expect(defense).toBeGreaterThan(300)
    await expect(stat('Crit reduction (boss’s crits)')).toHaveText(`${(Math.round((defense - 300) * 0.4) / 10).toFixed(1)}%`)
    // Your own Crit and Hit keep their names; the boss's crits and plain hits say whose they are (TU5).
    const sheetLabels = await results.locator('dl').first().locator('dt').allTextContents()
    expect(sheetLabels).toEqual(expect.arrayContaining(['Crit', 'Hit', 'Crit reduction (boss’s crits)']))
    expect(sheetLabels).not.toContain('Crit reduction')

    const table = results.getByRole('region', { name: 'Boss’s attack table' })
    // Why its numbers aren't the sheet's (TU1).
    await expect(table).toContainText(
      'Its chances on each swing at you as the fight starts, from the stats above. ' +
        'Its 315 weapon skill takes 0.6 points off your dodge, parry and block. ' +
        'The swings that landed can differ a little, by chance and as cooldowns and procs change your stats in the fight.',
    )
    const rows = await outcomes(table.locator('dl > div'))
    expect(rows.map(([label]) => label)).toEqual(OUTCOMES)
    // …and the numbers bear it out, to the tenth they're shown to.
    for (const [i, name] of [[1, 'Dodge'], [2, 'Parry'], [3, 'Block']] as const) {
      expect(Math.abs(pct(await stat(name).first().textContent()) - rows[i][1] - 0.6), name).toBeLessThan(0.11)
    }
    const [, crush] = rows[5]
    const [, hit] = rows[6]
    expect(crush).toBe(15)
    // Crushing blows sit before hits, so pushing them off takes both slices, in points (TU2).
    await expect(table).toContainText(`Another ${(crush + hit).toFixed(1)} points of miss, dodge, parry or block would push crushing blows off the table.`)
    // The unmeasured base values in these numbers (decision D24).
    await expect(results).toContainText('Classic-based values until they’re measured: base health, base parry, base block.')

    // With crushing blows off for the fight, the table says so rather than calling you uncrushable.
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    await page.getByRole('button', { name: 'Advanced' }).click()
    await page.getByRole('switch', { name: 'Crushing blows' }).click()
    await simulate(results)
    await expect(table).toContainText('Crushing blows are off for this fight (Fight → Advanced).')
    expect((await outcomes(table.locator('dl > div')))[5]).toEqual(['Crushing', 0])
    const landed = results.getByRole('region', { name: LANDED }).getByRole('listitem')
    expect((await outcomes(landed))[5]).toEqual(['Crushing', 0])
  })

  test('the breakdown switches between threat and damage, and remembers the choice', async ({ page }) => {
    await openProtection(page)
    const results = page.getByRole('complementary', { name: 'Results' })
    await simulate(results)

    const breakdown = results.getByRole('region', { name: /by ability$/ })
    const threat = breakdown.getByRole('radio', { name: 'Threat' })
    const damage = breakdown.getByRole('radio', { name: 'Damage' })
    await expect(breakdown.getByRole('heading')).toHaveText('Threat by ability')
    await expect(threat).toHaveAttribute('aria-checked', 'true')
    // Master of Defense only gives rage, so it makes threat but deals no damage.
    await expect(breakdown.getByText('Master of Defense')).toBeVisible()
    const mainHandThreat = await breakdown.getByRole('listitem').filter({ hasText: 'Main hand' }).textContent()

    await damage.click()
    await expect(breakdown.getByRole('heading')).toHaveText('Damage by ability')
    await expect(damage).toHaveAttribute('aria-checked', 'true')
    await expect(breakdown.getByText('Master of Defense')).toBeHidden()
    await expect(breakdown.getByRole('listitem').filter({ hasText: 'Main hand' })).not.toHaveText(mainHandThreat!)

    // Remembered for the session: still damage after a reload and a new run.
    await page.reload()
    await simulate(results)
    await expect(breakdown.getByRole('heading')).toHaveText('Damage by ability')
  })

  test('DPS specs keep one DPS headline and a damage breakdown with no switch, and no tank views', async ({ page }) => {
    await page.goto('./')
    const results = page.getByRole('complementary', { name: 'Results' })
    await simulate(results)
    await expect(results.getByRole('group', { name: 'DPS' })).toContainText(VALUE_WITH_CI)
    await expect(results.getByRole('group', { name: 'TPS' })).toHaveCount(0)
    await expect(results.getByRole('heading', { name: 'Damage by ability' })).toBeVisible()
    await expect(results.getByRole('radio', { name: 'Threat' })).toHaveCount(0)
    // The boss attacks no one in a DPS run.
    await expect(results.getByRole('region', { name: 'Damage taken per second' })).toHaveCount(0)
    await results.getByRole('button', { name: 'Character sheet' }).click()
    await expect(results.getByText('Attack power')).toBeVisible()
    await expect(results.getByRole('region', { name: 'Boss’s attack table' })).toHaveCount(0)
    await expect(results.getByText('Crit reduction')).toHaveCount(0)
  })

  test('a link to a tank the app doesn’t offer yet is still refused', async ({ page }) => {
    await page.goto(shareLink('paladin-protection'))
    await expect(page.getByText('That link is for a Protection Paladin')).toBeVisible()
    await expect(page.getByRole('button', { name: /Spec: Fury Warrior/ })).toBeVisible()
  })
})

test.describe('tank results on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the bottom bar shows TPS and DPS, and the results sheet has both with the switch', async ({ page }) => {
    await openProtection(page)
    await simulate(page)

    const bar = page.getByRole('button', { name: 'Show results' })
    await expect(bar).toContainText(/TPS\s*\d[\d,]*\.\d/)
    await expect(bar).toContainText(/DPS\s*\d[\d,]*\.\d/)
    // Both values and Run again fit on the bar, inside the screen, with a full-size touch target.
    const again = await page.getByRole('button', { name: 'Run again' }).boundingBox()
    const shown = await bar.boundingBox()
    expect(again!.height).toBeGreaterThanOrEqual(44)
    expect(again!.x + again!.width).toBeLessThanOrEqual(390)
    expect(shown!.x + shown!.width).toBeLessThanOrEqual(again!.x)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0)

    await bar.click()
    const sheet = page.getByRole('dialog', { name: 'Results' })
    await expect(sheet.getByRole('group', { name: 'TPS' })).toContainText(VALUE_WITH_CI)
    await expect(sheet.getByRole('group', { name: 'DPS' })).toContainText(VALUE_WITH_CI)
    const damage = sheet.getByRole('radio', { name: 'Damage' })
    expect((await damage.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await damage.click()
    await expect(sheet.getByRole('heading', { name: 'Damage by ability' })).toBeVisible()
  })

  test('the results sheet has damage taken and the boss’s table, inside the screen', async ({ page }) => {
    await openProtection(page)
    await simulate(page)
    await page.getByRole('button', { name: 'Show results' }).click()
    const sheet = page.getByRole('dialog', { name: 'Results' })

    const taken = sheet.getByRole('region', { name: 'Damage taken per second' })
    await expect(taken).toContainText(VALUE_WITH_CI)
    // "(Fight → Advanced)" never splits across lines: non-breaking spaces around the arrow (TU10).
    expect(await taken.textContent()).toContain('(Fight\u00a0→\u00a0Advanced)')
    const landed = sheet.getByRole('region', { name: LANDED }).getByRole('listitem')
    expect((await outcomes(landed)).map(([label]) => label)).toEqual(OUTCOMES)
    // Two columns, filled down: the four that spare you on the left, then crit, crushing and normal hit.
    const boxes = await Promise.all((await landed.all()).map((item) => item.boundingBox()))
    for (const box of boxes) expect(box!.x + box!.width).toBeLessThanOrEqual(390 - 16)
    expect(boxes[4]!.x).toBeGreaterThan(boxes[3]!.x + boxes[3]!.width)
    expect(boxes[4]!.y).toBeCloseTo(boxes[0]!.y, 0)

    // From the keyboard: the link's notice sits over the sheet's lower half for 10 s.
    await sheet.getByRole('button', { name: 'Character sheet' }).press('Enter')
    const table = sheet.getByRole('region', { name: 'Boss’s attack table' })
    await table.scrollIntoViewIfNeeded()
    await expect(table).toBeInViewport()
    await expect(table).toContainText(/Another \d+\.\d points of miss, dodge, parry or block would push crushing blows off the table\./)
    for (const row of await table.locator('dl > div').all()) {
      const box = await row.boundingBox()
      expect(box!.x + box!.width).toBeLessThanOrEqual(390 - 16)
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0)
  })
})
