// The hunter's shots, cooldowns, pet and talents against the Forever client data (docs/classes/hunter.md;
// docs/data/client.md): every number abilities.ts, talents.ts and pet.ts write out, read back from
// src/data/client/{spells,talents,gametables}.json.
import { describe, expect, it } from 'vitest'
import gametablesJson from '@/data/client/gametables.json'
import spellsJson from '@/data/client/spells.json'
import talentsJson from '@/data/client/talents.json'
import type { ClientSpell, ClientSpells } from '@/data/client/types'
import { GCD_MS } from '../../core/formulas'
import type { AbilityDef } from '../../plan/types'
import { CLASS_BASE } from '../../stats/base-stats'
import {
  AIMED_SHOT,
  ARCANE_SHOT,
  ASPECT_OF_THE_HAWK_RAP,
  BESTIAL_WRATH,
  baseManaCost,
  HUNTER_BASE_MANA,
  HUNTER_RACIALS,
  HUNTERS_MARK,
  HUNTERS_MARK_RAP,
  MULTI_SHOT,
  QUICK_SHOTS_AURA,
  RAPID_FIRE,
  SERPENT_STING,
  SNIPER_SHOT,
} from './abilities'
import { BITE, CLAW } from './pet'
import { BESTIAL_DISCIPLINE_SHARE } from './setup'
import { BARRAGE, DEADLY_ASPECTS_CHANCE, IMPROVED_STINGS, LONE_WOLF_PCT, TRUESHOT_AURA_RAP } from './talents'

const spells = (spellsJson as unknown as ClientSpells).spells
const spell = (id: number): ClientSpell => {
  const s = spells[String(id)]
  expect(s, `client spell ${id}`).toBeDefined()
  return s
}
const effect = (id: number, index: number) => spell(id).effects.find((e) => e.effectIndex === index)!
const mana = (def: AbilityDef) => def.costTenths / 10
/** SpellMisc Attributes[8] 0x200: the periodic-crit flag (docs/mechanics/spells.md §7). */
const periodicCrit = (id: number) => ((spell(id).misc!.attributes![8] ?? 0) & 0x200) !== 0
/** Whether an effect's class mask (all four words) selects a spell's (SpellClassOptions). */
const selects = (id: number, index: number, target: number) => {
  const mask = effect(id, index).effectSpellClassMask!
  const own = spell(target).classOptions!.spellClassMask!
  return mask.some((w, i) => ((w >>> 0) & (own[i] >>> 0)) !== 0)
}
type ClientTalent = { name: string; spellId: number; rankEffects: { effectIndex: number; values: number[] }[] }
const talent = (name: string): ClientTalent => {
  const t = (talentsJson as unknown as { classes: { hunter: { talents: ClientTalent[] } } }).classes.hunter.talents.find((x) => x.name === name)
  expect(t, name).toBeDefined()
  return t!
}
/** The Forever client's rank curve of a hunter talent's effect (TraitDefinitionEffectPoints). */
const curve = (name: string, effectIndex = 0) => talent(name).rankEffects.find((r) => r.effectIndex === effectIndex)!.values

const AIMED = 20904
const MULTI = 2643
const ARCANE = 14287
const STING = 13555
const SNIPER = 1310786
const MARK = 14325
const RAPID = 3045
const WRATH = 19574
const HAWK = 14321
const AUTO = 75
/** Ranged defense type (SpellCategories.DefenseType 3). */
const RANGED = 3

