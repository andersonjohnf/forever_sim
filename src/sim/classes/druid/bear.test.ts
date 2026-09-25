// The Feral bear against docs/classes/druid.md §4, §6.3 and §9: its ability rows against the
// Forever client (src/data/client), Clearcasting's class mask, the default build's talents on each
// row, the arithmetic of worked examples W14–W16, W18 and W19, the Rotation settings, and the
// priority list they give. The engine's side is src/sim/engine/bear.test.ts.
import { describe, expect, it } from 'vitest'
import spellsJson from '@/data/client/spells.json'
import type { ClientSpells } from '@/data/client/types'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { buildPlan } from '../../plan/build'
import { unusedRotationSettings } from '../../index'
import { COND, SCHOOL } from '../../plan/types'
import { CLASSIC_ERA, FOREVER } from '../../rules/profiles'
import type { RotationOption, SimConfig } from '../../types'
import { talentRanksByName } from '../index'
import { resolveRotationValues } from '../options'
import { maintainedBuffs, rotationOptions } from '../rotation'
import { NO_CONTEXT } from '../warrior/shared'
import {
  BEAR_IDS,
  BEAR_OPTIONS,
  BEAR_PRIORITY,
  bearMaintainedBuffs,
  bearRotation,
  DEMO_ROAR_REFRESH_SEC,
  FAERIE_FIRE_REFRESH_SEC,
  LACERATE_REFRESH_SEC,
  PREPULL_ENRAGE_MS,
} from './bear'
import {
  BEAR_GCD_MS,
  DEMORALIZING_ROAR_THREAT,
  demoralizingRoar,
  ENRAGE_ITEM_ARMOR_PCT,
  enrage,
  FAERIE_FIRE_BEAR,
  FAERIE_FIRE_THREAT,
  highThreatBonus,
  LACERATE,
  LACERATE_MAX_STACKS,
  LACERATE_RANK_LEVELS,
  LACERATE_THREAT,
  LACERATE_WEAPON_PCT_PER_STACK,
  lacerate as lacerateFor,
  PRIMAL_BITE,
  MAUL,
  MAUL_THREAT_MULT,
  SWIPE,
  SWIPE_THREAT_MULT,
} from './bear-abilities'
import { IDOL_OF_BRUTALITY, IDOL_OF_BRUTALITY_ABILITIES, IDOL_OF_BRUTALITY_RAGE_TENTHS } from './abilities'
import { BERSERK, FAERIE_FIRE_ARMOR } from './cat-abilities'
import { formBit } from './forms'
import { REND_AND_TEAR, withDruidTalents } from './modifiers'

const spells = (spellsJson as unknown as ClientSpells).spells
const spell = (id: number) => spells[String(id)]
const effect = (id: number, index: number) => spell(id).effects.find((e) => e.effectIndex === index)!
/**
 * The worked examples' bear build (druid.md §7.1, §9: W16's Feral Instinct 3/3, no Shredding
 * Attacks): 8/43/0, the former default. The default bear's own is the 9/42/0 of §7.1.
 */
const BEAR_CODE = '050012-5523032120132210551-'
const TALENTS = talentRanksByName(TALENT_DATA.druid, BEAR_CODE)
/** Defensive, "Tank duties first" before D28: the rotation that keeps both duties, the roar and Faerie Fire. */
const DEFENSIVE = { [BEAR_IDS.priority]: BEAR_PRIORITY.duties }
/** The default bear with Defensive picked. */
const defensiveConfig = (): SimConfig => ({ ...defaultConfig('druid-feral-bear'), rotation: DEFENSIVE })

/** A spell's class mask, and whether any of its bits is in a spell effect's affected mask. */
const mask = (id: number) => spell(id).classOptions!.spellClassMask as number[]
const covers = (affected: number[], id: number) => mask(id).some((word, i) => (word & affected[i]) !== 0)

