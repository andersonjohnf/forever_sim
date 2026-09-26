// The shaman's abilities, spells and talents against the Forever client data (docs/classes/shaman.md;
// docs/data/client.md): every number abilities.ts and talents.ts write out, read back from
// src/data/client/{spells,talents,gametables}.json. The imbues' and procs' triggered spells (439431,
// 16361, 16313, 408505, 16257, 30165, 1238931) are extracted through shaman.md's spell markers; the
// imbues' enchants 1669 and 1664 aren't in enchants.json, which holds the buffs doc's enchants only,
// so they're cited from the client in shaman.md#weapon-imbues.
import { describe, expect, it } from 'vitest'
import gametablesJson from '@/data/client/gametables.json'
import spellsJson from '@/data/client/spells.json'
import talentsJson from '@/data/client/talents.json'
import type { ClientSpell, ClientSpells } from '@/data/client/types'
import { TALENT_DATA } from '../../defaults'
import { GCD_MS } from '../../core/formulas'
import type { AbilityDef, SpellDef } from '../../plan/types'
import { CLASS_BASE } from '../../stats/base-stats'
import { atLevel60, spread } from '../paladin/spells'
import {
  EARTH_SHOCK,
  EARTH_SHOCK_SPELL,
  FROST_SHOCK,
  FROST_SHOCK_SPELL,
  IMPROVED_STORMSTRIKE_AURA,
  IMPROVED_STORMSTRIKE_SHARE,
  LIGHTNING_BOLT,
  LIGHTNING_BOLT_SPELL,
  MAELSTROM_AURA,
  MAELSTROM_CHANCE_PCT,
  RAGE_OF_THE_FARSEER,
  ROCKBITER_AP,
  SHAMAN_BASE_MANA,
  SHOCK_CATEGORY,
  SHOCK_COOLDOWN_MS,
  STORMSTRIKE,
  STORMSTRIKE_AURA,
  STORMSTRIKE_BOOST,
  WINDFURY_WEAPON_AP,
  windfuryWeaponProc,
} from './abilities'
import { TOTEM_OF_RAGE_PCT, TOTEM_OF_THE_STORM, TOTEM_OF_THE_STORM_SP } from './enhancement'
import {
  CHAIN_LIGHTNING,
  CHAIN_LIGHTNING_SPELL,
  ELEMENTAL_CLEARCASTING,
  elementalFocusProc,
  FLAME_SHOCK,
  FLAME_SHOCK_AURA,
  FLAME_SHOCK_SPELL,
  LAVA_BURST,
  LAVA_BURST_FLAME_SHOCK_PCT,
  LAVA_BURST_SPELL,
  LIGHTNING_BOLT_R4,
  LIGHTNING_BOLT_R4_SPELL,
  LIGHTNING_OVERLOAD_PCT,
  MANA_TIDE_TOTEM,
} from './abilities'
import { MANA_TIDE_MANA } from './elemental'
import { MINDFULNESS_PCT } from './setup'
import { ELEMENTAL_ALACRITY_MS } from './talents'
import { ELEMENTAL_WEAPONS_ROCKBITER, ELEMENTAL_WEAPONS_WINDFURY, maelstromPctPerStack, TALENT_EFFECTS, withSpellTalents, withTalents } from './talents'

const spells = (spellsJson as unknown as ClientSpells).spells
const spell = (id: number): ClientSpell => {
  const s = spells[String(id)]
  expect(s, `client spell ${id}`).toBeDefined()
  return s
}
const effect = (id: number, index: number) => spell(id).effects.find((e) => e.effectIndex === index)!
/** No Active Defense (Attr0 0x200000) and Always Hit (Attr3 0x40000): combat-tables §3. */
const attrs = (id: number) => {
  const a = spell(id).misc!.attributes!
  return { noActiveDefense: (a[0] & 0x200000) !== 0, alwaysHit: (a[3] & 0x40000) !== 0 }
}
const DEFENSE_TYPE = { none: 0, magic: 1, melee: 2, ranged: 3 } as const
const SCHOOL_MASK = { fire: 4, nature: 8, frost: 16 } as const
/** A spell's first class-mask word (SpellClassOptions), which talents' and items' masks select. */
const classMask = (id: number) => spell(id).classOptions!.spellClassMask![0] >>> 0
/** Whether an effect's class mask (word 0) selects the spell. */
const selects = (id: number, index: number, target: number) => ((effect(id, index).effectSpellClassMask![0] >>> 0) & classMask(target)) !== 0
const ranks = (r: Record<string, number>) => new Map(Object.entries(r))
const mana = (def: AbilityDef) => def.costTenths / 10

/** The Forever client's rank curve of a shaman talent's effect (TraitDefinitionEffectPoints). */
const curve = (name: string, effectIndex = 0): number[] => {
  const t = (talentsJson as unknown as { classes: { shaman: { talents: { name: string; rankEffects: { effectIndex: number; values: number[] }[] }[] } } }).classes.shaman.talents.find(
    (x) => x.name === name,
  )
  expect(t, name).toBeDefined()
  const e = t!.rankEffects.find((r) => r.effectIndex === effectIndex)
  expect(e, `${name} #${effectIndex}`).toBeDefined()
  return e!.values
}

