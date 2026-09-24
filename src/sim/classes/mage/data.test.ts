// The mage's spells, cooldowns and talents against the Forever client data (docs/classes/mage.md;
// docs/data/client.md): every number abilities.ts, talents.ts and setup.ts write out, read back from
// src/data/client/{spells,talents,items,gametables}.json. Three rows the datasets don't hold yet are
// cited from the client in mage.md instead: Hot Streak's buff (400625: 3 stacks, 15 s) and the mana
// gems' spells (10058, 10057) and items (8008, 8007); the gems' 2 min category 1153 is read from the
// Demonic Rune's row, which shares it.
import { describe, expect, it } from 'vitest'
import gametablesJson from '@/data/client/gametables.json'
import itemsJson from '@/data/client/items.json'
import spellsJson from '@/data/client/spells.json'
import talentsJson from '@/data/client/talents.json'
import type { ClientSpell, ClientSpells } from '@/data/client/types'
import { GCD_MS } from '../../core/formulas'
import { TALENT_DATA } from '../../defaults'
import type { AbilityDef, SpellDef } from '../../plan/types'
import { CLASS_BASE } from '../../stats/base-stats'
import { atLevel60, spread } from '../paladin/spells'
import {
  ARCANE_BLAST,
  ARCANE_BLAST_SPELL,
  ARCANE_MISSILE_SPELL,
  ARCANE_MISSILES,
  ARCANE_POWER,
  ARCANE_POWER_AURA,
  COMBUSTION,
  COMBUSTION_AURA,
  EVOCATION,
  EVOCATION_AURA,
  FIRE_BLAST,
  FIRE_BLAST_SPELL,
  FIREBALL,
  FIREBALL_SPELL,
  FROSTBOLT,
  FROSTBOLT_SPELL,
  GEM_CATEGORY,
  ICE_BARRIER,
  ICE_BARRIER_AURA,
  MAGE_BASE_MANA,
  MANA_CITRINE,
  MANA_RUBY,
  PRESENCE_OF_MIND,
  PRESENCE_OF_MIND_AURA,
  PYROBLAST,
  PYROBLAST_SPELL,
  SCORCH,
  SCORCH_SPELL,
  TALENT_DPS_CATEGORY,
} from './abilities'
import { ARCANE_MEDITATION_SHARE, MAGE_ARMOR_SHARE } from './setup'
import { CLEARCASTING, FIRE_VULNERABILITY, HOT_STREAK, HOT_STREAK_CAST_PCT, TALENT_EFFECTS, WINTERS_CHILL_CRIT_PER_STACK, wintersChill, withSpellTalents, withTalents } from './talents'

const spells = (spellsJson as unknown as ClientSpells).spells
const spell = (id: number): ClientSpell => {
  const s = spells[String(id)]
  expect(s, `client spell ${id}`).toBeDefined()
  return s
}
const effect = (id: number, index: number) => spell(id).effects.find((e) => e.effectIndex === index)!
const DEFENSE_TYPE = { magic: 1 } as const
const SCHOOL_MASK = { fire: 4, frost: 16, arcane: 64 } as const
/** A spell's class-mask words (SpellClassOptions), which talents' and auras' masks select. */
const classMask = (id: number) => spell(id).classOptions!.spellClassMask!.map((w) => w >>> 0)
/** Whether an effect's class mask selects the spell (any word). */
const selects = (id: number, index: number, target: number) => {
  const m = effect(id, index).effectSpellClassMask!.map((w) => w >>> 0)
  const t = classMask(target)
  return m.some((w, i) => (w & (t[i] ?? 0)) !== 0)
}
const ranks = (r: Record<string, number>) => new Map(Object.entries(r))
const mana = (def: AbilityDef) => def.costTenths / 10

/** The Forever client's rank curve of a mage talent's effect (TraitDefinitionEffectPoints). */
const curve = (name: string, effectIndex = 0): number[] => {
  const t = (talentsJson as unknown as { classes: { mage: { talents: { name: string; rankEffects: { effectIndex: number; values: number[] }[] }[] } } }).classes.mage.talents.find((x) => x.name === name)
  expect(t, name).toBeDefined()
  const e = t!.rankEffects.find((r) => r.effectIndex === effectIndex)
  expect(e, `${name} #${effectIndex}`).toBeDefined()
  return e!.values
}
/** A talent's effect at each rank, 1..n. */
const byRank = <T>(n: number, f: (r: number) => T) => Array.from({ length: n }, (_, i) => f(i + 1))

const FB = 25306
const SC = 10207
const FBL = 10199
const PY = 18809
const FRB = 25304
const AM = 25345
const AMM = 25346
const AB = 1239700
/** Our damage spells, by plan id: the client row whose class mask the talents select. */
const DAMAGE: Record<string, number> = { fireball: FB, scorch: SC, fireBlast: FBL, pyroblast: PY, frostbolt: FRB, arcaneMissiles: AMM, arcaneBlast: AB }

