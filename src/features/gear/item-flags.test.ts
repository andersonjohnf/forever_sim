import { describe, expect, it } from 'vitest'
import type { GearSlot } from '@/sim'
import { defaultConfig, fitsSlot } from '@/sim'
import { itemData, itemsById } from '@/lib/items'
import { buildPlan } from '@/sim/plan/build'
import { classicFlag, itemDescription, statsLine, unsimulatedEffects } from './item-flags'

const SLOTS: GearSlot[] = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'finger1', 'trinket1', 'mainHand', 'offHand', 'ranged']

/** The item names an assumption lists after its colon ("Some item effects aren’t simulated yet: A, B."). */
function listed(assumptions: { id: string; text: string }[], id: string): string[] {
  const text = assumptions.find((a) => a.id === id)?.text
  return text ? text.slice(text.indexOf(': ') + 2).replace(/\.$/, '').split(', ') : []
}

describe('gear-row badge for effects the sim leaves out', () => {
  it('flags Blackblade of Shahram’s summon, and not Hand of Justice’s extra attack or Weakness Analyzer’s use', () => {
    const byName = (name: string) => itemData.items.find((i) => i.name === name)!
    expect(unsimulatedEffects(byName('Blackblade of Shahram'))).toEqual(['Chance on hit: Summons the infernal spirit of Shahram.'])
    expect(unsimulatedEffects(byName('Hand of Justice'))).toEqual([])
    expect(unsimulatedEffects(itemsById.get(272438)!)).toEqual([])
    expect(unsimulatedEffects(byName('Lionheart Helm'))).toEqual([])
  })

  it('leaves out Idol of Brutality’s effect: the bear’s rotation simulates it, and for a cat it names only a bear’s abilities', () => {
    const idol = itemsById.get(23198)!
    expect(unsimulatedEffects(idol, 'druid-feral-cat')).toEqual([])
    expect(unsimulatedEffects(idol, 'druid-feral-bear')).toEqual([])
    // The cat's plan agrees: its default relic isn't listed as not simulated.
    const cat = defaultConfig('druid-feral-cat')
    expect(cat.gear.ranged?.itemId).toBe(23198)
    expect(listed(buildPlan(cat).assumptions, 'unmodelledProcs')).not.toContain('Idol of Brutality')
  })

  it('leaves out an effect that only moves you: the default bear’s Defiler’s Leather Boots’ run speed (JL-12, JU-6)', () => {
    const boots = itemData.items.find((i) => i.name === 'Defiler’s Leather Boots' || i.name === "Defiler's Leather Boots")!
    expect(boots.otherEquip.map((e) => e.spellId)).toEqual([23990])
    expect(unsimulatedEffects(boots, 'druid-feral-bear')).toEqual([])
    const bear = defaultConfig('druid-feral-bear')
    expect(bear.gear.feet?.itemId).toBe(boots.id)
    expect(listed(buildPlan(bear).assumptions, 'unmodelledProcs')).not.toContain(boots.name)
    // Ghost Wolf's speed and Sprint's duration only move you too.
    for (const spellId of [22801, 23049]) {
      const item = itemData.items.find((i) => i.otherEquip.some((e) => e.spellId === spellId))!
      expect(unsimulatedEffects(item).filter((line) => item.otherEquip.some((e) => e.spellId === spellId && e.raw === line)), item.name).toEqual([])
    }
  })

  it('agrees with the plan’s assumptions for every item with an effect a warrior can wear', () => {
    const base = defaultConfig('warrior-fury')
    const withEffects = itemData.items.filter(
      (i) => i.procs.length || i.otherEquip.length || i.useEffects.length || i.weapon?.extraDamage?.length,
    )
    let checked = 0
    for (const item of withEffects) {
      const slot = SLOTS.find((s) => fitsSlot('warrior', s, item))
      if (!slot) continue
      const { assumptions } = buildPlan({ ...base, gear: { [slot]: { itemId: item.id } } })
      const inPlan = [...listed(assumptions, 'unmodelledProcs'), ...listed(assumptions, 'onUseConsumables')].includes(item.name)
      expect(unsimulatedEffects(item).length > 0, item.name).toBe(inPlan)
      checked++
    }
    expect(checked).toBeGreaterThan(100)
  })
})

describe('the stats line (docs/ux.md "Gear"; review FU-9)', () => {
  it('quotes the effects of an item with no stats, so a proc trinket says what earns its rank', () => {
    expect(statsLine(itemsById.get(22268)!)).toBe(
      'Equip: Chance on harmful spellcast to increase your spell damage and healing by up to 35 for 10 sec. This spell damage increase is doubled against Dragonkin.',
    )
    expect(statsLine(itemsById.get(21180)!)).toMatch(/^Use: Increases your melee and ranged attack power by 280\./)
    expect(statsLine(itemsById.get(21190)!)).toMatch(/^Equip: Gives a chance when your harmful spells land/)
  })

  it('keeps an item’s stats when it has them', () => {
    expect(statsLine(itemData.items.find((i) => i.name === 'Hand of Justice')!)).toBe('+20 AP')
  })

  it('never says "No stats" for an item with an effect', () => {
    for (const i of itemData.items) if (i.procs.length || i.otherEquip.length || i.useEffects.length) expect(statsLine(i), i.name).not.toBe('No stats')
  })
})

describe('the Classic stats flag (EU-2)', () => {
  it('flags an item with no Forever data, and a Forever caster weapon whose spell power is Classic Era’s, each in its own words', () => {
    const noForever = itemData.items.find((i) => !i.foreverData)
    if (noForever) {
      expect(classicFlag(noForever)).toEqual({ kind: 'item' })
      expect(itemDescription(noForever)).toContain('Classic stats: no Forever data yet')
    }
    for (const id of [20069, 20070, 20214, 20220]) {
      const weapon = itemsById.get(id)!
      expect(weapon.foreverData).toBe(true)
      expect(classicFlag(weapon)).toEqual({ kind: 'stats', stats: 'spell power' })
      expect(itemDescription(weapon)).toContain('Classic stats: its spell power is Classic Era’s, with no Forever tooltip on record yet')
    }
    // Whiteout Staff's spell power is Forever's own tooltip.
    expect(classicFlag(itemsById.get(19101)!)).toBeNull()
  })
})