const LB = 15208
const ES = 10414
const FS = 10473
const CL = 10605
const SS = 17364

describe('Stormstrike against the client (shaman.md#stormstrike)', () => {
  it('125 mana, an 8 s cooldown, the GCD; normalized weapon damage (effect 121); melee class, one roll on the special table', () => {
    const s = spell(SS)
    expect(s.power![0].manaCost).toBe(mana(STORMSTRIKE))
    expect(s.cooldowns).toMatchObject({ recoveryTime: STORMSTRIKE.cooldownMs, startRecoveryTime: STORMSTRIKE.gcdMs })
    expect(STORMSTRIKE.gcdMs).toBe(GCD_MS)
    expect(effect(SS, 0).effect).toBe(121)
    expect(STORMSTRIKE).toMatchObject({ kind: 'weaponStrike', weaponPercent: 1, normalized: true, unavoidable: false, resource: 'mana' })
    expect(s.categories!.defenseType).toBe(DEFENSE_TYPE.melee)
    expect(attrs(SS)).toEqual({ noActiveDefense: false, alwaysHit: false })
  })

  it('its aura: +20% (aura 271) to the caster’s next Lightning Bolt, Chain Lightning or Earth Shock (mask 0x100003), one charge, 12 s; not Frost Shock', () => {
    expect(effect(SS, 1)).toMatchObject({ effectAura: 271, effectBasePointsF: STORMSTRIKE_BOOST.pct })
    expect(effect(SS, 1).effectSpellClassMask![0]).toBe(0x100003)
    expect(spell(SS).auraOptions!.procCharges).toBe(1)
    expect(spell(SS).duration!.duration).toBe(STORMSTRIKE_AURA.durationMs)
    expect(STORMSTRIKE.aura).toBe(STORMSTRIKE_AURA)
    for (const id of [LB, CL, ES]) expect(selects(SS, 1, id), String(id)).toBe(true)
    expect(selects(SS, 1, FS)).toBe(false)
    // The spells that read it: Earth Shock and Lightning Bolt carry the boost, Frost Shock doesn't.
    expect(EARTH_SHOCK_SPELL.boost).toEqual({ aura: STORMSTRIKE_AURA.id, pct: 20 })
    expect(LIGHTNING_BOLT_SPELL.boost).toEqual({ aura: STORMSTRIKE_AURA.id, pct: 20 })
    expect(FROST_SHOCK_SPELL.boost).toBeUndefined()
  })
})

describe('the shocks and Lightning Bolt against the client (shaman.md#shocks-and-lightning-bolt)', () => {
  /** A spell def against its client row: school, damage class, attributes, coefficient, and its range at 60. */
  function matches(def: SpellDef, id: number, index: number) {
    const s = spell(id)
    expect(s.misc!.schoolMask, def.id).toBe(SCHOOL_MASK[def.school as keyof typeof SCHOOL_MASK])
    expect(s.categories!.defenseType, def.id).toBe(DEFENSE_TYPE[def.defense])
    expect(attrs(id), def.id).toEqual({ noActiveDefense: def.noActiveDefense, alwaysHit: def.alwaysHit })
    const e = effect(id, index)
    expect(e.effect, def.id).toBe(2)
    expect(e.effectBonusCoefficient, def.id).toBe(def.spCoefficient)
    const levels = s.levels!
    const grow = atLevel60(0, e.effectRealPointsPerLevel!, levels.baseLevel!, levels.maxLevel!)
    const [lo, hi] = spread(e.effectBasePointsF!, e.variance!)
    expect(def.min, def.id).toBeCloseTo(lo + grow, 9)
    expect(def.max, def.id).toBeCloseTo(hi + grow, 9)
    expect(def).toMatchObject({ triggersProcs: true, weaponPercent: 0, critMultiplier: 1.5 })
  }

  it('Earth Shock r7: 301 ± 5.27%, +1.9 a level from 60 (293.06–308.94), 0.386, Nature, magic', () => {
    matches(EARTH_SHOCK_SPELL, ES, 0)
    expect(EARTH_SHOCK_SPELL.min).toBeCloseTo(293.06403, 5)
    expect(EARTH_SHOCK_SPELL.max).toBeCloseTo(308.93597, 5)
  })

  it('Frost Shock r4: 283 ± 5.6%, + trunc(1.8 a level from 58) = 3 (278.08–293.92), 0.386, Frost, magic', () => {
    matches(FROST_SHOCK_SPELL, FS, 1)
    expect(FROST_SHOCK_SPELL.min).toBeCloseTo(278.076, 9)
    expect(FROST_SHOCK_SPELL.max).toBeCloseTo(293.924, 9)
  })

  it('Lightning Bolt r10: 196 ± 10.8%, + trunc(1.2 a level from 56) = 4 (189.38–210.62), 0.714, Nature, magic', () => {
    matches(LIGHTNING_BOLT_SPELL, LB, 0)
    expect(LIGHTNING_BOLT_SPELL.min).toBeCloseTo(189.38149, 5)
    expect(LIGHTNING_BOLT_SPELL.max).toBeCloseTo(210.61851, 5)
  })

  it('costs, cooldowns, GCDs and cast times: the shocks 450 and 430 in category 19 (6 s); Lightning Bolt 220 and 2.5 s', () => {
    for (const [def, id] of [
      [EARTH_SHOCK, ES],
      [FROST_SHOCK, FS],
      [LIGHTNING_BOLT, LB],
    ] as const) {
      const s = spell(id)
      expect(
        { mana: mana(def), cooldown: def.cooldownMs, gcd: def.gcdMs, cast: def.castMs, resource: def.resource },
        def.id,
      ).toEqual({ mana: s.power![0].manaCost, cooldown: s.cooldowns!.categoryRecoveryTime ?? 0, gcd: s.cooldowns!.startRecoveryTime, cast: s.castTime?.base ?? 0, resource: 'mana' })
    }
    expect(spell(ES).categories!.category).toBe(19)
    expect(spell(FS).categories!.category).toBe(19)
    expect(spell(ES).cooldowns!.categoryRecoveryTime).toBe(SHOCK_COOLDOWN_MS)
    expect([EARTH_SHOCK.category, FROST_SHOCK.category]).toEqual([SHOCK_CATEGORY, SHOCK_CATEGORY])
    expect(LIGHTNING_BOLT.category).toBeUndefined()
    // A cast stops the swings (shaman.md#shocks-and-lightning-bolt [?]); the shocks are instant.
    expect([LIGHTNING_BOLT.castStopsSwings, EARTH_SHOCK.castMs, FROST_SHOCK.castMs]).toEqual([true, 0, 0])
  })
})

