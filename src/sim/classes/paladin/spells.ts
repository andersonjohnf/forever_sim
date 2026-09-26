// Paladin damage spells at level 60, as data (docs/classes/paladin.md).
//
// A seal's proc has its own id (`sealOfCommandProc`), so the breakdown's damage row and the seal's
// cast in "Cooldowns and buffs" (`sealOfCommand`) stay apart; both are named after the seal.
//
// Numbers are the Forever client's (src/data/client/spells.json, build 1.60.1.69913), written out
// here so the app bundle doesn't carry the client dataset; spells.test.ts checks each against it.
// A rank learned below 60 grows by its per-level points up to its max level, truncated to a whole
// number (docs/data/items.md#per-level-values), and a range is
// base × (1 ± variance/2) (paladin.md#conventions-used-below). These are the base spells: talents
// (Improved Seals, Sacred Arbiter, Iron Creed) are applied by `withSpellTalents` in talents.ts,
// JotC's share (`takenScale`) is measured (paladin.md#seal-of-the-crusader-sotc-and-judgement-of-the-crusader-jotc).
import { CRIT_MULTIPLIER } from '../../core/formulas'
import type { AuraSpec } from '../../effects/types'
import type { SpellDef } from '../../plan/types'

/**
 * A rank's base points at level 60: base + trunc(per level × levels), counting levels from the
 * spell's level up to min(60, max level) and never below 0. The per-level term is truncated toward
 * zero to a whole number, the datasets' rendering, by the same rule
 * (docs/data/items.md#per-level-values; paladin.md#conventions-used-below): Frostbolt r10's
 * 2.9 × 4 = 11.6 adds 11. How the client itself rounds it is [?] (docs/open-questions.md B74).
 */
export const atLevel60 = (base: number, perLevel: number, baseLevel: number, maxLevel = Infinity) =>
  base + Math.trunc(perLevel * Math.max(0, Math.min(60, maxLevel) - baseLevel))

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
  // JotC's share is the whole 0.29, outside the 70%, as Holy Strike's measured 0.429 is outside its 50%.
  takenScale: 0.29,
}

/**
 * Judgement of Command (20968 → 20966, paladin.md#seal-of-command-soc): 356 base points, variance
 * 0.0955, so 339–373, **halved** because raid bosses can't be stunned: 169.5–186.5; the 0.429
 * coefficient isn't halved [?] (OQ 7). Melee class with No Active Defense: it can't be dodged, parried
 * or blocked. The damage spell 20966 carries Always Hit, but the dummy 20968 that casts it doesn't, and
 * the beta logs show the dummy missing (10 of 43, OQ 23): so it rolls the melee miss, then crit ×2 on a
 * landed one, as Judgement of Righteousness does [?].
 */
