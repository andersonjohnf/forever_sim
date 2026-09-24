import { describe, expect, it } from 'vitest'
import itemJson from '@/data/items/pre-bis.json'
import type { Item, ItemData } from '@/data/items/types'
import raceJson from '@/data/races/races.json'
import type { RaceData } from '@/data/races/types'
import { decodeTalentCode, talentsInCodeOrder, validateTalentBuild } from '@/data/talents/types'
import { ammoKind, DEFAULT_SUPPLIES, defaultConfig, INTERIM_GEAR, matchSupplies, preRaidListGear, TALENT_DATA } from './defaults'
import { armorReduction } from './core/formulas'
import { canUse, fitsFaction, uniqueConflicts } from './equip'
import { ITEM_EFFECTS } from './effects/items'
import { buildPlan } from './plan/build'
import { FOREVER } from './rules/profiles'
import { SPEC_IDS, SPEC_META } from './specs'
import type { GearSlot, SimConfig, SpecId } from './types'

const items = new Map((itemJson as unknown as ItemData).items.map((i) => [i.id, i]))
const raceData = raceJson as unknown as RaceData
const races = raceData.races

/** Which item equip slots may go in each gear slot. */
const FITS: Record<GearSlot, string[]> = {
  head: ['head'], neck: ['neck'], shoulder: ['shoulder'], back: ['back'], chest: ['chest'],
  wrist: ['wrist'], hands: ['hands'], waist: ['waist'], legs: ['legs'], feet: ['feet'],
  finger1: ['finger'], finger2: ['finger'], trinket1: ['trinket'], trinket2: ['trinket'],
  mainHand: ['mainHand'], offHand: ['offHand'], ranged: ['ranged'], ammo: ['ammo'], quiver: ['quiver'],
}

describe.each(SPEC_IDS)('default setup for %s', (spec) => {
  const config = defaultConfig(spec)
  const meta = SPEC_META[spec]

  it('uses a legal talent build for the class', () => {
    const data = TALENT_DATA[meta.classId]
    expect(validateTalentBuild(data, decodeTalentCode(data, config.talents))).toEqual([])
  })

  it('uses a race that can be the class in Forever', () => {
    const race = races.find((r) => r.id === config.race)
    expect(race?.classes.forever).toContain(meta.classId)
  })

  it('equips pool items in slots they fit', () => {
    const equipped = Object.entries(config.gear)
    expect(equipped.length).toBeGreaterThanOrEqual(15)
    for (const [slot, { itemId }] of equipped) {
      const item = items.get(itemId)
      expect(item, `${slot}: ${itemId}`).toBeDefined()
      expect(item!.equipSlots.some((s) => FITS[slot as GearSlot].includes(s)), `${slot}: ${item!.name}`).toBe(true)
    }
  })

  // docs/data/items.md#equipping-rules: for every race the class can be, the gear is the race's
  // faction's, breaks no Unique or Unique-Equipped rule, and keeps two distinct rings and trinkets.
  it.each(raceData.simClassAvailability[meta.classId].forever)('is legal for a %s', (race) => {
    const gear = defaultConfig(spec, race).gear
    expect(defaultConfig(spec, race).race).toBe(race)
    const worn: Partial<Record<GearSlot, Item>> = {}
    for (const [slot, { itemId }] of Object.entries(gear) as [GearSlot, { itemId: number }][]) {
      const item = items.get(itemId)!
      expect(canUse(meta.classId, item), `${slot}: ${item.name}`).toBe(true)
      expect(fitsFaction(race, item), `${slot}: ${item.name}`).toBe(true)
      expect(uniqueConflicts(worn, slot, item), `${slot}: ${item.name}`).toEqual([])
      worn[slot] = item
    }
    for (const [a, b] of [['finger1', 'finger2'], ['trinket1', 'trinket2']] as const) {
      if (gear[a] && gear[b]) expect(gear[a].itemId, `${a}/${b}`).not.toBe(gear[b].itemId)
    }
  })
})

