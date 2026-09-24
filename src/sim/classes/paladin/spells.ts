// Paladin damage spells at level 60, as data (docs/classes/paladin.md).
//
// A seal's proc has its own id (`sealOfCommandProc`), so the breakdown's damage row and the seal's
// cast in "Cooldowns and buffs" (`sealOfCommand`) stay apart; both are named after the seal.
//
// Numbers are the Forever client's (src/data/client/spells.json, build 1.60.1.69913), written out
// here so the app bundle doesn't carry the client dataset; spells.test.ts checks each against it.
// A rank learned below 60 grows by its per-level points up to its max level, and a range is
// base × (1 ± variance/2) (paladin.md#conventions-used-below). These are the base spells: talents
// (Improved Seals, Sacred Arbiter, Iron Creed) are applied by `withSpellTalents` in talents.ts,
// and the Judgement of the Crusader rule by `withJotcRule` below.
import { CRIT_MULTIPLIER } from '../../core/formulas'
import type { SpellDef } from '../../plan/types'

/** A rank's base points at level 60: base + per level × (min(60, max level) − base level) (paladin.md#conventions-used-below). */
export const atLevel60 = (base: number, perLevel: number, baseLevel: number, maxLevel = Infinity) =>
  base + perLevel * (Math.min(60, maxLevel) - baseLevel)

/** A spell's damage range from its base points and variance: base × (1 ± variance / 2) (paladin.md#conventions-used-below). */
export const spread = (base: number, variance: number): [number, number] => [base * (1 - variance / 2), base * (1 + variance / 2)]

/**
 * What every paladin damage spell starts from: Holy, melee class (SpellCategories DefenseType 2),
 * the full special-attack table, crit ×2, triggering procs, no talents. JotC's share
 * (`takenScale`) is the spell's coefficient, the default rule
 * (paladin.md#seal-of-the-crusader-sotc-and-judgement-of-the-crusader-jotc).
 */
const HOLY_MELEE = {
  school: 'holy',
  defense: 'melee',
  noActiveDefense: false,
  alwaysHit: false,
  triggersProcs: true,
  min: 0,
  max: 0,
  weaponPercent: 0,
  normalized: false,
  critMultiplier: CRIT_MULTIPLIER.melee,
  bonusCrit: 0,
  damageMult: 1,
  threatMult: 1,
  threatBonus: 0,
} as const

/**
 * Seal of Command's proc (20424, paladin.md#seal-of-command-soc): `WEAPON_PERCENT_DAMAGE` 70% of a
 * main-hand swing (roll + flat weapon damage + AP/14 × base speed), Holy, and its 0.29 coefficient
 * inside the 70% [?] (OQ 2), so 0.203 × SP. Melee class without No Active Defense or Always Hit:
 * it rolls miss, dodge, parry, block and crit ×2 [?] (OQ 3). It carries NOT_A_PROC, so it
 * triggers procs.
 */
export const SEAL_OF_COMMAND_PROC: SpellDef = {
  ...HOLY_MELEE,
  id: 'sealOfCommandProc',
  name: 'Seal of Command',
  icon: 'ability_warrior_innerrage',
  weaponPercent: 0.7,
  spCoefficient: 0.7 * 0.29,
  takenScale: 0.7 * 0.29,
}

/**
 * Judgement of Command (20968 → 20966, paladin.md#seal-of-command-soc): 356 base points, variance
 * 0.0955, so 339–373, **halved** because raid bosses can't be stunned: 169.5–186.5; the 0.429
 * coefficient isn't halved [?] (OQ 7). Melee class with No Active Defense and Always Hit on 20966:
 * it can't miss, be dodged, parried or blocked, and crits ×2 (OQ 23).
 */
export const JUDGEMENT_OF_COMMAND: SpellDef = {
  ...HOLY_MELEE,
  id: 'judgementOfCommand',
  name: 'Judgement of Command',
  icon: 'ability_warrior_innerrage',
  noActiveDefense: true,
  alwaysHit: true,
  min: spread(356, 0.09550562)[0] / 2,
  max: spread(356, 0.09550562)[1] / 2,
  spCoefficient: 0.429,
  takenScale: 0.429,
}

/**
 * The seal value of Seal of Righteousness r8 (20293): 1786 + 47 per level from 58, per 100 s of
 * weapon speed, so 18.80 per second at 60 (paladin.md#seal-of-righteousness-sor).
 */
export const SEAL_OF_RIGHTEOUSNESS_VALUE = atLevel60(1786, 47, 58, 64) / 100

