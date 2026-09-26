// The paladin's spells, abilities and talents against the Forever client data (docs/classes/paladin.md;
// docs/data/client.md), and the mana costs of paladin.md#mana-model.
import { describe, expect, it } from 'vitest'
import spellsJson from '@/data/client/spells.json'
import type { ClientSpell, ClientSpells } from '@/data/client/types'
import { TALENT_DATA } from '../../defaults'
import type { SpellDef } from '../../plan/types'
import {
  CONSECRATION,
  CONSECRATION_RANK1,
  EXORCISM_ABILITY,
  HAMMER_OF_WRATH_ABILITY,
  HOLY_STRIKE_ABILITY,
  JUDGE_COMMAND,
  JUDGE_CRUSADER,
  JUDGEMENT_OF_THE_CRUSADER_AURA,
  manaCostOf,
  PALADIN_BASE_MANA,
  pctOfBaseMana,
  SEAL_DURATION_MS,
  SEAL_OF_COMMAND,
  SEAL_OF_FURY,
  SEAL_OF_RIGHTEOUSNESS,
  SEAL_OF_THE_CRUSADER,
  SEAL_OF_THE_CRUSADER_AP,
  sealProcs,
} from './abilities'
import * as SPELLS from './spells'
import {
  atLevel60,
  CONSECRATION_RANK1_TICK,
  CONSECRATION_TICK,
  EXORCISM,
  HAMMER_OF_WRATH,
  HOLY_STRIKE,
  JUDGEMENT_OF_COMMAND,
  JUDGEMENT_OF_FURY,
  JUDGEMENT_OF_RIGHTEOUSNESS,
  SEAL_OF_COMMAND_PROC,
  SEAL_OF_FURY_ABSORB_PCT,
  SEAL_OF_FURY_BASE,
  SEAL_OF_FURY_SHIELD_AURA,
  SEAL_PROC_BASE,
  sealOfFuryProc,
  SEAL_OF_RIGHTEOUSNESS_VALUE,
  sealOfRighteousnessProc,
  spread,
  withJotcRule,
} from './spells'
import {
  IMPROVED_SEALS,
  RIGHTEOUS_FURY_HOLY_THREAT_PCT,
  righteousFuryEffects,
  SACRED_ARBITER_PCT,
  TALENT_EFFECTS,
  TWIST_OF_LIGHT_SEAL_COST_CUT_PCT,
  VENGEANCE_MAX_STACKS,
  withSpellTalents,
  withTalents,
} from './talents'

const spells = (spellsJson as unknown as ClientSpells).spells
const spell = (id: number): ClientSpell => {
  const s = spells[String(id)]
  expect(s, `client spell ${id}`).toBeDefined()
  return s
}
const effect = (id: number, index: number) => spell(id).effects.find((e) => e.effectIndex === index)!
/** No Active Defense (Attr0 0x200000) and Always Hit (Attr3 0x40000): paladin.md#conventions-used-below. */
const attrs = (id: number) => {
  const a = spell(id).misc!.attributes!
  return { noActiveDefense: (a[0] & 0x200000) !== 0, alwaysHit: (a[3] & 0x40000) !== 0 }
}
const DEFENSE_TYPE = { none: 0, magic: 1, melee: 2, ranged: 3 } as const
/** Holy school (SpellMisc school mask 2). */
const HOLY_MASK = 2

/** A spell def against its client row: school, damage class, attributes and coefficient. */
function matches(def: SpellDef, id: number, coefficientEffect = 0) {
  const s = spell(id)
  expect(s.misc!.schoolMask, def.id).toBe(HOLY_MASK)
  expect(s.categories?.defenseType ?? 0, def.id).toBe(DEFENSE_TYPE[def.defense])
  expect(attrs(id), def.id).toEqual({ noActiveDefense: def.noActiveDefense, alwaysHit: def.alwaysHit })
  const e = effect(id, coefficientEffect)
  expect(e.effectBonusCoefficient ?? 0, def.id).toBeCloseTo(def.weaponPercent > 0 && def.id !== 'holyStrike' ? def.spCoefficient / def.weaponPercent : def.spCoefficient, 12)
}

