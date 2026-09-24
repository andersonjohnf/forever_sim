// Paladin abilities as data (docs/classes/paladin.md "Seals", "Judgement", "Other abilities").
//
// Numbers are the Forever client's (src/data/client/spells.json, build 1.60.1.69913), checked by
// abilities.test.ts. These are the base rows; the build's talents (Benediction, Holy Conduit,
// Improved Judgement, Improved Holy Strike, Purifying Power, Instrument of Law, Sanctified
// Judgement and the spell talents) are applied by `withTalents` in talents.ts. Seals are `cast`s
// that put their aura up, one seal at a time; each damage seal procs from landed main-hand auto
// attacks while its aura is up (`sealProcs`). Each seal has its own judgement row, usable while
// its seal is up, and all of them share Judgement's cooldown (category `judgement`); the seal stays
// up, as Forever's Judgement doesn't consume it.
import { GCD_MS } from '../../core/formulas'
import type { AuraSpec, ProcSpec } from '../../effects/types'
import { type AbilityDef, STANCE_ANY, type SpellDef } from '../../plan/types'
import {
  CONSECRATION_RANK1_TICK,
  CONSECRATION_TICK,
  EXORCISM,
  HAMMER_OF_WRATH,
  hammerOfTheRighteous,
  HOLY_STRIKE,
  JUDGEMENT_OF_COMMAND,
  JUDGEMENT_OF_FURY,
  JUDGEMENT_OF_RIGHTEOUSNESS,
  SEAL_OF_COMMAND_PROC,
  sealOfFuryProc,
  sealOfRighteousnessProc,
} from './spells'

const DOC = 'docs/classes/paladin.md'

/** Base mana at level 60 (paladin.md#mana-model; character-stats.md#other-base-values-at-level-60) [F]. */
export const PALADIN_BASE_MANA = 1512

/** A cost of a percentage of base mana, rounded down (paladin.md#conventions-used-below: 6% → 90). */
export const pctOfBaseMana = (pct: number) => Math.floor((PALADIN_BASE_MANA * pct) / 100)

/** A mana cost as a row's `costTenths` (paid from mana: `resource: 'mana'`, in tenths). */
const mana = (cost: number) => ({ costTenths: 10 * cost })

/** A row's mana cost in whole mana. */
export const manaCostOf = (def: { costTenths: number }) => def.costTenths / 10

/**
 * The fields of a paladin ability that the warrior's abilities use and it doesn't: no rage, no
 * stance, no weapon strike of its own (its spell does the rolling), no bleed, no refund.
 */
export const PALADIN = {
  resource: 'mana',
  costTenths: 0,
  cooldownMs: 0,
  gcdMs: GCD_MS,
  castMs: 0,
  castStopsSwings: false,
  twoHandOnly: false,
  unavoidable: false,
  stances: STANCE_ANY,
  executePhaseOnly: false,
  weaponPercent: 0,
  normalized: false,
  flatDamage: 0,
  apCoefficient: 0,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: 2,
  refundShare: 0,
  threatMult: 0,
  threatBonus: 0,
  offHand: false,
  dotTickDamage: 0,
  dotTicks: 0,
  dotTickMs: 0,
  periodicCanCrit: false,
  rageTenths: 0,
  rageSpreadTenths: 0,
  rageTickTenths: 0,
  rageTicks: 0,
  rageTickMs: 0,
  usesPerFight: 0,
  aura: null,
} as const

// --- Seals (paladin.md#seals) ------------------------------------------------------------------

/** Seals exclude each other: one seal per paladin (paladin.md#seals). */
export const SEAL_GROUP = 'seal'

/** Every seal lasts 30 s [F]; recasting one refreshes it (paladin.md#seals). */
export const SEAL_DURATION_MS = 30000

const sealAura = (id: string, name: string, mods: AuraSpec['mods'] = {}): AuraSpec => ({
  id,
  name,
  durationMs: SEAL_DURATION_MS,
  group: SEAL_GROUP,
  mods,
})

/** A seal: a `cast` on the GCD that puts its aura up and ends any other seal (paladin.md#seals). */
const seal = (id: string, name: string, icon: string, manaCost: number, mods?: AuraSpec['mods']): AbilityDef => ({
  ...PALADIN,
  id,
  name,
  icon,
  kind: 'cast',
  ...mana(manaCost),
  aura: sealAura(id, name, mods),
})