/**
 * Seal of Righteousness's proc per landed white hit (25713, paladin.md#seal-of-righteousness-sor):
 * `1.2 × v × speed` with a two-hander, `0.85 × v × speed` with a one-hander [?] (OQ 4), plus
 * 0.1 × SP. Melee class with No Active Defense and Always Hit: it can't be avoided, and crits ×2 [?].
 * It lacks NOT_A_PROC, so it triggers no procs: no Windfury, Crusader or Vengeance from it [?].
 */
export function sealOfRighteousnessProc(speedSec: number, twoHand: boolean): SpellDef {
  const damage = (twoHand ? 1.2 : 0.85) * SEAL_OF_RIGHTEOUSNESS_VALUE * speedSec
  return {
    ...HOLY_MELEE,
    id: 'sealOfRighteousnessProc',
    name: 'Seal of Righteousness',
    icon: 'ability_thunderbolt',
    noActiveDefense: true,
    alwaysHit: true,
    triggersProcs: false,
    min: damage,
    max: damage,
    spCoefficient: 0.1,
    takenScale: 0.1,
  }
}

/**
 * Judgement of Righteousness r8 (20286, paladin.md#seal-of-righteousness-sor): 170 base points,
 * variance 0.0941, + 4.1 per level from 58: 170.2–186.2 at 60, + 0.5 × SP. Melee class with No
 * Active Defense and no Always Hit: a melee miss, no dodge, parry or block; no weapon damage, so
 * a second roll for crit ×2 on a landed one [?] (combat-tables §3 "melee spells").
 */
export const JUDGEMENT_OF_RIGHTEOUSNESS: SpellDef = {
  ...HOLY_MELEE,
  id: 'judgementOfRighteousness',
  name: 'Judgement of Righteousness',
  icon: 'ability_thunderbolt',
  noActiveDefense: true,
  min: spread(170, 0.09411765)[0] + atLevel60(0, 4.1, 58, 64),
  max: spread(170, 0.09411765)[1] + atLevel60(0, 4.1, 58, 64),
  spCoefficient: 0.5,
  takenScale: 0.5,
}

/** Seal of Fury's proc base (20418 effect 0, paladin.md#seal-of-fury-sof-new-the-protection-seal): the tooltip's flat 35 [F]. */
export const SEAL_OF_FURY_BASE = 35

/**
 * The seal value of Seal of Fury r7 (20423 effect 0): 1607 + 42 per level from 58, per 100 s of
 * weapon speed, so 16.91 per second at 60 [F] data; the same structure as Seal of Righteousness's
 * (paladin.md#seal-of-fury-sof-new-the-protection-seal).
 */
export const SEAL_OF_FURY_VALUE = atLevel60(1607, 42, 58, 64) / 100

/**
 * Seal of Fury's proc per landed white hit (20418, paladin.md#seal-of-fury-sof-new-the-protection-seal):
 * the flat 35, plus its seal value by Seal of Righteousness's rule, `0.85 × 16.91 × speed` with a
 * one-hander and `1.2 × …` with a two-hander [?] (OQ 10, guild test T1; D29: the aura carries the
 * value, so it gets a default, the reading that fits the guild's benchmark), + 0.1 × SP. With the
 * default 1.5 s axe that's 35 + 21.56. With no main hand it's the flat 35. Melee class with No Active
 * Defense and Always Hit, and no NOT_A_PROC, like Seal of Righteousness's: it triggers no procs [?].
 */
export function sealOfFuryProc(mainHand: { speedSec: number; twoHand: boolean } | null): SpellDef {
  const value = mainHand ? (mainHand.twoHand ? 1.2 : 0.85) * SEAL_OF_FURY_VALUE * mainHand.speedSec : 0
  return {
    ...HOLY_MELEE,
    id: 'sealOfFuryProc',
    name: 'Seal of Fury',
    icon: 'spell_holy_retributionaura',
    noActiveDefense: true,
    alwaysHit: true,
    triggersProcs: false,
    min: SEAL_OF_FURY_BASE + value,
    max: SEAL_OF_FURY_BASE + value,
    spCoefficient: 0.1,
    takenScale: 0.1,
  }
}

/**
 * Judgement of Fury r7 (20414, paladin.md#seal-of-fury-sof-new-the-protection-seal): 153 base
 * points, variance 0.0876, + 3.69 per level from 58: 153.7–167.1 at 60, + 0.45 × SP. Melee class
 * with No Active Defense and no Always Hit, so it can miss, and like JoR rolls crit apart. Its 4 s
 * taunt comes with the Protection rotation.
 */
