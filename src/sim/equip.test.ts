import { describe, expect, it } from 'vitest'
import itemJson from '@/data/items/pre-bis.json'
import type { Item, ItemData } from '@/data/items/types'
import raceJson from '@/data/races/races.json'
import type { RaceData } from '@/data/races/types'
import { defaultConfig } from './defaults'
import { canUse, fitsFaction, fitsSlot, itemFaction, raceFaction, uniqueConflicts } from './equip'
import { SPEC_IDS, SPEC_META } from './specs'
import type { GearSlot } from './types'

const items = (itemJson as unknown as ItemData).items
const byName = (name: string) => {
  const item = items.find((i) => i.name === name)
  if (!item) throw new Error(`No item named ${name}`)
  return item
}
const byId = (id: number) => {
  const item = items.find((i) => i.id === id)
  if (!item) throw new Error(`No item ${id}`)
  return item
}

describe('proficiencies', () => {
  it('keeps druids out of mail and plate and paladins away from idols', () => {
    expect(canUse('druid', byName('Lionheart Helm'))).toBe(false)
    expect(canUse('warrior', byName('Lionheart Helm'))).toBe(true)
    const idol = items.find((i) => i.itemSubclass === 'Idol')!
    expect(canUse('druid', idol)).toBe(true)
    expect(canUse('paladin', idol)).toBe(false)
  })

  it('only lets warriors put a weapon in the off hand', () => {
    const offHandWeapon = byName("Mirah's Song")
    expect(fitsSlot('warrior', 'offHand', offHandWeapon)).toBe(true)
    expect(fitsSlot('paladin', 'offHand', offHandWeapon)).toBe(false)
  })

  it('respects class-restricted items', () => {
    const druidOnly = items.find((i) => i.classes?.length === 1 && i.classes[0] === 'Druid')!
    expect(canUse('druid', druidOnly)).toBe(true)
    expect(canUse('warrior', druidOnly)).toBe(false)
  })
})