describe('the hunter’s rows against the Forever client (docs/classes/hunter.md §3)', () => {
  it('base mana and the class rates: 1,720 mana, 0.0189% crit per Agility, 0.0165% spell crit per Intellect', () => {
    const row = (gametablesJson as unknown as { playerExpectedStat: { level60: Record<string, { baseMana: number; critPerAgility: number; spellCritPerIntellect: number }> } }).playerExpectedStat.level60.hunter
    expect(row.baseMana).toBe(HUNTER_BASE_MANA)
    expect(CLASS_BASE.hunter.baseMana).toBe(HUNTER_BASE_MANA)
    expect(CLASS_BASE.hunter.critPerAgi).toBeCloseTo(100 * row.critPerAgility, 9)
    expect(CLASS_BASE.hunter.spellCritPerInt).toBeCloseTo(100 * row.spellCritPerIntellect, 9)
  })

  it('Aimed Shot: normalized weapon damage + 166, a 2.0 s cast, 310 mana, category 2’s 6 s, a ranged shot', () => {
    const s = spell(AIMED)
    expect(effect(AIMED, 0).effect).toBe(121)
    expect(effect(AIMED, 0).effectBasePointsF).toBe(AIMED_SHOT.spellDef!.min)
    expect([AIMED_SHOT.spellDef!.min, AIMED_SHOT.spellDef!.max, AIMED_SHOT.spellDef!.normalized, AIMED_SHOT.spellDef!.weaponPercent]).toEqual([166, 166, true, 1])
    expect(s.castTime!.base).toBe(AIMED_SHOT.castMs)
    expect(s.power![0].manaCost).toBe(mana(AIMED_SHOT))
    expect(s.cooldowns!.categoryRecoveryTime).toBe(AIMED_SHOT.cooldownMs)
    expect(s.cooldowns!.startRecoveryTime).toBe(AIMED_SHOT.gcdMs)
    expect(s.categories!.category).toBe(spell(MULTI).categories!.category)
    expect(AIMED_SHOT.category).toBe(MULTI_SHOT.category)
    expect(s.categories!.defenseType).toBe(RANGED)
    expect(s.misc!.schoolMask).toBe(1)
  })

  it('Multi-Shot: normalized weapon damage, no bonus, a 0.5 s cast, 13.9% of base mana (239), the shared 6 s', () => {
    const s = spell(MULTI)
    expect(effect(MULTI, 0).effect).toBe(121)
    expect(effect(MULTI, 0).effectBasePointsF ?? 0).toBe(0)
    expect(s.castTime!.base).toBe(MULTI_SHOT.castMs)
    expect(s.power![0].powerCostPct).toBe(13.9)
    expect(mana(MULTI_SHOT)).toBe(baseManaCost(13.9))
    expect(mana(MULTI_SHOT)).toBe(239)
    expect(s.cooldowns!.categoryRecoveryTime).toBe(MULTI_SHOT.cooldownMs)
    expect(s.categories!.defenseType).toBe(RANGED)
  })

  it('Arcane Shot: 217 Arcane with no coefficient, instant, 190 mana, 6 s', () => {
    const s = spell(ARCANE)
    expect(effect(ARCANE, 0).effect).toBe(2)
    expect(effect(ARCANE, 0).effectBasePointsF).toBe(ARCANE_SHOT.spellDef!.min)
    expect(effect(ARCANE, 0).effectBonusCoefficient ?? 0).toBe(ARCANE_SHOT.spellDef!.spCoefficient)
    expect(s.misc!.schoolMask).toBe(64)
    expect(ARCANE_SHOT.spellDef!.school).toBe('arcane')
    expect(s.power![0].manaCost).toBe(mana(ARCANE_SHOT))
    expect(s.cooldowns!.categoryRecoveryTime).toBe(ARCANE_SHOT.cooldownMs)
    expect(ARCANE_SHOT.castMs).toBe(0)
    expect(s.categories!.defenseType).toBe(RANGED)
  })

  it('Serpent Sting r8 (the trainer’s, D36): 5 ticks of 83 Nature every 3 s, no coefficient, the periodic-crit flag, 230 mana, on the ranged table', () => {
    const s = spell(STING)
    const def = SERPENT_STING.spellDef!
    expect(effect(STING, 0).effectAura).toBe(3)
    expect(effect(STING, 0).effectBasePointsF).toBe(def.dotTickDamage)
    expect(effect(STING, 0).effectAuraPeriod).toBe(def.dotTickMs)
    expect(s.duration!.duration! / def.dotTickMs!).toBe(def.dotTicks)
    expect(effect(STING, 0).effectBonusCoefficient ?? 0).toBe(def.dotSpCoefficient)
    expect(periodicCrit(STING)).toBe(def.dotCanCrit)
    expect(s.misc!.schoolMask).toBe(8)
    expect(s.power![0].manaCost).toBe(mana(SERPENT_STING))
    expect(s.categories!.defenseType).toBe(RANGED)
    expect(SERPENT_STING.aura!.durationMs).toBe(s.duration!.duration)
  })

  it('Sniper Shot r3: normalized weapon damage + 295, a 4.0 s cast, 15 s, 365 mana', () => {
    const s = spell(SNIPER)
    expect(effect(SNIPER, 0).effect).toBe(121)
    expect(effect(SNIPER, 0).effectBasePointsF).toBe(SNIPER_SHOT.spellDef!.min)
    expect(s.castTime!.base).toBe(SNIPER_SHOT.castMs)
    expect(s.cooldowns!.recoveryTime).toBe(SNIPER_SHOT.cooldownMs)
    expect(s.power![0].manaCost).toBe(mana(SNIPER_SHOT))
  })

  it('Hunter’s Mark +71 ranged attack power for 2 min, 60 mana; Rapid Fire +40% ranged speed for 15 s, 5 min, off the GCD', () => {
    expect(effect(MARK, 1).effectAura).toBe(127)
    expect(effect(MARK, 1).effectBasePointsF).toBe(HUNTERS_MARK_RAP)
    expect(HUNTERS_MARK.aura!.mods.rap).toBe(HUNTERS_MARK_RAP)
    expect(spell(MARK).duration!.duration).toBe(HUNTERS_MARK.aura!.durationMs)
    expect(spell(MARK).power![0].manaCost).toBe(mana(HUNTERS_MARK))
    expect(effect(RAPID, 0).effectAura).toBe(140)
    expect(effect(RAPID, 0).effectBasePointsF).toBe(RAPID_FIRE.aura!.mods.rangedHaste)
    expect(spell(RAPID).duration!.duration).toBe(RAPID_FIRE.aura!.durationMs)
    expect(spell(RAPID).cooldowns!.categoryRecoveryTime).toBe(RAPID_FIRE.cooldownMs)
    expect(spell(RAPID).cooldowns!.startRecoveryTime ?? 0).toBe(RAPID_FIRE.gcdMs)
    expect(spell(RAPID).power![0].manaCost).toBe(mana(RAPID_FIRE))
  })

  it('Bestial Wrath: +50% pet damage for 18 s, 2 min, 12% of base mana, off the GCD', () => {
    expect(effect(WRATH, 1).effectAura).toBe(79)
    expect(effect(WRATH, 1).effectBasePointsF).toBe(BESTIAL_WRATH.aura!.mods.petDamage)
    expect(spell(WRATH).duration!.duration).toBe(BESTIAL_WRATH.aura!.durationMs)
    expect(spell(WRATH).cooldowns!.recoveryTime).toBe(BESTIAL_WRATH.cooldownMs)
    expect(spell(WRATH).power![0].powerCostPct).toBe(12)
    expect(mana(BESTIAL_WRATH)).toBe(baseManaCost(12))
    expect(BESTIAL_WRATH.gcdMs).toBe(0)
  })

  it('Aspect of the Hawk r5 +90 ranged attack power (r6 is +55 in Forever, r7 an Ahn’Qiraj book) and its Quick Shots: +30% ranged speed for 12 s', () => {
    expect(effect(14322, 0).effectBasePointsF).toBe(55)
    expect(effect(HAWK, 0).effectAura).toBe(124)
    expect(effect(HAWK, 0).effectBasePointsF).toBe(ASPECT_OF_THE_HAWK_RAP)
    expect(effect(HAWK, 1).effectTriggerSpell).toBe(6150)
    expect(effect(6150, 0).effectAura).toBe(140)
    expect(effect(6150, 0).effectBasePointsF).toBe(QUICK_SHOTS_AURA.mods.rangedHaste)
    expect(spell(6150).duration!.duration).toBe(QUICK_SHOTS_AURA.durationMs)
  })

  it('every shot is on the 1.5 s GCD and needs a ranged weapon; Auto Shot fires bows, guns and crossbows', () => {
    for (const [id, def] of [
      [AIMED, AIMED_SHOT],
      [MULTI, MULTI_SHOT],
      [ARCANE, ARCANE_SHOT],
      [STING, SERPENT_STING],
      [SNIPER, SNIPER_SHOT],
    ] as const) {
      expect(spell(id).cooldowns!.startRecoveryTime, def.id).toBe(GCD_MS)
      expect(def.gcdMs, def.id).toBe(GCD_MS)
      expect(def.needsRanged, def.id).toBe(true)
      expect(spell(id).equippedItems!.equippedItemSubclass, def.id).toBe(spell(AUTO).equippedItems!.equippedItemSubclass)
    }
  })

  it('the racials: Blood Fury +10% attack power and ranged attack power, Berserking +10% ranged speed', () => {
    expect(effect(20572, 1).effectAura).toBe(167)
    expect(HUNTER_RACIALS['horde-orc']!.aura!.mods.rapPct).toBe(effect(20572, 1).effectBasePointsF)
    expect(effect(20554, 1).effectAura).toBe(140)
    expect(HUNTER_RACIALS['horde-troll']!.aura!.mods.rangedHaste).toBe(effect(20554, 1).effectBasePointsF)
  })

  it('the cat’s Claw and Bite: 51 ± 31.4% for 25 Focus, 90 ± 20% for 35 Focus on a 10 s cooldown', () => {
    const claw = effect(3009, 0)
    expect(CLAW.min).toBeCloseTo(claw.effectBasePointsF! * (1 - claw.variance! / 2), 9)
    expect(CLAW.max).toBeCloseTo(claw.effectBasePointsF! * (1 + claw.variance! / 2), 9)
    expect(spell(3009).power![0].manaCost).toBe(CLAW.costTenths / 10)
    expect(spell(3009).power![0].powerType).toBe(2)
    const bite = effect(17261, 0)
    expect(BITE.min).toBeCloseTo(bite.effectBasePointsF! * (1 - bite.variance! / 2), 9)
    expect(spell(17261).power![0].manaCost).toBe(BITE.costTenths / 10)
    expect(spell(17261).cooldowns!.categoryRecoveryTime).toBe(BITE.cooldownMs)
    expect([CLAW.gcdMs, BITE.gcdMs]).toEqual([spell(3009).cooldowns!.startRecoveryTime, spell(17261).cooldowns!.startRecoveryTime])
  })
})