describe('the weapon imbues (shaman.md#weapon-imbues)', () => {
  it('Windfury Weapon r4 and Rockbiter Weapon r7 enchant the weapon (effect 360) with enchants 1669 and 1664', () => {
    expect(effect(16362, 0)).toMatchObject({ effect: 360, effectMiscValue: [1669, 0] })
    expect(effect(16316, 0)).toMatchObject({ effect: 360, effectMiscValue: [1664, 0] })
    expect(spell(16362).levels!.baseLevel).toBe(60)
  })

  it('the numbers the imbues’ spells carry (not in the datasets, see the header): 20%, 1.5 s, 2 extra attacks, 333 AP; Rockbiter 554 + 16.5 × 6 = 653', () => {
    expect(windfuryWeaponProc(466.2)).toMatchObject({ trigger: 'meleeLanded', from: 'mainHand', chance: { pct: 20 }, icdMs: 1500, action: { kind: 'extraAttacks', count: 2, bonusAp: 466.2 } })
    expect(WINDFURY_WEAPON_AP).toBe(333)
    expect(ROCKBITER_AP).toBe(653)
  })
})

describe('Rage of the Farseer (425336)', () => {
  it('+30% attack speed (aura 342) for 25 s, and no casting speed since 1.60.1.70009 (no aura 65); a 3 min cooldown, off the GCD, free', () => {
    const s = spell(425336)
    expect(effect(425336, 0)).toMatchObject({ effectAura: 342, effectBasePointsF: 30 })
    expect(s.effects.map((e) => e.effectAura)).toEqual([342, 61])
    expect(RAGE_OF_THE_FARSEER.aura!.mods.castHaste).toBeUndefined()
    expect(s.duration!.duration).toBe(RAGE_OF_THE_FARSEER.aura!.durationMs)
    expect(s.cooldowns!.recoveryTime).toBe(RAGE_OF_THE_FARSEER.cooldownMs)
    expect(s.cooldowns!.startRecoveryTime ?? 0).toBe(RAGE_OF_THE_FARSEER.gcdMs)
    expect(s.power ?? []).toEqual([])
    expect(RAGE_OF_THE_FARSEER.aura!.mods.haste).toBe(30)
  })
})