export const JUDGEMENT_OF_COMMAND: SpellDef = {
  ...HOLY_MELEE,
  id: 'judgementOfCommand',
  name: 'Judgement of Command',
  icon: 'ability_warrior_innerrage',
  noActiveDefense: true,
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
 * Seal of Righteousness's spell damage coefficient per proc at rank 8 (paladin.md#the-beta-logs-seal-of-righteousness):
 * 0.1, the proc's (25713) 0.1 plus the rank-8 aura's weapon-speed dummy's 0 (20293 effect 0) [F] client.
 * The beta logs' 0.2 at ranks 1–4 is the same sum there: the proc's 0.1 plus that rank's dummy's 0.1
 * (20154, 20287, 20288, 20289; ranks 5–7 carry it too), which rank 8's dummy doesn't have [?] (OQ 4).
 * Its share of Judgement of the Crusader's bonus is the proc's 0.1, as measured
 * (paladin.md#seal-of-the-crusader-sotc-and-judgement-of-the-crusader-jotc).
 */
export const SEAL_OF_RIGHTEOUSNESS_SP = 0.1

/**
 * Seal of Righteousness's proc per landed white hit (25713, paladin.md#seal-of-righteousness-sor): the
 * seal value, `1.2 × v × speed` with a two-hander and `0.85 × v × speed` with a one-hander (Classic
 * Era's rule, and what the beta logs show at ranks 1–4), + 0.1 × SP at rank 8 [?]. The proc's own base points (35
 * at rank 8) aren't added: at ranks 1–4 their 4 to 9 fit 23 of 727 procs where the seal value alone fits
 * 587 (the beta logs). Melee class with No Active Defense and Always Hit: it can't be avoided, and crits
 * ×2 [?]. It lacks NOT_A_PROC, so it triggers no procs, no Windfury or Crusader, but its crit gives
 * Vengeance a stack: Vengeance's aura can proc from procs (Attr3 0x4000000, paladin.md#retribution-tree) [?].
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
    spCoefficient: SEAL_OF_RIGHTEOUSNESS_SP,
    takenScale: 0.1,
  }
}

/**
 * Judgement of Righteousness r8 (20286, paladin.md#seal-of-righteousness-sor): 170 base points,
 * variance 0.0941, + trunc(4.1 per level from 58) = 8: 170–186 at 60, + 0.5 × SP. Melee class with No
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

/**
 * Seal of Fury's proc base (20418 effect 0, paladin.md#seal-of-fury-sof-new-the-protection-seal): the
 * tooltip's flat 35 [F], all of its damage but its 0.1 × SP. Measured in the beta logs: every one of 179
 * non-crit procs from 24 characters is floor(base points + 0.1 × SP), after swings of 1.1 to 4.5 s.
 */
export const SEAL_OF_FURY_BASE = 35

/**
 * Seal of Fury's absorb, Light's Fury (1310927, paladin.md#the-beta-logs-lights-fury): with a shield
 * equipped, each landed proc shields you for half the Holy damage it dealt (20423 effect 1, 50) [F], an
 * absorb of every school (aura 69, misc 127) that lasts 10 s (DurationIndex 1) [F] client. Hits you take
 * spend it before they cost health; it ends when spent or after its 10 s. Each proc replaces it, what's
 * left of the last one lost, never added to: measured (the beta logs: 214 of 224 absorbs are half the
 * last proc, crits included, and none fits a sum). Improved Seal of Fury restores mana when a hit uses
 * it up (talents.ts), with that hit, as the logs show.
 */
export const SEAL_OF_FURY_SHIELD_AURA: AuraSpec = {
  id: 'sealOfFuryShield',
  name: 'Light’s Fury',
  durationMs: 10000,
  absorb: true,
  mods: {},
}

/** The absorb's share of the proc's Holy damage, % (20423 effect 1: 50) [F], and measured (the beta logs). */
export const SEAL_OF_FURY_ABSORB_PCT = 50

/**
 * Seal of Fury's proc per landed white hit (20418, paladin.md#seal-of-fury-sof-new-the-protection-seal):
 * a flat 35 + 0.1 × SP, whatever the weapon: client data, and measured (the beta logs). The aura's
 * weapon-speed dummy (1607 + 42/level) is undescribed, so it models as zero. With `shield`, it puts up
 * the absorb. Melee class with No Active Defense and Always Hit, and no NOT_A_PROC, like Seal of
 * Righteousness's: it triggers no procs but Vengeance, which can proc from procs [?].
 */
export function sealOfFuryProc(shield = false): SpellDef {
  return {
    ...HOLY_MELEE,
    id: 'sealOfFuryProc',
    name: 'Seal of Fury',
    icon: 'spell_holy_retributionaura',
    noActiveDefense: true,
    alwaysHit: true,
    triggersProcs: false,
    min: SEAL_OF_FURY_BASE,
    max: SEAL_OF_FURY_BASE,
    spCoefficient: 0.1,
    takenScale: 0.1,
    ...(shield ? { absorb: { aura: SEAL_OF_FURY_SHIELD_AURA, pct: SEAL_OF_FURY_ABSORB_PCT } } : {}),
  }
}

/**
 * Judgement of Fury r7 (20414, paladin.md#seal-of-fury-sof-new-the-protection-seal): 153 base
 * points, variance 0.0876, + trunc(3.69 per level from 58) = 7: 153.3–166.7 at 60, + 0.45 × SP. Melee class
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
 * so 81.375–104.625) and `WEAPON_PERCENT_DAMAGE` 50% (40% before 1.60.1.70009) [F] [client]
 * (SpellEffect, 1.60.1.70009). The flat part and the 0.429 × SP are inside the 50%, as the beta logs
 * show (356 hits from 44 characters, paladin.md#the-beta-logs-holy-strike): 0.50 × (normalized
 * main-hand damage + 81…105 + 0.429 × SP), so 0.2145 × SP. The tooltip prints the flat part's raw
 * base points ("plus an additional 81 to 105"). Its share of Judgement of the Crusader's bonus is the
 * full 0.429, outside the 50%, as measured. All Holy, so armor doesn't reduce it. A melee special with
 * the full table, crit ×2. Its third effect (77, a script) is Sacred Arbiter's refresh of your
 * judgements, with no damage or threat of its own (paladin.md#other-abilities).
 */
export const HOLY_STRIKE: SpellDef = {
  ...HOLY_MELEE,
  id: 'holyStrike',
  name: 'Holy Strike',
  icon: 'classicon_paladin',
  weaponPercent: 0.5,
  normalized: true,
  min: spread(93, 0.25)[0],
  max: spread(93, 0.25)[1],
  spCoefficient: 0.5 * 0.429,
  takenScale: 0.429,
}

/**
 * Hammer of the Righteous (407632, paladin.md#other-abilities): "Holy damage ... equal to 3 times the
 * damage per second of your main hand weapon" (effect 2's 3; effect 0 is the damage, a script), Holy,
 * no spell damage coefficient in the data. Melee class with neither No Active Defense nor Always Hit:
 * the full special table, crit ×2, and like the other melee-class spells without a weapon share it
 * rolls to hit and then to crit [?]. Whether the weapon's DPS counts attack power is OQ 11's [?]: by
 * default it doesn't, the tooltip's reading, the damage per second of the weapon itself; Character →
 * Advanced counts it (`hotrWeaponDps`), the DPS a character sheet shows. No log or allowed source says
 * which (the beta logs stop below level 40, where it's trained). Its effect 1 (120, 3 chain targets) is the extra
 * targets' part, left out on one target (M6). A cast spell, so it triggers procs; not the seals'.
 */
export function hammerOfTheRighteous(withAttackPower = false): SpellDef {
  return {
    ...HOLY_MELEE,
    id: 'hammerOfTheRighteous',
    name: 'Hammer of the Righteous',
    icon: 'ability_paladin_hammeroftherighteous',
    weaponDps: 3,
    weaponDpsAp: withAttackPower,
    spCoefficient: 0,
    takenScale: 0,
  }
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

