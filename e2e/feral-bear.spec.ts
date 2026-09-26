import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

// The Feral bear (docs/classes/druid.md §4, §6.3, §7), shipped in B4: the switcher, its tabs in
// its own terms, its rotation as a priority list with three presets (Defensive, Balanced, the
// default, and Max TPS; decisions D28, D31), a run and its tank results, and a share link, on a
// desktop and on a phone (docs/ux.md).

const BEAR = /^Spec: Feral \(Bear\) Druid/

/** The rows in druid.md §6.3's order. */
const DEFAULT_ORDER = ['prepull', 'berserk', 'enrage', 'racial', 'onUseItems', 'maul', 'demoRoar', 'faerieFire', 'mangle', 'lacerate', 'swipe', 'faerieFireFiller']

async function switchToBear(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('menuitem', { name: /Feral \(Bear\)/ }).click()
  await expect(page.getByRole('button', { name: BEAR })).toBeVisible()
}

const openTab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click()

/** The bear's Rotation tab, and its priority list. */
async function openRotation(page: Page) {
  await switchToBear(page)
  await openTab(page, 'Rotation')
  return { tab: page.getByRole('tabpanel', { name: 'Rotation' }), list: page.getByRole('list', { name: 'Priority list' }) }
}

const preset = (page: Page) => page.getByRole('combobox', { name: 'Rotation preset' })
/** A preset's name in the menu and the trigger: the default's is marked "(default)". */
const presetName = (name: string) => new RegExp(`^${name}( \\(default\\))?$`)
async function pickPreset(page: Page, name: string) {
  await preset(page).click()
  await page.getByRole('option', { name: presetName(name) }).click()
  await expect(preset(page)).toHaveText(presetName(name))
}
/** The rows' ids in the list's order. */
const order = (page: Page) => page.locator('[data-apl-row]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-apl-row')))
const row = (list: Locator, id: string) => list.locator(`[data-apl-row="${id}"]`)

/** Every match is at least 44 px tall, after any open animation (as shell-a11y.spec.ts measures it). */
async function expectTouchTargets(locator: Locator) {
  await expect(locator.first()).toBeVisible()
  await expect.poll(() => locator.evaluateAll((els) => Math.min(...els.map((e) => e.getBoundingClientRect().height)))).toBeGreaterThanOrEqual(44)
}

async function simulate(page: Page) {
  const results = page.getByRole('complementary', { name: 'Results' })
  await results.getByRole('button', { name: /^(Simulate|Run again)$/ }).click()
  await expect(results.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
  return results
}

async function noSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(0)
}

/** A value with its ± 95% CI, e.g. "711.6± 2.1", in a headline group. */
const VALUE_WITH_CI = /\d[\d,]*\.\d\s*± \d[\d,]*\.\d/
/** What a screen reader hears of a change from the last run (docs/ux.md#results). */
const HEARD_CHANGE = /^(up|down) [\d,]+\.\d from the last run, (better|worse)$/
/** Each preset's short line under the picker: what it keeps and drops, with a number or two against Defensive (D28). */
const BALANCED_LINE = 'Faerie Fire kept, Demoralizing Roar dropped: +3.1% TPS, +2.8% DPS and 0.7% more damage taken than Defensive.'
const DEFENSIVE_LINE = 'Demoralizing Roar and Faerie Fire kept on the boss: the least damage taken. Tuned on threat.'
const MAX_TPS_LINE = 'Balanced, but Mauls from 14 rage: +0.2% TPS, −0.2% DPS, the same damage taken (0.7% more than Defensive).'