describe('paladin spells against the client (paladin.md#seals, #judgement, #other-abilities)', () => {
  it('Seal of Command’s proc: 70% weapon damage (effect 31), 0.29 inside it, the full melee table', () => {
    expect(effect(20424, 0)).toMatchObject({ effect: 31, effectBasePointsF: 70, effectBonusCoefficient: 0.29 })
    expect(SEAL_OF_COMMAND_PROC.weaponPercent).toBe(0.7)
    matches(SEAL_OF_COMMAND_PROC, 20424)
  })

  it('the judgements: JoC 356 ± 4.78% halved, 0.429, Always Hit; JoR 170 + 4.1/level from 58, 0.5; JoF 153 + 3.69/level, 0.45', () => {
    const joc = effect(20966, 0)
    const [lo, hi] = spread(joc.effectBasePointsF!, joc.variance!)
    expect([JUDGEMENT_OF_COMMAND.min, JUDGEMENT_OF_COMMAND.max]).toEqual([lo / 2, hi / 2])
    expect(lo).toBeCloseTo(339, 3)
    expect(hi).toBeCloseTo(373, 3)
    matches(JUDGEMENT_OF_COMMAND, 20966)
    for (const [def, id] of [
      [JUDGEMENT_OF_RIGHTEOUSNESS, 20286],
      [JUDGEMENT_OF_FURY, 20414],
    ] as const) {
      const e = effect(id, 0)
      const levels = spell(id).levels!
      const scaled = atLevel60(0, e.effectRealPointsPerLevel!, levels.baseLevel!, levels.maxLevel!)
      const [a, b] = spread(e.effectBasePointsF!, e.variance!)
      expect(def.min).toBeCloseTo(a + scaled, 9)
      expect(def.max).toBeCloseTo(b + scaled, 9)
      matches(def, id)
    }
    // The client's variance is stored to 8 digits: 162.0000 and 178.0000 before the level scaling,
    // then + trunc(8.2) = 8 (docs/data/items.md#per-level-values): Classic Era's 170–186.
    expect(JUDGEMENT_OF_RIGHTEOUSNESS.min).toBeCloseTo(170, 5)
    expect(JUDGEMENT_OF_RIGHTEOUSNESS.max).toBeCloseTo(186, 5)
  })

  it('Seal of Righteousness and Seal of Fury procs: Always Hit, No Active Defense, 0.1; Seal of Fury flat, with its 50% absorb; Seal of Righteousness’s seal value 1786 + 47/level from 58', () => {
    matches(sealOfRighteousnessProc(3.5, true), 25713)
    matches(sealOfFuryProc(), 20418)
    // Seal of Fury: the proc's flat 35 + 0.1 × SP, whatever the weapon (the beta logs); the aura's
    // weapon-speed dummy (20423 effect 0) is undescribed, so it models as zero.
    expect(effect(20418, 0).effectBasePointsF).toBe(SEAL_OF_FURY_BASE)
    expect(sealOfFuryProc()).toMatchObject({ min: 35, max: 35, spCoefficient: 0.1, takenScale: 0.1 })
    expect(sealOfFuryProc().absorb).toBeUndefined()
    // Its absorb with a shield: 50% of the Holy damage dealt (20423 effect 1).
    expect(effect(20423, 1).effectBasePointsF).toBe(SEAL_OF_FURY_ABSORB_PCT)
    expect(sealOfFuryProc(true).absorb).toEqual({ aura: SEAL_OF_FURY_SHIELD_AURA, pct: 50 })
    const v = effect(20293, 0)
    expect(SEAL_OF_RIGHTEOUSNESS_VALUE).toBeCloseTo(atLevel60(v.effectBasePointsF!, v.effectRealPointsPerLevel!, 58, 64) / 100, 12)
    expect(SEAL_OF_RIGHTEOUSNESS_VALUE).toBeCloseTo(18.8, 12)
    // Seal of Righteousness: Forever's proc carries the same 35 as Seal of Fury's, read the same way,
    // on top of the seal value [?] (OQ 4, OQ 10). Worked example 6: 35 + 1.2 × 18.80 × 3.5 = 113.96 before
    // spell damage; the same weapon one-handed (0.85) 90.93.
    expect(effect(25713, 0).effectBasePointsF).toBe(SEAL_PROC_BASE)
    expect(SEAL_OF_FURY_BASE).toBe(SEAL_PROC_BASE)
    expect(sealOfRighteousnessProc(3.5, true).min).toBeCloseTo(113.96, 9)
    expect(sealOfRighteousnessProc(3.5, false).max).toBeCloseTo(90.93, 9)
  })

  it('Holy Strike: normalized weapon + 93 ± 12.5% (effect 121), then 50% (effect 31; 40% before 1.60.1.70009), 0.429; category 2404 with Hammer of the Righteous', () => {
    expect(effect(10333, 0)).toMatchObject({ effect: 121, effectBasePointsF: 93, variance: 0.25, effectBonusCoefficient: 0.429 })
    expect(effect(10333, 1)).toMatchObject({ effect: 31, effectBasePointsF: 50 })
    expect([HOLY_STRIKE.min, HOLY_STRIKE.max]).toEqual(spread(93, 0.25))
    expect(HOLY_STRIKE.weaponPercent).toBe(0.5)
    matches(HOLY_STRIKE, 10333)
    expect(spell(10333).categories!.category).toBe(spell(407632).categories!.category)
  })

  it('Exorcism (magic), Hammer of Wrath (ranged) and Consecration’s ticks (magic, 12 + 27 at 0.095; rank 1: 2 + 4)', () => {
    for (const [def, id] of [
      [EXORCISM, 10314],
      [HAMMER_OF_WRATH, 24239],
    ] as const) {
      const e = effect(id, 0)
      expect([def.min, def.max]).toEqual(spread(e.effectBasePointsF!, e.variance!))
      matches(def, id)
    }
    for (const [def, id] of [
      [CONSECRATION_TICK, 1280349],
      [CONSECRATION_RANK1_TICK, 1280345],
    ] as const) {
      expect(def.min).toBe(effect(id, 0).effectBasePointsF! + effect(id, 1).effectBasePointsF!)
      matches(def, id, 1)
    }
  })

  it('the abilities’ costs, cooldowns, GCDs, cast times and durations', () => {
    const row = (id: number) => {
      const s = spell(id)
      return {
        mana: s.power?.[0]?.manaCost ?? (s.power?.[0]?.powerCostPct ? pctOfBaseMana(s.power[0].powerCostPct) : 0),
        cooldown: s.cooldowns?.categoryRecoveryTime ?? s.cooldowns?.recoveryTime ?? 0,
        gcd: s.cooldowns?.startRecoveryTime ?? 0,
        cast: s.castTime?.base ?? 0,
      }
    }
    for (const [def, id] of [
      [SEAL_OF_COMMAND, 20920],
      [SEAL_OF_RIGHTEOUSNESS, 20293],
      [SEAL_OF_FURY, 20423],
      [SEAL_OF_THE_CRUSADER, 20308],
      [JUDGE_COMMAND, 20271],
      [HOLY_STRIKE_ABILITY, 10333],
      [EXORCISM_ABILITY, 10314],
      [HAMMER_OF_WRATH_ABILITY, 24239],
      [CONSECRATION, 20924],
      [CONSECRATION_RANK1, 26573],
    ] as const) {
      expect({ mana: manaCostOf(def), cooldown: def.cooldownMs, gcd: def.gcdMs, cast: def.castMs }, def.id).toEqual(row(id))
      expect(def.resource, def.id).toBe('mana')
    }
    for (const id of [20920, 20293, 20423, 20308]) expect(spell(id).duration!.duration).toBe(SEAL_DURATION_MS)
    // Consecration: a tick a second for 8 s.
    expect(effect(20924, 2).effectAuraPeriod).toBe(CONSECRATION.rageTickMs)
    expect(spell(20924).duration!.duration).toBe(CONSECRATION.rageTicks * CONSECRATION.rageTickMs)
    expect(pctOfBaseMana(6)).toBe(90)
    expect(PALADIN_BASE_MANA).toBe(1512)
  })

  it('the seals: Seal of Command procs on auto attacks (mask 0x4) with a 1 s ICD, and Seal of the Crusader’s 306 + 2.4/level AP and 40% speed', () => {
    for (const id of [20920, 20293, 20423]) expect(spell(id).auraOptions!.procTypeMask![0]).toBe(4)
    expect(spell(20920).auraOptions!.procCategoryRecovery).toBe(1000)
    const procs = sealProcs({ speedSec: 3.5, twoHand: true })
    expect(procs.find((p) => p.id === 'sealOfCommandProc')).toMatchObject({ chance: { ppm: 7 }, icdMs: 1000, trigger: 'whiteResolved', from: 'mainHand' })
    const ap = effect(20308, 0)
    expect(SEAL_OF_THE_CRUSADER_AP).toBeCloseTo(atLevel60(ap.effectBasePointsF!, ap.effectRealPointsPerLevel!, 52, 60), 9)
    expect(effect(20308, 1)).toMatchObject({ effectAura: 9, effectBasePointsF: 40 })
  })

  it('Judgement of the Crusader: +161 Holy damage taken (aura 14, Holy) for 40 s, Always Hit', () => {
    expect(effect(20303, 0)).toMatchObject({ effectAura: 14, effectBasePointsF: 161 })
    expect(effect(20303, 0).effectMiscValue![0]).toBe(HOLY_MASK)
    expect(spell(20303).duration!.duration).toBe(JUDGEMENT_OF_THE_CRUSADER_AURA.durationMs)
    expect(attrs(20303).alwaysHit).toBe(true)
    expect(JUDGE_CRUSADER.aura).toBe(JUDGEMENT_OF_THE_CRUSADER_AURA)
  })

  it('Righteous Fury: +60% Holy threat (aura 10, Holy); Vengeance: +3% Physical and Holy per stack, 3 stacks, 30 s, from non-periodic crits', () => {
    expect(effect(25780, 0)).toMatchObject({ effectAura: 10, effectBasePointsF: 60 })
    expect(effect(25780, 0).effectMiscValue![0]).toBe(HOLY_MASK)
    expect(RIGHTEOUS_FURY_HOLY_THREAT_PCT).toBe(60)
    expect(righteousFuryEffects(true, new Map())).toEqual([{ kind: 'threat', pct: 60, holyOnly: true }])
    expect(effect(20050, 0)).toMatchObject({ effectAura: 79, effectBasePointsF: 3 })
    expect(effect(20050, 0).effectMiscValue![0]).toBe(1 | HOLY_MASK)
    expect(spell(20050).auraOptions!.cumulativeAura).toBe(VENGEANCE_MAX_STACKS)
    expect(VENGEANCE_MAX_STACKS).toBe(3)
    expect(spell(20050).duration!.duration).toBe(30000)
    // The talent's proc mask (20049): melee and ranged autos, melee-, ranged- and magic-class spells,
    // no periodic damage (0x40000, which 1.60.1.69913's 332116 had).
    expect(spell(20049).auraOptions!.procTypeMask![0]).toBe(69972)
    expect(spell(20049).auraOptions!.procTypeMask![0] & 0x40000).toBe(0)
  })

  it('Twist of Light: −20% on the seals’ cost (aura 108, misc 14); Sacred Arbiter +20% Holy Strike; Holy Power +15% Holy Strike crit at 5/5', () => {
    expect(effect(1310735, 0)).toMatchObject({ effectAura: 108, effectBasePointsF: -TWIST_OF_LIGHT_SEAL_COST_CUT_PCT })
    expect(effect(1310735, 0).effectMiscValue![0]).toBe(14)
    expect(effect(1311087, 0)).toMatchObject({ effectAura: 108, effectBasePointsF: SACRED_ARBITER_PCT })
    expect(SACRED_ARBITER_PCT).toBe(20)
    // Holy Power's second effect is Holy Strike's (class mask word 3 bit 0x8000) and Holy Shock's: 15 at 5/5.
    expect(effect(5923, 1)).toMatchObject({ effectAura: 108, effectBasePointsF: 15 })
    expect(effect(5923, 1).effectSpellClassMask![3] & spell(10333).classOptions!.spellClassMask![3]).not.toBe(0)
  })

  // Each paladin spell's client row, and whether another spell or an aura triggers it (a seal's
  // proc, a judgement's damage, Consecration's ticks) rather than you casting it.
  const CLIENT: Record<string, [id: number, triggered: boolean]> = {
    sealOfCommandProc: [20424, true],
    judgementOfCommand: [20966, true],
    sealOfRighteousnessProc: [25713, true],
    judgementOfRighteousness: [20286, true],
    sealOfFuryProc: [20418, true],
    judgementOfFury: [20414, true],
    holyStrike: [10333, false],
    exorcism: [10314, false],
    hammerOfWrath: [24239, false],
    consecration: [1280349, true],
    consecrationRank1: [1280345, true],
  }
  const isSpell = (x: unknown): x is SpellDef => typeof x === 'object' && x !== null && 'triggersProcs' in x
  /** Every spell spells.ts defines. */
  const allSpells = () => [...Object.values(SPELLS).filter(isSpell), sealOfRighteousnessProc(3.5, true), sealOfFuryProc()]

  it('which spells trigger procs: every one you cast, and a triggered one only with NOT_A_PROC (Attr3 0x200)', () => {
    const defs = allSpells()
    // Every spell spells.ts defines is in the table, so none escapes the check.
    expect(defs.map((d) => d.id).sort()).toEqual(Object.keys(CLIENT).sort())
    for (const def of defs) {
      const [id, triggered] = CLIENT[def.id]
      const notAProc = (spell(id).misc!.attributes![3] & 0x200) !== 0
      expect(def.triggersProcs, def.id).toBe(!triggered || notAProc)
    }
    // The review's reading (PC1): the seals' procs differ. Seal of Command's has NOT_A_PROC, and so
    // does each judgement's damage spell; Seal of Righteousness's and Seal of Fury's have Always Hit only.
    for (const id of [20424, 20966, 20286, 20414]) expect(spell(id).misc!.attributes![3] & 0x200, String(id)).toBe(0x200)
    for (const id of [25713, 20418]) expect(spell(id).misc!.attributes![3], String(id)).toBe(0x40000)
  })

  it('a weapon share exactly when the client effect is weapon damage (17, 58, 121, 31): one roll for those, two for the rest (combat-tables §3)', () => {
    const WEAPON_EFFECTS = new Set([17, 58, 121, 31])
    for (const def of allSpells()) {
      const weapon = spell(CLIENT[def.id][0]).effects.some((e) => WEAPON_EFFECTS.has(e.effect))
      expect(def.weaponPercent > 0, def.id).toBe(weapon)
    }
  })

  it('the default JotC rule scales the bonus by each spell’s coefficient; the flat rule gives melee-class spells all of it', () => {
    expect(withJotcRule(JUDGEMENT_OF_COMMAND, 'coefficient').takenScale).toBe(0.429)
    expect(withJotcRule(JUDGEMENT_OF_COMMAND, 'flat').takenScale).toBe(1)
    expect(withJotcRule(EXORCISM, 'flat').takenScale).toBe(0.429)
    expect(SEAL_OF_COMMAND_PROC.takenScale).toBeCloseTo(0.203, 12)
  })
})