describe('the talents against the client (shaman.md#talents)', () => {
  it('Flurry: melee crits (mask 0x14) give +5% attack speed a rank, 25% at 5/5', () => {
    expect(spell(16256).auraOptions!.procTypeMask![0]).toBe(0x14)
    expect(curve('Flurry')).toEqual([5, 10, 15, 20, 25])
    for (let r = 1; r <= 5; r++) {
      const [proc] = TALENT_EFFECTS.Flurry(r)
      expect(proc).toMatchObject({ kind: 'proc', proc: { trigger: 'meleeCrit', action: { kind: 'aura', aura: { whiteSwingCharges: 3, whiteSwingChargeIcdMs: 500, durationMs: 15000, mods: { haste: curve('Flurry')[r - 1] } } } } })
    }
  })

  it('Elemental Devastation: a harmful spell crit (mask 0x10000) gives +3% melee crit a rank for 10 s', () => {
    expect(spell(30160).auraOptions!.procTypeMask![0]).toBe(0x10000)
    expect(curve('Elemental Devastation')).toEqual([3, 6, 9])
    expect(TALENT_EFFECTS['Elemental Devastation'](3)[0]).toMatchObject({ proc: { trigger: 'spellCrit', action: { aura: { durationMs: 10000, mods: { crit: 9 } } } } })
  })

  it('Maelstrom Weapon: −4% cast time and cost a stack a rank (20% at 5/5), 5 stacks; its dummy 50 is the sim’s chance [?]; landed melee (mask 0x10014)', () => {
    expect(curve('Maelstrom Weapon')).toEqual([-4, -8, -12, -16, -20])
    for (let r = 1; r <= 5; r++) expect(maelstromPctPerStack(ranks({ 'Maelstrom Weapon': r }))).toBe(-curve('Maelstrom Weapon')[r - 1])
    expect(effect(408498, 1).effectBasePointsF).toBe(MAELSTROM_CHANCE_PCT)
    expect(effect(408498, 2).effectBasePointsF).toBe(MAELSTROM_AURA.maxStacks)
    expect(spell(408498).auraOptions!.procTypeMask![0]).toBe(0x10014)
    expect(MAELSTROM_AURA.durationMs).toBe(30000)
    expect(TALENT_EFFECTS['Maelstrom Weapon'](5)[0]).toMatchObject({ proc: { trigger: 'meleeLanded', from: 'any', chance: { pct: 50 } } })
  })

  it('Improved Stormstrike: its regeneration at a 50% chance a rank; the sim takes it at 2/2, 50% of spirit regeneration for 15 s', () => {
    expect(curve('Improved Stormstrike')).toEqual([50, 100])
    expect(curve('Improved Stormstrike', 1)).toEqual([50, 100])
    expect(IMPROVED_STORMSTRIKE_SHARE).toBe(0.5)
    expect(IMPROVED_STORMSTRIKE_AURA.durationMs).toBe(15000)
    expect(withTalents(STORMSTRIKE, ranks({ 'Improved Stormstrike': 2 })).selfAuraSpec).toBe(IMPROVED_STORMSTRIKE_AURA)
    expect(withTalents(STORMSTRIKE, ranks({ 'Improved Stormstrike': 1 })).selfAuraSpec).toBeUndefined()
  })

  it('the passives: Thundering Strikes (aura 290, all crit), Ancestral Knowledge (+2% Intellect a rank), Mental Dexterity (aura 598, Intellect), Mental Quickness (aura 174), Tidal Focus (auras 54, 55)', () => {
    expect(effect(16255, 0).effectAura).toBe(290)
    expect(curve('Thundering Strikes')).toEqual([1, 2, 3, 4, 5])
    expect(TALENT_EFFECTS['Thundering Strikes'](5)).toEqual([
      { kind: 'stat', stat: 'crit', value: 5 },
      { kind: 'stat', stat: 'spellCrit', value: 5 },
    ])
    expect(effect(17485, 0).effectAura).toBe(137)
    expect(curve('Ancestral Knowledge')).toEqual([2, 4, 6, 8, 10])
    expect(TALENT_EFFECTS['Ancestral Knowledge'](5)).toEqual([{ kind: 'mult', stat: 'int', pct: 10 }])
    expect(effect(415140, 0)).toMatchObject({ effectAura: 598, effectMiscValue: [3, 0] })
    expect(curve('Mental Dexterity')).toEqual([33, 67, 100])
    for (let r = 1; r <= 3; r++) expect(TALENT_EFFECTS['Mental Dexterity'](r)).toEqual([{ kind: 'stat', stat: 'apPerInt', value: curve('Mental Dexterity')[r - 1] / 100 }])
    expect(effect(30812, 1)).toMatchObject({ effectAura: 174, effectMiscValue: [126, 3] })
    expect(curve('Mental Quickness', 1)).toEqual([15, 30])
    expect(TALENT_EFFECTS['Mental Quickness'](2)).toEqual([{ kind: 'stat', stat: 'spellDamagePerIntPct', value: 30 }])
    expect([effect(16179, 1).effectAura, effect(16179, 2).effectAura]).toEqual([54, 55])
    expect(curve('Tidal Focus', 1)).toEqual([1, 2, 3, 4, 5])
    expect(curve('Tidal Focus', 2)).toEqual([1, 2, 3, 4, 5])
    expect(TALENT_EFFECTS['Tidal Focus'](5)).toEqual([
      { kind: 'stat', stat: 'hit', value: 5 },
      { kind: 'stat', stat: 'spellHit', value: 5 },
    ])
  })

  it('Elemental Weapons: Rockbiter +7/13/20% (mask 0x400000), Windfury Weapon +13/27/40% (mask 0x800000)', () => {
    expect(curve('Elemental Weapons', 0)).toEqual(ELEMENTAL_WEAPONS_ROCKBITER.slice(1))
    expect(curve('Elemental Weapons', 2)).toEqual(ELEMENTAL_WEAPONS_WINDFURY.slice(1))
    expect(effect(16266, 0).effectSpellClassMask![0]).toBe(0x400000)
    expect(effect(16266, 2).effectSpellClassMask![0]).toBe(0x800000)
  })

  it('the cost cuts: Convection −2% a rank and Shamanistic Focus −45% (shocks, mask 0x90100000), added together; Lightning Bolt gets Convection only', () => {
    expect(curve('Convection')).toEqual([-2, -4, -6, -8, -10])
    expect(effect(1223030, 0)).toMatchObject({ effectAura: 108, effectBasePointsF: -45, effectMiscValue: [14, 0] })
    for (const id of [ES, FS]) {
      expect(selects(1223030, 0, id), String(id)).toBe(true)
      expect(selects(16039, 0, id), String(id)).toBe(true)
    }
    expect(selects(1223030, 0, LB)).toBe(false)
    expect(selects(16039, 0, LB)).toBe(true)
    const cost = (def: AbilityDef, r: Record<string, number>) => mana(withTalents(def, ranks(r)))
    expect(cost(EARTH_SHOCK, { 'Shamanistic Focus': 1 })).toBe(247)
    expect(cost(EARTH_SHOCK, { 'Shamanistic Focus': 1, Convection: 5 })).toBe(202)
    expect(cost(FROST_SHOCK, { 'Shamanistic Focus': 1 })).toBe(236)
    expect(cost(LIGHTNING_BOLT, { 'Shamanistic Focus': 1 })).toBe(220)
    expect(cost(LIGHTNING_BOLT, { Convection: 5 })).toBe(198)
    expect(cost(STORMSTRIKE, { Convection: 5, 'Shamanistic Focus': 1 })).toBe(125)
  })

  it('the spell talents: Concussion +1% a rank (mask 0x100003: not Frost Shock), Call of Thunder +3% crit, Elemental Fury +20% crit bonus a rank, Reverberation −0.2 s, Elemental Alacrity −170/330/500 ms', () => {
    expect(curve('Concussion')).toEqual([1, 2, 3, 4, 5])
    expect(effect(16035, 0).effectSpellClassMask![0]).toBe(0x100003)
    expect(selects(16035, 0, FS)).toBe(false)
    const t = ranks({ Concussion: 5, 'Call of Thunder': 1, 'Elemental Fury': 5 })
    expect(withSpellTalents(EARTH_SHOCK_SPELL, t).damageMult).toBeCloseTo(1.05, 12)
    expect(withSpellTalents(LIGHTNING_BOLT_SPELL, t).damageMult).toBeCloseTo(1.05, 12)
    expect(withSpellTalents(FROST_SHOCK_SPELL, t).damageMult).toBe(1)
    expect(effect(16120, 0)).toMatchObject({ effectAura: 107, effectBasePointsF: 3, effectMiscValue: [7, 0], effectSpellClassMask: [3, 0, 0, 0] })
    expect(withSpellTalents(LIGHTNING_BOLT_SPELL, t).bonusCrit).toBe(3)
    expect(withSpellTalents(EARTH_SHOCK_SPELL, t).bonusCrit).toBe(0)
    expect(curve('Elemental Fury')).toEqual([20, 40, 60, 80, 100])
    expect(withSpellTalents(EARTH_SHOCK_SPELL, t).critMultiplier).toBeCloseTo(2, 12)
    expect(curve('Reverberation')).toEqual([-200, -400, -600, -800, -1000])
    expect(withTalents(EARTH_SHOCK, ranks({ Reverberation: 5 })).cooldownMs).toBe(5000)
    expect(curve('Elemental Alacrity')).toEqual([-170, -330, -500])
    expect(withTalents(LIGHTNING_BOLT, ranks({ 'Elemental Alacrity': 3 })).castMs).toBe(2000)
    expect(withTalents(LIGHTNING_BOLT, ranks({ 'Maelstrom Weapon': 5 }))).toMatchObject({ stackAuraId: MAELSTROM_AURA.id, stackCastPct: 20, stackCostPct: 20 })
  })

  it('Totem of Rage’s 27859: +2% to the shocks (aura 108, mask 0x90100000)', () => {
    expect(effect(27859, 0)).toMatchObject({ effectAura: 108, effectBasePointsF: TOTEM_OF_RAGE_PCT })
    expect(effect(27859, 0).effectSpellClassMask![0] >>> 0).toBe(0x90100000)
    expect(withSpellTalents(EARTH_SHOCK_SPELL, ranks({ Concussion: 5 }), TOTEM_OF_RAGE_PCT).damageMult).toBeCloseTo(1.071, 12)
    expect(withSpellTalents(FROST_SHOCK_SPELL, new Map(), TOTEM_OF_RAGE_PCT).damageMult).toBeCloseTo(1.02, 12)
    expect(withSpellTalents(LIGHTNING_BOLT_SPELL, new Map(), TOTEM_OF_RAGE_PCT).damageMult).toBe(1)
  })

  it('the Forever rank tooltips say the same', () => {
    const tooltip = (name: string) => {
      const t = TALENT_DATA.shaman.trees.flatMap((x) => x.talents).find((x) => x.name === name)!
      const f = (t.ranks as unknown as { forever: string[] }).forever
      return f[f.length - 1]
    }
    for (const [name, text] of [
      ['Flurry', 'by 25% for your next 3 swings after dealing a melee critical strike'],
      ['Mental Dexterity', 'equal to 100% of your Intellect'],
      ['Mental Quickness', 'up to 30% of your Intellect'],
      ['Improved Stormstrike', '100% chance to gain 50% mana regeneration while casting spells for 15 sec'],
      ['Maelstrom Weapon', 'Mana cost of your next Lightning Bolt spell by 20%. Stacks up to 5 times. Lasts 30 sec.'],
      ['Shamanistic Focus', 'Shock and Lightning Shield spells by 45%'],
      ['Elemental Weapons', 'Rockbiter Weapon by 20%, your Windfury Weapon effect by 40%'],
      ['Thundering Strikes', 'all spells and attacks by 5%'],
      ['Tidal Focus', 'improves your chance to hit by 5%'],
      ['Stormstrike', 'next Lightning Bolt, Chain Lightning, or Earth Shock spell by 20% for 12 sec'],
      ['Rage of the Farseer', 'by 30% for 25 sec'],
      ['Elemental Devastation', 'melee attacks by 9% for 10 sec'],
      ['Concussion', 'Lightning Bolt, Chain Lightning, and Earth Shock spells by 5%'],
    ] as const)
      expect(tooltip(name), name).toContain(text)
  })
})