/** Seal of Command r5 (20920): 210 mana, GCD 1.5 s, 30 s (paladin.md#seal-of-command-soc). */
export const SEAL_OF_COMMAND = seal('sealOfCommand', 'Seal of Command', 'ability_warrior_innerrage', 210)

/** Seal of Righteousness r8 (20293): 200 mana (paladin.md#seal-of-righteousness-sor). */
export const SEAL_OF_RIGHTEOUSNESS = seal('sealOfRighteousness', 'Seal of Righteousness', 'ability_thunderbolt', 200)

/** Seal of Fury r7 (20423): 200 mana (paladin.md#seal-of-fury-sof-new-the-protection-seal). */
export const SEAL_OF_FURY = seal('sealOfFury', 'Seal of Fury', 'spell_holy_retributionaura', 200)

/**
 * Seal of the Crusader r6 (20308): 160 mana; +306 + 2.4 per level from 52 = 325 AP at 60 [?]
 * (OQ 17), +40% attack speed, and "less damage with each attack", which the sim reads as each swing
 * ÷ 1.4 [?] (paladin.md#seal-of-the-crusader-sotc-and-judgement-of-the-crusader-jotc).
 */
export const SEAL_OF_THE_CRUSADER_AP = 306 + 2.4 * (60 - 52)
export const SEAL_OF_THE_CRUSADER = seal('sealOfTheCrusader', 'Seal of the Crusader', 'spell_holy_holysmite', 160, {
  ap: SEAL_OF_THE_CRUSADER_AP,
  haste: 40,
  damage: (1 / 1.4 - 1) * 100,
})

/** Each seal's base mana cost, which Sanctified Judgement returns a share of (paladin.md#judgement). */
export const SEAL_BASE_COST: Readonly<Record<string, number>> = Object.fromEntries(
  [SEAL_OF_COMMAND, SEAL_OF_RIGHTEOUSNESS, SEAL_OF_FURY, SEAL_OF_THE_CRUSADER].map((s) => [s.id, manaCostOf(s)]),
)

/**
 * The damage seals' procs on landed main-hand auto attacks, white swings and extra attacks alike,
 * not specials (`ProcTypeMask 0x4`, paladin.md#seals), each only while its seal is up. They fire
 * after the swing's own procs (paladin.md#implementation-notes). Seal of Command: 7 PPM from the
 * base weapon speed [C] (OQ 1), a 1 s internal cooldown [F]. Seal of Righteousness and Seal of
 * Fury: every landed swing. `mainHand` is the main-hand weapon's base speed and whether it's a
 * two-hander (Seal of Righteousness and Seal of Fury's seal value scale with them).
 */
export function sealProcs(
  mainHand: { speedSec: number; twoHand: boolean } | null,
  spells: (s: SpellDef) => SpellDef = (s) => s,
): ProcSpec[] {
  const proc = (seal: AbilityDef, spell: SpellDef, chance: ProcSpec['chance'], icdMs = 0): ProcSpec => ({
    id: `${seal.id}Proc`,
    name: seal.name,
    icon: seal.icon,
    trigger: 'whiteResolved',
    from: 'mainHand',
    chance,
    icdMs,
    action: { kind: 'spell', spell: spells(spell) },
    requiresAura: seal.id,
    docRef: `${DOC}#seals`,
  })
  const procs = [proc(SEAL_OF_COMMAND, SEAL_OF_COMMAND_PROC, { ppm: 7 }, 1000), proc(SEAL_OF_FURY, sealOfFuryProc(mainHand), { pct: 100 })]
  if (mainHand) procs.push(proc(SEAL_OF_RIGHTEOUSNESS, sealOfRighteousnessProc(mainHand.speedSec, mainHand.twoHand), { pct: 100 }))
  return procs
}

// --- Judgement (paladin.md#judgement) ----------------------------------------------------------

/** The judgements share one cooldown (paladin.md#judgement). */
export const JUDGEMENT_CATEGORY = 'judgement'

/**
 * Judgement (20271): 6% of base mana = 90, a 10 s cooldown, no GCD (`StartRecoveryTime` 0); it
 * needs an active seal and doesn't consume it (paladin.md#judgement). Each seal's judgement is its
 * own row, so the breakdown names it.
 */
const JUDGEMENT = {
  ...PALADIN,
  gcdMs: 0,
  cooldownMs: 10000,
  ...mana(pctOfBaseMana(6)),
  category: JUDGEMENT_CATEGORY,
} as const

