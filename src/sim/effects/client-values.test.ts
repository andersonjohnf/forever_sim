// Item and buff effects whose numbers come from the client data, tied to src/data/client
// (docs/data/client.md), and what the plan builder makes of them: Hand of Justice's chance and
// internal cooldown per profile (damage-and-timing §5.2), Windfury Totem's internal cooldown
// (§5.4), and the weapons an Elemental Sharpening Stone fits and how two of them stack (buffs doc
// §3.6).
import { describe, expect, it } from 'vitest'
import enchantsJson from '@/data/client/enchants.json'
import itemsJson from '@/data/client/items.json'
import spellsJson from '@/data/client/spells.json'
import type { ClientItems, ClientSpells } from '@/data/client/types'
import itemJson from '@/data/items/pre-bis.json'
import type { ItemData, WeaponType } from '@/data/items/types'
import { defaultConfig } from '../defaults'
import { presetBuffIds } from './presets'
import { buildPlan } from '../plan/build'
import { CLASSIC_ERA, FOREVER } from '../rules/profiles'
import type { RuleProfileId, SimConfig } from '../types'
import { BUFFS_BY_ID, ELEMENTAL_STONE_WEAPONS } from './buffs'
import { HAND_OF_JUSTICE_ICD_MS, ITEM_EFFECTS } from './items'

const spells = (spellsJson as unknown as ClientSpells).spells
const clientItems = (itemsJson as unknown as ClientItems).items
const enchants = (enchantsJson as unknown as { enchants: Record<string, { effect: number[]; effectArg: number[] }> }).enchants
const items = (itemJson as unknown as ItemData).items

/** SpellEffect: apply aura; SpellAuraName: dummy, weapon crit %; SpellItemEnchantment: equip spell. */
const APPLY_AURA = 6
const AURA_DUMMY = 4
const AURA_WEAPON_CRIT = 52
const ENCHANT_EQUIP_SPELL = 3
/** Proc mask: melee auto attack (0x4) and melee ability (0x10). */
const MELEE_HITS = 0x14

const withRules = (c: SimConfig, profile: RuleProfileId): SimConfig => ({ ...c, rules: { ...c.rules, profile } })
const procOf = (config: SimConfig, id: string) => buildPlan(config).plan.procs.find((p) => p.id === id)
const assumptionIds = (config: SimConfig) => buildPlan(config).assumptions.map((a) => a.id)

describe('Hand of Justice (spell 15600; damage-and-timing §5.2)', () => {
  const hoj = spells['15600']
  const config = (profile: RuleProfileId) => {
    const d = defaultConfig('warrior-fury')
    return withRules({ ...d, gear: { ...d.gear, trinket1: { itemId: 11815 } } }, profile)
  }

  it('Forever: ProcChance 3, "${$h/3}%", and 3× against Dwarves ($s2), so 1% against a boss; a 2 s internal cooldown', () => {
    expect(hoj.name).toBe('Hand of Justice')
    expect(hoj.auraOptions?.procTypeMask?.[0]).toBe(MELEE_HITS)
    const dwarves = hoj.effects.find((e) => e.effectIndex === 1)!
    expect(dwarves).toMatchObject({ effect: APPLY_AURA, effectAura: AURA_DUMMY, effectBasePointsF: 3 })
    expect(FOREVER.values.handOfJusticePct).toBe(hoj.auraOptions!.procChance! / dwarves.effectBasePointsF!)
    expect(HAND_OF_JUSTICE_ICD_MS).toBe(hoj.auraOptions!.procCategoryRecovery)
  })

  it('Classic Era: 2% (ProcChance 2 in 1.15.9, which src/data doesn’t carry), the same 2 s', () => {
    expect(CLASSIC_ERA.values.handOfJusticePct).toBe(2)
  })

  it('reaches the plan per profile, with its internal cooldown', () => {
    expect(typeof ITEM_EFFECTS[11815].effects).toBe('function')
    expect(procOf(config('forever'), 'handOfJustice')).toMatchObject({ chance: [0.01, 0.01], icdMs: 2000, hands: 3 })
    expect(procOf(config('classicEra'), 'handOfJustice')).toMatchObject({ chance: [0.02, 0.02], icdMs: 2000 })
  })

  it('isn’t one of the server-side proc rates the `procRates` assumption lists', () => {
    const d = defaultConfig('warrior-fury')
    const noEnchants = Object.fromEntries(Object.entries(d.gear).map(([slot, e]) => [slot, e && { itemId: e.itemId }]))
    // No Crusader and no PPM weapons: Hand of Justice alone.
    const gear = { ...noEnchants, mainHand: { itemId: 17016 }, offHand: { itemId: 18498 }, trinket1: { itemId: 11815 } }
    expect(procOf({ ...d, gear }, 'handOfJustice')).toBeDefined()
    expect(assumptionIds({ ...d, gear })).not.toContain('procRates')
    expect(assumptionIds(d)).toContain('procRates') // Crusader
  })
})