describe('the bear’s abilities against the client (druid.md §4)', () => {
  it('Maul r7 (9881): 15 rage, +128 weapon damage, no GCD, Bear and Dire Bear only', () => {
    const s = spell(9881)
    expect(s.power![0]).toMatchObject({ manaCost: MAUL.costTenths, powerType: 1 })
    expect(effect(9881, 0)).toMatchObject({ effect: 58, effectBasePointsF: MAUL.flatDamage })
    expect(s.cooldowns?.startRecoveryTime).toBeUndefined()
    expect(s.shapeshift?.shapeshiftMask?.[0]).toBe(144)
    expect(MAUL).toMatchObject({ kind: 'onNextSwing', gcdMs: 0, weaponPercent: 1, forms: formBit('bear'), threatMult: 1.75 })
  })

  it('Swipe r5 (9908): 20 rage, 83 to up to 3 targets with no attack power, GCD 1500', () => {
    const s = spell(9908)
    expect(s.power![0]).toMatchObject({ manaCost: SWIPE.costTenths, powerType: 1 })
    expect(effect(9908, 0)).toMatchObject({ effect: 2, effectBasePointsF: SWIPE.flatDamage, effectChainTargets: 3 })
    expect(s.cooldowns?.startRecoveryTime).toBe(SWIPE.gcdMs)
    expect(SWIPE).toMatchObject({ kind: 'meleeSpell', weaponPercent: 0, apCoefficient: 0, refundShare: 0, threatMult: 1.75 })
  })

  it('Primal Bite (1238073, level 60): 20 rage, 100% weapon damage + 77, a 6 s cooldown, GCD 1500', () => {
    const s = spell(1238073)
    expect(s.power![0]).toMatchObject({ manaCost: PRIMAL_BITE.costTenths, powerType: 1 })
    expect(effect(1238073, 0)).toMatchObject({ effect: 58, effectBasePointsF: PRIMAL_BITE.flatDamage })
    expect(effect(1238073, 1)).toMatchObject({ effect: 31, effectBasePointsF: 100 * PRIMAL_BITE.weaponPercent })
    expect(s.cooldowns).toMatchObject({ categoryRecoveryTime: PRIMAL_BITE.cooldownMs, startRecoveryTime: PRIMAL_BITE.gcdMs })
    expect(s.shapeshift?.shapeshiftMask?.[0]).toBe(144)
    expect(PRIMAL_BITE).toMatchObject({ kind: 'weaponStrike', threatMult: 1, noCooldownWhile: 'berserk' })
  })

  it('Primal Bite keeps all four ranks under its new name (Mangle until 1.60.1.70009): +26/38/59/77 at levels 25/36/48/60, the same cost, cooldown and class mask', () => {
    const ranks = [407995, 1238069, 1238070, 1238073]
    expect(ranks.map((id) => spell(id)?.name)).toEqual(ranks.map(() => PRIMAL_BITE.name))
    expect(ranks.map((id) => effect(id, 0).effectBasePointsF)).toEqual([26, 38, 59, 77])
    expect(ranks.map((id) => effect(id, 1).effectBasePointsF)).toEqual([100, 100, 100, 100])
    expect(ranks.map((id) => spell(id).levels?.spellLevel)).toEqual([25, 36, 48, 60])
    for (const id of ranks) {
      expect(spell(id).power![0], String(id)).toMatchObject({ manaCost: 200, powerType: 1 })
      expect(spell(id).cooldowns?.categoryRecoveryTime, String(id)).toBe(6000)
      expect(mask(id), String(id)).toEqual(mask(1238073))
      // 132278 is ability_racial_cannibalize, the icon 1.60.1.70009 gave it (Blood Frenzy's before).
      expect(spell(id).misc?.spellIconFileDataId, String(id)).toBe(132278)
    }
    expect(PRIMAL_BITE.icon).toBe('ability_racial_cannibalize')
    // Its tooltip names no threat, so no wording-table bonus (threat.md#threat-wording-table).
    expect(PRIMAL_BITE.threatBonus ?? 0).toBe(0)
  })

  it('Lacerate r3 (1235827): 15 rage, 15 per 3 s for 15 s a stack, 5 stacks, 10% weapon damage a stack, ticks that may crit', () => {
    const s = spell(1235827)
    expect(s.power![0]).toMatchObject({ manaCost: LACERATE.costTenths, powerType: 1 })
    expect(effect(1235827, 0)).toMatchObject({ effect: 6, effectAura: 3, effectAuraPeriod: LACERATE.dotTickMs, effectBasePointsF: LACERATE.dotTickDamage })
    expect(effect(1235827, 1)).toMatchObject({ effect: 3, effectBasePointsF: 100 * LACERATE_WEAPON_PCT_PER_STACK })
    expect(s.duration?.duration).toBe(LACERATE.dotTicks * LACERATE.dotTickMs)
    expect(s.duration?.duration).toBe(LACERATE.aura!.durationMs)
    expect(s.auraOptions?.cumulativeAura).toBe(LACERATE_MAX_STACKS)
    expect(LACERATE.aura!.maxStacks).toBe(LACERATE_MAX_STACKS)
    expect(s.categories?.mechanic).toBe(15) // a bleed
    // SpellMisc Attributes[8] 0x200: periodic effects can crit (druid.md §2.9).
    expect((s.misc?.attributes ?? [])[8] & 0x200).toBe(0x200)
    expect(LACERATE).toMatchObject({ periodicCanCrit: true, weaponPercent: 0, weaponPercentPerStack: 0.1, gcdMs: 1500 })
  })

  it('Lacerate’s “high amount of threat” (D29): Sunder Armor r5’s at the same level, 206 + 0.05 × AP in Forever and 261 in Classic Era, with no threat effect in the client', () => {
    const ranks = [414644, 1235826, 1235827]
    expect(ranks.map((id) => spell(id).levels?.spellLevel)).toEqual([...LACERATE_RANK_LEVELS])
    // No rank carries a THREAT effect (63): the bonus is the wording's, [?].
    for (const id of ranks) expect(spell(id).effects.some((e) => e.effect === 63), String(id)).toBe(false)
    // threat.md#threat-wording-table: rank 3 is level 58, as Sunder Armor r5 is, and Forever's client
    // gives that Sunder a THREAT effect of 206 (1.60.1.70009), plus the attack power share Blizzard's
    // notes add and the client doesn't carry, 0.05 × AP [?] (the warrior's default, warrior.md Q1).
    const sunder = effect(11597, 1)
    expect(spell(11597).levels?.spellLevel).toBe(LACERATE_RANK_LEVELS[2])
    expect(sunder).toMatchObject({ effect: 63, effectBasePointsF: LACERATE_THREAT.forever.bonus })
    expect(LACERATE_THREAT.forever).toEqual({ bonus: 206, apCoefficient: 0.05 })
    expect(LACERATE).toMatchObject({ threatBonus: 206, threatApCoefficient: 0.05 })
    expect(lacerateFor(FOREVER)).toBe(LACERATE)
    // At the default bear's 1,296 attack power in Dire Bear Form, that's 270.8.
    expect(206 + 0.05 * 1296).toBeCloseTo(270.8, 9)
    // Classic Era: the warrior's GCD specials with those words fit 4.5 × the spell's level (Sunder
    // Armor r5 at 58: 261; Revenge r5 at 54: 243, r6 at 60: 270), with no attack power term.
    expect([highThreatBonus(58), highThreatBonus(54), highThreatBonus(60)]).toEqual([261, 243, 270])
    expect(LACERATE_THREAT.classicEra).toEqual({ bonus: 261, apCoefficient: 0 })
    expect(lacerateFor(CLASSIC_ERA)).toMatchObject({ threatBonus: 261, threatApCoefficient: 0 })
  })

  it('Demoralizing Roar r5 (9898): 10 rage, GCD 1500, 30 s; W18: −193 − 1.4 × 8 = −204.2 at 60 (Classic −138)', () => {
    const s = spell(9898)
    expect(s.power![0]).toMatchObject({ manaCost: demoralizingRoar(FOREVER).costTenths, powerType: 1 })
    expect(s.cooldowns?.startRecoveryTime).toBe(BEAR_GCD_MS)
    expect(s.duration?.duration).toBe(30000)
    const e = effect(9898, 0)
    expect(e).toMatchObject({ effectAura: 99, effectBasePointsF: -193, effectRealPointsPerLevel: -1.4 })
    expect(s.levels).toMatchObject({ spellLevel: 52, maxLevel: 62 })
    const atSixty = e.effectBasePointsF! + e.effectRealPointsPerLevel! * (60 - 52)
    expect(atSixty).toBeCloseTo(-204.2, 9)
    // The client shows −204; the sim uses the tooltip's whole number (Q32).
    expect(demoralizingRoar(FOREVER).aura!.mods.bossAp).toBe(-204)
    expect(demoralizingRoar(CLASSIC_ERA).aura!.mods.bossAp).toBe(-138)
    // `DefenseType` Magic: it rolls spell hit.
    expect(s.categories?.defenseType).toBe(1)
    expect(demoralizingRoar(FOREVER)).toMatchObject({ kind: 'spellTable', threatBonus: DEMORALIZING_ROAR_THREAT, refundShare: 0.8 })
    // Physical (`SchoolMask` 1): no resistance.
    expect(s.misc?.schoolMask).toBe(1)
    expect(demoralizingRoar(FOREVER).spellSchool).toBeUndefined()
  })

  it('Faerie Fire r4 (9907) in bear: −505 armor for 40 s, GCD 1500, a spell; free with a 6 s cooldown from Dire Bear Form (Passive)', () => {
    const s = spell(9907)
    expect(effect(9907, 0)).toMatchObject({ effectAura: 22, effectBasePointsF: -FAERIE_FIRE_ARMOR })
    expect(s.duration?.duration).toBe(FAERIE_FIRE_BEAR.aura!.durationMs)
    expect(s.cooldowns?.startRecoveryTime).toBe(FAERIE_FIRE_BEAR.gcdMs)
    expect(s.categories?.defenseType).toBe(1)
    // Its shapeshift mask allows Bear and Dire Bear (144); 9635's −100% cost and +6000 ms cooldown
    // aren't in the committed dataset, only in the raw client (druid.md §4.5).
    expect((s.shapeshift?.shapeshiftMask ?? [0])[0] & 144).toBe(144)
    expect(FAERIE_FIRE_BEAR).toMatchObject({ kind: 'spellTable', costTenths: 0, cooldownMs: 6000, threatBonus: FAERIE_FIRE_THREAT })
    // A Nature spell (`SchoolMask` 8), so the boss's resistance applies to it (combat-tables §9).
    expect(s.misc?.schoolMask).toBe(8)
    expect(FAERIE_FIRE_BEAR.spellSchool).toBe(SCHOOL.nature)
  })

  it('Berserk (417141): 15 s, 3 min, no GCD; its Primal Bite part is a −100% cooldown modifier on Primal Bite’s class mask', () => {
    const s = spell(417141)
    expect(s.cooldowns?.recoveryTime).toBe(BERSERK.cooldownMs)
    expect(s.duration?.duration).toBe(BERSERK.aura!.durationMs)
    expect(s.cooldowns?.startRecoveryTime).toBeUndefined()
    const cooldown = effect(417141, 1)
    expect(cooldown).toMatchObject({ effectAura: 108, effectBasePointsF: -100, effectMiscValue: [11, 0] })
    expect(covers(cooldown.effectSpellClassMask!, 1238073)).toBe(true)
    // Its crit part covers the cat's builders, not Maul, Swipe, Primal Bite or Lacerate (druid.md §4.6).
    const crit = effect(417141, 0).effectSpellClassMask!
    for (const id of [9881, 9908, 1238073, 1235827]) expect(covers(crit, id), String(id)).toBe(false)
    // The cat's row, usable in both forms (cat-abilities.ts).
    expect(BERSERK).toMatchObject({ gcdMs: 0, costTenths: 0, forms: formBit('cat', 'bear') })
  })

  it('Enrage (5229): 10 rage at once and 2 a second for 10 s, 1 min cooldown, no GCD; Wolfshead Helm +5', () => {
    const s = spell(5229)
    expect(effect(5229, 1)).toMatchObject({ effect: 30, effectBasePointsF: enrage(false).rageTenths })
    expect(effect(5229, 0)).toMatchObject({ effectAura: 24, effectAuraPeriod: enrage(false).rageTickMs, effectBasePointsF: enrage(false).rageTickTenths })
    expect(s.duration?.duration).toBe(enrage(false).rageTicks * enrage(false).rageTickMs)
    expect(s.cooldowns?.recoveryTime).toBe(enrage(false).cooldownMs)
    expect(s.cooldowns?.startRecoveryTime).toBeUndefined()
    expect(enrage(true).rageTenths - enrage(false).rageTenths).toBe(50)
    expect(enrage(false).aura!.mods.itemArmorPct).toBe(ENRAGE_ITEM_ARMOR_PCT)
  })

  it('Idol of Brutality (23198, 28855): −2 rage on its class mask, which covers Maul, Swipe and Primal Bite and nothing else of the bear’s', () => {
    const idol = effect(28855, 0)
    expect(idol).toMatchObject({ effect: 6, effectAura: 107, effectBasePointsF: -IDOL_OF_BRUTALITY_RAGE_TENTHS, effectMiscValue: [14, 0] })
    const affected = idol.effectSpellClassMask!
    const rows = [
      [9881, MAUL],
      [9908, SWIPE],
      [1238073, PRIMAL_BITE],
      [1235827, LACERATE],
      [9898, demoralizingRoar(FOREVER)],
      [9907, FAERIE_FIRE_BEAR],
      [5229, enrage(false)],
    ] as const
    for (const [id, def] of rows) expect(covers(affected, id), def.id).toBe(IDOL_OF_BRUTALITY_ABILITIES.has(def.id))
    expect([...IDOL_OF_BRUTALITY_ABILITIES].sort()).toEqual(['mangle', 'maul', 'swipe'])
  })

  it('Clearcasting (16870) pays for exactly the bear abilities its class mask covers: not Faerie Fire, which is free anyway', () => {
    const affected = effect(16870, 0).effectSpellClassMask!
    const rows = [
      [9881, MAUL],
      [9908, SWIPE],
      [1238073, PRIMAL_BITE],
      [1235827, LACERATE],
      [9898, demoralizingRoar(FOREVER)],
    ] as const
    for (const [id, def] of rows) expect(Boolean(def.clearcastable), def.id).toBe(covers(affected, id))
    expect(rows.every(([, def]) => def.clearcastable)).toBe(true)
    expect(covers(affected, 9907)).toBe(false)
    expect(FAERIE_FIRE_BEAR.clearcastable).toBeUndefined()
  })
})