describe('the damage spells against the client (mage.md#fire-spells, #frost-spells, #arcane-spells)', () => {
  /** A spell def against its client row: school, damage class, coefficient, and its range at 60 from base points, variance and per-level points. */
  function matches(def: SpellDef, id: number, index: number) {
    const s = spell(id)
    expect(s.misc!.schoolMask, def.id).toBe(SCHOOL_MASK[def.school as keyof typeof SCHOOL_MASK])
    expect(s.categories!.defenseType, def.id).toBe(DEFENSE_TYPE[def.defense as 'magic'])
    const e = effect(id, index)
    expect(e.effect, def.id).toBe(2)
    expect(e.effectBonusCoefficient, def.id).toBe(def.spCoefficient)
    const levels = s.levels!
    const grow = atLevel60(0, e.effectRealPointsPerLevel ?? 0, levels.baseLevel!, levels.maxLevel!)
    const [lo, hi] = spread(e.effectBasePointsF!, e.variance ?? 0)
    expect(def.min, def.id).toBeCloseTo(lo + grow, 9)
    expect(def.max, def.id).toBeCloseTo(hi + grow, 9)
    expect(def).toMatchObject({ triggersProcs: true, weaponPercent: 0, critMultiplier: 1.5, alwaysHit: false, noActiveDefense: false })
  }

  it('Fireball r12: 483 ± 12.09% (424.58–541.42), 1.0; its DoT 15 every 2 s for 8 s, coefficient 0, no periodic crit', () => {
    matches(FIREBALL_SPELL, FB, 0)
    expect([FIREBALL_SPELL.min.toFixed(2), FIREBALL_SPELL.max.toFixed(2)]).toEqual(['424.58', '541.42'])
    const dot = effect(FB, 1)
    expect([dot.effectAura, dot.effectAuraPeriod, dot.effectBasePointsF, dot.effectBonusCoefficient ?? 0]).toEqual([3, FIREBALL_SPELL.dotTickMs, FIREBALL_SPELL.dotTickDamage, FIREBALL_SPELL.dotSpCoefficient])
    expect(spell(FB).duration!.duration! / dot.effectAuraPeriod!).toBe(FIREBALL_SPELL.dotTicks)
    expect(FIREBALL_SPELL.dotCanCrit).toBeUndefined()
  })

  it('Scorch r7: 178 ± 8.27%, +1.7 a level from 58 to 62 (166.68–196.12), 0.429', () => {
    matches(SCORCH_SPELL, SC, 0)
    expect([SCORCH_SPELL.min.toFixed(2), SCORCH_SPELL.max.toFixed(2)]).toEqual(['166.68', '196.12'])
  })

  it('Fire Blast r7: 438 ± 8.30%, +3 a level from 54 to 59 (416.66–489.34), 0.429', () => {
    matches(FIRE_BLAST_SPELL, FBL, 0)
    expect([FIRE_BLAST_SPELL.min.toFixed(2), FIRE_BLAST_SPELL.max.toFixed(2)]).toEqual(['416.66', '489.34'])
  })

  it('Pyroblast r8: 583 ± 10.83% (519.84–646.16), 1.0; its DoT 53 every 3 s for 12 s, 0.15 a tick', () => {
    matches(PYROBLAST_SPELL, PY, 0)
    expect([PYROBLAST_SPELL.min.toFixed(2), PYROBLAST_SPELL.max.toFixed(2)]).toEqual(['519.84', '646.16'])
    const dot = effect(PY, 1)
    expect([dot.effectAura, dot.effectAuraPeriod, dot.effectBasePointsF, dot.effectBonusCoefficient]).toEqual([3, PYROBLAST_SPELL.dotTickMs, PYROBLAST_SPELL.dotTickDamage, PYROBLAST_SPELL.dotSpCoefficient])
    expect(spell(PY).duration!.duration! / dot.effectAuraPeriod!).toBe(PYROBLAST_SPELL.dotTicks)
  })

  it('Frostbolt r11: 475 ± 3.74% (457.24–492.76), 0.814; its slow (aura 33) makes it binary', () => {
    matches(FROSTBOLT_SPELL, FRB, 1)
    expect([FROSTBOLT_SPELL.min.toFixed(2), FROSTBOLT_SPELL.max.toFixed(2)]).toEqual(['457.24', '492.76'])
    expect(effect(FRB, 0)).toMatchObject({ effect: 6, effectAura: 33, effectBasePointsF: -40 })
    expect(FROSTBOLT_SPELL.binary).toBe(true)
    for (const def of [FIREBALL_SPELL, SCORCH_SPELL, FIRE_BLAST_SPELL, PYROBLAST_SPELL, ARCANE_MISSILE_SPELL, ARCANE_BLAST_SPELL]) expect(def.binary, def.id).toBeUndefined()
  })

  it('Arcane Missiles r8: each missile (25346) 209, 0.286, no variance; Arcane Blast r5 (Forever’s): 394 ± 7.55% (364.25–423.75), 0.714', () => {
    matches(ARCANE_MISSILE_SPELL, AMM, 0)
    expect([ARCANE_MISSILE_SPELL.min, ARCANE_MISSILE_SPELL.max]).toEqual([209, 209])
    matches(ARCANE_BLAST_SPELL, AB, 0)
    expect([ARCANE_BLAST_SPELL.min.toFixed(2), ARCANE_BLAST_SPELL.max.toFixed(2)]).toEqual(['364.25', '423.75'])
  })
})

