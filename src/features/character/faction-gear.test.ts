import { describe, expect, it } from 'vitest'
import { itemData, itemsById } from '@/lib/items'
import { canUse, defaultConfig, fitsFaction, itemFaction, SPEC_IDS, SPEC_META, type ClassId, type GearSlot, type SimConfig, type SpecId } from '@/sim'
import { changeRace, factionTwin, raceChangeTwin } from './faction-gear'

const item = (id: number) => itemsById.get(id)!

describe('faction twins (docs/data/items.md#faction-twins)', () => {
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
      expect(factionTwin(item(alliance), 'Horde', 'warrior')?.id, item(alliance).name).toBe(horde)
      expect(factionTwin(item(horde), 'Alliance', 'warrior')?.id, item(horde).name).toBe(alliance)
    }
  })

  it('picks the twin whose name ends the same way when several share the stats', () => {
    // Highlander's Chain Greaves matches Defiler's Chain and Mail Greaves, whose sets give the same bonuses.
    expect(item(20050).twins).toEqual([20154, 20199])
    expect(factionTwin(item(20050), 'Horde', 'warrior')?.name).toBe("Defiler's Chain Greaves")
    // Highlander's Mail Greaves has none: its set's 3-piece is spell crit, the Defilers' melee crit.
    expect(item(20051).twins).toEqual([])
    expect(factionTwin(item(20051), 'Horde', 'warrior')).toBeNull()
  })

  it('finds twins the old stat match missed: the Arathi Basin Ironbark Staff (DV2-1)', () => {
    // Identical client rows but for the faction and price: The League of Arathor's and The Defilers'.
    expect(item(20069).name).toBe(item(20220).name)
    expect(factionTwin(item(20069), 'Horde', 'warlock')?.id).toBe(20220)
    expect(factionTwin(item(20220), 'Alliance', 'mage')?.id).toBe(20069)
  })

  it('matches class restrictions by whether this class can wear both, not by the whole list', () => {
    // Sergeant Major's Plate Wristguards (warriors and paladins) / First Sergeant's Plate Bracers (warriors).
    expect(item(18445).classes).toEqual(['Warrior', 'Paladin'])
    expect(item(18429).classes).toEqual(['Warrior'])
    expect(factionTwin(item(18445), 'Horde', 'warrior')?.id).toBe(18429)
    expect(factionTwin(item(18429), 'Alliance', 'warrior')?.id).toBe(18445)
    // A paladin can't wear the Horde piece, so for a paladin there's no twin.
    expect(factionTwin(item(18445), 'Horde', 'paladin')).toBeNull()
  })

  it('has no twin for items only one side has, for neutral items, or for the same side', () => {
    expect(factionTwin(item(16337), 'Horde', 'warrior')).toBeNull() // Sergeant Major's Cape: no Horde piece with its stats
    expect(factionTwin(item(23315), 'Alliance', 'warrior')).toBeNull()
    const neutral = defaultConfig('warrior-fury').gear.head!.itemId // Lionheart Helm
    expect(factionTwin(item(neutral), 'Horde', 'warrior')).toBeNull()
  })
})

describe('the pre-raid lists’ faction twins (docs/data/items.md#faction-twins)', () => {
  it('give every one-faction item on a list its other faction’s twin at the same rank, when the client has one', () => {
    let checked = 0
    for (const i of itemData.items) {
      const own = itemFaction(i)
      if (own === null) continue
      const other = own === 'Alliance' ? 'Horde' : 'Alliance'
      for (const e of i.preRaidBis) {
        const twin = factionTwin(i, other, SPEC_META[e.spec as SpecId].classId)
        if (!twin) continue
        checked++
        expect(twin.preRaidBis, `${e.spec} ${e.slot}: ${i.name} (${i.id}) → ${twin.name} (${twin.id})`).toContainEqual(e)
      }
    }
    expect(checked).toBeGreaterThan(50)
  })

  it('pair twins both ways, with the same slot, level, stats, weapon and effects', () => {
    let pairs = 0
    for (const i of itemData.items)
      for (const id of i.twins) {
        const t = item(id)
        pairs++
        expect(t.twins, `${t.name} lists ${i.name}`).toContain(i.id)
        const same = (x: typeof i) => [x.slot, x.itemLevel, x.quality, x.stats, x.weapon, x.procs.map((p) => p.spellId), x.useEffects.map((u) => u.cooldownSec ?? null)]
        expect(same(t), `${i.name} (${i.id}) and ${t.name} (${t.id})`).toEqual(same(i))
      }
    expect(pairs).toBeGreaterThan(150)
  })
})