describe('the hunter’s talents against the Forever client (docs/classes/hunter.md §4)', () => {
  it('reads the rank curves the code uses', () => {
    expect(curve('Deadly Aspects')).toEqual(DEADLY_ASPECTS_CHANCE.slice(1))
    expect(curve('Improved Stings')).toEqual(IMPROVED_STINGS.slice(1))
    expect(curve('Barrage')).toEqual(BARRAGE.slice(1))
    expect(curve('Bestial Discipline', 1)).toEqual(BESTIAL_DISCIPLINE_SHARE.slice(1).map((x) => 100 * x))
    expect(curve('Efficiency')).toEqual([-3, -6, -9, -12, -15])
    expect(curve('Improved Arcane Shot')).toEqual([-300, -600, -900, -1200, -1500])
    expect(curve('Rapid Killing')).toEqual([-60000, -120000])
    expect(curve('Mortal Shots')).toEqual([6, 12, 18, 24, 30])
    expect(curve('Lethal Attacks')).toEqual([1, 2, 3, 4, 5])
    expect(curve('Ranged Weapon Specialization')).toEqual([1, 2, 3, 4, 5])
    expect(curve('Unleashed Fury')).toEqual([3, 6, 9, 12, 15])
    expect(curve('Ferocity')).toEqual([2, 4, 6, 8, 10])
    expect(curve('Frenzy')).toEqual([20, 40, 60, 80, 100])
    expect(curve('Focused Fire')).toEqual([1, 2])
    expect(curve('Careful Aim')).toEqual([20, 40, 60, 80, 100])
    expect(curve('Lightning Reflexes')).toEqual([2, 4, 6, 8, 10])
    expect(curve('Surefooted', 2)).toEqual([1, 2, 3])
    expect(curve('Improved Tracking')).toEqual([1, 2, 3, 4, 5])
  })

  it('Lone Wolf is +20% damage (aura 79); Trueshot Aura’s level-60 rank +50; Lethal Attacks is all crit (aura 290)', () => {
    expect(effect(talent('Lone Wolf').spellId, 0).effectAura).toBe(79)
    expect(effect(talent('Lone Wolf').spellId, 0).effectBasePointsF).toBe(LONE_WOLF_PCT)
    expect(effect(20906, 0).effectAura).toBe(124)
    expect(effect(20906, 0).effectBasePointsF).toBe(TRUESHOT_AURA_RAP)
    expect(effect(talent('Lethal Attacks').spellId, 0).effectAura).toBe(290)
  })

  it('Efficiency’s class mask names Aimed Shot, Multi-Shot, Arcane Shot and Serpent Sting, not Sniper Shot, Hunter’s Mark or Rapid Fire', () => {
    const eff = talent('Efficiency').spellId
    for (const id of [AIMED, MULTI, ARCANE, STING]) expect(selects(eff, 0, id), `${id}`).toBe(true)
    for (const id of [SNIPER, MARK, RAPID]) expect(selects(eff, 0, id), `${id}`).toBe(false)
  })

  it('Mortal Shots’ class mask names Auto Shot, Aimed Shot, Multi-Shot, Arcane Shot and Serpent Sting, not Sniper Shot', () => {
    const ms = talent('Mortal Shots').spellId
    for (const id of [AUTO, AIMED, MULTI, ARCANE, STING]) expect(selects(ms, 0, id), `${id}`).toBe(true)
    expect(selects(ms, 0, SNIPER)).toBe(false)
  })

  it('Barrage’s names Aimed Shot and Multi-Shot; Improved Stings’ Serpent Sting; Deadly Aspects’ Aspect of the Hawk', () => {
    const barrage = talent('Barrage').spellId
    for (const id of [AIMED, MULTI]) expect(selects(barrage, 0, id), `${id}`).toBe(true)
    expect(selects(talent('Improved Stings').spellId, 0, STING)).toBe(true)
    expect(selects(talent('Improved Arcane Shot').spellId, 0, ARCANE)).toBe(true)
    expect(selects(talent('Rapid Killing').spellId, 0, RAPID)).toBe(true)
    expect(selects(talent('Deadly Aspects').spellId, 0, HAWK)).toBe(true)
  })
})