describe('the shaman’s base values against the client (shaman.md#base-stats)', () => {
  it('base mana 1,520, 0.000508 crit per Agility and 0.000169 spell crit per Intellect (PlayerExpectedStat, basemp.txt)', () => {
    const g = gametablesJson as unknown as {
      baseMana: { level60: Record<string, number> }
      playerExpectedStat: { level60: Record<string, { baseMana: number; critPerAgility: number; spellCritPerIntellect: number }> }
    }
    const row = g.playerExpectedStat.level60.shaman
    expect(row.baseMana).toBe(SHAMAN_BASE_MANA)
    expect(g.baseMana.level60.shaman).toBe(SHAMAN_BASE_MANA)
    expect(CLASS_BASE.shaman.baseMana).toBe(SHAMAN_BASE_MANA)
    expect(CLASS_BASE.shaman.critPerAgi).toBeCloseTo(100 * row.critPerAgility, 12)
    expect(CLASS_BASE.shaman.spellCritPerInt).toBeCloseTo(100 * row.spellCritPerIntellect, 12)
  })
})

describe('the triggered spells the imbues and the talents’ procs apply', () => {
  const aura = (id: number, index: number) => effect(id, index).effectAura
  it('Windfury Weapon: 20% on melee auto attacks and abilities, a 1.5 s cooldown, 2 extra attacks with 333 attack power', () => {
    expect(spell(439431).auraOptions).toMatchObject({ procChance: 20, procTypeMask: [0x14, 0], procCategoryRecovery: 1500 })
    const proc = windfuryWeaponProc(WINDFURY_WEAPON_AP)
    expect(proc.chance).toEqual({ pct: 20 })
    expect(proc.icdMs).toBe(1500)
    expect([aura(16361, 0), effect(16361, 0).effectBasePointsF, effect(16361, 1).effect, effect(16361, 1).effectBasePointsF]).toEqual([99, WINDFURY_WEAPON_AP, 19, 2])
    expect(proc.action).toMatchObject({ kind: 'extraAttacks', count: 2 })
  })
  it('Rockbiter Weapon: +554 attack power and 16.5 a level from 54 to 62, so 653 at 60', () => {
    const e = effect(16313, 0)
    expect([e.effectAura, e.effectBasePointsF, e.effectRealPointsPerLevel]).toEqual([99, 554, 16.5])
    expect(ROCKBITER_AP).toBeCloseTo(atLevel60(554, 16.5, spell(16313).levels!.baseLevel!, spell(16313).levels!.maxLevel!), 6)
  })
  it('Maelstrom Weapon’s stacks, Flurry’s charges, Elemental Devastation and Improved Stormstrike: their auras and durations', () => {
    expect(spell(408505).auraOptions?.cumulativeAura).toBe(MAELSTROM_AURA.maxStacks)
    expect(spell(408505).duration?.duration).toBe(MAELSTROM_AURA.durationMs)
    expect(spell(16257).auraOptions).toMatchObject({ procCharges: 3, procCategoryRecovery: 500 })
    expect(spell(16257).duration?.duration).toBe(15000)
    expect([aura(30165, 0), spell(30165).duration?.duration]).toEqual([52, 10000])
    expect([aura(1238931, 0), effect(1238931, 0).effectBasePointsF, spell(1238931).duration?.duration]).toEqual([134, 100 * IMPROVED_STORMSTRIKE_SHARE, IMPROVED_STORMSTRIKE_AURA.durationMs])
  })
})