test.describe('Feral bear in the switcher', () => {
  test('is under Druid as a tank, with its own talent build, a Tauren and the Manual Crowd Pummeler', async ({ page }) => {
    await page.goto('./')
    await page.getByRole('button', { name: /^Spec: / }).click()
    const bear = page.getByRole('menuitem', { name: /Feral \(Bear\)/ })
    await expect(bear).toContainText('Tank')
    // Under the Druid heading, after the cat.
    const items = await page.getByRole('menuitem').allTextContents()
    expect(items.findIndex((t) => t.includes('Feral (Bear)'))).toBe(items.findIndex((t) => t.includes('Feral (Cat)')) + 1)
    await expect(page.getByRole('menu').getByText('Druid', { exact: true })).toBeVisible()
    await bear.click()
    await expect(page.getByRole('button', { name: BEAR })).toBeVisible()

    await openTab(page, 'Character')
    await expect(page.getByRole('radio', { name: /Tauren/ })).toHaveAttribute('aria-checked', 'true')
    await openTab(page, 'Gear')
    await expect(page.getByRole('button', { name: 'Main hand: Manual Crowd Pummeler' })).toBeVisible()
    await openTab(page, 'Talents')
    const presets = page.getByRole('combobox', { name: 'Talent build presets' })
    await expect(presets).toHaveText('Feral bear (default)')
    await expect(page.getByText('9 / 42 / 0')).toBeVisible()
    await presets.click()
    // Both druid builds now that both ship; only the bear's is marked "(default)" here.
    await expect(page.getByRole('option')).toHaveText(['Feral cat default 9/37/5', 'Feral bear (default) 9/42/0', 'Balance default 41/5/0'])
    await page.keyboard.press('Escape')
    // About names both druid specs.
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: /About/ }).click()
    await expect(page.getByRole('dialog').getByText(/ · Druids: Feral \(Cat\), Feral \(Bear\) and Balance · /)).toBeVisible()
  })
})