describe('the default bear build on each row (druid.md §5.1, W14–W16, W19)', () => {
  const resolved = (def: Parameters<typeof withDruidTalents>[0]) => withDruidTalents(def, TALENTS)

  it('Ferocity 5/5: Maul 10, Primal Bite 15, Swipe 15 rage; Lacerate stays 15 without Shredding Attacks', () => {
    expect(TALENTS.get('Ferocity')).toBe(5)
    expect(TALENTS.has('Shredding Attacks')).toBe(false)
    expect([MAUL, PRIMAL_BITE, SWIPE, LACERATE].map((d) => resolved(d).costTenths)).toEqual([100, 150, 150, 150])
  })

  it('W21: with Idol of Brutality, the rotation’s Maul costs 15 − 5 − 2 = 8, Primal Bite and Swipe 13; Lacerate stays 15', () => {
    const cost = (equipped: number[]) => {
      const r = bearRotation({ [BEAR_IDS.swipeEnabled]: true }, TALENTS, () => -1, { ...NO_CONTEXT, profile: FOREVER, equipped: new Set(equipped) })
      return Object.fromEntries(['maul', 'mangle', 'swipe', 'lacerate'].map((id) => [id, r.abilities.find((a) => a.id === id)!.costTenths / 10]))
    }
    expect(cost([IDOL_OF_BRUTALITY])).toEqual({ maul: 8, mangle: 13, swipe: 13, lacerate: 15 })
    expect(cost([])).toEqual({ maul: 10, mangle: 15, swipe: 15, lacerate: 15 })
    // The default bear wears it, and its plan pays the idol's costs; its effect isn't listed as not simulated.
    const d = defaultConfig('druid-feral-bear')
    expect(d.gear.ranged?.itemId).toBe(IDOL_OF_BRUTALITY)
    const { plan, assumptions } = buildPlan(d)
    expect(plan.abilities.find((a) => a.id === 'maul')!.costTenths).toBe(80)
    expect(plan.abilities.find((a) => a.id === 'mangle')!.costTenths).toBe(130)
    expect(assumptions.find((a) => a.id === 'unmodelledProcs')?.text ?? '').not.toContain('Idol of Brutality')
    // Its Primal Bite part is the class mask's reading, listed while Primal Bite is used (Q37); without the idol, not.
    expect(assumptions.map((a) => a.id)).toContain('idolOfBrutality')
    const noIdol = buildPlan({ ...d, gear: { ...d.gear, ranged: undefined } }).assumptions.map((a) => a.id)
    expect(noIdol).not.toContain('idolOfBrutality')
    const noMangle = buildPlan({ ...d, rotation: { [BEAR_IDS.mangleEnabled]: false } }).assumptions.map((a) => a.id)
    expect(noMangle).not.toContain('idolOfBrutality')
  })

  it('W14: Maul at 1200 AP is (351.286 + 128) × 1.10 = 527.214, and its threat × 1.75 × 1.3 = 1199.41', () => {
    const maul = resolved(MAUL)
    const wb = (109.6 + 164.4) / 2 + (1200 * 2.5) / 14
    expect(wb).toBeCloseTo(351.286, 3)
    const damage = (wb + maul.flatDamage) * maul.weaponPercent
    expect(damage).toBeCloseTo(527.214, 3)
    expect(damage * MAUL_THREAT_MULT * 1.3).toBeCloseTo(1199.41, 2)
    expect(maul.critMultiplier).toBeCloseTo(2.2, 12)
  })

  it('W15: Primal Bite at 1200 AP is 351.286 + 77 = 428.286 (no Savage Fury); threat × 1.3 = 556.77', () => {
    const mangle = resolved(PRIMAL_BITE)
    const damage = ((109.6 + 164.4) / 2 + (1200 * 2.5) / 14 + mangle.flatDamage) * mangle.weaponPercent
    expect(damage).toBeCloseTo(428.286, 3)
    expect(damage * mangle.threatMult * 1.3).toBeCloseTo(556.77, 2)
    expect(mangle.critMultiplier).toBeCloseTo(2.2, 12)
  })

  it('W16: Swipe is 83 × 1.10 × 1.30 = 118.69 a target; threat × 1.75 × 1.3 = 270.02', () => {
    const swipe = resolved(SWIPE)
    expect(swipe.flatDamage).toBeCloseTo(118.69, 2)
    expect(swipe.flatDamage * SWIPE_THREAT_MULT * 1.3).toBeCloseTo(270.02, 2)
  })

  it('W19: Lacerate at 5 stacks ticks 15 × 5 = 75, 78.75 with Genesis 5/5; no Savage Fury on its hit', () => {
    expect(LACERATE.dotTickDamage * LACERATE_MAX_STACKS).toBe(75)
    const lacerate = resolved(LACERATE)
    expect(lacerate.dotTickDamage * LACERATE_MAX_STACKS).toBeCloseTo(78.75, 9)
    expect(lacerate.weaponPercentPerStack).toBe(0.1)
  })

  it('W20: Lacerate at 1200 AP onto 4 stacks, the boss bleeding, hits for 0.1 × 4 × 351.286 × 1.10 = 154.566; threat (154.566 + 206 + 0.05 × 1200) × 1.3 = 546.735', () => {
    const lacerate = resolved(LACERATE)
    const wb = (109.6 + 164.4) / 2 + (1200 * 2.5) / 14
    const hit = lacerate.weaponPercentPerStack! * 4 * wb * (1 + lacerate.bleedingTargetPct! / 100)
    expect(hit).toBeCloseTo(154.566, 3)
    const bonus = lacerate.threatBonus + lacerate.threatApCoefficient! * 1200
    expect(bonus).toBeCloseTo(266, 9)
    expect((hit * lacerate.threatMult + bonus) * 1.3).toBeCloseTo(546.735, 3)
    // The first application deals nothing and still lands its bonus: 266 × 1.3 = 345.8.
    expect(bonus * 1.3).toBeCloseTo(345.8, 9)
    // Classic Era's 261: (154.566 + 261) × 1.3 = 540.235, and 339.3 for a first application.
    const classic = withDruidTalents(lacerateFor(CLASSIC_ERA), TALENTS)
    expect((hit * classic.threatMult + classic.threatBonus) * 1.3).toBeCloseTo(540.235, 3)
    expect(classic.threatBonus * 1.3).toBeCloseTo(339.3, 9)
  })

  it('Rend and Tear 5/5: +10% on Maul, Swipe, Primal Bite and Lacerate against a bleeding target, as the druid’s talents resolve it', () => {
    const rotation = bearRotation({ [BEAR_IDS.swipeEnabled]: true }, TALENTS, () => -1, { profile: FOREVER })
    const pct = Object.fromEntries(rotation.abilities.map((a) => [a.id, a.bleedingTargetPct ?? 0]))
    for (const id of REND_AND_TEAR) if (id in pct) expect(pct[id], id).toBe(10)
    expect(pct.faerieFire ?? 0).toBe(0)
    expect(pct.demoralizingRoar ?? 0).toBe(0)
  })
})