describe('Windfury Totem’s internal cooldown (spell 10612; damage-and-timing §5.4)', () => {
  const d = defaultConfig('warrior-fury')
  const config = (profile: RuleProfileId) => withRules({ ...d, buffs: { raid: ['shaman'], enabled: ['windfuryTotem'] } }, profile)

  it('is the Forever client’s ProcCategoryRecovery 100 in `forever`, and none in `classicEra`', () => {
    expect(spells['10612'].auraOptions).toMatchObject({ procChance: 20, procCategoryRecovery: 100 })
    expect(FOREVER.values.windfuryIcdMs).toBe(100)
    expect(procOf(config('forever'), 'windfury')!.icdMs).toBe(100)
    expect(procOf(config('classicEra'), 'windfury')!.icdMs).toBe(0)
  })

  it('surfaces as an assumption only where it applies', () => {
    expect(assumptionIds(config('forever'))).toContain('windfuryIcd')
    expect(assumptionIds(config('classicEra'))).not.toContain('windfuryIcd')
    expect(assumptionIds(config('forever'))).toContain('extraAttackChains')
  })
})

describe('Elemental Sharpening Stone (item 18262 → 22756 → enchant 2506 → 22755; buffs doc §3.6)', () => {
  /** Weapon subclass (item class 2) → weapon type, checked against the item data below. */
  const SUBCLASS: Record<number, WeaponType | null> = {
    0: 'axe',
    1: 'axe',
    2: 'bow',
    3: 'gun',
    4: 'mace',
    5: 'mace',
    6: 'polearm',
    7: 'sword',
    8: 'sword',
    9: null, // obsolete
    10: 'staff',
    11: null, // exotic
    12: null, // exotic
    13: 'fist',
    14: null, // miscellaneous
    15: 'dagger',
    16: 'thrown',
    17: null, // spear
    18: 'crossbow',
    19: 'wand',
    20: null, // fishing pole
  }

  it('maps weapon subclasses the way the item data does', () => {
    let checked = 0
    for (const item of items) {
      const row = clientItems[String(item.id)]?.item
      if (!item.weaponType || !row || row.classId !== 2) continue
      expect(SUBCLASS[row.subclassId], item.name).toBe(item.weaponType)
      checked++
    }
    expect(checked).toBeGreaterThan(50)
  })

  it('fits every weapon type in the client’s SpellEquippedItems mask 42483', () => {
    const typesOf = (mask: number) => [...new Set(Object.entries(SUBCLASS).flatMap(([bit, type]) => (mask & (1 << Number(bit)) && type ? [type] : [])))].sort()
    for (const id of ['22756', '22755']) {
      expect(spells[id].equippedItems).toMatchObject({ equippedItemClass: 2, equippedItemSubclass: 42483 })
      expect(typesOf(spells[id].equippedItems!.equippedItemSubclass!)).toEqual([...ELEMENTAL_STONE_WEAPONS].sort())
    }
    const effects = BUFFS_BY_ID.get('elementalSharpeningStone')!.effects
    expect(Array.isArray(effects) && effects[0]).toMatchObject({ kind: 'tempEnchant', crit: 2, weapons: [...ELEMENTAL_STONE_WEAPONS] })
  })

  it('is an equip spell of the weapon: aura 52 (+2% melee crit) on the warrior', () => {
    expect(spells['22756'].effects[0].effectMiscValue?.[0]).toBe(2506)
    expect(enchants['2506']).toMatchObject({ effect: [ENCHANT_EQUIP_SPELL, 0, 0], effectArg: [22755, 0, 0] })
    expect(spells['22755'].effects[0]).toMatchObject({ effect: APPLY_AURA, effectAura: AURA_WEAPON_CRIT, effectBasePointsF: 2, implicitTarget: [1, 0] })
  })

  it('goes on a mace too, and two stones stack: +4% crit for Fury’s mace and sword [?]', () => {
    const d = defaultConfig('warrior-fury')
    const buffs = (extra: string[]) => ({ raid: d.buffs.raid, enabled: [...d.buffs.enabled.filter((b) => b !== 'denseSharpeningStone'), ...extra] })
    const fury = (extra: string[]) => buildPlan({ ...d, buffs: buffs(extra) })
    // Ironfoe (mace) and Mirah's Song (sword).
    const typeOf = (id: number | undefined) => items.find((i) => i.id === id)?.weaponType
    expect([typeOf(d.gear.mainHand?.itemId), typeOf(d.gear.offHand?.itemId)]).toEqual(['mace', 'sword'])
    const none = fury([])
    const both = fury(['elementalSharpeningStone'])
    expect(both.sheet.critPct - none.sheet.critPct).toBeCloseTo(4, 9)
    expect(both.assumptions.map((a) => a.id)).toContain('elementalStone')
    // The Max preset picks it over the dense stone on both weapons.
    const max = buildPlan({ ...d, buffs: { raid: d.buffs.raid, enabled: presetBuffIds('max', 'warrior-fury', d.buffs.raid) } })
    expect(max.sheet.critPct - buildPlan({ ...d, buffs: { raid: d.buffs.raid, enabled: presetBuffIds('max', 'warrior-fury', d.buffs.raid).filter((b) => b !== 'elementalSharpeningStone') } }).sheet.critPct).toBeCloseTo(4, 9)
    // One stone on a two-hander: +2%, and nothing to assume.
    const arms = defaultConfig('warrior-arms')
    const one = buildPlan({ ...arms, buffs: { raid: arms.buffs.raid, enabled: [...arms.buffs.enabled, 'elementalSharpeningStone'] } })
    expect(one.sheet.critPct - buildPlan(arms).sheet.critPct).toBeCloseTo(2, 9)
    expect(one.assumptions.map((a) => a.id)).not.toContain('elementalStone')
  })
})