describe('costs, cast times, cooldowns and the GCD against the client', () => {
  it('Fireball 410 / 3.5 s, Scorch 150 / 1.5 s, Fire Blast 340 / instant / 8 s (category 19), Pyroblast 440 / 6 s, Frostbolt 290 / 3 s; all on the 1.5 s GCD (category 133)', () => {
    for (const [def, id] of [
      [FIREBALL, FB],
      [SCORCH, SC],
      [FIRE_BLAST, FBL],
      [PYROBLAST, PY],
      [FROSTBOLT, FRB],
    ] as const) {
      const s = spell(id)
      expect({ mana: mana(def), cooldown: def.cooldownMs, gcd: def.gcdMs, cast: def.castMs, resource: def.resource }, def.id).toEqual({
        mana: s.power![0].manaCost,
        cooldown: s.cooldowns!.categoryRecoveryTime ?? 0,
        gcd: s.cooldowns!.startRecoveryTime,
        cast: s.castTime?.base ?? 0,
        resource: 'mana',
      })
      expect(s.categories!.startRecoveryCategory, def.id).toBe(133)
      expect(def.castHasted, def.id).toBe(def.castMs > 0)
      expect(def.clearcastable, def.id).toBe(true)
    }
    expect(FIREBALL.gcdMs).toBe(GCD_MS)
    expect(spell(FBL).categories!.category).toBe(19)
  })

  it('Arcane Blast costs 15% of base mana (181 of 1,213), a 2.5 s cast', () => {
    expect(spell(AB).power![0].powerCostPct).toBe(15)
    expect(mana(ARCANE_BLAST)).toBe(Math.floor(0.15 * MAGE_BASE_MANA))
    expect(mana(ARCANE_BLAST)).toBe(181)
    expect(ARCANE_BLAST.castMs).toBe(spell(AB).castTime!.base)
  })

  it('Arcane Missiles: a 5 s channel of 655 mana, a missile (25346) each second from 1 s (aura 23, period 1000)', () => {
    const s = spell(AM)
    expect(mana(ARCANE_MISSILES)).toBe(s.power![0].manaCost)
    expect(effect(AM, 0)).toMatchObject({ effectAura: 23, effectAuraPeriod: ARCANE_MISSILES.rageTickMs, effectTriggerSpell: AMM })
    expect(s.duration!.duration! / effect(AM, 0).effectAuraPeriod!).toBe(ARCANE_MISSILES.rageTicks)
    expect(ARCANE_MISSILES).toMatchObject({ kind: 'channel', gcdMs: s.cooldowns!.startRecoveryTime, castMs: 0, tickSpellDef: ARCANE_MISSILE_SPELL })
  })

  it('Evocation: an 8 s channel on the GCD, no cost, 8 min; regeneration +1,500% (aura 110), all of it while casting (aura 134)', () => {
    const s = spell(12051)
    expect([EVOCATION.cooldownMs, EVOCATION.gcdMs, EVOCATION.costTenths]).toEqual([s.cooldowns!.recoveryTime, s.cooldowns!.startRecoveryTime, 0])
    expect(EVOCATION.rageTicks! * EVOCATION.rageTickMs!).toBe(s.duration!.duration)
    expect(EVOCATION_AURA.durationMs).toBe(s.duration!.duration)
    expect([effect(12051, 0).effectAura, effect(12051, 0).effectBasePointsF]).toEqual([110, EVOCATION_AURA.mods.spiritRegen])
    expect([effect(12051, 1).effectAura, effect(12051, 1).effectBasePointsF]).toEqual([134, EVOCATION_AURA.mods.castingRegen])
    expect(EVOCATION.aura).toBe(EVOCATION_AURA)
  })

  it('Ice Barrier r4: 480 mana, a 30 s cooldown, on the GCD, 60 s', () => {
    const s = spell(13033)
    expect([mana(ICE_BARRIER), ICE_BARRIER.cooldownMs, ICE_BARRIER.gcdMs, ICE_BARRIER_AURA.durationMs]).toEqual([s.power![0].manaCost, s.cooldowns!.categoryRecoveryTime, s.cooldowns!.startRecoveryTime, s.duration!.duration])
  })
})