describe('the tanks keep D30\'s survival floor in their default talents', () => {
  // docs/decisions.md D30: Deflection 5/5 for a warrior and a paladin (Anticipation the preferred
  // filler, not required; Toughness optional), Feral Swiftness 2/2 for a bear, besides each class's
  // cooldown talents.
  const ranks = (spec: SpecId) => {
    const data = TALENT_DATA[SPEC_META[spec].classId]
    const ranks = decodeTalentCode(data, defaultConfig(spec).talents)
    return new Map(talentsInCodeOrder(data).flat().map((t) => [t.name, ranks[t.id] ?? 0]))
  }
  it.each([
    ['warrior-protection', { Deflection: 5, 'Last Stand': 1, 'Improved Shield Wall': 2 }],
    ['paladin-protection', { Deflection: 5, 'Improved Righteous Fury': 3, 'Sacred Duty': 2, "Templar's Bulwark": 1, 'Holy Shield': 1 }],
    ['druid-feral-bear', { 'Feral Swiftness': 2, 'Thick Hide': 3, 'Heart of the Wild': 5 }],
  ] as const)('%s', (spec, floor) => {
    const got = ranks(spec as SpecId)
    for (const [name, rank] of Object.entries(floor)) expect([name, got.get(name) ?? 0]).toEqual([name, rank])
  })
})

