// What every feral druid has, as data (docs/classes/druid.md §2.4–§2.8): Energy and its tick,
// combo points, Omen of Clarity and Clearcasting, the shapeshifts and their mana, and Furor. Cat
// and bear abilities (Shred, Rip, Maul, …) build on these rows with the fields plan/types.ts
// AbilityPlan documents (`resource`, `forms`, `comboPoints`, `finisher`, `clearcastable`).
//
// Numbers are the Forever client's (src/data/client/spells.json, build 1.60.1.69913), with the
// doc value as fallback, written out here so the app bundle doesn't carry the client dataset;
// abilities.test.ts checks them against it. Pools are in tenths, times in ms.
import { CRIT_MULTIPLIER, GCD_MS } from '../../core/formulas'
import type { AuraSpec, DruidForm, ProcSpec } from '../../effects/types'
import { type AbilityDef, STANCE_ANY } from '../../plan/types'
import { FORM_ICON, FORM_INDEX, FORM_NAME } from './forms'

export type { AbilityDef } from '../../plan/types'

const DOC = 'docs/classes/druid.md'

// --- Energy (druid.md §2.4) -------------------------------------------------------------------

/** 20 Energy per power tick, every 2 s: 10 a second [C] (druid.md §2.4; the 20.2 per 2.02 s refinement is Q6 [?]). */
export const ENERGY_PER_TICK_TENTHS = 200
/** The Energy cap, 100 [?] (druid.md §2.4, Q29). */
export const MAX_ENERGY_TENTHS = 1000
/** Energy at the pull: full [?] (druid.md §2.4). */
export const START_ENERGY_TENTHS = 1000

// --- Combo points (druid.md §2.5) ---------------------------------------------------------------

/** At most 5 combo points [C] (druid.md §2.5). */
export const MAX_COMBO_POINTS = 5

/** Blood Frenzy's (Primal Fury's until 1.60.1.70009) chance of an extra combo point on a builder's non-periodic crit, per rank: 50% (100% at 2/2) [F] (druid.md §2.5, §5.1). */
export const PRIMAL_FURY_CP_CHANCE_PER_RANK = 0.5

// --- Omen of Clarity and Clearcasting (druid.md §2.7) -------------------------------------------

/**
 * Clearcasting (16870): the next ability with a cost costs nothing, one charge, for 15 s
 * (`DurationIndex` 8) [F] (druid.md §2.7). The plan's `freeCastAura`.
 */
export const CLEARCASTING: AuraSpec = { id: 'clearcasting', name: 'Clearcasting', durationMs: 15000, mods: {} }

/** Omen of Clarity's rate, 2 procs per minute [?]: only a secondary source gives it (druid.md §2.7, Q4). */
export const OMEN_OF_CLARITY_PPM = 2

/** Omen of Clarity's internal cooldown, `ProcCategoryRecovery` 10000 on 16864 [F] [C] (druid.md §2.7). */
export const OMEN_OF_CLARITY_ICD_MS = 10000

/**
 * Omen of Clarity (16864): trained at 20, so every druid has it in Forever. A landed melee attack,
 * white or special, procs Clearcasting at 2 PPM from the form's swing speed (3.33% in cat, 8.33% in
 * bear [?]), at most once per 10 s [F] (druid.md §2.7, W10).
 */
export const OMEN_OF_CLARITY: ProcSpec = {
  id: 'omenOfClarity',
  name: 'Omen of Clarity',
  icon: 'spell_nature_crystalball',
  trigger: 'meleeLanded',
  from: 'any',
  chance: { ppm: OMEN_OF_CLARITY_PPM },
  icdMs: OMEN_OF_CLARITY_ICD_MS,
  action: { kind: 'aura', aura: CLEARCASTING },
  docRef: `${DOC}#27-omen-of-clarity-and-clearcasting`,
}

// --- Shapeshifting, Furor and mana (druid.md §2.8) ------------------------------------------------

/** Base mana at level 60, 1,244 [F] (character-stats.md#other-base-values-at-level-60, `PlayerExpectedStat`). */
export const DRUID_BASE_MANA = 1244

/** Cat Form (768) and Dire Bear Form (9634) cost 55% of base mana (`PowerCostPct`) [F] (druid.md §2.8). */
export const SHAPESHIFT_COST_PCT = 55

/** Natural Shapeshifter: −10% shapeshift mana per rank [F] (druid.md §2.8, §5.2). */
export const NATURAL_SHAPESHIFTER_PCT_PER_RANK = 10

/**
 * A shapeshift's mana, in whole mana: 55% of base mana × (1 − 10% per Natural Shapeshifter rank),
 * rounded down [?] (druid.md §2.8): 684 untalented, 478 at 3/3.
 */