describe('the cooldowns and their auras against the client', () => {
  it('Combustion (11129 → 28682): +10% Fire crit a stack (aura 107, misc 7, the Fire spells’ mask), 10 stacks, 4 charges on crits (mask 0x10000), category 1151’s 3 min, off the GCD, free', () => {
    const s = spell(11129)
    expect(s.auraOptions).toMatchObject({ procCharges: COMBUSTION_AURA.critCharges, procTypeMask: [0x10000, 0] })
    expect(s.categories!.category).toBe(1151)
    expect(s.cooldowns!.categoryRecoveryTime).toBe(COMBUSTION.cooldownMs)
    expect(s.cooldowns!.startRecoveryTime ?? 0).toBe(COMBUSTION.gcdMs)
    expect(s.power ?? []).toEqual([])
    expect(effect(11129, 1).effectTriggerSpell).toBe(28682)
    expect(spell(28682).auraOptions!.cumulativeAura).toBe(COMBUSTION_AURA.maxStacks)
    expect(effect(28682, 0)).toMatchObject({ effectAura: 107, effectBasePointsF: COMBUSTION_AURA.mods.schoolCrit, effectMiscValue: [7, 0] })
    for (const id of [FB, SC, FBL, PY]) expect(selects(28682, 0, id), String(id)).toBe(true)
    for (const id of [FRB, AMM, AB]) expect(selects(28682, 0, id), String(id)).toBe(false)
    expect(COMBUSTION_AURA).toMatchObject({ critChargeSchools: ['fire'], refreshKeepsCharges: true })
    expect(COMBUSTION).toMatchObject({ category: TALENT_DPS_CATEGORY, cooldownAfterAura: true, aura: COMBUSTION_AURA })
    // Each Fire spell that hits adds a stack while it's up (talents.ts).
    expect(TALENT_EFFECTS.Combustion(1)).toMatchObject([{ proc: { trigger: 'spellLanded', schools: ['fire'], requiresAura: 'combustion', action: { kind: 'aura', aura: COMBUSTION_AURA } } }])
  })

  it('Presence of Mind (12043): −100% cast time (aura 108, misc 10) for the next spell of mask 0x40000000, one charge; category 1151, shared with Combustion', () => {
    const s = spell(12043)
    expect(s.categories!.category).toBe(spell(11129).categories!.category)
    expect((spellsJson as unknown as { spellCategories: Record<string, { name: string }> }).spellCategories['1151'].name).toBe('Talent - DPS')
    expect(s.cooldowns!.categoryRecoveryTime).toBe(PRESENCE_OF_MIND.cooldownMs)
    expect(s.auraOptions!.procCharges).toBe(1)
    expect(effect(12043, 0)).toMatchObject({ effectAura: 108, effectBasePointsF: -100, effectMiscValue: [10, 0] })
    // Fireball, Scorch, Pyroblast, Frostbolt and Arcane Blast have cast times and the mask; Fire Blast and Arcane Missiles neither.
    for (const [id, def] of [
      [FB, FIREBALL],
      [SC, SCORCH],
      [PY, PYROBLAST],
      [FRB, FROSTBOLT],
      [AB, ARCANE_BLAST],
    ] as const) {
      expect(selects(12043, 0, id), String(id)).toBe(true)
      expect(withTalents(def, ranks({ 'Presence of Mind': 1 })).instantAuraId, def.id).toBe(PRESENCE_OF_MIND_AURA.id)
    }
    for (const def of [FIRE_BLAST, ARCANE_MISSILES]) expect(withTalents(def, ranks({ 'Presence of Mind': 1 })).instantAuraId, def.id).toBeUndefined()
    expect(withTalents(FIREBALL, new Map()).instantAuraId).toBeUndefined()
    expect(PRESENCE_OF_MIND).toMatchObject({ category: TALENT_DPS_CATEGORY, gcdMs: 0, costTenths: 0 })
  })

  it('Arcane Power (12042): +30% damage and +30% mana cost (aura 108, misc 0 and 14), 15 s, a 3 min cooldown, off the GCD', () => {
    const s = spell(12042)
    expect([ARCANE_POWER.cooldownMs, ARCANE_POWER.gcdMs, ARCANE_POWER_AURA.durationMs]).toEqual([s.cooldowns!.recoveryTime, s.cooldowns!.startRecoveryTime ?? 0, s.duration!.duration])
    expect(effect(12042, 0)).toMatchObject({ effectAura: 108, effectBasePointsF: ARCANE_POWER_AURA.mods.schoolDamage })
    expect(effect(12042, 1)).toMatchObject({ effectAura: 108, effectBasePointsF: ARCANE_POWER_AURA.mods.manaCostPct, effectMiscValue: [14, 0] })
    // Every damage spell of ours, and every ability's cost.
    for (const [id, target] of Object.entries(DAMAGE)) expect(selects(12042, 0, target), id).toBe(true)
    for (const target of [FB, SC, FBL, PY, FRB, AM, AB]) expect(selects(12042, 1, target), String(target)).toBe(true)
  })

  it('Clearcasting (12536): the next spell’s cost −100% (aura 108, misc 14), one charge, 15 s', () => {
    const s = spell(12536)
    expect(s.duration!.duration).toBe(CLEARCASTING.durationMs)
    expect(s.auraOptions!.procCharges).toBe(1)
    expect(effect(12536, 0)).toMatchObject({ effectAura: 108, effectMiscValue: [14, 0] })
    expect(effect(12536, 0).effectBasePointsF!).toBeLessThanOrEqual(-100)
    for (const target of [FB, SC, FBL, PY, FRB, AM, AB]) expect(selects(12536, 0, target), String(target)).toBe(true)
  })
})