describe('the bear’s Rotation settings (druid.md §6.3)', () => {
  const byId = new Map(BEAR_OPTIONS.map((o) => [o.id, o]))
  const option = (id: string) => byId.get(id)!
  const toggle = (id: string) => option(id) as Extract<RotationOption, { kind: 'toggle' }>

  it('are the spec’s rotation options, each id `druid.bear.<ability>.<param>` and unique, the priority choice first', () => {
    expect(rotationOptions('druid-feral-bear')).toBe(BEAR_OPTIONS)
    expect(new Set(BEAR_OPTIONS.map((o) => o.id)).size).toBe(BEAR_OPTIONS.length)
    // Balanced is the default (D28); a setup saved with "duties" (tank duties first) is Defensive.
    expect(BEAR_OPTIONS[0]).toMatchObject({ kind: 'choice', id: 'druid.bear.priority', default: BEAR_PRIORITY.balanced })
    expect(BEAR_PRIORITY).toEqual({ duties: 'duties', balanced: 'balanced', maxTps: 'maxTps' })
    for (const o of BEAR_OPTIONS.slice(1)) expect(o.id).toMatch(/^druid\.bear\.[a-zA-Z]+\.[a-zA-Z]+$/)
  })

  it('keep the tank’s duties with Defensive (D26, D28): Demoralizing Roar and Faerie Fire kept up; Enrage in combat isn’t one, and is on (tuned)', () => {
    expect(toggle(BEAR_IDS.roarEnabled).default).toBe(true)
    expect(toggle(BEAR_IDS.ffEnabled).default).toBe(true)
    expect(toggle(BEAR_IDS.enrageInCombat).default).toBe(true)
    expect(toggle(BEAR_IDS.roarEnabled).maintainsBuff).toBe('demoralizingRoar')
    expect(toggle(BEAR_IDS.ffEnabled).maintainsBuff).toBe('faerieFire')
  })

  it('time the duties by D26’s fixed rule: Faerie Fire from its 6 s cooldown, the roar from one 1.5 s global cooldown (PW4)', () => {
    expect(FAERIE_FIRE_REFRESH_SEC).toBe(FAERIE_FIRE_BEAR.cooldownMs / 1000)
    expect(FAERIE_FIRE_REFRESH_SEC).toBe(6)
    expect(DEMO_ROAR_REFRESH_SEC).toBe(BEAR_GCD_MS / 1000)
    expect(DEMO_ROAR_REFRESH_SEC).toBe(1.5)
    const refresh = (id: string) => option(id) as Extract<RotationOption, { kind: 'number' }>
    expect(refresh(BEAR_IDS.ffRefresh).default).toBe(6)
    expect(refresh(BEAR_IDS.roarRefresh).default).toBe(1.5)
    expect(refresh(BEAR_IDS.ffRefresh).help).toContain('The default, 6 s (its cooldown), follows the tank duties’ rule')
    expect(refresh(BEAR_IDS.roarRefresh).help).toContain('The default, 1.5 s (one global cooldown, as it has none), follows the tank duties’ rule')
  })

  it('keep the Buffs tab’s Faerie Fire and Demoralizing Roar out while the bear keeps its own', () => {
    expect(maintainedBuffs('druid-feral-bear', DEFENSIVE)).toEqual(['faerieFire', 'demoralizingRoar'])
    // Balanced, the default, keeps Faerie Fire only.
    expect(maintainedBuffs('druid-feral-bear', {})).toEqual(['faerieFire'])
    expect(bearMaintainedBuffs({ ...DEFENSIVE, [BEAR_IDS.roarEnabled]: false })).toEqual(['faerieFire'])
    // The filler keeps Faerie Fire up too.
    expect(bearMaintainedBuffs({ ...DEFENSIVE, [BEAR_IDS.ffEnabled]: false })).toEqual(['faerieFire', 'demoralizingRoar'])
    expect(bearMaintainedBuffs({ [BEAR_IDS.ffEnabled]: false, [BEAR_IDS.ffFiller]: false, [BEAR_IDS.roarEnabled]: false })).toEqual([])
  })

  it('rage thresholds are absolute rage, 0 to the 100 cap', () => {
    for (const o of BEAR_OPTIONS) if (o.kind === 'number' && o.unit === 'rage') expect([o.min, o.max], o.id).toEqual([0, 100])
  })
})