describe('other assumptions this slice surfaces', () => {
  it('the rotation’s instant reactions, wherever a rotation runs (damage-and-timing §3.6)', () => {
    expect(assumptionIds(defaultConfig('warrior-fury'))).toContain('reactionTime')
    expect(assumptionIds(defaultConfig('warrior-arms'))).toContain('reactionTime')
    const note = buildPlan(defaultConfig('warrior-fury')).assumptions.find((a) => a.id === 'reactionTime')!
    expect(note.docRef).toBe('docs/mechanics/damage-and-timing.md#36-server-tick-and-spell-batching')
  })

  it('negative armor, and the floor at −2,750 once armor goes past it (damage-and-timing §1.1)', () => {
    const d = defaultConfig('warrior-fury')
    const debuffs = ['sunderArmor', 'faerieFire', 'curseOfRecklessness', 'armorShatter']
    const note = (bossArmor: number) =>
      buildPlan({ ...d, buffs: { raid: d.buffs.raid, enabled: debuffs }, fight: { ...d.fight, bossArmor } }).assumptions.find((a) => a.id === 'negativeArmor')?.text
    // 3,731 − 3,755 = −24: below zero, above the floor.
    expect(note(3731)).toBe('The boss’s armor is below zero after debuffs, which increases your damage, as the Forever tooltip says; unmeasured in combat.')
    // 500 − 3,755 = −3,255: past the floor.
    expect(note(500)).toContain('below −2,750 (here −3,255) the sim holds it at −2,750, which doubles your physical damage')
    expect(note(5000)).toBeUndefined()
  })

  it('magic procs crit (combat-tables §9)', () => {
    const d = defaultConfig('warrior-fury')
    const gear = { ...d.gear, mainHand: { itemId: d.gear.mainHand!.itemId, enchantId: 'fieryWeapon' } }
    const text = buildPlan({ ...d, gear }).assumptions.find((a) => a.id === 'magicProcs')!.text
    expect(text).toContain('spell crit chance for 150% damage')
  })
})