describe('Unique and Unique-Equipped (docs/data/items.md#equipping-rules)', () => {
  const conflictIds = (worn: Partial<Record<GearSlot, Item>>, slot: GearSlot, item: Item) =>
    uniqueConflicts(worn, slot, item).map((c) => [c.slot, c.item.id, c.group])

  it('allows one item of a Unique-Equipped group across the pair: two Undermine trinkets', () => {
    const worn = { trinket2: byId(272438) } // Weakness Analyzer
    expect(conflictIds(worn, 'trinket1', byId(272437))).toEqual([['trinket2', 272438, 'Undermine Trinkets']]) // Adaptive Combat Assistant
    // Replacing the group's item in its own slot is fine.
    expect(conflictIds(worn, 'trinket2', byId(272437))).toEqual([])
  })

  it('allows one Watcher’s Signet', () => {
    expect(conflictIds({ finger1: byId(275968) }, 'finger2', byId(275970))).toEqual([['finger1', 275968, "Watcher's Signet"]])
  })

  it('allows one copy of a unique weapon across both hands: Annihilator', () => {
    const annihilator = byId(12798)
    expect(conflictIds({ mainHand: annihilator }, 'offHand', annihilator)).toEqual([['mainHand', 12798, null]])
    expect(conflictIds({ offHand: annihilator }, 'mainHand', annihilator)).toEqual([['offHand', 12798, null]])
  })

  it('allows one copy of a Unique ring and two of a plain one', () => {
    expect(conflictIds({ finger1: byId(19325) }, 'finger2', byId(19325))).toEqual([['finger1', 19325, null]]) // Don Julio's Band
    expect(conflictIds({ finger1: byId(11934) }, 'finger2', byId(11934))).toEqual([]) // Emperor's Seal
    expect(conflictIds({ finger1: byId(19325) }, 'finger2', byId(11934))).toEqual([])
  })

  it('ignores the off hand when a two-hander goes in the main hand, since it frees it', () => {
    const unique = { ...byId(12798), uniqueEquipped: { group: 'Test', max: 1 } }
    const twoHander = { ...unique, id: -1, slot: 'twoHand' as const }
    expect(conflictIds({ offHand: unique }, 'mainHand', twoHander)).toEqual([])
    expect(conflictIds({ offHand: unique }, 'mainHand', { ...twoHander, slot: 'oneHand' })).toEqual([['offHand', 12798, 'Test']])
  })

  it('allows a group up to its limit', () => {
    const member = (id: number) => ({ ...byId(272438), id, uniqueEquipped: { group: 'Two', max: 2 } })
    expect(conflictIds({ trinket1: member(1) }, 'finger1', member(2))).toEqual([])
    expect(conflictIds({ trinket1: member(1), trinket2: member(2) }, 'finger1', member(3))).toHaveLength(2)
  })

  it('has consistent Unique-Equipped groups in the data: one limit per group, and every member Unique', () => {
    const limits = new Map<string, Set<number>>()
    for (const item of items) {
      const group = item.uniqueEquipped?.group
      if (!group) continue
      limits.set(group, (limits.get(group) ?? new Set()).add(item.uniqueEquipped!.max))
      expect(item.unique, item.name).toBe(true)
    }
    expect([...limits.keys()]).toEqual(expect.arrayContaining(['Undermine Trinkets', "Watcher's Signet"]))
    for (const [group, max] of limits) {
      expect(max.size, group).toBe(1)
      expect([...max][0], group).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('faction-bound items (docs/data/items.md#equipping-rules)', () => {
  const races = (raceJson as unknown as RaceData).races

  it('knows each race’s faction', () => {
    expect(raceFaction('alliance-human')).toBe('Alliance')
    expect(raceFaction('horde-tauren')).toBe('Horde')
    expect(raceFaction('nobody')).toBeNull()
    for (const race of races) expect(raceFaction(race.id), race.id).toBe(race.faction)
  })

  it('places the PvP twins on the pre-raid lists by their rank titles', () => {
    const twins: [number, number][] = [
      [23315, 23243], // Lieutenant Commander's / Champion's Plate Shoulders (rank 10)
      [23287, 22858], // Knight-Lieutenant's / Blood Guard's Plate Greaves (rank 7)
      [23300, 22872], // Knight-Captain's / Legionnaire's Plate Hauberk (rank 8)
      [18454, 18434], // Sergeant Major's / First Sergeant's Dragonhide armguards (rank 5)
      [18443, 16335], // Master Sergeant's / Senior Sergeant's Insignia (rank 4)
      [18461, 16342], // Sergeant's Cloak / Sergeant's Cape (rank 3: the title is shared)
    ]
    for (const [alliance, horde] of twins) {
      expect(itemFaction(byId(alliance)), byId(alliance).name).toBe('Alliance')
      expect(itemFaction(byId(horde)), byId(horde).name).toBe('Horde')
    }
  })

  it('places every PvP-rank item in the pool, and both factions get their share', () => {
    const pvp = items.filter((i) => i.requirements.some((r) => r.kind === 'pvpRank'))
    expect(pvp.length).toBeGreaterThan(100)
    const unplaced = pvp.filter((i) => itemFaction(i) === null).map((i) => i.name)
    expect(unplaced).toEqual([])
    const alliance = pvp.filter((i) => itemFaction(i) === 'Alliance').length
    expect(alliance / pvp.length).toBeGreaterThan(0.4)
    expect(alliance / pvp.length).toBeLessThan(0.6)
  })

  it('places reputation rewards and Alterac Valley rewards', () => {
    expect(itemFaction(byName('Talisman of Arathor'))).toBe('Alliance')
    expect(itemFaction(byName("Defiler's Talisman"))).toBe('Horde')
    expect(itemFaction(byName('Theramore Signet'))).toBe('Alliance')
    expect(itemFaction(byName('Darkspear Signet'))).toBe('Horde')
    expect(itemFaction(byName('Stormpike Insignia Rank 6'))).toBe('Alliance')
    expect(itemFaction(byName('Frostwolf Insignia Rank 6'))).toBe('Horde')
  })

  // RL7: the client lists them with no requirement, as it does Alterac Valley's.
  it('places the Warsong Gulch rewards by their quartermasters’ names, twin by twin [C]', () => {
    const twins: [number, number][] = [
      [19538, 19534], // Sentinel's / Scout's Medallion
      [19514, 19510], // Protector's / Legionnaire's Band
      [19522, 19518], // Lorekeeper's / Advisor's Ring
      [19530, 19526], // Caretaker's Cape / Battle Healer's Cloak
      [19546, 19542], // Sentinel's / Scout's Blade
      [19554, 19550], // Protector's / Legionnaire's Sword
      [19562, 19558], // Outrunner's / Outrider's Bow
      [19570, 19566], // Lorekeeper's Staff / Advisor's Gnarled Staff
    ]
    for (const [alliance, horde] of twins) {
      expect(itemFaction(byId(alliance)), byId(alliance).name).toBe('Alliance')
      expect(itemFaction(byId(horde)), byId(horde).name).toBe('Horde')
      // Twins: the same slot, level and stats.
      expect(byId(alliance).slot).toBe(byId(horde).slot)
      expect(byId(alliance).itemLevel).toBe(byId(horde).itemLevel)
      expect(byId(alliance).stats).toEqual(byId(horde).stats)
      expect(byId(alliance).requirements).toEqual([])
    }
    expect(fitsFaction('horde-orc', byName("Sentinel's Medallion"))).toBe(false)
    expect(fitsFaction('alliance-human', byName("Legionnaire's Sword"))).toBe(false)
    // Forever's own Sentinel's Libram is new, with no twin: both factions [?].
    expect(byId(272434)).toMatchObject({ name: "Sentinel's Libram", tab: 'new' })
    expect(itemFaction(byId(272434))).toBeNull()
    // The Horde PvP rank-8 pieces also start "Legionnaire's": Horde either way.
    expect(itemFaction(byName("Legionnaire's Plate Armor"))).toBe('Horde')
  })

  it('leaves everything else to both factions', () => {
    for (const name of ['Lionheart Helm', 'Hand of Justice', 'Darkspear', "Champion's Chain Headguard"]) {
      const item = byName(name)
      const faction = itemFaction(item)
      // Champion's Chain Headguard is a Horde PvP piece (rank 10); the rest are neutral.
      expect(faction, name).toBe(name.startsWith("Champion's") ? 'Horde' : null)
    }
    // Forever's Premier PvP pieces carry no requirement to place them by.
    expect(itemFaction(byId(272490))).toBeNull()
    expect(fitsFaction('alliance-human', byName('Lionheart Helm'))).toBe(true)
    expect(fitsFaction('alliance-human', byId(23243))).toBe(false)
    expect(fitsFaction('horde-orc', byId(23243))).toBe(true)
  })

  it('reads race restrictions when the data has them', () => {
    const helm = byName('Lionheart Helm')
    expect(itemFaction({ ...helm, races: ['Orc', 'Troll'] })).toBe('Horde')
    expect(itemFaction({ ...helm, races: ['Human'] })).toBe('Alliance')
    // Skyborne are on both sides.
    expect(itemFaction({ ...helm, races: ['Skyborne'] })).toBeNull()
    expect(itemFaction({ ...helm, races: ['Human', 'Orc'] })).toBeNull()
  })
})

describe.each(SPEC_IDS)('default gear for %s', (spec) => {
  it('is all equippable by the class in its slot', () => {
    const { classId } = SPEC_META[spec]
    for (const [slot, { itemId }] of Object.entries(defaultConfig(spec).gear)) {
      const item = items.find((i) => i.id === itemId)!
      expect(fitsSlot(classId, slot as GearSlot, item), `${slot}: ${item.name}`).toBe(true)
    }
  })
})