/** Judging Seal of Command: Judgement of Command's damage (paladin.md#seal-of-command-soc). */
export const JUDGE_COMMAND: AbilityDef = {
  ...JUDGEMENT,
  id: 'judgementOfCommand',
  name: 'Judgement of Command',
  icon: 'spell_holy_righteousfury',
  kind: 'spell',
  spellDef: JUDGEMENT_OF_COMMAND,
}

/** Judging Seal of Righteousness (paladin.md#seal-of-righteousness-sor). */
export const JUDGE_RIGHTEOUSNESS: AbilityDef = {
  ...JUDGEMENT,
  id: 'judgementOfRighteousness',
  name: 'Judgement of Righteousness',
  icon: 'spell_holy_righteousfury',
  kind: 'spell',
  spellDef: JUDGEMENT_OF_RIGHTEOUSNESS,
}

/** Judging Seal of Fury (paladin.md#seal-of-fury-sof-new-the-protection-seal); its taunt comes with the Protection rotation. */
export const JUDGE_FURY: AbilityDef = {
  ...JUDGEMENT,
  id: 'judgementOfFury',
  name: 'Judgement of Fury',
  icon: 'spell_holy_righteousfury',
  kind: 'spell',
  spellDef: JUDGEMENT_OF_FURY,
}

/** Judgement debuffs exclude each other: one per paladin on the target (paladin.md#implementation-notes). */
export const JUDGEMENT_DEBUFF_GROUP = 'judgementDebuff'

/**
 * Judgement of the Crusader r6 (20303): the target takes +161 Holy damage (`MOD_DAMAGE_TAKEN`, Holy)
 * for 40 s; it always hits [F] (paladin.md#seal-of-the-crusader-sotc-and-judgement-of-the-crusader-jotc).
 * Your landed main-hand auto attacks refresh it (`JOTC_REFRESH`).
 */
export const JUDGEMENT_OF_THE_CRUSADER_AURA: AuraSpec = {
  id: 'judgementOfTheCrusader',
  name: 'Judgement of the Crusader',
  durationMs: 40000,
  group: JUDGEMENT_DEBUFF_GROUP,
  mods: { holyTaken: 161 },
}

/** Judging Seal of the Crusader: puts Judgement of the Crusader on the target; it always lands. */
export const JUDGE_CRUSADER: AbilityDef = {
  ...JUDGEMENT,
  id: 'judgementOfTheCrusader',
  name: 'Judgement of the Crusader',
  icon: 'spell_holy_holysmite',
  kind: 'cast',
  aura: JUDGEMENT_OF_THE_CRUSADER_AURA,
}

/**
 * Your melee strikes refresh your Judgement of the Crusader (paladin.md#seal-of-the-crusader-sotc-and-judgement-of-the-crusader-jotc):
 * each landed main-hand auto attack restarts its 40 s while it's up. (Holy Strike with Sacred
 * Arbiter refreshes it too; that comes with Holy Strike's rotation row.)
 */
export const JOTC_REFRESH: ProcSpec = {
  id: 'judgementOfTheCrusaderRefresh',
  name: 'Judgement of the Crusader',
  icon: 'spell_holy_holysmite',
  trigger: 'whiteResolved',
  from: 'mainHand',
  chance: { pct: 100 },
  action: { kind: 'aura', aura: JUDGEMENT_OF_THE_CRUSADER_AURA },
  requiresAura: JUDGEMENT_OF_THE_CRUSADER_AURA.id,
  docRef: `${DOC}#seal-of-the-crusader-sotc-and-judgement-of-the-crusader-jotc`,
}

/** Each seal's judgement row (paladin.md#judgement). */
export const JUDGEMENT_OF: Readonly<Record<string, AbilityDef>> = {
  sealOfCommand: JUDGE_COMMAND,
  sealOfRighteousness: JUDGE_RIGHTEOUSNESS,
  sealOfFury: JUDGE_FURY,
  sealOfTheCrusader: JUDGE_CRUSADER,
}

// --- Other abilities (paladin.md#other-abilities) ----------------------------------------------

/**
 * Holy Strike r8 (10333): 20 mana, 12 s (category 2404, shared with Hammer of the Righteous), GCD
 * 1.5 s. It doesn't proc the damage seals (paladin.md#other-abilities).
 */