export const shapeshiftMana = (naturalShapeshifterRank: number) =>
  Math.floor((((DRUID_BASE_MANA * SHAPESHIFT_COST_PCT) / 100) * (100 - NATURAL_SHAPESHIFTER_PCT_PER_RANK * naturalShapeshifterRank)) / 100 + 1e-9)

/** Furor on entering Cat Form (druid.md §2.8): the reference formula is core/formulas.ts `furorCatEnergyTenths`. */
export { furorCatEnergyTenths } from '../../core/formulas'

/** Furor on entering bear: 20% per rank of 10 rage (17057: energize 100), after rage is set to 0 [F] (rage.md#bear-druid-rage). */
export const FUROR_BEAR_RAGE_TENTHS = 100
export const FUROR_BEAR_CHANCE_PER_RANK = 0.2

/**
 * Spirit regeneration per 2 s power tick outside the five-second rule, and the rule itself (druid.md
 * §2.8): the paladin's too, so core/formulas.ts holds them (character-stats.md#spirit-and-mana-regeneration).
 */
export { FIVE_SECOND_RULE_MS, spiritRegenTickTenths } from '../../core/formulas'

/** The fields of a row that rolls nothing and deals nothing (a shapeshift, a cast). */
export const NO_STRIKE = {
  executePhaseOnly: false,
  weaponPercent: 0,
  normalized: false,
  flatDamage: 0,
  apCoefficient: 0,
  damagePerExtraRage: 0,
  bonusCrit: 0,
  critMultiplier: CRIT_MULTIPLIER.melee,
  refundShare: 0,
  threatMult: 0,
  threatBonus: 0,
  offHand: false,
  castMs: 0,
  castStopsSwings: false,
  twoHandOnly: false,
  unavoidable: false,
  dotTickDamage: 0,
  dotTicks: 0,
  dotTickMs: 0,
  periodicCanCrit: false,
  aura: null,
  rageTenths: 0,
  rageSpreadTenths: 0,
  rageTickTenths: 0,
  rageTicks: 0,
  rageTickMs: 0,
  usesPerFight: 0,
} as const

/** Spell ids of the shapeshifts at level 60 (druid.md §2.8). */
export const SHAPESHIFT_SPELL = { cat: 768, bear: 9634 } as const

/**
 * A shapeshift into Cat Form (768) or Dire Bear Form (9634): 55% of base mana less Natural
 * Shapeshifter, a 1.5 s GCD [F], usable in any form (from cat into cat is a powershift: cancel the
 * form and shift again at once, druid.md §2.8). Entering the form runs its rules for Energy and rage
 * (Furor; plan/types.ts ShapeshiftPlan). The mana is spent in tenths.
 */
export function shapeshift(form: 'cat' | 'bear', naturalShapeshifterRank: number): AbilityDef {
  return {
    id: `shift.${form}`,
    name: FORM_NAME[form],
    icon: FORM_ICON[form],
    kind: 'shift',
    ...NO_STRIKE,
    resource: 'mana',
    costTenths: 10 * shapeshiftMana(naturalShapeshifterRank),
    cooldownMs: 0,
    gcdMs: GCD_MS,
    stances: STANCE_ANY,
    shiftTo: FORM_INDEX[form],
  }
}

/** The form a shapeshift ability enters, or null for any other ability. */
export const shiftForm = (def: AbilityDef): DruidForm | null =>
  def.kind === 'shift' && def.shiftTo !== undefined ? ((Object.keys(FORM_INDEX) as DruidForm[]).find((f) => FORM_INDEX[f] === def.shiftTo) ?? null) : null

/** Wolfshead Helm (8345): +20 Energy from Tiger's Fury and +5 rage from Enrage in Forever; nothing on a shift [F] (druid.md §1.1, §2.8). */
export const WOLFSHEAD_HELM = 8345

/**
 * Idol of Brutality (23198, spell 28855): −2 rage (aura 107, misc 14: −20 tenths) on class mask
 * [2048, 64, 0, 0], which is Maul and Swipe (0x800 in the first word) and Primal Bite (0x40 in the second)
 * [F] [client] (SpellEffect, SpellClassOptions, 1.60.1.69913; druid.md §4.1, §4.2, §4.4). Its tooltip
 * names only Maul and Swipe, so Primal Bite's 2 rage is the client data's reading [?] (guild test G2).
 */
export const IDOL_OF_BRUTALITY = 23198
export const IDOL_OF_BRUTALITY_RAGE_TENTHS = 20
export const IDOL_OF_BRUTALITY_ABILITIES: ReadonlySet<string> = new Set(['maul', 'swipe', 'mangle'])