export const JUDGEMENT_OF_FURY: SpellDef = {
  ...HOLY_MELEE,
  id: 'judgementOfFury',
  name: 'Judgement of Fury',
  icon: 'spell_holy_retributionaura',
  noActiveDefense: true,
  min: spread(153, 0.087591)[0] + atLevel60(0, 3.69, 58, 64),
  max: spread(153, 0.087591)[1] + atLevel60(0, 3.69, 58, 64),
  spCoefficient: 0.45,
  takenScale: 0.45,
}

/**
 * Holy Strike r8 (10333, paladin.md#other-abilities): `NORMALIZED_WEAPON_DMG` + 93 (variance 0.25,
 * so 81.375–104.625), then `WEAPON_PERCENT_DAMAGE` 40%: 0.40 × (normalized main-hand damage +
 * 81…105) [?] (OQ 6), + 0.429 × SP. All Holy, so armor doesn't reduce it. A melee special with the
 * full table, crit ×2.
 */
export const HOLY_STRIKE: SpellDef = {
  ...HOLY_MELEE,
  id: 'holyStrike',
  name: 'Holy Strike',
  icon: 'classicon_paladin',
  weaponPercent: 0.4,
  normalized: true,
  min: spread(93, 0.25)[0],
  max: spread(93, 0.25)[1],
  spCoefficient: 0.429,
  takenScale: 0.429,
}

/**
 * Exorcism r6 (10314, paladin.md#other-abilities): 502 base points, variance 0.1086, so 474.7–529.3,
 * + 0.429 × SP. Magic class: spell hit, crit ×1.5. Undead and Demons only (the rotation's gate).
 */
export const EXORCISM: SpellDef = {
  ...HOLY_MELEE,
  id: 'exorcism',
  name: 'Exorcism',
  icon: 'spell_holy_excorcism_02',
  defense: 'magic',
  critMultiplier: CRIT_MULTIPLIER.spell,
  min: spread(502, 0.10861423)[0],
  max: spread(502, 0.10861423)[1],
  spCoefficient: 0.429,
  takenScale: 0.429,
}

/**
 * Hammer of Wrath r3 (24239, paladin.md#other-abilities): 498 base points, variance 0.0981, so
 * 473.6–522.4, + 0.429 × SP. Ranged class (DefenseType 3): miss, block from the front, then a crit
 * roll at melee crit, ×2 [?] (combat-tables §3 "Defense type").
 */
export const HAMMER_OF_WRATH: SpellDef = {
  ...HOLY_MELEE,
  id: 'hammerOfWrath',
  name: 'Hammer of Wrath',
  icon: 'ability_thunderclap',
  defense: 'ranged',
  min: spread(498, 0.09811321)[0],
  max: spread(498, 0.09811321)[1],
  spCoefficient: 0.429,
  takenScale: 0.429,
}

/**
 * One tick of Consecration r5 on a single target (1280349, paladin.md#other-abilities): 12 Holy to
 * every enemy plus 27 + 0.095 × SP to the first four, so 39 + 0.095 × SP. Magic class; each tick
 * rolls spell hit and crit [?] (OQ 18), crit ×1.5. A tick is triggered by the aura and lacks
 * NOT_A_PROC, so it triggers no procs [?].
 */
export const CONSECRATION_TICK: SpellDef = {
  ...HOLY_MELEE,
  id: 'consecration',
  name: 'Consecration',
  icon: 'spell_holy_innerfire',
  defense: 'magic',
  triggersProcs: false,
  critMultiplier: CRIT_MULTIPLIER.spell,
  min: 12 + 27,
  max: 12 + 27,
  spCoefficient: 0.095,
  takenScale: 0.095,
}

/**
 * One tick of Consecration r1 on a single target (1280345, paladin.md#other-abilities): 2 + 4, and
 * the full 0.095 coefficient that every Forever rank carries.
 */
export const CONSECRATION_RANK1_TICK: SpellDef = {
  ...CONSECRATION_TICK,
  id: 'consecrationRank1',
  name: 'Consecration (Rank 1)',
  min: 2 + 4,
  max: 2 + 4,
}

/**
 * How much of the target's flat Holy damage taken (Judgement of the Crusader's +161) a Holy hit gets
 * (paladin.md#seal-of-the-crusader-sotc-and-judgement-of-the-crusader-jotc, OQ 5): `coefficient`,
 * the default, scales it by the hit's own spell damage coefficient; `flat` gives melee-class hits
 * all of it, and other hits their coefficient's share.
 */
export type JotcRule = 'coefficient' | 'flat'

export function withJotcRule(spell: SpellDef, rule: JotcRule): SpellDef {
  if (rule === 'coefficient' || spell.defense !== 'melee') return spell
  return { ...spell, takenScale: 1 }
}