export const HOLY_STRIKE_CATEGORY = 'holyStrike'
export const HOLY_STRIKE_ABILITY: AbilityDef = {
  ...PALADIN,
  id: 'holyStrike',
  name: 'Holy Strike',
  icon: 'classicon_paladin',
  kind: 'spell',
  ...mana(20),
  cooldownMs: 12000,
  category: HOLY_STRIKE_CATEGORY,
  spellDef: HOLY_STRIKE,
}

/**
 * Hammer of the Righteous (407632, trained at 40): 6% of base mana (90), a 6 s cooldown in category
 * 2404, shared with Holy Strike, GCD 1.5 s; it needs a one-handed axe, mace or sword [F] [client]
 * (SpellPower, SpellCooldowns, SpellCategories, SpellEquippedItems subclass mask 145, 1.60.1.69913).
 * Casting it holds Holy Strike for 6 s, and Holy Strike holds it for Holy Strike's 10 to 12
 * (paladin.md#other-abilities). It doesn't proc the damage seals.
 */
export const hammerOfTheRighteousAbility = (withAttackPower = true): AbilityDef => ({
  ...PALADIN,
  id: 'hammerOfTheRighteous',
  name: 'Hammer of the Righteous',
  icon: 'ability_paladin_hammeroftherighteous',
  kind: 'spell',
  ...mana(pctOfBaseMana(6)),
  cooldownMs: 6000,
  category: HOLY_STRIKE_CATEGORY,
  spellDef: hammerOfTheRighteous(withAttackPower),
})

/** The weapons Hammer of the Righteous needs: one-handed axes, maces and swords (407632's subclass mask 145). */
export const HAMMER_OF_THE_RIGHTEOUS_WEAPONS = ['axe', 'mace', 'sword'] as const

/** Exorcism r6 (10314): 345 mana, 15 s, GCD 1.5 s; Undead and Demons only (paladin.md#other-abilities). */
export const EXORCISM_ABILITY: AbilityDef = {
  ...PALADIN,
  id: 'exorcism',
  name: 'Exorcism',
  icon: 'spell_holy_excorcism_02',
  kind: 'spell',
  ...mana(345),
  cooldownMs: 15000,
  spellDef: EXORCISM,
}

/**
 * Hammer of Wrath r3 (24239): 425 mana, 6 s, a 1.0 s cast and a 1.0 s GCD; only at or below 20%
 * target health, the execute phase (paladin.md#other-abilities; encounter §3). The cast stops your
 * auto attacks, which restart from full when it ends, as Slam's do (damage-and-timing §3.3 "Other
 * casts with a cast time"), and holds everything else, the off-GCD Judgement too [?] (OQ 22). The
 * default Retribution build's Instrument of Law 2/2 makes it instant; the default Protection build
 * casts it in 1 s.
 */
export const HAMMER_OF_WRATH_ABILITY: AbilityDef = {
  ...PALADIN,
  id: 'hammerOfWrath',
  name: 'Hammer of Wrath',
  icon: 'ability_thunderclap',
  kind: 'spell',
  ...mana(425),
  cooldownMs: 6000,
  gcdMs: 1000,
  castMs: 1000,
  castStopsSwings: true,
  castHoldsOffGcd: true,
  executePhaseOnly: true,
  spellDef: HAMMER_OF_WRATH,
}

/** Consecration's ranks share its cooldown, as every rank of one spell does [C]. */
export const CONSECRATION_CATEGORY = 'consecration'

/**
 * Consecration r5 (20924): 565 mana, 8 s cooldown, GCD 1.5 s; a tick every second for 8 s
 * (paladin.md#other-abilities). Rank 1 (26573, ticks 1280345): 135 mana, the same timing and the
 * same cooldown, so one rank or the other goes down every 8 s at most.
 */
const consecration = (id: string, name: string, manaCost: number, tick: SpellDef): AbilityDef => ({
  ...PALADIN,
  id,
  name,
  icon: 'spell_holy_innerfire',
  kind: 'spell',
  ...mana(manaCost),
  cooldownMs: 8000,
  category: CONSECRATION_CATEGORY,
  rageTicks: 8,
  rageTickMs: 1000,
  tickSpellDef: tick,
})
export const CONSECRATION = consecration('consecration', 'Consecration', 565, CONSECRATION_TICK)
export const CONSECRATION_RANK1 = consecration('consecrationRank1', 'Consecration (Rank 1)', 135, CONSECRATION_RANK1_TICK)