describe('the race change’s stat twins (docs/data/items.md#faction-twins, "Two tiers")', () => {
  it('include every twin, and pair both ways with the same slot, level, stats, weapon and effects', () => {
    let pairs = 0
    for (const i of itemData.items) {
      for (const id of i.twins) expect(i.statTwins, `${i.name} (${i.id}) twin ${id}`).toContain(id)
      for (const id of i.statTwins) {
        const t = item(id)
        pairs++
        expect(t.statTwins, `${t.name} lists ${i.name}`).toContain(i.id)
        const same = (x: typeof i) => [x.slot, x.itemLevel, x.quality, x.stats, x.weapon, x.procs.map((p) => p.spellId), x.useEffects.map((u) => u.cooldownSec ?? null)]
        expect(same(t), `${i.name} (${i.id}) and ${t.name} (${t.id})`).toEqual(same(i))
      }
    }
    expect(pairs).toBeGreaterThan(450)
  })

  it('swap the Rank 7 to 10 leather, satin and silk and the Arathi Basin mail, whose sets differ (GV-1)', () => {
    // The Alliance's Rank 7 to 10 pieces have no item set in Forever's rows; Highlander's Mail
    // Pauldrons' 3-piece is spell crit where the Defilers' is melee crit.
    const cases: [number, 'Alliance' | 'Horde', ClassId, number][] = [
      [23257, 'Alliance', 'rogue', 23312], // Champion's → Lieutenant Commander's Leather Helm
      [22864, 'Alliance', 'rogue', 23284], // Blood Guard's → Knight-Lieutenant's Leather Grips
      [23288, 'Horde', 'priest', 22869], // Knight-Lieutenant's → Blood Guard's Satin Handwraps
      [22870, 'Alliance', 'mage', 23290], // Blood Guard's → Knight-Lieutenant's Silk Handwraps
      [20203, 'Alliance', 'shaman', 20056], // Defiler's → Highlander's Mail Pauldrons
    ]
    for (const [from, faction, classId, to] of cases) {
      expect(factionTwin(item(from), faction, classId), item(from).name).toBeNull()
      expect(raceChangeTwin(item(from), faction, classId), item(from).name).toEqual({ twin: item(to), setDiffers: true })
      const back = faction === 'Alliance' ? 'Horde' : 'Alliance'
      expect(raceChangeTwin(item(to), back, classId), item(to).name).toEqual({ twin: item(from), setDiffers: true })
    }
    // A faction twin comes first among pieces whose sets end the same way, with the same set bonus.
    expect(raceChangeTwin(item(20050), 'Horde', 'warrior')).toEqual({ twin: item(20154), setDiffers: false })
  })

  it('keep a set together: the set whose name ends the same way beats an exact twin in another set (GC-1)', () => {
    // Defiler's Mail Greaves (The Defiler's Fortitude) has an exact twin in Highlander's Chain Greaves
    // (The Highlander's Determination), but its pauldrons and girdle go to The Highlander's Fortitude.
    expect(item(20199).twins).toContain(20050)
    for (const classId of ['warrior', 'paladin', 'hunter', 'shaman'] as ClassId[]) {
      expect(raceChangeTwin(item(20199), 'Alliance', classId), classId).toEqual({ twin: item(20051), setDiffers: true })
      expect(raceChangeTwin(item(20051), 'Horde', classId), classId).toEqual({ twin: item(20199), setDiffers: true })
    }
  })

  it('come back to the same piece on a round trip, for every faction-bound item a class can wear', () => {
    const classes = [...new Set(Object.values(SPEC_META).map((m) => m.classId))]
    let trips = 0
    const asymmetric: string[] = []
    for (const i of itemData.items) {
      const own = itemFaction(i)
      if (own === null) continue
      const other = own === 'Alliance' ? 'Horde' : 'Alliance'
      for (const classId of classes.filter((c) => canUse(c, i))) {
        const there = raceChangeTwin(i, other, classId)
        if (!there) continue
        trips++
        const back = raceChangeTwin(there.twin, own, classId)
        if (back?.twin.id !== i.id || back.setDiffers !== there.setDiffers)
          asymmetric.push(`${classId} ${i.name} (${i.id}) → ${there.twin.id} → ${back?.twin.id}`)
      }
    }
    expect(asymmetric).toEqual([])
    expect(trips).toBeGreaterThan(700)
  })
})