// --- Elemental (docs/classes/shaman.md#elemental-abilities, #elemental-talents) ----------------------------

describe('the Elemental spells against the client (shaman.md#elemental-abilities)', () => {
  /** A spell def against its client row: school, damage class, coefficient and its range at 60. */
  function matches(def: SpellDef, id: number, index: number) {
    const s = spell(id)
    expect(s.misc!.schoolMask, def.id).toBe(SCHOOL_MASK[def.school as keyof typeof SCHOOL_MASK])
    expect(s.categories!.defenseType, def.id).toBe(DEFENSE_TYPE[def.defense])
    expect(attrs(id), def.id).toEqual({ noActiveDefense: def.noActiveDefense, alwaysHit: def.alwaysHit })
    const e = effect(id, index)
    expect(e.effect, def.id).toBe(2)
    expect(e.effectBonusCoefficient, def.id).toBe(def.spCoefficient)
    const levels = s.levels!
    const grow = atLevel60(0, e.effectRealPointsPerLevel ?? 0, levels.baseLevel!, levels.maxLevel ?? Infinity)
    const [lo, hi] = spread(e.effectBasePointsF!, e.variance ?? 0)
    expect(def.min, def.id).toBeCloseTo(lo + grow, 9)
    expect(def.max, def.id).toBeCloseTo(hi + grow, 9)
  }
  /** Mana, cooldown, GCD and cast time against the client row. */
  function costs(def: AbilityDef, id: number) {
    const s = spell(id)
    expect({ mana: mana(def), cooldown: def.cooldownMs, gcd: def.gcdMs, cast: def.castMs }, def.id).toEqual({
      mana: s.power![0].manaCost,
      cooldown: s.cooldowns!.categoryRecoveryTime ?? 0,
      gcd: s.cooldowns!.startRecoveryTime,
      cast: s.castTime?.base ?? 0,
    })
  }

  it('Lightning Bolt r4 (915): 56 ± 6.7%, +0.6 a level from 20 to 25 (55.22–62.78), 0.714 as rank 10’s, 60 mana, 2.5 s', () => {
    matches(LIGHTNING_BOLT_R4_SPELL, 915, 0)
    expect([LIGHTNING_BOLT_R4_SPELL.min, LIGHTNING_BOLT_R4_SPELL.max].map((x) => Math.round(x * 100) / 100)).toEqual([55.22, 62.78])
    costs(LIGHTNING_BOLT_R4, 915)
    expect(classMask(915)).toBe(classMask(LB))
  })

  it('Chain Lightning r4 (10605): 123 ± 5.6%, + trunc(0.8 a level from 56 to 61) = 3 (119.17–132.83), 0.571, 485 mana, 2.0 s, its own 6 s', () => {
    matches(CHAIN_LIGHTNING_SPELL, CL, 0)
    costs(CHAIN_LIGHTNING, CL)
    expect(CHAIN_LIGHTNING.castHasted).toBe(true)
  })

  it('Flame Shock r6 (29228): 166 at once (0.214), 4 × 44 every 3 s (0.1 a tick) over 12 s, the periodic-crit flag, 410 mana, the shocks’ category', () => {
    matches(FLAME_SHOCK_SPELL, 29228, 0)
    const dot = effect(29228, 1)
    expect([dot.effectAura, dot.effectAuraPeriod, dot.effectBasePointsF, dot.effectBonusCoefficient]).toEqual([3, FLAME_SHOCK_SPELL.dotTickMs, FLAME_SHOCK_SPELL.dotTickDamage, FLAME_SHOCK_SPELL.dotSpCoefficient])
    expect(spell(29228).duration!.duration).toBe(FLAME_SHOCK_SPELL.dotTicks! * FLAME_SHOCK_SPELL.dotTickMs!)
    expect(FLAME_SHOCK_AURA.durationMs).toBe(spell(29228).duration!.duration)
    expect((spell(29228).misc!.attributes![8] & 0x200) !== 0).toBe(FLAME_SHOCK_SPELL.dotCanCrit)
    costs(FLAME_SHOCK, 29228)
    expect(spell(29228).categories!.category).toBe(19)
    expect(FLAME_SHOCK.category).toBe(SHOCK_CATEGORY)
  })

  it('Lava Burst r3 (1238300): 220 ± 12.7%, +1.3 a level from 60 (192.14–247.86), 0.714, Fire, 265 mana, 2.5 s, 10 s; +20% with Flame Shock (a dummy)', () => {
    matches(LAVA_BURST_SPELL, 1238300, 0)
    costs(LAVA_BURST, 1238300)
    expect(effect(1238300, 1)).toMatchObject({ effect: 3, effectBasePointsF: LAVA_BURST_FLAME_SHOCK_PCT })
    expect(LAVA_BURST_SPELL.boost).toEqual({ aura: FLAME_SHOCK_AURA.id, pct: 20, keep: true })
    // The talent (408490) is rank 1; the spellbook's rank 3 at 60 has the same cast, cost family and cooldown category.
    expect(spell(408490).categories!.category).toBe(spell(1238300).categories!.category)
  })

  it('Mana Tide Totem r3 (17359): 60 mana, a 5 min cooldown, a 1 s GCD; 4 × 290 mana', () => {
    const s = spell(17359)
    expect(s.power![0].manaCost).toBe(mana(MANA_TIDE_TOTEM))
    expect(s.cooldowns).toMatchObject({ categoryRecoveryTime: MANA_TIDE_TOTEM.cooldownMs, startRecoveryTime: MANA_TIDE_TOTEM.gcdMs })
    expect(MANA_TIDE_TOTEM.rageTickTenths * MANA_TIDE_TOTEM.rageTicks).toBe(10 * MANA_TIDE_MANA)
  })

  it('Clearcasting (16246): Elemental Focus’s 10% on damage spells, one charge, −100% cost (aura 108, misc 14), 15 s', () => {
    expect(spell(16164).auraOptions).toMatchObject({ procChance: 10, procTypeMask: [0x15550, 0] })
    expect(effect(16164, 0)).toMatchObject({ effectAura: 42, effectTriggerSpell: 16246 })
    expect(spell(16246).auraOptions!.procCharges).toBe(1)
    expect(effect(16246, 0)).toMatchObject({ effectAura: 108, effectBasePointsF: -100, effectMiscValue: [14, 0] })
    expect(spell(16246).duration!.duration).toBe(ELEMENTAL_CLEARCASTING.durationMs)
    expect(elementalFocusProc()).toMatchObject({ trigger: 'spellLanded', chance: { pct: 10 }, schools: ['fire', 'frost', 'nature'] })
    // Its mask covers every damage spell the sim casts.
    for (const id of [LB, 915, CL, ES, 29228]) expect(selects(16246, 0, id), String(id)).toBe(true)
  })

  it('Totem of the Storm (23199): 33 to Lightning Bolt and Chain Lightning (28857, mask 0x3)', () => {
    expect(TOTEM_OF_THE_STORM).toBe(23199)
    expect(effect(28857, 0)).toMatchObject({ effectAura: 112, effectBasePointsF: TOTEM_OF_THE_STORM_SP })
    expect(effect(28857, 0).effectSpellClassMask![0]).toBe(0x3)
  })

  it('the caster’s racials: Blood Fury’s +10% spell power (aura 317), Berserking’s +10% casting speed (aura 65)', () => {
    expect(effect(20572, 2)).toMatchObject({ effectAura: 317, effectBasePointsF: 10 })
    expect(effect(20554, 2)).toMatchObject({ effectAura: 65, effectBasePointsF: 10 })
  })
})