describe('the procs’ auras against the client', () => {
  it('Fire Vulnerability (22959): +3% Fire damage taken from you a stack (aura 270, misc 4), 5 stacks, 30 s', () => {
    const s = spell(22959)
    expect(s.auraOptions!.cumulativeAura).toBe(FIRE_VULNERABILITY.maxStacks)
    expect(s.duration!.duration).toBe(FIRE_VULNERABILITY.durationMs)
    expect(effect(22959, 0)).toMatchObject({ effectAura: 270, effectBasePointsF: FIRE_VULNERABILITY.mods.schoolTaken, effectMiscValue: [4, 0] })
    // Improved Scorch (11095) triggers it from Scorch (mask 0x10): 33 / 67 / 100% by rank.
    expect(effect(11095, 0)).toMatchObject({ effectTriggerSpell: 22959 })
    expect(selects(11095, 0, SC)).toBe(true)
    expect(selects(11095, 0, FB)).toBe(false)
    expect(curve('Improved Scorch')).toEqual([33, 67, 100])
    expect(byRank(3, (r) => TALENT_EFFECTS['Improved Scorch'](r)[0])).toMatchObject(
      [33, 67, 100].map((pct) => ({ proc: { trigger: 'spellLanded', fromSpell: 'scorch', chance: { pct }, action: { kind: 'aura', aura: FIRE_VULNERABILITY } } })),
    )
  })

  it('Winter’s Chill (11180 → 12579): +2% crit a stack (aura 308, misc 16) for Frostbolt only of ours, 15 s, 1 stack a rank (5 at 5/5), a 20% chance a rank', () => {
    const s = spell(12579)
    expect(s.duration!.duration).toBe(wintersChill(5).durationMs)
    expect(s.auraOptions!.cumulativeAura).toBe(wintersChill(5).maxStacks)
    expect(effect(12579, 0)).toMatchObject({ effectAura: 308, effectBasePointsF: WINTERS_CHILL_CRIT_PER_STACK, effectMiscValue: [16, 0] })
    expect(selects(12579, 0, FRB)).toBe(true)
    for (const id of [FB, SC, FBL, PY, AMM, AB]) expect(selects(12579, 0, id), String(id)).toBe(false)
    expect(effect(11180, 0).effectTriggerSpell).toBe(12579)
    expect(curve("Winter's Chill", 0)).toEqual([1, 2, 3, 4, 5])
    expect(curve("Winter's Chill", 1)).toEqual([20, 40, 60, 80, 100])
    for (let r = 1; r <= 5; r++) {
      expect(wintersChill(r).maxStacks).toBe(curve("Winter's Chill", 0)[r - 1])
      expect(TALENT_EFFECTS["Winter's Chill"](r)[0]).toMatchObject({ proc: { trigger: 'spellLanded', schools: ['frost'], chance: { pct: curve("Winter's Chill", 1)[r - 1] } } })
    }
  })

  it('Hot Streak (400624): on a crit (mask 0x10000) of Fireball, Fire Blast or Scorch; 3 stacks, 15 s, 25% of Pyroblast’s cast a stack, not its cost', () => {
    expect(spell(400624).auraOptions!.procTypeMask).toEqual([0x10000, 0])
    expect(HOT_STREAK).toMatchObject({ maxStacks: 3, durationMs: 15000 })
    expect(HOT_STREAK_CAST_PCT).toBe(25)
    expect(TALENT_EFFECTS['Hot Streak'](1).map((e) => (e.kind === 'proc' ? [e.proc.trigger, e.proc.fromSpell] : []))).toEqual([
      ['spellCrit', 'fireball'],
      ['spellCrit', 'fireBlast'],
      ['spellCrit', 'scorch'],
    ])
    expect(withTalents(PYROBLAST, ranks({ 'Hot Streak': 1 }))).toMatchObject({ stackAuraId: HOT_STREAK.id, stackCastPct: 25, stackCostPct: 0 })
    expect(withTalents(PYROBLAST, new Map()).stackAuraId).toBeUndefined()
  })

  it('Arcane Concentration (11213): Clearcasting at 2% a rank on a landed spell (mask 0x15550), at most once a second', () => {
    const s = spell(11213)
    expect(s.auraOptions).toMatchObject({ procCategoryRecovery: 1000, procTypeMask: [0x15550, 0] })
    expect(effect(11213, 0).effectTriggerSpell).toBe(12536)
    expect(curve('Arcane Concentration')).toEqual([2, 4, 6, 8, 10])
    for (let r = 1; r <= 5; r++) expect(TALENT_EFFECTS['Arcane Concentration'](r)[0]).toMatchObject({ proc: { trigger: 'spellLanded', icdMs: 1000, chance: { pct: 2 * r }, action: { kind: 'aura', aura: CLEARCASTING } } })
  })
})