describe('Balanced and Max TPS (druid.md §6.3 "Balanced", "Max TPS"; D26, D28)', () => {
  const MAX = { [BEAR_IDS.priority]: BEAR_PRIORITY.maxTps }

  it('Balanced, the default, drops the roar and keeps Faerie Fire; its quick search moved nothing else (D27)', () => {
    const duties = resolveRotationValues(BEAR_OPTIONS, DEFENSIVE, TALENTS)
    const balanced = resolveRotationValues(BEAR_OPTIONS, {}, TALENTS)
    expect(balanced[BEAR_IDS.priority]).toBe(BEAR_PRIORITY.balanced)
    const moved = Object.keys(duties).filter((id) => duties[id] !== balanced[id])
    expect(moved.sort()).toEqual([BEAR_IDS.priority, BEAR_IDS.roarEnabled].sort())
    expect([balanced[BEAR_IDS.ffEnabled], balanced[BEAR_IDS.ffFiller], balanced[BEAR_IDS.roarEnabled]]).toEqual([true, true, false])
    // Max TPS, tuned on TPS alone, Mauls from less rage (T5): otherwise the same rows.
    const max = resolveRotationValues(BEAR_OPTIONS, MAX, TALENTS)
    expect(Object.keys(max).filter((id) => max[id] !== balanced[id])).toEqual([BEAR_IDS.priority, BEAR_IDS.maulMinRage])
    expect([balanced[BEAR_IDS.maulMinRage], max[BEAR_IDS.maulMinRage]]).toEqual([20, 14])
  })

  it('Max TPS drops the roar by default, keeps Faerie Fire and its filler, refreshes Lacerate as Defensive does, and Mauls from 14', () => {
    const duties = resolveRotationValues(BEAR_OPTIONS, DEFENSIVE, TALENTS)
    const max = resolveRotationValues(BEAR_OPTIONS, MAX, TALENTS)
    expect([duties[BEAR_IDS.roarEnabled], max[BEAR_IDS.roarEnabled]]).toEqual([true, false])
    // Faerie Fire's armor makes the bear's threat: dropping its upkeep costs 1% of TPS (§6.3 "Max TPS").
    for (const id of [BEAR_IDS.ffEnabled, BEAR_IDS.ffFiller]) expect([id, duties[id], max[id]]).toEqual([id, true, true])
    expect(LACERATE_REFRESH_SEC).toBe(12)
    expect([duties[BEAR_IDS.lacerateRefresh], max[BEAR_IDS.lacerateRefresh]]).toEqual([12, 12])
    // Maul from 14 on TPS alone (§6.3 "Max TPS", T5); nothing else moves: T3's first-pass search
    // found no other setting better (D27).
    const moved = Object.keys(duties).filter((id) => duties[id] !== max[id])
    expect(moved.sort()).toEqual([BEAR_IDS.priority, BEAR_IDS.roarEnabled, BEAR_IDS.maulMinRage].sort())
    // Each setting's help says how it follows the choice.
    const help = (id: string) => BEAR_OPTIONS.find((o) => o.id === id)!.help
    expect(help(BEAR_IDS.maulMinRage)).toContain('With Max TPS it’s 14 by default')
    expect(help(BEAR_IDS.roarEnabled)).toContain('On with Defensive; off by default with Balanced and Max TPS.')
    expect(help(BEAR_IDS.ffEnabled)).toContain('Every preset keeps it')
  })

  it('keeps a value you set yourself, and Balanced is the default', () => {
    const own = resolveRotationValues(BEAR_OPTIONS, { ...MAX, [BEAR_IDS.roarEnabled]: true, [BEAR_IDS.lacerateRefresh]: 3 }, TALENTS)
    expect([own[BEAR_IDS.roarEnabled], own[BEAR_IDS.lacerateRefresh]]).toEqual([true, 3])
    const back = resolveRotationValues(BEAR_OPTIONS, { [BEAR_IDS.priority]: BEAR_PRIORITY.balanced }, TALENTS)
    expect(back).toEqual(resolveRotationValues(BEAR_OPTIONS, {}, TALENTS))
  })

  it('leaves the roar to the Buffs tab, keeps Faerie Fire, and its lines are the rest of the list', () => {
    expect(bearMaintainedBuffs(MAX)).toEqual(['faerieFire'])
    const r = bearRotation(MAX, TALENTS, () => -1, { ...NO_CONTEXT, profile: FOREVER })
    expect(r.rotation.map((e) => r.abilities[e.ability].id)).toEqual(['berserk', 'enrage', 'maul', 'faerieFire', 'mangle', 'lacerate', 'lacerate', 'faerieFire'])
    const lacerate = r.abilities.findIndex((a) => a.id === 'lacerate')
    expect(r.rotation.filter((e) => e.ability === lacerate)[1].conditions).toEqual([{ code: COND.abilityAuraRefresh, a: lacerate, b: 12000 }])
  })
})

