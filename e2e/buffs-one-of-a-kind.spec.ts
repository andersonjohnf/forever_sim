import { expect, test } from './fixtures.ts'

// docs/ux.md "Buffs": entries of which only one can be on turn each other off, and their summaries
// say so. A weapon takes one stone or oil (issue #13), potions share one cooldown (issue #14), and a
// group has one air totem and one Thorns (review FU-5; buffs doc "Exclusivity groups", "On-use items
// and cooldown categories").

test('a warrior’s stones and potions: one of each, the other switched off', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
  const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
  await buffs.getByRole('radio', { name: 'Max consumables' }).click()

  const dense = buffs.getByRole('switch', { name: 'Dense Sharpening Stone / Weightstone' })
  const elemental = buffs.getByRole('switch', { name: 'Elemental Sharpening Stone' })
  await expect(elemental).toBeChecked()
  await expect(dense).not.toBeChecked()
  await expect(dense).toHaveAccessibleDescription('+8 weapon damage on each weapon (one stone per weapon)')
  await dense.click()
  await expect(dense).toBeChecked()
  await expect(elemental).not.toBeChecked()
  await expect(page.getByText('Custom selection.')).toBeVisible()

  const rage = buffs.getByRole('switch', { name: 'Mighty Rage Potion' })
  const stoneshield = buffs.getByRole('switch', { name: 'Greater Stoneshield Potion' })
  const bomb = buffs.getByRole('switch', { name: 'EZ-Thro Dark Bomb' })
  await expect(rage).toBeChecked()
  // No preset throws the bomb (buffs doc §6.3); it's yours to turn on.
  await expect(bomb).not.toBeChecked()
  // Its throw stops a warrior's swings (buffs doc §3.7, review CV-2).
  await expect(bomb).toHaveAccessibleDescription('225–675 Fire damage, every minute; its 1 s throw stops your melee swings')
  await bomb.click()
  // Armor changes nothing for a DPS spec, and the entry says so (review CV-1).
  await expect(stoneshield).toHaveAccessibleDescription(
    '+2,000 armor for 2 min, drunk on cooldown from the pull. Potions share a cooldown, so one is on at a time. Only the tank takes the boss’s swings, so it changes nothing for you.',
  )
  await stoneshield.click()
  await expect(stoneshield).toBeChecked()
  await expect(rage).not.toBeChecked()
  // The bomb has a cooldown of its own: it stays on.
  await expect(bomb).toBeChecked()
})

test('a mage’s oils: one at a time, and the potion stays beside the rune', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('group', { name: 'Mage' }).getByRole('menuitem', { name: /^Fire/ }).click()
  await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
  const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
  await buffs.getByRole('radio', { name: 'Max consumables' }).click()

  const wizard = buffs.getByRole('switch', { name: 'Wizard Oil', exact: true })
  const brilliant = buffs.getByRole('switch', { name: 'Brilliant Wizard Oil' })
  await expect(brilliant).toBeChecked()
  await expect(wizard).not.toBeChecked()
  // A caster sees only oils, on its one weapon (docs/ux.md "Buffs").
  await expect(wizard).toHaveAccessibleDescription('+24 spell damage, on your main hand (one oil at a time)')
  await wizard.click()
  await expect(wizard).toBeChecked()
  await expect(brilliant).not.toBeChecked()
  await brilliant.click()
  await expect(brilliant).toBeChecked()
  await expect(wizard).not.toBeChecked()

  await expect(buffs.getByRole('switch', { name: 'Major Mana Potion' })).toBeChecked()
  await expect(buffs.getByRole('switch', { name: 'Demonic Rune' })).toBeChecked()
  // A caster never swings: the bomb's throw holds its next cast (review CV-2).
  await expect(buffs.getByRole('switch', { name: 'EZ-Thro Dark Bomb' })).toHaveAccessibleDescription('225–675 Fire damage, every minute; its 1 s throw holds your next cast')
})

// The air totems and the two Thorns name the rival they turn off (src/features/buffs/rival-note.ts).
test('a Fury warrior’s air totems: one at a time, and each says so', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
  const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
  const windfury = buffs.getByRole('switch', { name: 'Windfury Totem' })
  const grace = buffs.getByRole('switch', { name: 'Grace of Air Totem' })
  const note = 'One air totem at a time (even from different shamans)'
  await expect(windfury).toBeChecked()
  await expect(grace).not.toBeChecked()
  await expect(windfury).toHaveAccessibleDescription(`20% chance on a main-hand hit for an extra attack; it, and whatever you swing or cast in the next 1 s, gets +246 attack power. ${note}`)
  await expect(grace).toHaveAccessibleDescription(`+77 Agility. ${note}`)
  await grace.click()
  await expect(grace).toBeChecked()
  await expect(windfury).not.toBeChecked()
})

test('a bear’s two Thorns: one at a time, and each says so', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('menuitem', { name: /Feral \(Bear\)/ }).click()
  await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
  const buffs = page.getByRole('tabpanel', { name: 'Buffs' })
  const thorns = buffs.getByRole('switch', { name: 'Thorns', exact: true })
  const own = buffs.getByRole('switch', { name: 'Thorns (your own)', exact: true })
  await expect(thorns).toHaveAccessibleDescription(/: a raid Restoration druid’s, with its gear’s spell damage\. Doesn’t stack with the other Thorns$/)
  await expect(own).toHaveAccessibleDescription(/, when no other druid casts it\. Doesn’t stack with the other Thorns$/)
  await expect(thorns).toBeChecked()
  await own.click()
  await expect(own).toBeChecked()
  await expect(thorns).not.toBeChecked()
})

test('a Protection warrior’s Thorns has no rival to name', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /^Spec: / }).click()
  await page.getByRole('group', { name: 'Warrior' }).getByRole('menuitem', { name: /^Protection/ }).click()
  await page.getByRole('tab', { name: 'Buffs', exact: true }).click()
  const thorns = page.getByRole('tabpanel', { name: 'Buffs' }).getByRole('switch', { name: 'Thorns', exact: true })
  await expect(thorns).toHaveAccessibleDescription('47 Nature damage to the boss each time it hits you: a raid Restoration druid’s, with its gear’s spell damage')
})