describe('the talents’ rank curves (mage.md#talents)', () => {
  it('Ignite: 8% a rank of a Fire crit (40% at 5/5), 2 ticks 2 s apart, on crits (mask 0x10000)', () => {
    expect(curve('Ignite')).toEqual([8, 16, 24, 32, 40])
    expect(spell(11119).auraOptions!.procTypeMask).toEqual([0x10000, 0])
    for (let r = 1; r <= 5; r++) {
      expect(TALENT_EFFECTS.Ignite(r)[0]).toMatchObject({ proc: { trigger: 'spellCrit', schools: ['fire'], action: { kind: 'ignite', pct: curve('Ignite')[r - 1], ticks: 2, tickMs: 2000, school: 'fire' } } })
    }
  })

  it('Master of Elements: 10 / 20 / 30% of a Fire or Frost crit’s cost', () => {
    expect(curve('Master of Elements')).toEqual([10, 20, 30])
    for (let r = 1; r <= 3; r++) expect(TALENT_EFFECTS['Master of Elements'](r)[0]).toMatchObject({ proc: { trigger: 'spellCrit', schools: ['fire', 'frost'], action: { kind: 'manaOfCost', pct: 10 * r } } })
  })

  it('Critical Mass +2% a rank on the Fire spells (aura 107, misc 7), not Frostbolt', () => {
    expect(curve('Critical Mass')).toEqual([2, 4, 6])
    for (const id of [FB, SC, FBL, PY]) expect(selects(11115, 0, id), String(id)).toBe(true)
    expect(selects(11115, 0, FRB)).toBe(false)
    expect(TALENT_EFFECTS['Critical Mass'](3)).toEqual([{ kind: 'schoolCrit', schools: ['fire'], pct: 6 }])
  })

  it('the spell multipliers: Fire Power +2% a rank (Fire spells, and Fireball’s and Pyroblast’s DoTs), Piercing Ice +2% (Frostbolt), Arcane Instability +1% on every spell', () => {
    expect(curve('Fire Power', 0)).toEqual([2, 4, 6, 8, 10])
    expect(curve('Fire Power', 1)).toEqual([2, 4, 6, 8, 10])
    expect(curve('Piercing Ice')).toEqual([2, 4, 6])
    expect(curve('Arcane Instability', 0)).toEqual([1, 2, 3])
    expect(curve('Arcane Instability', 2)).toEqual([1, 2, 3])
    for (const id of [FB, SC, FBL, PY]) expect(selects(11124, 0, id), String(id)).toBe(true)
    for (const id of [FB, PY]) expect(selects(11124, 1, id), String(id)).toBe(true)
    expect(selects(11124, 0, FRB)).toBe(false)
    expect(selects(11151, 0, FRB)).toBe(true)
    expect(selects(11151, 0, FB)).toBe(false)
    for (const [id, target] of Object.entries(DAMAGE)) expect(selects(15058, 0, target), id).toBe(true)
    const t = ranks({ 'Fire Power': 5, 'Piercing Ice': 3, 'Arcane Instability': 3 })
    for (const def of [FIREBALL_SPELL, SCORCH_SPELL, FIRE_BLAST_SPELL, PYROBLAST_SPELL]) expect(withSpellTalents(def, t).damageMult, def.id).toBeCloseTo(1.1 * 1.03, 12)
    expect(withSpellTalents(FROSTBOLT_SPELL, t).damageMult).toBeCloseTo(1.06 * 1.03, 12)
    for (const def of [ARCANE_MISSILE_SPELL, ARCANE_BLAST_SPELL]) expect(withSpellTalents(def, t).damageMult, def.id).toBeCloseTo(1.03, 12)
    expect(TALENT_EFFECTS['Arcane Instability'](3)).toEqual([
      { kind: 'stat', stat: 'crit', value: 3 },
      { kind: 'stat', stat: 'spellCrit', value: 3 },
    ])
    expect(effect(15058, 2).effectAura).toBe(290)
  })

  it('the crit talents: Incineration +2% a rank (Scorch, Fire Blast, Arcane Blast), Arcane Impact +2% (Arcane Missiles, Arcane Blast); Ice Shards and Arcane Mind +20% a rank of the crit bonus', () => {
    expect(curve('Incineration')).toEqual([2, 4, 6])
    expect(curve('Arcane Impact')).toEqual([2, 4, 6])
    expect(curve('Ice Shards')).toEqual([20, 40, 60, 80, 100])
    expect(curve('Arcane Mind', 1)).toEqual([20, 40, 60, 80, 100])
    for (const id of [SC, FBL, AB]) expect(selects(18459, 0, id), String(id)).toBe(true)
    for (const id of [FB, PY]) expect(selects(18459, 0, id), String(id)).toBe(false)
    for (const id of [AMM, AB]) expect(selects(11242, 0, id), String(id)).toBe(true)
    expect(selects(11207, 0, FRB)).toBe(true)
    for (const id of [AMM, AB]) expect(selects(11232, 1, id), String(id)).toBe(true)
    const t = ranks({ Incineration: 3, 'Arcane Impact': 3, 'Ice Shards': 5, 'Arcane Mind': 5 })
    const crit = (def: SpellDef) => withSpellTalents(def, t).bonusCrit
    expect([FIREBALL_SPELL, SCORCH_SPELL, FIRE_BLAST_SPELL, PYROBLAST_SPELL, FROSTBOLT_SPELL, ARCANE_MISSILE_SPELL, ARCANE_BLAST_SPELL].map(crit)).toEqual([0, 6, 6, 0, 0, 6, 12])
    const mult = (def: SpellDef) => withSpellTalents(def, t).critMultiplier
    expect([FIREBALL_SPELL, FROSTBOLT_SPELL, ARCANE_MISSILE_SPELL, ARCANE_BLAST_SPELL].map(mult)).toEqual([1.5, 2, 2, 2])
    expect(withSpellTalents(FROSTBOLT_SPELL, ranks({ 'Ice Shards': 3 })).critMultiplier).toBeCloseTo(1.8, 12)
  })

  it('the hit talents: Arcane Focus +1% a rank with Arcane spells, Elemental Precision +1% a rank with Fire and Frost (aura 107, misc 16)', () => {
    expect(curve('Arcane Focus')).toEqual([1, 2, 3, 4, 5])
    expect(curve('Elemental Precision')).toEqual([1, 2, 3, 4, 5])
    for (const id of [FB, SC, FBL, PY, FRB]) expect(selects(29438, 0, id), String(id)).toBe(true)
    for (const id of [AMM, AB]) expect(selects(29438, 0, id), String(id)).toBe(false)
    for (const id of [AMM, AB]) expect(selects(11222, 0, id), String(id)).toBe(true)
    expect(selects(11222, 0, FB)).toBe(false)
    expect(TALENT_EFFECTS['Elemental Precision'](5)).toEqual([{ kind: 'schoolHit', schools: ['fire', 'frost'], pct: 5 }])
    expect(TALENT_EFFECTS['Arcane Focus'](5)).toEqual([{ kind: 'schoolHit', schools: ['arcane'], pct: 5 }])
  })

  it('Arcane Subtlety −8 / −15 resistance (aura 123), Arcane Mind +2% Intellect a rank (aura 137), Arcane Meditation 17 / 33 / 50% regeneration while casting', () => {
    expect(curve('Arcane Subtlety', 1)).toEqual([-8, -15])
    expect(effect(11210, 1).effectAura).toBe(123)
    for (let r = 1; r <= 2; r++) expect(TALENT_EFFECTS['Arcane Subtlety'](r)).toEqual([{ kind: 'stat', stat: 'spellPen', value: -curve('Arcane Subtlety', 1)[r - 1] }])
    expect(curve('Arcane Mind', 0)).toEqual([2, 4, 6, 8, 10])
    expect(effect(11232, 0).effectAura).toBe(137)
    expect(TALENT_EFFECTS['Arcane Mind'](5)).toEqual([{ kind: 'mult', stat: 'int', pct: 10 }])
    expect(curve('Arcane Meditation')).toEqual([17, 33, 50])
    expect(effect(18462, 0).effectAura).toBe(134)
    expect(ARCANE_MEDITATION_SHARE.slice(1).map((x) => Math.round(100 * x))).toEqual(curve('Arcane Meditation'))
  })

  it('the cast-time and cost talents: Improved Fireball and Improved Frostbolt −100 ms a rank, Wake of Fire −1 s a rank off Fire Blast’s cooldown, Frost Channeling −5% a rank off Frostbolt’s cost (whole mana)', () => {
    expect(curve('Improved Fireball')).toEqual([-100, -200, -300, -400, -500])
    expect(curve('Improved Frostbolt')).toEqual([-100, -200, -300, -400, -500])
    expect(curve('Wake of Fire')).toEqual([-1000, -2000])
    expect(curve('Frost Channeling')).toEqual([-5, -10, -15])
    expect(effect(11069, 0).effectSpellClassMask![0]).toBe(1)
    expect(selects(11069, 0, FB)).toBe(true)
    expect(selects(11070, 0, FRB)).toBe(true)
    expect(effect(11078, 0)).toMatchObject({ effectAura: 107, effectMiscValue: [11, 0] })
    expect(selects(11078, 0, FBL)).toBe(true)
    expect(effect(11160, 0)).toMatchObject({ effectAura: 108, effectMiscValue: [14, 0] })
    expect(selects(11160, 0, FRB)).toBe(true)
    expect(byRank(5, (r) => withTalents(FIREBALL, ranks({ 'Improved Fireball': r })).castMs)).toEqual([3400, 3300, 3200, 3100, 3000])
    expect(byRank(5, (r) => withTalents(FROSTBOLT, ranks({ 'Improved Frostbolt': r })).castMs)).toEqual([2900, 2800, 2700, 2600, 2500])
    expect(byRank(2, (r) => withTalents(FIRE_BLAST, ranks({ 'Wake of Fire': r })).cooldownMs)).toEqual([7000, 6000])
    // 290 × 0.95 = 275.5 → 275, × 0.9 = 261, × 0.85 = 246.5 → 246.
    expect(byRank(3, (r) => mana(withTalents(FROSTBOLT, ranks({ 'Frost Channeling': r }))))).toEqual([275, 261, 246])
    expect(mana(withTalents(FIREBALL, ranks({ 'Frost Channeling': 3 })))).toBe(410)
  })

  it('the Forever rank tooltips say the same', () => {
    const tooltip = (name: string) => {
      const t = TALENT_DATA.mage.trees.flatMap((x) => x.talents).find((x) => x.name === name)
      expect(t, name).toBeDefined()
      const f = (t!.ranks as unknown as { forever: string[] }).forever
      return f[f.length - 1]
    }
    for (const [name, text] of [
      ['Ignite', '40%'],
      ['Improved Scorch', '100%'],
      ['Critical Mass', '6%'],
      ['Fire Power', '10%'],
      ['Master of Elements', '30%'],
      ['Ice Shards', '100%'],
      ['Piercing Ice', '6%'],
      ['Arcane Instability', '3%'],
      ['Incineration', '6%'],
      ['Elemental Precision', '5%'],
      ['Arcane Meditation', '50%'],
    ] as const)
      expect(tooltip(name), name).toContain(text)
  })
})