test.describe('the bear’s priority list and its presets (druid.md §6.3; D28, D31)', () => {
  test('Balanced by default: the roar off, Faerie Fire kept, the rows in §6.3’s order, and its help with the numbers', async ({ page }) => {
    const { tab, list } = await openRotation(page)
    await expect(tab.getByText('Which abilities the sim uses, and when. Defensive is tuned for the default setup; Balanced, the default, and Max TPS haven’t been fully tuned yet.', { exact: true })).toBeVisible()
    await expect(preset(page)).toHaveText('Balanced (default)')
    await expect(preset(page)).toHaveAccessibleDescription(BALANCED_LINE)
    await expect(tab.getByText(BALANCED_LINE)).toBeVisible()
    // The info has each preset's full help and numbers.
    await tab.getByRole('button', { name: 'About the presets' }).click()
    const info = page.getByRole('dialog', { name: 'The presets' })
    await expect(info).toContainText('3.1% more TPS and 2.8% more DPS than Defensive in the default setup, for 0.7% more damage taken')
    await expect(info).toContainText('Mauls from 14 rage rather than Balanced’s 20')
    await page.keyboard.press('Escape')
    expect(await order(page)).toEqual(DEFAULT_ORDER)
    // The priority is the picker, first: no Priority choice of its own, and only the consumables between it and the list.
    await expect(tab.getByRole('radiogroup', { name: 'Priority' })).toHaveCount(0)
    await expect(tab.getByRole('heading', { level: 3 })).toHaveText(['Preset', 'Consumables', 'Priority list'])
    await expect(list.getByRole('switch', { name: 'Demoralizing Roar', exact: true })).not.toBeChecked()
    await expect(row(list, 'demoRoar')).toContainText('Off')
    for (const name of ['Berserk', 'Enrage', 'Maul', 'Faerie Fire', 'Primal Bite', 'Lacerate', 'Faerie Fire filler']) {
      await expect(list.getByRole('switch', { name, exact: true }), name).toBeChecked()
    }
    await expect(list.getByRole('switch', { name: 'Swipe', exact: true })).not.toBeChecked()
    await expect(row(list, 'lacerate')).toContainText('5 stacks · again with 12 s left')
    await expect(row(list, 'faerieFire')).toContainText('Again with 6 s left')
    await expect(row(list, 'maul')).toContainText('From 20 rage')
    // The pre-pull's Enrage is pinned first.
    await expect(row(list, 'prepull').getByText('Fixed in place:')).toHaveCount(1)
    await expect(row(list, 'prepull')).toContainText('Enrage')
    await expect(page.getByRole('button', { name: 'Reset order' })).toBeDisabled()
  })

  test('switches presets: Defensive keeps the roar, Max TPS drops it and Mauls sooner, and each says what it is', async ({ page }) => {
    const { tab, list } = await openRotation(page)
    await preset(page).click()
    await expect(page.getByRole('option')).toHaveText(['Defensive', 'Balanced (default)', 'Max TPS'])
    await expectTouchTargets(page.getByRole('option'))
    await page.getByRole('option', { name: 'Defensive', exact: true }).click()
    await expect(preset(page)).toHaveText('Defensive')
    await expect(page.locator('[data-announcer]')).toHaveText('Rotation set to Defensive.')
    await expect(preset(page)).toHaveAccessibleDescription(DEFENSIVE_LINE)
    const roar = list.getByRole('switch', { name: 'Demoralizing Roar', exact: true })
    await expect(roar).toBeChecked()
    // Its own default, not a change: no dot.
    await expect(list.getByRole('button', { name: 'Demoralizing Roar', exact: true })).toHaveAccessibleDescription('Again with 1.5 s left')
    await expect(list.getByRole('switch', { name: 'Faerie Fire', exact: true })).toBeChecked()

    await pickPreset(page, 'Max TPS')
    await expect(preset(page)).toHaveAccessibleDescription(MAX_TPS_LINE)
    await expect(roar).not.toBeChecked()
    // Tuned on threat alone, it Mauls from 14 (druid.md §6.3 "Max TPS"), unmarked: its own default.
    await expect(row(list, 'maul')).toContainText('From 14 rage')
    await expect(list.getByRole('button', { name: 'Maul', exact: true })).toHaveAccessibleDescription('From 14 rage')
    await expect(list.getByRole('switch', { name: 'Faerie Fire', exact: true })).toBeChecked()
    // The settings they don't name stay as they were, and so does the order.
    expect(await order(page)).toEqual(DEFAULT_ORDER)
    await pickPreset(page, 'Balanced')
    await expect(tab.getByText(BALANCED_LINE)).toBeVisible()
    await expect(row(list, 'maul')).toContainText('From 20 rage')
    // Back at the default, nothing's left to reset.
    await expect(tab.getByRole('button', { name: 'Reset rotation' })).toBeDisabled()
  })

  test('editing the list makes it Custom: a row’s switch, one of its settings, or its place; picking a preset goes back', async ({ page }) => {
    const { tab, list } = await openRotation(page)
    const roar = list.getByRole('switch', { name: 'Demoralizing Roar', exact: true })
    await roar.click()
    await expect(preset(page)).toHaveText('Custom')
    await expect(tab.getByText('Custom: the list matches none of the presets. Pick one to start again from it.')).toBeVisible()
    await expect(preset(page)).toHaveAccessibleDescription(/^Custom: /)
    // The roar is marked against Balanced's default, off.
    await expect(list.getByRole('button', { name: 'Demoralizing Roar', exact: true })).toHaveAccessibleDescription('Changed. Again with 1.5 s left')
    await list.getByRole('button', { name: 'Demoralizing Roar', exact: true }).click()
    const settings = page.getByRole('complementary', { name: 'Demoralizing Roar settings' })
    await expect(settings.getByRole('switch', { name: 'Use Demoralizing Roar', exact: true })).toHaveAccessibleDescription(
      /On with Defensive; off by default with Balanced and Max TPS\. Changed\. Default: off$/,
    )
    // Balanced puts it back.
    await pickPreset(page, 'Balanced')
    await expect(roar).not.toBeChecked()

    // A setting in a row's panel: Maul from 30 rage.
    await list.getByRole('button', { name: 'Maul', exact: true }).click()
    const maul = page.getByRole('complementary', { name: 'Maul settings' })
    const threshold = maul.getByRole('textbox', { name: 'Maul from', exact: true })
    await threshold.fill('30')
    await threshold.press('Enter')
    await expect(row(list, 'maul')).toContainText('From 30 rage')
    await expect(preset(page)).toHaveText('Custom')
    await pickPreset(page, 'Defensive')
    await expect(row(list, 'maul')).toContainText('From 20 rage')

    // A moved row: Maul down one, below the roar.
    await list.getByRole('button', { name: 'Maul', exact: true }).click()
    await maul.getByRole('button', { name: 'Move down', exact: true }).click()
    await expect.poll(() => order(page)).toEqual(['prepull', 'berserk', 'enrage', 'racial', 'onUseItems', 'demoRoar', 'maul', 'faerieFire', 'mangle', 'lacerate', 'swipe', 'faerieFireFiller'])
    await expect(preset(page)).toHaveText('Custom')
    // Defensive's order is the default: picking it puts Maul back, and the roar stays on.
    await pickPreset(page, 'Defensive')
    expect(await order(page)).toEqual(DEFAULT_ORDER)
    await expect(roar).toBeChecked()
  })

  test('the duties keep their rule wherever they sit: Faerie Fire from 6 s left, the roar from 1.5 s (PW4)', async ({ page }) => {
    const { list } = await openRotation(page)
    await list.getByRole('button', { name: 'Faerie Fire', exact: true }).click()
    const faerieFire = page.getByRole('complementary', { name: 'Faerie Fire settings' })
    const ffRefresh = faerieFire.getByRole('textbox', { name: 'Faerie Fire again with', exact: true })
    await expect(ffRefresh).toHaveValue('6')
    await expect(ffRefresh).toHaveAccessibleDescription(/The default, 6 s \(its cooldown\), follows the tank duties’ rule: refresh while a missed cast can still be tried again before it falls off\./)
    await expect(faerieFire.getByRole('switch', { name: 'Use Faerie Fire', exact: true })).toHaveAccessibleDescription(/Every preset keeps it: it’s the raid’s armor debuff/)
    // Moved below Primal Bite, it keeps the rule, and says so.
    await faerieFire.getByRole('button', { name: 'Move down', exact: true }).click()
    await expect(row(list, 'faerieFire')).toContainText('Again with 6 s left')
    await list.getByRole('button', { name: 'Demoralizing Roar', exact: true }).click()
    const roar = page.getByRole('complementary', { name: 'Demoralizing Roar settings' })
    await expect(roar.getByRole('textbox', { name: 'Demoralizing Roar again with', exact: true })).toHaveValue('1.5')
    await expect(roar.getByRole('textbox', { name: 'Demoralizing Roar again with', exact: true })).toHaveAccessibleDescription(
      /The default, 1\.5 s \(one global cooldown, as it has none\), follows the tank duties’ rule/,
    )
    // Lacerate refreshes from 12 s in every preset (druid.md §6.3, T3's re-check).
    await list.getByRole('button', { name: 'Lacerate', exact: true }).click()
    const lacerate = page.getByRole('complementary', { name: 'Lacerate settings' }).getByRole('textbox', { name: 'Lacerate again with', exact: true })
    await expect(lacerate).toHaveValue('12')
    await expect(lacerate).toHaveAccessibleDescription(/From 12 s, the global cooldowns Maul’s rage leaves free go to Lacerate, for its threat\./)
  })

  test('the Buffs tab: Faerie Fire is yours in every preset; the roar is off for another druid’s with Balanced, and yours with Defensive', async ({ page }) => {
    await switchToBear(page)
    await openTab(page, 'Buffs')
    const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
    const roar = buffs.getByRole('switch', { name: 'Demoralizing Roar', exact: true })
    const faerieFire = buffs.getByRole('switch', { name: 'Faerie Fire', exact: true })
    // Balanced: the bear's own roar, in no preset, is off by default once it drops it, and unlocked, with the note.
    await expect(roar).not.toBeChecked()
    await expect(roar).toBeEnabled()
    await expect(roar).toHaveAccessibleDescription(/\. You’re not keeping it up \(see Rotation\); turn this on if another druid does\.$/)
    await expect(faerieFire).toBeChecked()
    await expect(faerieFire).toBeDisabled()
    await expect(faerieFire).toHaveAccessibleDescription(/\. You keep it up yourself \(see Rotation\), so it isn’t added twice\.$/)
    // Turned on for another druid's, it counts; with Defensive your own replaces it.
    await roar.click()
    await expect(roar).toBeChecked()
    await openTab(page, 'Rotation')
    await pickPreset(page, 'Defensive')
    await openTab(page, 'Buffs')
    for (const own of [roar, faerieFire]) {
      await expect(own).toBeChecked()
      await expect(own).toBeDisabled()
      await expect(own).toHaveAccessibleDescription(/\. You keep it up yourself \(see Rotation\), so it isn’t added twice\.$/)
    }
    await expect(page.getByText('−204 boss attack power (instead of Demoralizing Shout). You keep it up yourself (see Rotation), so it isn’t added twice.')).toBeVisible()
    // Without another druid in the raid, the roar needs one, with Balanced; your own Mark of the Wild is still yours.
    await openTab(page, 'Rotation')
    await pickPreset(page, 'Balanced')
    await openTab(page, 'Buffs')
    await buffs.getByRole('button', { name: 'Druid', exact: true }).click()
    await expect(roar).toBeDisabled()
    await expect(roar).toHaveAccessibleDescription('Needs another druid in the raid')
    const mark = buffs.getByRole('switch', { name: 'Gift of the Wild', exact: true })
    await expect(mark).toBeChecked()
    await expect(mark).toBeEnabled()
  })

  test('with Defensive and a Demoralizing Shout from Buffs, its roar shows off, naming the Shout, and the list says it isn’t cast (BU2)', async ({ page }) => {
    const { list } = await openRotation(page)
    await pickPreset(page, 'Defensive')
    await openTab(page, 'Buffs')
    const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
    const roar = buffs.getByRole('switch', { name: 'Demoralizing Roar', exact: true })
    await expect(roar).toBeChecked()
    await buffs.getByRole('switch', { name: 'Demoralizing Shout', exact: true }).click()
    await expect(roar).not.toBeChecked()
    await expect(roar).toBeDisabled()
    await expect(roar).toHaveAccessibleDescription(
      '−204 boss attack power (instead of Demoralizing Shout). Your raid’s Demoralizing Shout is on the boss instead, so you don’t cast it (see Rotation).',
    )
    await openTab(page, 'Rotation')
    await expect(row(list, 'demoRoar')).toContainText('Not used: the Demoralizing Shout in Buffs is on the boss instead, so you don’t cast the roar.')
    await expect(row(list, 'demoRoar')).toHaveAttribute('data-inactive')
    await expect(list.getByRole('switch', { name: 'Demoralizing Roar', exact: true })).toBeChecked()
  })

  test('says why Lacerate does nothing while it waits for no other bleeds in a raid with warriors, as the cat’s Rake does (BU4)', async ({ page }) => {
    const { list } = await openRotation(page)
    await list.getByRole('button', { name: 'Lacerate', exact: true }).click()
    const settings = page.getByRole('complementary', { name: 'Lacerate settings' })
    const alone = settings.getByRole('switch', { name: 'Lacerate only when nothing else bleeds', exact: true })
    await expect(alone).not.toBeChecked()
    const note = 'Not used in this raid: its warriors keep the boss bleeding. Turn off “Lacerate only when nothing else bleeds” to use it anyway.'
    await expect(row(list, 'lacerate')).not.toContainText(note)
    await alone.click()
    await expect(row(list, 'lacerate')).toContainText(note)
    // Lacerate's switch stays on and usable; the one that makes it wait stays live.
    await expect(list.getByRole('switch', { name: 'Lacerate', exact: true })).toBeChecked()
    await expect(alone).toBeEnabled()
    await expect(preset(page)).toHaveText('Custom')
  })

  test('Thorns is on for the bear, a damage shield only a tank feels; the cat’s Buffs tab says so (BR5)', async ({ page }) => {
    await switchToBear(page)
    await openTab(page, 'Buffs')
    const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
    // In the Standard raid, a raid Restoration druid's (PR-4); the bear's own is there, off.
    const thorns = buffs.getByRole('switch', { name: 'Thorns', exact: true })
    const own = buffs.getByRole('switch', { name: 'Thorns (your own)', exact: true })
    await expect(thorns).toBeChecked()
    await expect(thorns).toBeEnabled()
    await expect(thorns).toHaveAccessibleDescription(/^38 Nature damage to the boss each time it hits you: a raid Restoration druid’s/)
    await expect(own).not.toBeChecked()
    await expect(own).toHaveAccessibleDescription(/^22 Nature damage to the boss each time it hits you: your own/)
    // Self only is the bear's own; they don't stack, so turning the raid druid's on turns it off.
    const presets = page.getByRole('radiogroup', { name: 'Preset' })
    await presets.getByRole('radio', { name: 'Self only' }).click()
    await expect(own).toBeChecked()
    await expect(thorns).not.toBeChecked()
    await thorns.click()
    await expect(thorns).toBeChecked()
    await expect(own).not.toBeChecked()
    await presets.getByRole('radio', { name: 'Standard raid (default)' }).click()
    await expect(thorns).toBeChecked()
    // A run lists its damage and threat on its own row.
    const results = await simulate(page)
    await expect(results.getByText('Thorns', { exact: true }).first()).toBeVisible()
    // For the cat it's there, off, and says why it does nothing.
    await page.getByRole('button', { name: /^Spec: / }).click()
    await page.getByRole('menuitem', { name: /Feral \(Cat\)/ }).click()
    await openTab(page, 'Buffs')
    const catThorns = page.getByRole('tabpanel', { name: 'Buffs' }).getByRole('switch', { name: 'Thorns', exact: true })
    await expect(catThorns).not.toBeChecked()
    await expect(catThorns).toHaveAccessibleDescription(/Only the tank takes the boss’s swings, so it changes nothing for you\.$/)
  })

  test('a Defensive run makes less threat and damage than Balanced, and adds the roar’s row', async ({ page }) => {
    await switchToBear(page)
    const results = await simulate(page)
    const breakdown = results.getByRole('region', { name: 'Threat by ability' })
    const threatRow = (name: string) => breakdown.getByRole('listitem').filter({ hasText: new RegExp(`^${name}`) })
    await expect(threatRow('Demoralizing Roar')).toHaveCount(0)
    await openTab(page, 'Rotation')
    await pickPreset(page, 'Defensive')
    await expect(results.getByRole('group', { name: 'TPS' })).toContainText('Setup changed')
    await simulate(page)
    const heard = (metric: string) => results.getByRole('group', { name: metric }).getByText(HEARD_CHANGE)
    await expect(heard('TPS')).toHaveText(/^down [\d,]+\.\d from the last run, worse$/)
    await expect(heard('DPS')).toHaveText(/^down [\d,]+\.\d from the last run, worse$/)
    for (const name of ['Maul', 'Primal Bite', 'Faerie Fire', 'Demoralizing Roar']) await expect(threatRow(name).first()).toBeVisible()
  })
})