describe('default gear by faction (docs/data/items.md#equipping-rules)', () => {
  const ids = (spec: SpecId, race: string, slots: GearSlot[]) => slots.map((s) => defaultConfig(spec, race).gear[s]?.itemId)

  it('gives an Alliance warrior the Alliance PvP twins and a Horde one the Horde twins', () => {
    // Lieutenant Commander's Plate Shoulders, Knight-Lieutenant's Plate Greaves / Champion's, Blood Guard's.
    for (const spec of ['warrior-fury', 'warrior-arms'] as const) {
      expect(ids(spec, 'alliance-human', ['shoulder', 'feet'])).toEqual([23315, 23287])
      expect(ids(spec, 'alliance-dwarf', ['shoulder', 'feet'])).toEqual([23315, 23287])
      expect(ids(spec, 'horde-orc', ['shoulder', 'feet'])).toEqual([23243, 22858])
      expect(ids(spec, 'horde-undead', ['shoulder', 'feet'])).toEqual([23243, 22858])
    }
    // Protection's pre-raid list, and its interim picks (warrior.md §6.3): Knight-Captain's /
    // Legionnaire's Plate Hauberk and Leggings, the greaves above.
    const listIds = (race: string) => (['shoulder', 'chest', 'feet'] as const).map((s) => preRaidListGear('warrior-protection', race)[s]?.itemId)
    expect(listIds('alliance-gnome')).toEqual([23315, 23300, 23287])
    expect(listIds('horde-tauren')).toEqual([23243, 22872, 22858])
    expect(ids('warrior-protection', 'alliance-gnome', ['chest', 'legs', 'feet'])).toEqual([23300, 23301, 23287])
    expect(ids('warrior-protection', 'horde-tauren', ['chest', 'legs', 'feet'])).toEqual([22872, 22873, 22858])
  })

  it('gives each faction its own rank-3 cloak', () => {
    // The bear's list's (its default wears the interim threat preset's cloak, druid.md §7.3a).
    const listIds = (race: string) => preRaidListGear('druid-feral-bear', race).back?.itemId
    expect(listIds('alliance-night-elf')).toBe(18461) // Sergeant's Cloak
    expect(listIds('horde-tauren')).toBe(16342) // Sergeant's Cape
  })

  it('lists only interim items that exist and that the spec’s class can use', () => {
    // preRaidListGear skips an unusable pick without a word and falls back to the list's
    // (the Horde paladin's Legionnaire's Plate Leggings, 22873, did: the 2026-09-24 tank review's PP-1).
    const specs = Object.keys(INTERIM_GEAR) as SpecId[]
    expect(specs.length).toBeGreaterThan(0)
    for (const spec of specs) {
      const classId = SPEC_META[spec].classId
      for (const [slot, ids] of Object.entries(INTERIM_GEAR[spec] ?? {})) {
        for (const id of ids) {
          const item = items.get(id)
          expect(item, `${spec} ${slot} ${id} is in the item data`).toBeDefined()
          expect(item && canUse(classId, item), `${spec} ${slot} ${id} (${item?.name}) is usable by a ${classId}`).toBe(true)
        }
      }
    }
  })

  it('gives each warlock its sim-ranked list’s twins, and Affliction its Shadow picks', () => {
    // docs/classes/warlock.md#73-gear: each spec's own list, with the Arathi Basin main hand and the
    // Rank 10 Dreadweave cowl and spaulders by faction; the Fire tome ranks second in Destruction's off hand.
    const slots: GearSlot[] = ['head', 'shoulder', 'mainHand', 'offHand']
    for (const spec of ['warlock-destruction', 'warlock-demonology'] as const) {
      expect(ids(spec, 'horde-orc', slots)).toEqual([23255, 23256, 20214, 19315])
      expect(ids(spec, 'horde-undead', slots)).toEqual([23255, 23256, 20214, 19315])
      expect(ids(spec, 'alliance-human', slots)).toEqual([23310, 23311, 20070, 19315])
      expect(ids(spec, 'alliance-gnome', slots)).toEqual([23310, 23311, 20070, 19315])
    }
    const tome = items.get(19311)!
    expect(tome.preRaidBis.filter((p) => p.spec.startsWith('warlock-'))).toEqual([{ spec: 'warlock-destruction', slot: 'offHand', rank: 2 }])
    // Affliction, a Shadow build, keeps the Shadow items where they lead: Felcloth Gloves, Tome of
    // Shadow Force, Skul's Ghastly Touch.
    const aff: GearSlot[] = [...slots, 'hands', 'ranged']
    expect(ids('warlock-affliction', 'horde-orc', aff)).toEqual([23255, 23256, 20214, 19309, 18407, 13396])
    expect(ids('warlock-affliction', 'alliance-human', aff)).toEqual([23310, 23311, 20070, 19309, 18407, 13396])
    // Ironbark Staff leads every warlock's two-handers: the League of Arathor's for the Alliance, and its
    // faction twin from the client, The Defilers' (20220), for the Horde (DV2-1; docs/data/items.md#faction-twins).
    // So do the Fire mage's and the Elemental shaman's.
    for (const spec of ['warlock-destruction', 'warlock-affliction', 'warlock-demonology', 'mage-fire', 'shaman-elemental'] as const)
      for (const id of [20069, 20220]) expect(items.get(id)!.preRaidBis.filter((p) => p.spec === spec), `${spec} ${id}`).toEqual([{ spec, slot: 'twoHand', rank: 1 }])
    expect([fitsFaction('alliance-human', items.get(20069)!), fitsFaction('horde-orc', items.get(20069)!)]).toEqual([true, false])
    expect([fitsFaction('alliance-human', items.get(20220)!), fitsFaction('horde-orc', items.get(20220)!)]).toEqual([false, true])
    // Draconic Infused Emblem's proc, modelled (DV2-4), leads every warlock's trinkets, with the Royal Seal.
    for (const spec of ['warlock-destruction', 'warlock-affliction', 'warlock-demonology'] as const)
      expect(ids(spec, 'horde-orc', ['trinket1', 'trinket2']), spec).toEqual([22268, 18467])
    // The Scourge Invasion's items are event-only: no warlock list has them.
    for (const id of [23124, 23125])
      expect(items.get(id)!.preRaidBis.filter((p) => p.spec.startsWith('warlock-')), String(id)).toEqual([])
  })

  it('opens with the default race’s gear', () => {
    expect(defaultConfig('warrior-fury')).toEqual(defaultConfig('warrior-fury', 'alliance-human'))
    expect(defaultConfig('druid-feral-cat')).toEqual(defaultConfig('druid-feral-cat', 'horde-tauren'))
  })
})