describe('the mage’s mana against the client (mage.md#mana, #base-stats)', () => {
  it('base mana 1,213 (PlayerExpectedStat, basemp.txt); 0.000514 crit per Agility and 0.000168 spell crit per Intellect', () => {
    const g = gametablesJson as unknown as {
      baseMana: { level60: Record<string, number> }
      playerExpectedStat: { level60: Record<string, { baseMana: number; critPerAgility: number; spellCritPerIntellect: number }> }
    }
    const row = g.playerExpectedStat.level60.mage
    expect([row.baseMana, g.baseMana.level60.mage, CLASS_BASE.mage.baseMana]).toEqual([MAGE_BASE_MANA, MAGE_BASE_MANA, MAGE_BASE_MANA])
    expect(CLASS_BASE.mage.critPerAgi).toBeCloseTo(100 * row.critPerAgility, 12)
    expect(CLASS_BASE.mage.spellCritPerInt).toBeCloseTo(100 * row.spellCritPerIntellect, 12)
  })

  it('Mage Armor r3 (22783): 50% of regeneration while casting (aura 134); Classic Era’s 30% is the Classic Era profile’s', () => {
    expect(effect(22783, 1)).toMatchObject({ effectAura: 134, effectBasePointsF: 100 * MAGE_ARMOR_SHARE.forever })
    expect(MAGE_ARMOR_SHARE.classicEra).toBe(0.3)
  })

  it('mana gems: Ruby 1,100 × (1 ± 0.1818 / 2) = 1,000–1,200 and Citrine 850 × (1 ± 0.1765 / 2) = 775–925, once each, off the GCD; category 1153’s 2 min, the Demonic Rune’s (12662, 20520)', () => {
    const [rubyLo, rubyHi] = spread(1100, 0.1818)
    const [citLo, citHi] = spread(850, 0.1765)
    expect([Math.round(rubyLo), Math.round(rubyHi), Math.round(citLo), Math.round(citHi)]).toEqual([1000, 1200, 775, 925])
    expect([MANA_RUBY.manaTenths, MANA_RUBY.manaTenths! + MANA_RUBY.manaSpreadTenths!]).toEqual([10000, 12000])
    expect([MANA_CITRINE.manaTenths, MANA_CITRINE.manaTenths! + MANA_CITRINE.manaSpreadTenths!]).toEqual([7750, 9250])
    const consumables = (itemsJson as unknown as { consumables: Record<string, { effects: { spellCategoryId: number; categoryCoolDownMSec: number }[] }> }).consumables
    for (const rune of ['12662', '20520']) expect(consumables[rune].effects[0]).toMatchObject({ spellCategoryId: 1153, categoryCoolDownMSec: MANA_RUBY.cooldownMs })
    for (const gem of [MANA_RUBY, MANA_CITRINE]) expect(gem).toMatchObject({ category: GEM_CATEGORY, usesPerFight: 1, gcdMs: 0, cooldownMs: 120000, costTenths: 0, kind: 'cast' })
  })
})