test.describe('Feral bear share link', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

  test('carries the bear, its Defensive preset and a moved row to a fresh page load', async ({ page }) => {
    const { list } = await openRotation(page)
    await pickPreset(page, 'Defensive')
    await page.getByRole('button', { name: /Share/ }).click()
    await expect(page.getByText('Link copied')).toBeVisible()
    const defensive = await page.evaluate(() => navigator.clipboard.readText())
    // Primal Bite (row `mangle`) up above the duties: Custom, and the order goes in the link too.
    await list.getByRole('button', { name: 'Primal Bite', exact: true }).click()
    const mangle = page.getByRole('complementary', { name: 'Primal Bite settings' })
    await mangle.getByRole('button', { name: 'Move up', exact: true }).click()
    await mangle.getByRole('button', { name: 'Move up', exact: true }).click()
    const moved = ['prepull', 'berserk', 'enrage', 'racial', 'onUseItems', 'maul', 'mangle', 'demoRoar', 'faerieFire', 'lacerate', 'swipe', 'faerieFireFiller']
    await expect.poll(() => order(page)).toEqual(moved)
    await page.getByRole('button', { name: /Share/ }).click()
    // The first link's toast may still be up: wait for the new link itself.
    const clipboard = () => page.evaluate(() => navigator.clipboard.readText())
    await expect.poll(clipboard).not.toBe(defensive)
    const custom = await clipboard()
    // Back to Balanced, then Fury: each link brings its bear back.
    await pickPreset(page, 'Balanced')
    await page.getByRole('button', { name: /^Spec: / }).click()
    await page.getByRole('menuitem', { name: /Fury/ }).click()

    for (const [link, name, rows] of [
      [defensive, 'Defensive', DEFAULT_ORDER],
      [custom, 'Custom', moved],
    ] as const) {
      await page.goto('about:blank')
      await page.goto(link)
      await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Loaded a shared setup' })).toBeVisible()
      await expect(page.getByRole('button', { name: BEAR })).toBeVisible()
      await openTab(page, 'Rotation')
      await expect(preset(page)).toHaveText(name)
      await expect.poll(() => order(page)).toEqual(rows)
      await expect(page.getByRole('list', { name: 'Priority list' }).getByRole('switch', { name: 'Demoralizing Roar', exact: true })).toBeChecked()
    }
  })
})

