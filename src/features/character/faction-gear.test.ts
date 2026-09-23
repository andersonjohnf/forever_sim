import { describe, expect, it } from 'vitest'
import { itemsById } from '@/lib/items'
import { defaultConfig, fitsFaction, SPEC_IDS, type SimConfig } from '@/sim'
import { changeRace, factionTwin } from './faction-gear'

const item = (id: number) => itemsById.get(id)!

describe('faction twins (docs/data/items.md#equipping-rules)', () => {
  it('finds the other side’s PvP and battleground twin, both ways', () => {
    const twins: [number, number][] = [
      [23315, 23243], // Lieutenant Commander's / Champion's Plate Shoulders (rank 10)
      [23287, 22858], // Knight-Lieutenant's / Blood Guard's Plate Greaves (rank 7)
      [23300, 22872], // Knight-Captain's / Legionnaire's Plate Hauberk (rank 8)
      [18443, 16335], // Master Sergeant's / Senior Sergeant's Insignia (rank 4)
      [18461, 16342], // Sergeant's Cloak / Sergeant's Cape (rank 3)
      [17904, 17909], // Stormpike / Frostwolf Insignia Rank 6: only the use's destination differs
    ]
    for (const [alliance, horde] of twins) {
      expect(factionTwin(item(alliance), 'Horde')?.id, item(alliance).name).toBe(horde)
      expect(factionTwin(item(horde), 'Alliance')?.id, item(horde).name).toBe(alliance)
    }
  })

  it('picks the twin whose name ends the same way when several share the stats', () => {
    expect(factionTwin(item(20050), 'Horde')?.name).toBe("Defiler's Chain Greaves")
    expect(factionTwin(item(20051), 'Horde')?.name).toBe("Defiler's Mail Greaves")
  })

  it('has no twin for items only one side has, for neutral items, or for the same side', () => {
    expect(factionTwin(item(18445), 'Horde')).toBeNull() // Sergeant Major's Plate Wristguards: the Horde piece differs
    expect(factionTwin(item(23315), 'Alliance')).toBeNull()
    const neutral = defaultConfig('warrior-fury').gear.head!.itemId // Lionheart Helm
    expect(factionTwin(item(neutral), 'Horde')).toBeNull()
  })
})

describe('changing race', () => {
  it.each(SPEC_IDS.filter((s) => s.startsWith('warrior')))('%s: gives the new faction’s twins, as its defaults would', (spec) => {
    const human = defaultConfig(spec, 'alliance-human')
    const { config, swapped, kept } = changeRace(human, 'horde-orc')
    expect(config.race).toBe('horde-orc')
    expect(swapped.length).toBeGreaterThan(0)
    expect(kept).toEqual([])
    expect(config.gear).toEqual(defaultConfig(spec, 'horde-orc').gear)
    // And back again.
    expect(changeRace(config, 'alliance-human').config.gear).toEqual(human.gear)
  })

  it('keeps the enchant and swaps nothing within a faction', () => {
    const human = defaultConfig('warrior-fury', 'alliance-human')
    const shoulders: SimConfig = { ...human, gear: { ...human.gear, shoulder: { itemId: 23315, enchantId: 'zandalarSignetOfMight' } } }
    const orc = changeRace(shoulders, 'horde-troll')
    expect(orc.config.gear.shoulder).toEqual({ itemId: 23243, enchantId: 'zandalarSignetOfMight' })
    const dwarf = changeRace(shoulders, 'alliance-dwarf')
    expect(dwarf.swapped).toEqual([])
    expect(dwarf.config.gear).toEqual(shoulders.gear)
  })

  it('keeps an item with no twin and says so', () => {
    const human = defaultConfig('warrior-fury', 'alliance-human')
    const bracers: SimConfig = { ...human, gear: { ...human.gear, wrist: { itemId: 18445 } } }
    const { config, kept } = changeRace(bracers, 'horde-orc')
    expect(kept.map((k) => [k.slot, k.item.id])).toEqual([['wrist', 18445]])
    expect(config.gear.wrist).toEqual({ itemId: 18445 })
    expect(fitsFaction('horde-orc', item(18445))).toBe(false)
  })
})
