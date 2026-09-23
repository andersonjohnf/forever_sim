import { describe, expect, it } from 'vitest'
import type { GearSlot } from '@/sim'
import { defaultConfig, fitsSlot } from '@/sim'
import { itemData, itemsById } from '@/lib/items'
import { buildPlan } from '@/sim/plan/build'
import { unsimulatedEffects } from './item-flags'

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