describe('the bear’s priority list (druid.md §6.3)', () => {
  const lines = (values: Record<string, boolean | number | string> = {}, context = {}) => {
    const r = bearRotation(values, TALENTS, () => -1, { ...NO_CONTEXT, profile: FOREVER, ...context })
    return { r, ids: r.rotation.map((e) => r.abilities[e.ability].id) }
  }

  it('with Defensive: Berserk and Maul off the GCD, then the duties, Primal Bite, Lacerate and the Faerie Fire filler; no Swipe', () => {
    const all = ['berserk', 'enrage', 'maul', 'demoralizingRoar', 'faerieFire', 'mangle', 'lacerate', 'lacerate', 'faerieFire']
    expect(lines(DEFENSIVE).ids).toEqual(all)
    // Balanced, the default, the same without the roar.
    expect(lines().ids).toEqual(all.filter((id) => id !== 'demoralizingRoar'))
    // The duties are the first lines on the GCD, before any threat ability there (D26's rule), and
    // refresh by it: the roar from 1.5 s left, Faerie Fire from 6 s.
    const { r } = lines(DEFENSIVE)
    const onGcd = r.rotation.filter((e) => r.abilities[e.ability].gcdMs > 0).map((e) => r.abilities[e.ability].id)
    expect(onGcd.slice(0, 2)).toEqual(['demoralizingRoar', 'faerieFire'])
    const refreshMs = (id: string) => r.rotation.find((e) => r.abilities[e.ability].id === id)!.conditions.find((c) => c.code === COND.abilityAuraRefresh)!.b
    expect([refreshMs('demoralizingRoar'), refreshMs('faerieFire')]).toEqual([1500, 6000])
    // A raid whose warriors keep the boss bleeding keeps Lacerate too (§6.3, BL1), unless it's set
    // to wait for no other bleeds.
    expect(lines(DEFENSIVE, { othersBleed: true }).ids).toEqual(all)
    expect(lines({ ...DEFENSIVE, [BEAR_IDS.lacerateAlone]: true }, { othersBleed: true }).ids).toEqual(['berserk', 'enrage', 'maul', 'demoralizingRoar', 'faerieFire', 'mangle', 'faerieFire'])
    expect(lines({ ...DEFENSIVE, [BEAR_IDS.lacerateAlone]: true }).ids).toEqual(all)
    // A Demoralizing Shout in the Buffs tab takes the roar's group: no roar.
    expect(lines(DEFENSIVE, { buffGroups: new Set(['ap-reduction']) }).ids).not.toContain('demoralizingRoar')
    // Swipe, when it's on, comes before the filler.
    expect(lines({ [BEAR_IDS.swipeEnabled]: true }).ids.slice(-2)).toEqual(['swipe', 'faerieFire'])
  })

  it('Enrage 1.5 s before the pull, and in combat on cooldown, up to the cap minus its 30 rage', () => {
    const { r } = lines()
    expect(r.prepull.casts).toEqual([{ ability: r.abilities.findIndex((a) => a.id === 'enrage'), atMs: PREPULL_ENRAGE_MS }])
    const line = r.rotation.find((e) => r.abilities[e.ability].id === 'enrage')!
    expect(line.conditions).toEqual([{ code: COND.maxRage, a: 700, b: 0 }])
    expect(lines({ [BEAR_IDS.enrageInCombat]: false }).ids).not.toContain('enrage')
    expect(lines({ [BEAR_IDS.enragePrepull]: false }).r.prepull.casts).toEqual([])
  })

  it('Wolfshead Helm adds 5 rage to Enrage at once', () => {
    const { r } = lines({}, { equipped: new Set([8345]) })
    expect(r.abilities.find((a) => a.id === 'enrage')!.rageTenths).toBe(150)
  })

  it('Lacerate while under 5 stacks, and at 5 once refreshBelowSec is left', () => {
    const { r } = lines({ [BEAR_IDS.lacerateEnabled]: true, [BEAR_IDS.lacerateRefresh]: 3 })
    const a = r.abilities.findIndex((x) => x.id === 'lacerate')
    const own = r.rotation.filter((e) => e.ability === a).map((e) => e.conditions)
    expect(own).toEqual([[{ code: COND.abilityAuraStacksBelow, a, b: 5 }], [{ code: COND.abilityAuraRefresh, a, b: 3000 }]])
  })

  it('each duty and ability is a setting: turned off, its line goes (a rotation without the duties is a matter of settings)', () => {
    const off = lines({
      [BEAR_IDS.roarEnabled]: false,
      [BEAR_IDS.ffEnabled]: false,
      [BEAR_IDS.ffFiller]: false,
      [BEAR_IDS.berserk]: false,
      [BEAR_IDS.maulEnabled]: false,
      [BEAR_IDS.mangleEnabled]: false,
      [BEAR_IDS.lacerateEnabled]: false,
      [BEAR_IDS.swipeEnabled]: false,
      [BEAR_IDS.enrageInCombat]: false,
    }).ids
    expect(off).toEqual([])
    // Without the talents, no Primal Bite and no Berserk.
    const bare = bearRotation({}, new Map(), () => -1, { ...NO_CONTEXT, profile: FOREVER })
    expect(bare.abilities.map((a) => a.id)).not.toContain('mangle')
    expect(bare.abilities.map((a) => a.id)).not.toContain('berserk')
  })

  it('the Night Elf’s Elune’s Light, and the potion and Juju Flurry only when selected in Buffs', () => {
    expect(lines({}, { race: 'alliance-night-elf' }).ids).toContain('elunesLight')
    expect(lines({}, { race: 'horde-tauren' }).ids).not.toContain('elunesLight')
    const plan = buildPlan(defaultConfig('druid-feral-bear')).plan
    expect(plan.abilities.map((a) => a.id)).toContain('mightyRagePotion')
    expect(plan.abilities.find((a) => a.id === 'mightyRagePotion')!.usesPerFight).toBe(1)
  })
})