describe('the tanks’ effective-health floor (D30; warrior.md §6.3)', () => {
  // Health ÷ (1 − armor's reduction against the level-63 boss), at least 90% of the v1 preset's (the
  // pre-raid list's gear with the same talents, buffs and race), for either faction's default race.
  const ehp = (config: SimConfig) => {
    const { sheet } = buildPlan(config)
    return sheet.health / (1 - armorReduction(sheet.armor, 63, FOREVER))
  }
  it.each(['alliance-human', 'horde-orc'])('holds for the Protection warrior’s interim gear as %s', (race) => {
    const d = defaultConfig('warrior-protection', race)
    const v1 = { ...d, gear: preRaidListGear('warrior-protection', race) }
    expect(d.gear).not.toEqual(v1.gear)
    expect(ehp(d) / ehp(v1)).toBeGreaterThanOrEqual(0.9)
  })
  // The Lamellar PvP pieces are Alliance's: an Undead paladin wears the Horde picks (T2R-2).
  it.each(['alliance-human', 'alliance-dwarf', 'horde-undead'])('holds for the Protection paladin’s interim gear as %s', (race) => {
    const d = defaultConfig('paladin-protection', race)
    const v1 = { ...d, gear: preRaidListGear('paladin-protection', race) }
    expect(d.gear).not.toEqual(v1.gear)
    expect(ehp(d) / ehp(v1)).toBeGreaterThanOrEqual(0.9)
  })
  it('gives a Horde paladin the Horde picks where the Lamellar pieces are Alliance’s', () => {
    const { shoulder, chest, legs, feet } = defaultConfig('paladin-protection', 'horde-undead').gear
    expect([shoulder, chest, legs, feet].map((e) => e?.itemId)).toEqual([274233, 13168, 274232, 274226])
    const ally = defaultConfig('paladin-protection', 'alliance-human').gear
    expect([ally.shoulder, ally.chest, ally.legs, ally.feet].map((e) => e?.itemId)).toEqual([23277, 23272, 23273, 23275])
  })
})

describe('Destruction’s sim-ranked list (docs/classes/warlock.md#73-gear; D29)', () => {
  const listed = [...items.values()].filter((i) => i.preRaidBis.some((p) => p.spec === 'warlock-destruction'))
  const SPELL_STATS = ['spellPower', 'spellDamage', 'fireSpellDamage', 'shadowSpellDamage', 'spellHit', 'spellCrit', 'hitRating', 'critRating', 'intellect'] as const

  it('lists only warlock gear that kept its spell stats or a modelled spell effect, and no Forever-new item', () => {
    expect(listed.length).toBeGreaterThan(40)
    for (const item of listed) {
      expect(canUse('warlock', item), item.name).toBe(true)
      // Its spell stats, or a spell effect the sim models (Wrath of Cenarius, Draconic Infused Emblem: effects/items.ts).
      expect(SPELL_STATS.some((k) => (item.stats[k] ?? 0) > 0) || ITEM_EFFECTS[item.id] !== undefined, `${item.name}: ${JSON.stringify(item.stats)}`).toBe(true)
      expect(item.tab, item.name).not.toBe('new')
      for (const r of item.requirements) if (r.kind === 'pvpRank') expect(r.level, item.name).toBeLessThanOrEqual(10)
    }
  })

  it('ranks every slot the default gear fills, with Fire items where they place', () => {
    const rank = (id: number) => items.get(id)!.preRaidBis.find((p) => p.spec === 'warlock-destruction')
    for (const slot of ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'finger', 'trinket', 'mainHand', 'offHand', 'twoHand', 'ranged'])
      expect(listed.some((i) => i.preRaidBis.some((p) => p.spec === 'warlock-destruction' && p.slot === slot && p.rank === 1)), slot).toBe(true)
    // Tome of Fiery Arcana (+40 Fire) and Pyric Caduceus (+13 Fire) place; a Shadow-only item doesn't.
    expect(rank(19311)).toEqual({ spec: 'warlock-destruction', slot: 'offHand', rank: 2 })
    expect(rank(11748)).toEqual({ spec: 'warlock-destruction', slot: 'ranged', rank: 3 })
    expect(rank(19309)).toBeUndefined() // Tome of Shadow Force
    expect(rank(18735)).toBeUndefined() // Maleki's Footwraps
  })
})