describe('the Elemental talents against the client (shaman.md#elemental-talents)', () => {
  it('Lightning Overload 3 / 7 / 10%; Mindfulness 17 / 33 / 50%; Elemental Alacrity −170 / 330 / 500 ms; Call of Flame 5 / 10 / 15%', () => {
    expect(curve('Lightning Overload')).toEqual(LIGHTNING_OVERLOAD_PCT.slice(1))
    expect(curve('Mindfulness')).toEqual(MINDFULNESS_PCT.slice(1))
    expect(effect(1223033, 0).effectAura).toBe(134)
    expect(curve('Elemental Alacrity').map((x) => -x)).toEqual(ELEMENTAL_ALACRITY_MS.slice(1))
    expect([curve('Call of Flame', 0), curve('Call of Flame', 1)]).toEqual([
      [5, 10, 15],
      [5, 10, 15],
    ])
  })

  it('their masks: Alacrity and Convection cover Lava Burst (word 1 0x1000); Call of Flame Flame Shock (and its ticks, misc 22) and Lava Burst; Call of Thunder and Concussion Chain Lightning', () => {
    const word1 = (id: number, index: number) => (effect(id, index).effectSpellClassMask![1] ?? 0) >>> 0
    const lavaBit = spell(1238300).classOptions!.spellClassMask![1] >>> 0
    expect(lavaBit).toBe(0x1000)
    for (const [id, index] of [
      [16578, 0],
      [16039, 0],
      [16038, 0],
    ] as const)
      expect(word1(id, index) & lavaBit, `${id}`).toBe(lavaBit)
    expect(selects(16038, 0, 29228)).toBe(true)
    expect(effect(16038, 1)).toMatchObject({ effectMiscValue: [22, 0] })
    expect(selects(16038, 1, 29228)).toBe(true)
    for (const id of [16120, 16035, 16578]) expect(selects(id, 0, CL), String(id)).toBe(true)
    expect(selects(16039, 0, 29228)).toBe(true)
  })

  it('the build’s rows: costs, casts and multipliers from the default build', () => {
    const talents = ranks({ Convection: 5, Concussion: 5, Reverberation: 4, 'Call of Flame': 3, 'Elemental Focus': 1, 'Elemental Fury': 5, 'Call of Thunder': 1, 'Elemental Alacrity': 3 })
    expect(mana(withTalents(LAVA_BURST, talents))).toBe(238)
    expect(mana(withTalents(CHAIN_LIGHTNING, talents))).toBe(436)
    expect(mana(withTalents(FLAME_SHOCK, talents))).toBe(369)
    expect(withTalents(FLAME_SHOCK, talents).cooldownMs).toBe(5200)
    expect(withTalents(LAVA_BURST, talents).castMs).toBe(2000)
    expect(withTalents(CHAIN_LIGHTNING, talents).castMs).toBe(1500)
    expect(withSpellTalents(FLAME_SHOCK_SPELL, talents).damageMult).toBeCloseTo(1.15, 12)
    expect(withSpellTalents(LAVA_BURST_SPELL, talents).damageMult).toBeCloseTo(1.15, 12)
    expect(withSpellTalents(CHAIN_LIGHTNING_SPELL, talents)).toMatchObject({ bonusCrit: 3, critMultiplier: 2 })
    expect(withSpellTalents(CHAIN_LIGHTNING_SPELL, talents).damageMult).toBeCloseTo(1.05, 12)
    for (const def of [LIGHTNING_BOLT, LIGHTNING_BOLT_R4, CHAIN_LIGHTNING, LAVA_BURST, FLAME_SHOCK, EARTH_SHOCK]) expect(withTalents(def, talents).clearcastable, def.id).toBe(true)
  })
})