describe('the default bear’s plan', () => {
  const plan = buildPlan(defaultConfig('druid-feral-bear')).plan
  const ability = (id: string) => plan.abilities.find((a) => a.id === id)!

  /** The default bear in a raid without warriors, so nothing else keeps the boss bleeding. */
  const withoutWarriors = (profile: 'forever' | 'classicEra' = 'forever') => {
    const d = defaultConfig('druid-feral-bear')
    return buildPlan({ ...d, buffs: { ...d.buffs, raid: d.buffs.raid.filter((c) => c !== 'warrior') }, rules: { profile, unmeasuredRatings: 'apply' } }).plan
  }

  it('keeps Lacerate while the raid’s warriors keep the boss bleeding; set to wait for no other bleeds, it leaves it out (§6.3, BL1)', () => {
    expect(plan.fight.othersBleed).toBe(true)
    expect(plan.abilities.map((a) => a.id)).toContain('lacerate')
    const alone = withoutWarriors()
    expect(alone.fight.othersBleed).toBe(false)
    expect(alone.abilities.map((a) => a.id)).toContain('lacerate')
    const d = defaultConfig('druid-feral-bear')
    const unused = (config: SimConfig) => unusedRotationSettings(config)[BEAR_IDS.lacerateEnabled]
    expect(unused(d)).toBeUndefined()
    const waits = { ...d, rotation: { [BEAR_IDS.lacerateAlone]: true } }
    expect(buildPlan(waits).plan.abilities.map((a) => a.id)).not.toContain('lacerate')
    // The Rotation tab says why, as it does for the cat's Rake and Rip.
    expect(unused(waits)).toBe('Not used in this raid: its warriors keep the boss bleeding. Turn off “Lacerate only when nothing else bleeds” to use it anyway.')
    const noWarriors = { ...waits, buffs: { ...d.buffs, raid: d.buffs.raid.filter((c) => c !== 'warrior') } }
    expect(buildPlan(noWarriors).plan.abilities.map((a) => a.id)).toContain('lacerate')
    expect(unused(noWarriors)).toBeUndefined()
  })

  it('Lacerate’s ticks get their own row, a bleed whose applications can’t be avoided and whose ticks may crit in Forever', () => {
    const alone = withoutWarriors()
    const row = alone.sources[alone.abilities.find((a) => a.id === 'lacerate')!.dotSource!]
    expect(row).toMatchObject({ id: 'lacerateBleed', name: 'Lacerate (bleed)', bleed: { ticksCanCrit: true, avoidable: false } })
    const classic = withoutWarriors('classicEra')
    const classicRow = classic.sources[classic.abilities.find((a) => a.id === 'lacerate')!.dotSource!]
    expect(classicRow.bleed?.ticksCanCrit).toBe(false)
  })

  it('its sheet says it can neither parry nor block, so those rows stay off it (BU15); a warrior’s can', () => {
    const sheet = buildPlan(defaultConfig('druid-feral-bear')).sheet
    expect(sheet).toMatchObject({ canParry: false, canBlock: false, parryPct: 0, blockPct: 0 })
    const prot = buildPlan(defaultConfig('warrior-protection')).sheet
    expect(prot.canParry).toBeUndefined()
    expect(prot.canBlock).toBeUndefined()
  })

  it('Primal Bite’s cooldown stops under Berserk’s aura', () => {
    expect(plan.auras[ability('mangle').noCooldownAura!].id).toBe('berserk')
  })

  it('its Faerie Fire and Demoralizing Roar are debuffs on the boss, in place of the Buffs tab’s', () => {
    const defensive = buildPlan(defensiveConfig()).plan
    expect(defensive.auras.find((a) => a.id === 'faerieFire')!.targetArmor).toBe(505)
    expect(defensive.auras.find((a) => a.id === 'demoralizingRoar')!.bossAp).toBe(-204)
    // Balanced, the default, keeps Faerie Fire only.
    expect(plan.auras.find((a) => a.id === 'faerieFire')!.targetArmor).toBe(505)
    expect(plan.auras.map((a) => a.id)).not.toContain('demoralizingRoar')
    // The Buffs tab's Faerie Fire is left out: the boss's static armor keeps Sunder Armor and Curse
    // of Recklessness only (3,731 − 2,250 − 505).
    expect(plan.fight.targetArmor).toBe(976)
    // Its duties are its own, in no preset, and its preset has no warrior tank's Demoralizing Shout
    // (D26's amendment, BU3).
    for (const id of ['demoralizingRoar', 'faerieFire', 'demoralizingShout']) expect(defaultConfig('druid-feral-bear').buffs.enabled).not.toContain(id)
    expect(plan.fight.bossSwing!.minDamage).toBe(4500)
  })

  it('its assumptions follow the setup: what it uses, the raid and the profile’s numbers (BL4, BU12)', () => {
    const text = (config: SimConfig) => Object.fromEntries(buildPlan(config).assumptions.map((a) => [a.id, a.text]))
    const d = defensiveConfig()
    const forever = text(d)
    expect(forever.bearRage).toBe(
      'A Maul swing gives no rage: the white swing it replaces would give 8.65 rage. A bear attack that misses or is dodged or parried refunds 80% of its rage, as in Classic Era; untested for bears in Forever.',
    )
    expect(forever.bearThreat).toBe(
      'Maul makes 1.75 threat per damage, Faerie Fire 108 and Demoralizing Roar 39, as a Classic Era threat library has them. Primal Bite makes 1 threat per damage, since its threat is unknown. Lacerate makes 1 per damage and 206 plus 5% of your attack power more each time it lands: its tooltip’s “high amount of threat”, valued as the warrior’s Sunder Armor, which has the same words at the same level (206 is Forever’s client value; the attack power share is the sim’s guess at the one Blizzard’s notes add). None is measured in Forever.',
    )
    expect(forever.demoralizingRoar).toMatch(/^Demoralizing Roar lowers the boss’s attack power by 204, its level-60 tooltip; whether combat applies all of it is untested\. Demoralizing Roar and Faerie Fire roll to hit as spells do; the boss resists 6% of the Faerie Fires that would land/)
    expect(forever.rendAndTear).toContain('all fight here, since the warriors in your raid keep their Deep Wounds on it')
    expect(forever.berserkMangle).toMatch(/so Primal Bite’s extra targets add nothing\.$/)
    // Classic Era: the roar's −138 [C], and white rage from damage.
    const classic = text({ ...d, rules: { profile: 'classicEra', unmeasuredRatings: 'apply' } })
    expect(classic.demoralizingRoar).toMatch(/^Demoralizing Roar lowers the boss’s attack power by 138, Classic Era’s rank 5 at level 60\./)
    expect(classic.bearRage).toContain('would give rage for its damage')
    // Classic Era's Lacerate is its rule for the words: 4.5 × level 58, Sunder Armor's 261 there.
    expect(classic.bearThreat).toContain('Lacerate makes 1 per damage and 261 more each time it lands: its tooltip’s “high amount of threat”, valued as a warrior’s abilities with the same words (4.5 × the spell’s level, Sunder Armor’s 261 in Classic Era).')
    // Swipe, no Lacerate and no roar, without warriors: each text names only what's used.
    const other = text({
      ...d,
      rotation: { [BEAR_IDS.swipeEnabled]: true, [BEAR_IDS.lacerateEnabled]: false, [BEAR_IDS.roarEnabled]: false },
      buffs: { ...d.buffs, raid: d.buffs.raid.filter((c) => c !== 'warrior') },
    })
    expect(other.bearThreat).toBe('Maul and Swipe make 1.75 threat per damage and Faerie Fire 108, as a Classic Era threat library has them. Primal Bite makes 1 threat per damage, since its threat is unknown. None is measured in Forever.')
    expect(other.bearRage).toContain('(Swipe nothing, like a warrior’s area attacks)')
    expect(other.demoralizingRoar).toMatch(/^Faerie Fire rolls to hit as a spell does;/)
    expect(other.rendAndTear).toContain('which it doesn’t here')
    expect(other.berserkMangle).toContain('Primal Bite’s and Swipe’s extra targets')
    expect(other.lacerate).toBeUndefined()
    expect(forever.bearThreat).not.toContain('Swipe')
    expect(forever.bearRage).not.toContain('Swipe')
  })

  it('a Demoralizing Shout in the Buffs tab takes the roar’s place on the boss, so the roar isn’t used (BL3)', () => {
    const d = defensiveConfig()
    const buffs = { ...d.buffs, enabled: [...d.buffs.enabled.filter((id) => id !== 'demoralizingRoar'), 'demoralizingShout'] }
    const shout = buildPlan({ ...d, buffs }).plan
    expect(shout.abilities.map((a) => a.id)).not.toContain('demoralizingRoar')
    expect(shout.auras.map((a) => a.id)).not.toContain('demoralizingRoar')
    expect(shout.fight.bossSwing!.minDamage).toBeCloseTo(4500 - (204 / 14) * 2, 9)
    // The Rotation tab says why.
    const unused = (config: SimConfig) => unusedRotationSettings(config)[BEAR_IDS.roarEnabled]
    expect(unused(d)).toBeUndefined()
    expect(unused({ ...d, buffs })).toBe('Not used: the Demoralizing Shout in Buffs is on the boss instead, so you don’t cast the roar.')
    // Without a warrior in the raid, nobody brings the Shout: the roar is used again.
    const noWarrior = { raid: d.buffs.raid.filter((c) => c !== 'warrior'), enabled: buffs.enabled }
    expect(buildPlan({ ...d, buffs: noWarrior }).plan.abilities.map((a) => a.id)).toContain('demoralizingRoar')
    expect(unused({ ...d, buffs: noWarrior })).toBeUndefined()
    // With the roar off (Max TPS) and the Buffs tab's roar on for another druid, that roar fills
    // the group: no Shout is on the boss, so no note (BF1).
    const other = { ...d.buffs, enabled: [...d.buffs.enabled, 'demoralizingRoar'] }
    expect(unused({ ...d, buffs: other, rotation: { ...DEFENSIVE, [BEAR_IDS.roarEnabled]: false } })).toBeUndefined()
    expect(unused({ ...d, buffs: other, rotation: {} })).toBeUndefined()
  })
})