describe('matchSupplies (docs/classes/hunter.md#73-gear)', () => {
  const pool = (itemJson as unknown as ItemData).items
  const item = (id: number) => pool.find((i) => i.id === id)!
  const gun = item(2099) // Dwarven Hand Cannon
  const bow = item(12653) // Riphook
  const crossbow = item(19107) // Bloodseeker
  const thrown = item(13173) // Flightblade Throwing Axe

  it('knows what each ranged weapon fires', () => {
    expect([gun, bow, crossbow, thrown, undefined].map(ammoKind)).toEqual(['bullet', 'arrow', 'arrow', null, null])
  })

  it('swaps arrows and a quiver for bullets and a pouch when a gun replaces a bow, as defaultGear picks', () => {
    const gear = { ranged: { itemId: bow.id }, ammo: { itemId: DEFAULT_SUPPLIES.arrows }, quiver: { itemId: DEFAULT_SUPPLIES.quiver } }
    expect(matchSupplies(gear, gun)).toEqual({
      ranged: { itemId: bow.id },
      ammo: { itemId: DEFAULT_SUPPLIES.bullets },
      quiver: { itemId: DEFAULT_SUPPLIES.pouch },
    })
    expect(matchSupplies({ ammo: { itemId: DEFAULT_SUPPLIES.bullets }, quiver: { itemId: DEFAULT_SUPPLIES.pouch } }, crossbow)).toEqual({
      ammo: { itemId: DEFAULT_SUPPLIES.arrows },
      quiver: { itemId: DEFAULT_SUPPLIES.quiver },
    })
  })

  it('keeps the ammo’s damage: arrows become their bullet twin, else the closest bullet (VF3)', () => {
    // Swiftfeather Arrow 274387 ↔ Swiftstrike Shot 274388, both 24.617; Doomshot 12654 (20.244) has
    // no twin, so it becomes Miniature Cannon Balls 13377 (20.901), the closest bullet.
    expect(matchSupplies({ ammo: { itemId: 274387 } }, gun)).toEqual({ ammo: { itemId: 274388 } })
    expect(matchSupplies({ ammo: { itemId: 274388 } }, bow)).toEqual({ ammo: { itemId: 274387 } })
    expect(matchSupplies({ ammo: { itemId: 12654 } }, gun)).toEqual({ ammo: { itemId: 13377 } })
    // A tie (Thorium Shells and Thorium Headed Arrow, 17.715) keeps to the default.
    expect(matchSupplies({ ammo: { itemId: DEFAULT_SUPPLIES.bullets } }, bow)).toEqual({ ammo: { itemId: DEFAULT_SUPPLIES.arrows } })
  })

  it('keeps the quiver’s haste: a 13% quiver becomes the 13% pouch', () => {
    // Quickdraw Quiver 8217 and Thick Leather Ammo Pouch 8218, both 13% (ranged-and-pets.md §1).
    expect(matchSupplies({ quiver: { itemId: 8217 } }, gun)).toEqual({ quiver: { itemId: 8218 } })
    expect(matchSupplies({ quiver: { itemId: 2663 } }, bow)).toEqual({ quiver: { itemId: 2662 } })
    // Ancient Sinew Wrapped Lamina (15%) has one 15% pouch, Gnoll Skin Bandolier.
    expect(matchSupplies({ quiver: { itemId: 18714 } }, gun)).toEqual({ quiver: { itemId: DEFAULT_SUPPLIES.pouch } })
  })

  it('leaves supplies the weapon uses, and a thrown weapon’s, alone', () => {
    const gear = { ammo: { itemId: 274387 }, quiver: { itemId: 18714 } }
    expect(matchSupplies(gear, bow)).toBe(gear)
    expect(matchSupplies(gear, thrown)).toBe(gear)
    expect(matchSupplies(gear, null)).toBe(gear)
    expect(matchSupplies({}, gun)).toEqual({})
  })

  it('gives every hunter spec ammo its default ranged weapon fires', () => {
    for (const spec of SPEC_IDS.filter((s) => SPEC_META[s].classId === 'hunter')) {
      const gear = defaultConfig(spec).gear
      expect(matchSupplies(gear, item(gear.ranged!.itemId))).toBe(gear)
    }
  })
})