describe('changing race', () => {
  it('swaps the pieces whose set differs, and says so (GV-1)', () => {
    const swap = (spec: SpecId, race: string, gear: Partial<Record<GearSlot, number>>, to: string) => {
      const d = defaultConfig(spec, race)
      const c: SimConfig = { ...d, gear: { ...d.gear, ...Object.fromEntries(Object.entries(gear).map(([slot, id]) => [slot, { itemId: id }])) } }
      const change = changeRace(c, to)
      return { change, of: (slot: GearSlot) => change.swapped.find((s) => s.slot === slot) }
    }
    const rogue = swap('rogue-combat', 'horde-orc', { head: 23257, hands: 22864 }, 'alliance-human')
    expect(rogue.change.config.gear.head?.itemId).toBe(23312)
    expect(rogue.change.config.gear.hands?.itemId).toBe(23284)
    expect(rogue.of('head')).toMatchObject({ from: item(23257), to: item(23312), setDiffers: true })
    expect(rogue.change.kept).toEqual([])
    const priest = swap('priest-shadow', 'alliance-human', { hands: 23288 }, 'horde-troll')
    expect(priest.change.config.gear.hands?.itemId).toBe(22869)
    expect(priest.of('hands')?.setDiffers).toBe(true)
    const shaman = swap('shaman-enhancement', 'horde-orc', { shoulder: 20203 }, 'alliance-dwarf')
    expect(shaman.change.config.gear.shoulder?.itemId).toBe(20056)
    expect(shaman.of('shoulder')?.setDiffers).toBe(true)
  })

  it('moves a whole set to one set on the other side, and back (GC-1)', () => {
    // 3/3 The Defiler's Fortitude on a Horde Enhancement shaman.
    const d = defaultConfig('shaman-enhancement', 'horde-orc')
    const fortitude = { shoulder: 20203, waist: 20195, feet: 20199 } as const
    const c: SimConfig = { ...d, gear: { ...d.gear, ...Object.fromEntries(Object.entries(fortitude).map(([slot, id]) => [slot, { itemId: id }])) } }
    const dwarf = changeRace(c, 'alliance-dwarf')
    const pieces = (config: SimConfig) => (['shoulder', 'waist', 'feet'] as const).map((s) => config.gear[s]?.itemId)
    expect(pieces(dwarf.config)).toEqual([20056, 20044, 20051]) // all The Highlander's Fortitude
    expect(new Set(pieces(dwarf.config).map((id) => item(id!).setId)).size).toBe(1)
    for (const slot of ['shoulder', 'waist', 'feet'] as const)
      expect(dwarf.swapped.find((s) => s.slot === slot)?.setDiffers, slot).toBe(true)
    const orc = changeRace(dwarf.config, 'horde-orc')
    expect(pieces(orc.config)).toEqual([20203, 20195, 20199])
  })

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
    const cape: SimConfig = { ...human, gear: { ...human.gear, back: { itemId: 16337 } } }
    const { config, kept } = changeRace(cape, 'horde-orc')
    expect(kept.map((k) => [k.slot, k.item.id])).toEqual([['back', 16337]])
    expect(config.gear.back).toEqual({ itemId: 16337 })
    expect(fitsFaction('horde-orc', item(16337))).toBe(false)
  })

  it('swaps the rank-5 plate bracers for a warrior (RL8)', () => {
    const human = defaultConfig('warrior-fury', 'alliance-human')
    const bracers: SimConfig = { ...human, gear: { ...human.gear, wrist: { itemId: 18445, enchantId: 'bracerSuperiorStrength' } } }
    const orc = changeRace(bracers, 'horde-orc')
    expect(orc.config.gear.wrist).toEqual({ itemId: 18429, enchantId: 'bracerSuperiorStrength' })
    expect(orc.swapped.map((s) => [s.slot, s.from.id, s.to.id])).toContainEqual(['wrist', 18445, 18429])
    expect(orc.kept).toEqual([])
    expect(changeRace(orc.config, 'alliance-human').config.gear.wrist).toEqual({ itemId: 18445, enchantId: 'bracerSuperiorStrength' })
  })
})