test.describe('Feral bear', () => {
  test('simulates TPS and DPS, its abilities in the threat breakdown', async ({ page }) => {
    await switchToBear(page)
    const results = await simulate(page)
    await expect(results.getByRole('group', { name: 'TPS' })).toContainText(/\d[\d,]*\.\d\s*± /)
    await expect(results.getByRole('group', { name: 'DPS' })).toContainText(/\d[\d,]*\.\d\s*± /)
    // A tank's results: the damage the boss's swings cost it, and how they landed.
    await expect(results.getByRole('region', { name: 'Damage taken per second' })).toContainText(VALUE_WITH_CI)
    await expect(results.getByRole('region', { name: 'How the boss’s swings landed' })).toBeVisible()
    const breakdown = results.getByRole('region', { name: /by ability$/ })
    await expect(breakdown.getByRole('heading')).toHaveText('Threat by ability')
    // Faerie Fire deals no damage, so it's in the threat view only.
    for (const name of ['Maul', 'Primal Bite', 'Lacerate', 'Faerie Fire']) {
      await expect(breakdown.getByRole('listitem').filter({ hasText: name }).first()).toBeVisible()
    }
  })

  test('with Defensive, shows Lacerate’s uptime and stacks on its bleed row, spells’ misses, its own roar under damage taken, and no parry or block (BU5, BU7, BU8, BU15)', async ({ page }) => {
    await openRotation(page)
    await pickPreset(page, 'Defensive')
    const results = await simulate(page)
    const breakdown = results.getByRole('region', { name: /by ability$/ })
    const threatRow = (name: string) => breakdown.getByRole('listitem').filter({ hasText: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) })
    await expect(threatRow('Lacerate (bleed)')).toContainText(/\d+\.\d% uptime on the boss, \d\.\d stacks on average/)
    for (const name of ['Faerie Fire', 'Demoralizing Roar']) {
      await expect(threatRow(name)).toContainText(/\d+\.\d% missed/)
      await expect(threatRow(name)).not.toContainText('crit')
    }
    await expect(
      results.getByText(/Debuffs on it, such as Demoralizing Roar \(yours in Rotation, or another druid’s in Buffs\) and a warrior tank’s Thunder Clap \(Buffs\), lower its damage and slow its swings\./),
    ).toBeVisible()
    // Lacerate's marker is on the boss: its uptime is on the bleed's row, not under Cooldowns and buffs.
    await results.getByRole('button', { name: 'Cooldowns and buffs' }).click()
    await expect(results.getByRole('rowheader', { name: 'Faerie Fire' })).toBeVisible()
    await expect(results.getByRole('rowheader', { name: 'Lacerate' })).toHaveCount(0)
    await results.getByRole('button', { name: 'Character sheet' }).click()
    const labels = await results.locator('dl').first().locator('dt').allTextContents()
    expect(labels).toEqual(expect.arrayContaining(['Defense', 'Dodge']))
    for (const label of ['Parry', 'Block', 'Block value']) expect(labels).not.toContain(label)
  })

  test('leaves the execute phase off the Fight tab, and the Buffs tab shows what the bear brings itself (BU13, BU14, BU16)', async ({ page }) => {
    await switchToBear(page)
    await page.getByRole('tab', { name: 'Fight', exact: true }).click()
    await expect(page.getByRole('switch', { name: 'Execute phase' })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    const lotp = page.getByRole('switch', { name: 'Leader of the Pack', exact: true })
    await expect(lotp).toBeChecked()
    await expect(lotp).toBeDisabled()
    await expect(page.getByText('+3% crit (feral druid in your party). Your talents bring it (see Talents), so it isn’t added twice.')).toBeVisible()
    await expect(page.getByText('+8 weapon damage on each weapon. Not used in Dire Bear Form: your attacks there don’t use your weapon’s damage.')).toBeVisible()
    const presets = page.getByRole('radiogroup', { name: 'Preset' })
    await expect(presets.getByRole('radio', { name: 'Standard raid (default)' })).toHaveAttribute('aria-checked', 'true')
    // Self only leaves only what the bear brings itself on, and still matches its preset: its
    // Faerie Fire, and not the roar Balanced drops.
    await presets.getByRole('radio', { name: 'Self only' }).click()
    await expect(presets.getByRole('radio', { name: 'Self only' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText('Custom selection.')).toHaveCount(0)
    await expect(page.getByRole('switch', { name: 'Faerie Fire', exact: true })).toBeChecked()
    await expect(page.getByRole('switch', { name: 'Demoralizing Roar', exact: true })).not.toBeChecked()
  })
})

test.describe('Feral bear on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('picks Defensive from the full-width picker, opens a row in a sheet, runs and shows its tank results, all without side scroll', async ({ page }) => {
    const { tab, list } = await openRotation(page)
    // The line under the picker fits in three lines on a phone.
    const line = tab.getByText(BALANCED_LINE)
    await expect(line).toBeVisible()
    expect((await line.boundingBox())!.height).toBeLessThanOrEqual(3 * 20 + 1)
    const picker = (await preset(page).boundingBox())!
    expect(picker.x).toBeGreaterThanOrEqual(16)
    expect(picker.height).toBeGreaterThanOrEqual(44)
    // The info button beside it is a 44 px target inside the screen.
    const info = (await tab.getByRole('button', { name: 'About the presets' }).boundingBox())!
    expect(info.height).toBeGreaterThanOrEqual(44)
    expect(info.x + info.width).toBeLessThanOrEqual(390 - 16)
    // Its popover stays on the screen and scrolls to its last preset.
    await tab.getByRole('button', { name: 'About the presets' }).tap()
    const about = page.getByRole('dialog', { name: 'The presets' })
    await expect(about).toBeVisible()
    const bottom = async () => {
      const box = (await about.boundingBox())!
      return box.y + box.height
    }
    // 16 px from the screen's edges (collisionPadding).
    await expect.poll(bottom).toBeLessThanOrEqual(844 - 16)
    expect((await about.boundingBox())!.x).toBeGreaterThanOrEqual(16)
    const last = about.getByText(/unless you turn it on there for another druid’s\.$/).last()
    await last.scrollIntoViewIfNeeded()
    await expect(last).toBeInViewport()
    await page.keyboard.press('Escape')
    await expect(about).toHaveCount(0)
    await preset(page).tap()
    await expectTouchTargets(page.getByRole('option'))
    await page.getByRole('option', { name: 'Defensive', exact: true }).tap()
    await expect(preset(page)).toHaveText('Defensive')
    await expect(tab.getByText(DEFENSIVE_LINE)).toBeVisible()
    await expect(list.getByRole('switch', { name: 'Demoralizing Roar', exact: true })).toBeChecked()
    await noSideScroll(page)
    // A row's settings open in a sheet, titled with its place.
    await list.getByRole('button', { name: 'Demoralizing Roar', exact: true }).tap()
    const sheet = page.getByRole('dialog', { name: 'Demoralizing Roar' })
    await expect(sheet.getByText('At position 7 of 12', { exact: true })).toBeVisible()
    await expect(sheet.getByRole('switch', { name: 'Use Demoralizing Roar', exact: true })).toBeChecked()
    await sheet.getByRole('button', { name: 'Close', exact: true }).tap()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await openTab(page, 'Buffs')
    await expect(page.getByRole('switch', { name: 'Demoralizing Roar', exact: true })).toHaveAccessibleDescription(/You keep it up yourself \(see Rotation\)/)
    await noSideScroll(page)

    await page.getByRole('button', { name: 'Simulate', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Run again' })).toBeVisible({ timeout: 30_000 })
    const bar = page.getByRole('button', { name: /^Show results/ })
    await expect(bar).toContainText(/TPS\s*\d[\d,]*\.\d/)
    await expect(bar).toContainText(/DPS\s*\d[\d,]*\.\d/)
    await bar.click()
    const results = page.getByRole('dialog', { name: 'Results' })
    await expect(results.getByRole('group', { name: 'TPS' })).toContainText(VALUE_WITH_CI)
    await expect(results.getByRole('region', { name: 'Damage taken per second' })).toContainText(VALUE_WITH_CI)
    const breakdown = results.getByRole('region', { name: 'Threat by ability' })
    await expect(breakdown.getByRole('listitem').filter({ hasText: /^Lacerate \(bleed\)/ })).toContainText(/\d+\.\d% uptime on the boss, \d\.\d stacks on average/)
    await noSideScroll(page)
  })
})
