import { describe, expect, it } from 'vitest'
import type { GearSlot } from '@/sim'
import { defaultConfig, fitsSlot } from '@/sim'
import { itemData, itemsById } from '@/lib/items'
import { buildPlan } from '@/sim/plan/build'
import { statsLine, unsimulatedEffects } from './item-flags'

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