describe('paladin talents (paladin.md#talents)', () => {
  const tooltip = (name: string, r: number) => {
    const t = TALENT_DATA.paladin.trees.flatMap((x) => x.talents).find((x) => x.name === name)!
    return (t.ranks as unknown as { forever: string[] }).forever[r - 1]
  }
  it('use each rank’s value from the Forever rank tooltips', () => {
    const cases: [string, number, string][] = [
      ['Divine Strength', 5, 'by 10%'],
      ['Divine Intellect', 5, 'by 10%'],
      ['Divine Precision', 3, 'by 18%'],
      ['Precision', 3, 'by 3%'],
      ['Toughness', 5, 'by 10%'],
      ['Anticipation', 5, 'by 20'],
      ['Sacred Duty', 2, 'Stamina by 4%'],
      ['One-Handed Weapon Specialization', 2, 'by 7%'],
      ['Shield Specialization', 2, 'by 20%, and gives your blocks a 66% chance to restore 6%'],
      ['Deflection', 5, 'by 5%'],
      ['Conviction', 5, 'by 5%'],
      ['Two-Handed Weapon Specialization', 3, 'by 6%'],
      ['Champion of the Light', 2, 'up to 66% of your Intellect'],
      ['Vengeance', 3, 'by 3% for 30 sec after landing a non-periodic critical strike. Stacks up to 3 times'],
      ['Vindication', 3, 'Attack Power by 3% for 30 sec'],
      ['Improved Seals', 3, 'by 15%'],
      ['Benediction', 5, 'by 10%'],
      ['Holy Conduit', 2, 'by 40%'],
      ['Improved Judgement', 2, 'by 2 sec'],
      ['Sanctified Judgement', 2, '66% chance to return 40%'],
      ['Sacred Arbiter', 1, 'by 20%'],
      ['Twist of Light', 1, 'Mana cost of your Seal spells by 20%'],
      ['Holy Power', 5, 'Holy Shock and Holy Strike spells by 15%, and all other spells by 5%'],
      ['Iron Creed', 5, 'Holy Strike ability 25%'],
      ['Instrument of Law', 2, 'by 1.0 sec, and reduces all threat you generate by 20%'],
      ['Improved Righteous Fury', 3, 'reduced by 6%'],
      ['Purifying Power', 2, 'Holy Wrath spells by 33%'],
      ['Reverence', 3, 'Allows 30%'],
    ]
    for (const [name, r, text] of cases) expect(tooltip(name, r), name).toContain(text)
    // Spot checks of the effects at those ranks.
    expect(TALENT_EFFECTS['One-Handed Weapon Specialization'](2)).toEqual([{ kind: 'damage', pct: 7, physicalOnly: true, when: { twoHand: false } }])
    expect(TALENT_EFFECTS['Champion of the Light'](2)).toEqual([{ kind: 'stat', stat: 'spellDamagePerIntPct', value: 66 }])
    expect(TALENT_EFFECTS['Two-Handed Weapon Specialization'](3)[0]).toMatchObject({ pct: 6, physicalOnly: true })
    // Crusade and Improved Holy Strike left the trees in 1.60.1.70009 (docs/data/talents.md#tree-versions).
    expect(TALENT_EFFECTS.Crusade).toBeUndefined()
    expect(righteousFuryEffects(false, new Map([['Instrument of Law', 2]]))).toEqual([{ kind: 'threat', pct: -20 }])
    expect(righteousFuryEffects(true, new Map([['Improved Righteous Fury', 3]]))).toContainEqual({ kind: 'damageTaken', pct: -6 })
  })

  it('Improved Seals covers the seals’ procs and the damage judgements, not Holy Strike or Consecration', () => {
    const t = new Map([['Improved Seals', 3]])
    for (const def of [SEAL_OF_COMMAND_PROC, sealOfFuryProc(), sealOfRighteousnessProc(3.5, true), JUDGEMENT_OF_COMMAND, JUDGEMENT_OF_RIGHTEOUSNESS, JUDGEMENT_OF_FURY]) {
      expect(IMPROVED_SEALS.has(def.id), def.id).toBe(true)
      expect(withSpellTalents(def, t).damageMult).toBeCloseTo(1.15, 12)
    }
    for (const def of [HOLY_STRIKE, CONSECRATION_TICK, EXORCISM]) expect(withSpellTalents(def, t).damageMult).toBe(1)
  })

  it('Sacred Arbiter: Holy Strike ×1.20; Holy Power: +3% crit a rank on Holy Strike, +1% on the seals’ procs and damage judgements, none on the magic spells’ own', () => {
    expect(withSpellTalents(HOLY_STRIKE, new Map([['Sacred Arbiter', 1]])).damageMult).toBeCloseTo(1.2, 12)
    const power = new Map([['Holy Power', 5]])
    expect(withSpellTalents(HOLY_STRIKE, power).bonusCrit).toBe(15)
    for (const def of [SEAL_OF_COMMAND_PROC, sealOfFuryProc(), JUDGEMENT_OF_COMMAND, JUDGEMENT_OF_RIGHTEOUSNESS]) expect(withSpellTalents(def, power).bonusCrit, def.id).toBe(5)
    // Exorcism and Consecration are magic class: Holy Power's +5% is their spell crit (TALENT_EFFECTS).
    for (const def of [EXORCISM, CONSECRATION_TICK]) expect(withSpellTalents(def, power).bonusCrit, def.id).toBe(0)
    expect(TALENT_EFFECTS['Holy Power'](5)).toEqual([{ kind: 'stat', stat: 'spellCrit', value: 5 }])
  })
})

