import { expect, test } from './fixtures.ts'

// docs/ux.md "Buffs": only what does something for your class and spec is listed. Mana and spell
// damage are the classes' that spend mana, and what changes only attacks is the melee's (buffs doc
// "Class-only entries"), so a warrior never sees the one and a mage never sees the other.

const PALADIN_ONLY = [
  'Prayer of Spirit',
  'Arcane Brilliance',
  'Blessing of Wisdom',
  'Mana Spring Totem',
  'Greater Arcane Elixir',
  'Elixir of Holy Power',
  'Flask of Supreme Power',
  'Major Mana Potion',
  'Demonic Rune',
]

test('a warrior’s Buffs tab lists no mana or spell damage entries, in any preset', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
  await expect(page.getByRole('switch', { name: 'Blessing of Might' })).toBeVisible()
  for (const preset of ['Standard raid (default)', 'Max consumables']) {
    await page.getByRole('radio', { name: preset }).click()
    await expect(page.getByRole('switch', { name: 'Elixir of the Mongoose' })).toBeChecked()
    for (const name of PALADIN_ONLY) await expect(page.getByRole('switch', { name })).toHaveCount(0)
  }
})

// docs/ux.md "Buffs": a debuff on the boss's swings changes only a tank's results, and the two
// attack-power debuffs, one at a time, name each other (BU1).
test('the Boss damage debuffs say they change nothing for a DPS spec, and the roar and the Shout name each other', async ({ page }) => {
  await page.goto('./')
  const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
  await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
  const note = 'Only the tank takes the boss’s swings, so it changes nothing for you.'
  await expect(buffs.getByRole('switch', { name: 'Demoralizing Roar' })).toHaveAccessibleDescription(`−204 boss attack power (instead of Demoralizing Shout). ${note}`)
  await expect(buffs.getByRole('switch', { name: 'Demoralizing Shout' })).toHaveAccessibleDescription(`−204 boss attack power (instead of Demoralizing Roar). ${note}`)
  await expect(buffs.getByRole('switch', { name: 'Thunder Clap' })).toHaveAccessibleDescription(`Boss attacks 20% slower. ${note}`)
  // Armor meets only the boss's swings too, so the armor-only entries say the same (review CV-1):
  // Greater Stoneshield would otherwise cost a DPS spec its potion with no word why.
  await expect(buffs.getByRole('switch', { name: 'Elixir of Greater Defense' })).toHaveAccessibleDescription(`+450 armor. ${note}`)
  await expect(buffs.getByRole('switch', { name: 'Greater Stoneshield Potion' })).toHaveAccessibleDescription(
    `+2,000 armor for 2 min, drunk on cooldown from the pull. Potions share a cooldown, so one is on at a time. ${note}`,
  )
})

/** The melee's entries (`forSpecs: 'melee'`) a caster never sees: attack power, the boss's armor, weapon enchants. */
const MELEE_ONLY = [
  'Battle Shout',
  'Blessing of Might',
  'Leader of the Pack',
  'Windfury Totem',
  'Grace of Air Totem',
  'Strength of Earth Totem',
  'Sunder Armor ×5',
  'Expose Armor',
  'Faerie Fire',
  'Curse of Recklessness',
  'Annihilator ×3',
  'Elixir of Greater Strength',
  'Juju Power',
  'Winterfall Firewater',
  'Juju Might',
  'R.O.I.D.S.',
  'Ground Scorpok Assay',
  'Smoked Desert Dumplings',
  'Mightfish Steak',
  'Flank au Poivre',
  'Dense Sharpening Stone / Weightstone',
  'Elemental Sharpening Stone',
  'Juju Flurry',
]

test('a mage’s Buffs tab lists nothing that changes only attacks, in any preset, and a warrior’s no caster entries', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('group', { name: 'Mage' }).getByRole('menuitem', { name: /^Fire/ }).click()
  await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
  const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
  await expect(buffs.getByRole('radio', { name: 'Standard raid (default)' })).toBeChecked()
  for (const preset of ['Self only', 'Dungeon group', 'Standard raid (default)', 'Max consumables']) {
    await buffs.getByRole('radio', { name: preset }).click()
    for (const name of MELEE_ONLY) await expect(buffs.getByRole('switch', { name, exact: true }), `${preset}: ${name}`).toHaveCount(0)
  }
  // Its own: the casters' crit aura and curse, on; and Mongoose, whose Forever crit is spell crit too.
  await buffs.getByRole('radio', { name: 'Standard raid (default)' }).click()
  await expect(buffs.getByRole('switch', { name: 'Moonkin Aura' })).toBeChecked()
  await expect(buffs.getByRole('switch', { name: 'Curse of the Elements' })).toBeChecked()
  await expect(buffs.getByRole('switch', { name: 'Elixir of the Mongoose' })).toBeEnabled()

  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('group', { name: 'Warrior' }).getByRole('menuitem', { name: /^Fury/ }).click()
  await expect(buffs.getByRole('switch', { name: 'Battle Shout' })).toBeVisible()
  for (const name of ['Moonkin Aura', 'Power Infusion', 'Curse of the Elements']) await expect(buffs.getByRole('switch', { name, exact: true })).toHaveCount(0)
})

// The warlock is a caster too (SpecMeta.caster, WL2): the same melee entries are gone from both specs'
// Buffs tabs in every preset, and its Standard raid has the casters' entries and its own elixir.
test('a warlock’s Buffs tab lists nothing that changes only attacks, in any preset', async ({ page }) => {
  await page.goto('./')
  const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
  for (const spec of [/^Destruction/, /^Affliction/]) {
    await page.getByRole('button', { name: /^Spec: / }).click()
    await page.getByRole('group', { name: 'Warlock' }).getByRole('menuitem', { name: spec }).click()
    await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
    await expect(buffs.getByRole('radio', { name: 'Standard raid (default)' })).toBeChecked()
    for (const preset of ['Self only', 'Dungeon group', 'Standard raid (default)', 'Max consumables']) {
      await buffs.getByRole('radio', { name: preset }).click()
      for (const name of MELEE_ONLY) await expect(buffs.getByRole('switch', { name, exact: true }), `${spec} ${preset}: ${name}`).toHaveCount(0)
    }
    await buffs.getByRole('radio', { name: 'Standard raid (default)' }).click()
    await expect(buffs.getByRole('switch', { name: 'Moonkin Aura' })).toBeChecked()
    await expect(buffs.getByRole('switch', { name: 'Elixir of Shadow Power' })).toBeChecked()
  }
})