describe('mana costs (paladin.md#mana-model)', () => {
  const RET = new Map([
    ['Benediction', 5],
    ['Instrument of Law', 2],
  ])
  it('Retribution (Benediction 5/5): SoC 189, SoR 180, SotC 144, Judgement 81, Holy Strike 18, Consecration 508 / 121, Exorcism 310, instant HoW 382', () => {
    const cost = (def: Parameters<typeof withTalents>[0], t = RET) => manaCostOf(withTalents(def, t))
    expect(cost(SEAL_OF_COMMAND)).toBe(189)
    expect(cost(SEAL_OF_RIGHTEOUSNESS)).toBe(180)
    expect(cost(SEAL_OF_THE_CRUSADER)).toBe(144)
    expect(cost(JUDGE_COMMAND)).toBe(81)
    expect(cost(HOLY_STRIKE_ABILITY)).toBe(18)
    expect(cost(CONSECRATION)).toBe(508)
    expect(cost(CONSECRATION_RANK1)).toBe(121)
    expect(cost(EXORCISM_ABILITY)).toBe(310)
    expect(cost(HAMMER_OF_WRATH_ABILITY)).toBe(382)
    // Hammer of Wrath with its cast (no Instrument of Law) isn't instant: Benediction doesn't touch it.
    expect(cost(HAMMER_OF_WRATH_ABILITY, new Map([['Benediction', 5]]))).toBe(425)
    // Holy Conduit 2/2 adds to Benediction [?]: Consecration 565 × (1 − 0.1 − 0.4) = 282.
    expect(cost(CONSECRATION, new Map([...RET, ['Holy Conduit', 2]]))).toBe(282)
  })

  it('Twist of Light takes 20% off every seal, added to Benediction [?]: SoC 147, SoR and SoF 140, SotC 112; nothing else', () => {
    const tol = new Map([...RET, ['Twist of Light', 1]])
    const cost = (def: Parameters<typeof withTalents>[0]) => manaCostOf(withTalents(def, tol))
    expect(cost(SEAL_OF_COMMAND)).toBe(147)
    expect(cost(SEAL_OF_RIGHTEOUSNESS)).toBe(140)
    expect(cost(SEAL_OF_FURY)).toBe(140)
    expect(cost(SEAL_OF_THE_CRUSADER)).toBe(112)
    expect(cost(JUDGE_COMMAND)).toBe(81)
    expect(cost(HOLY_STRIKE_ABILITY)).toBe(18)
    // Alone (no Benediction): 210 × 0.8 = 168.
    expect(manaCostOf(withTalents(SEAL_OF_COMMAND, new Map([['Twist of Light', 1]])))).toBe(168)
    // Sanctified Judgement still returns its share of the seal's base cost (126 of 210).
    expect(withTalents(JUDGE_COMMAND, new Map([['Twist of Light', 1], ['Sanctified Judgement', 3]])).manaReturnTenths).toBeCloseTo(1260, 9)
  })

  it('Protection (no Benediction): SoF 200, Judgement 90, Holy Strike 20, Consecration 565', () => {
    const none = new Map<string, number>()
    expect(manaCostOf(withTalents(SEAL_OF_FURY, none))).toBe(200)
    expect(manaCostOf(withTalents(JUDGE_COMMAND, none))).toBe(90)
    expect(manaCostOf(withTalents(HOLY_STRIKE_ABILITY, none))).toBe(20)
    expect(manaCostOf(withTalents(CONSECRATION, none))).toBe(565)
  })

  it('Sanctified Judgement returns 20% of the judged seal’s base cost per rank, at a 33 / 66 / 100% chance', () => {
    for (const [r, share, chance] of [
      [1, 42, 0.33],
      [2, 84, 0.66],
      [3, 126, 1],
    ] as const) {
      const j = withTalents(JUDGE_COMMAND, new Map([['Sanctified Judgement', r]]))
      expect(j.manaReturnTenths! / 10).toBeCloseTo(share, 9)
      expect(j.manaReturnChance).toBe(chance)
    }
    expect(withTalents(JUDGE_CRUSADER, new Map([['Sanctified Judgement', 3]])).manaReturnTenths).toBeCloseTo(960, 9)
  })
})
