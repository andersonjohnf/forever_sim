// The Protection priority list and its settings (docs/classes/paladin.md "Protection: model and
// rotation": "Forever priority list (default)", rows 0–8, and "Protection defaults").
//
// Rows: the paladin's aura before the pull, Devotion Aura (its duty, first by D26's fixed rule) or
// Retribution Aura (row 0); Righteous Fury, up all fight (row 0b, the plan's static Holy threat,
// setup.ts); the seal (row 1: Seal of Fury, or Seal of Righteousness) before the pull and whenever
// it's missing or about to end; Holy Shield whenever its buff is gone (row 2); the seal's judgement
// (row 3) and Swift Judgement right after it (row 4); Holy Strike (row 5); Exorcism against Undead
// and Demons (row 6); Consecration rank 5 and rank 1 by mana (row 7); Hammer of Wrath in the
// execute phase (row 8); and the consumables: on-use trinkets, Juju Flurry, the mana potion and
// the rune (consumables.ts). The rows are a priority list you reorder (PROTECTION_APL, decision
// D31), and D28's three rotations are its presets: Defensive (D26's "Tank duties first"), Balanced
// (the default, which plays as Defensive: it keeps Holy Strike, whose Iron Creed is active
// mitigation, user decision in D28) and Max TPS (Retribution Aura), set by the Priority choice,
// which moves defaults the way Warrior Protection's does. Hammer of the Righteous (row 5b) is off
// in all three; on, it takes Holy Strike's place while it sits above it. Setting ids are
// `paladin.protection.<ability>.<param>`; mana thresholds are percentages of maximum mana.
// Abilities are resolved with the build's talents (talents.ts) before their costs or spells feed
// anything.
import { DAMAGE_SHIELD_SP_COEFFICIENT } from '../../effects/buffs'
import type { AuraSpec, ProcSpec } from '../../effects/types'
import { type AbilityDef, COND, type Plan, type RotationCondition, type RotationEntry, type SpellDef } from '../../plan/types'
import type { AssumptionId } from '../../plan/assumptions'
import type { AplDefinition, FixedRotationRow, RotationOption, RotationValue } from '../../types'
import type { WeaponType } from '@/data/items/types'
import { compileAplRows, DEFAULT_APL_PRESET, normalizeAplOrder } from '../apl'
import { NO_CONTEXT, reader, seconds, type ClassRotation } from '../warrior/shared'
import {
  CONSECRATION,
  CONSECRATION_RANK1,
  EXORCISM_ABILITY,
  HAMMER_OF_THE_RIGHTEOUS_WEAPONS,
  hammerOfTheRighteousAbility,
  HAMMER_OF_WRATH_ABILITY,
  HOLY_STRIKE_ABILITY,
  JUDGE_CRUSADER,
  JUDGEMENT_OF,
  PALADIN,
  SEAL_OF_FURY,
  SEAL_OF_RIGHTEOUSNESS,
  SEAL_OF_THE_CRUSADER,
} from './abilities'
import { consecrationUnused } from './consecration-rows'
import { JUJU_FLURRY, MANA_POTION, MANA_RUNE, paladinConsumables, paladinTrinkets } from './consumables'
import { EXORCISM_TARGETS, manaOption } from './retribution'
import { type PaladinContext, paladinProcs, PREPULL_SEAL_MS } from './setup'
import { type JotcRule, withJotcRule } from './spells'
import { type TalentRanks, withTalents } from './talents'

const DOC = 'docs/classes/paladin.md'

const P = 'paladin.protection'
const ID = {
  priority: `${P}.priority`,
  seal: `${P}.seal.primary`,
  sealRefresh: `${P}.seal.refreshBelowSec`,
  holyShield: `${P}.holyShield.enabled`,
  swiftJudgement: `${P}.swiftJudgement.enabled`,
  swiftJudgementCooldown: `${P}.swiftJudgement.minCooldownSec`,
  devotionAura: `${P}.devotionAura.enabled`,
  crusader: `${P}.judgementOfTheCrusader.enabled`,
  judgement: `${P}.judgement.enabled`,
  holyStrike: `${P}.holyStrike.enabled`,
  hammerOfTheRighteous: `${P}.hammerOfTheRighteous.enabled`,
  exorcism: `${P}.exorcism.enabled`,
  exorcismMana: `${P}.exorcism.minManaPct`,
  consecration: `${P}.consecration.enabled`,
  consecrationMana: `${P}.consecration.minManaPct`,
  consecrationRank1: `${P}.consecrationRank1.enabled`,
  consecrationRank1Mana: `${P}.consecrationRank1.minManaPct`,
  hammerOfWrath: `${P}.hammerOfWrath.enabled`,
  hammerOfWrathMana: `${P}.hammerOfWrath.minManaPct`,
  trinkets: `${P}.trinkets.enabled`,
  juju: `${P}.jujuFlurry.enabled`,
  manaPotion: `${P}.manaPotion.enabled`,
  manaPotionMissing: `${P}.manaPotion.missingMana`,
  manaPotionEarly: `${P}.manaPotion.earlyMissingMana`,
  rune: `${P}.rune.enabled`,
  runeMissing: `${P}.rune.missingMana`,
  runeEarly: `${P}.rune.earlyMissingMana`,
}
export const PROTECTION_IDS = ID

/**
 * The priority choice's values, D28's three rotations (paladin.md "Priority: Defensive, Balanced or
 * Max TPS"): Defensive keeps the tank's duty and is tuned on threat (D26's "Tank duties first",
 * whose stored value it keeps); Balanced, the default, keeps the same upkeep and is tuned on threat
 * and damage together; Max TPS gives the duty up for threat alone. The Rotation tab sets it with the
 * priority list's preset picker.
 */
export const PROTECTION_PRIORITY = { duties: 'duties', balanced: 'balanced', maxTps: 'maxTps' } as const
const MAX_TPS = { option: ID.priority, is: PROTECTION_PRIORITY.maxTps } as const

/**
 * Protection recasts its seal with 2.5 s left, a second earlier than the core's 1.5 s: the global
 * cooldowns after it then leave Holy Shield's recast on time more often (paladin.md "Tuning the
 * defaults (C3)").
 */
const PROT_SEAL_REFRESH_SEC = 2.5


// --- Abilities, spells and procs (paladin.md#other-abilities, #protection-tree) -----------------

/**
 * Holy Shield's buff (20928, paladin.md#other-abilities): +20% block chance for 10 s or 4 blocks,
 * whichever ends first [F] [client] (SpellEffect aura 51, SpellAuraOptions procCharges 4, 1.60.1.69913).
 */
export const HOLY_SHIELD_AURA: AuraSpec = {
  id: 'holyShield',
  name: 'Holy Shield',
  durationMs: 10000,
  blockCharges: 4,
  mods: { block: 20 },
}

/**
 * Holy Shield r3 (20928, the 31-point Protection talent; paladin.md#other-abilities): 240 mana, a
 * 10 s cooldown (category 931), GCD 1.5 s; it needs a shield equipped [F] [client] (SpellPower,
 * SpellCooldowns, SpellEquippedItems, 1.60.1.69913). A `cast` that puts its buff up.
 */
export const HOLY_SHIELD: AbilityDef = {
  ...PALADIN,
  id: 'holyShield',
  name: 'Holy Shield',
  icon: 'spell_holy_blessingofprotection',
  kind: 'cast',
  costTenths: 10 * 240,
  cooldownMs: 10000,
  aura: HOLY_SHIELD_AURA,
}

/**
 * The damage of each block while Holy Shield is up (20928 effect 1, aura 43 `PROC_TRIGGER_DAMAGE`,
 * paladin.md#other-abilities): 221 Holy + 0.08 × SP [F] [client] (SpellEffect, 1.60.1.69913), with
 * 20% more threat, multiplied with Righteous Fury's (×1.6 × 1.2 = ×1.92) [?]
 * (paladin.md#threat-paladin-specific, OQ 16). Like a damage shield it always lands and never
 * crits [?] (OQ 16). Its share of Judgement of the Crusader's bonus is its coefficient's, the
 * default rule. It's triggered by the aura and lacks NOT_A_PROC, so it triggers no procs [?].
 */
export const HOLY_SHIELD_DAMAGE: SpellDef = {
  id: 'holyShieldProc',
  name: 'Holy Shield',
  icon: 'spell_holy_blessingofprotection',
  school: 'holy',
  defense: 'none',
  noActiveDefense: true,
  alwaysHit: true,
  triggersProcs: false,
  min: 221,
  max: 221,
  weaponPercent: 0,
  normalized: false,
  spCoefficient: 0.08,
  takenScale: 0.08,
  critMultiplier: 1.5,
  bonusCrit: 0,
  damageMult: 1,
  threatMult: 1.2,
  threatBonus: 0,
  cannotCrit: true,
}

/** Each block while Holy Shield is up deals its damage; the block that uses its last charge too (combat-tables §8, "The engine"). */
export const HOLY_SHIELD_PROC: ProcSpec = {
  id: 'holyShieldProc',
  name: 'Holy Shield',
  icon: 'spell_holy_blessingofprotection',
  trigger: 'block',
  from: 'any',
  chance: { pct: 100 },
  action: { kind: 'spell', spell: HOLY_SHIELD_DAMAGE },
  requiresAura: HOLY_SHIELD_AURA.id,
  counts: 'blocks',
  docRef: `${DOC}#other-abilities`,
}

/**
 * Seal of Fury's absorb (20423 effect 1, 50; paladin.md#seal-of-fury-sof-new-the-protection-seal):
 * with a shield equipped, each landed Seal of Fury proc shields you for half its Holy damage [F].
 * How it stacks and how long it lasts are the server's: the sim keeps one, which each proc replaces
 * and the next hit you take that costs health uses up, and which ends with the seal's 30 s [?]
 * (OQ 10). A boss's hit is thousands, so it always takes all of it, which is when Improved Seal of
 * Fury restores mana (talents.ts). The absorb itself isn't taken off the hit: about 20 damage.
 */
export const SEAL_OF_FURY_SHIELD_AURA: AuraSpec = {
  id: 'sealOfFuryShield',
  name: 'Seal of Fury’s absorb',
  durationMs: 30000,
  takenCharges: 1,
  mods: {},
}

/** Each landed Seal of Fury proc puts its absorb up, with a shield equipped (the rotation adds it only then). */
export const SEAL_OF_FURY_SHIELD_PROC: ProcSpec = {
  id: 'sealOfFuryShield',
  name: 'Seal of Fury’s absorb',
  icon: 'spell_holy_retributionaura',
  trigger: 'whiteResolved',
  from: 'mainHand',
  chance: { pct: 100 },
  action: { kind: 'aura', aura: SEAL_OF_FURY_SHIELD_AURA },
  requiresAura: SEAL_OF_FURY.id,
  docRef: `${DOC}#seal-of-fury-sof-new-the-protection-seal`,
}

/**
 * Swift Judgement's buff (1310994, paladin.md#protection-tree): the next Judgement costs no mana
 * (aura 108, cost −100% on Judgement's class mask, 1 charge) [F] [client] (SpellEffect,
 * SpellAuraOptions, 1.60.1.69913). The client's lasts until used; the rotation judges at once, so
 * its duration here only has to outlast that.
 */
export const SWIFT_JUDGEMENT_AURA: AuraSpec = {
  id: 'swiftJudgement',
  name: 'Swift Judgement',
  durationMs: 60000,
  mods: {},
}

/**
 * Swift Judgement (1310994, the Protection talent; paladin.md#protection-tree): off the GCD, a 1 min
 * cooldown, no cost [F] [client] (SpellCooldowns, 1.60.1.69913). It "finishes the remaining
 * cooldown on your Judgement ability" [F] (tooltip), so the rotation's line sets `endsCooldownOf`
 * to its judgement, and puts up the buff that makes that judgement free.
 */
export const SWIFT_JUDGEMENT: AbilityDef = {
  ...PALADIN,
  id: 'swiftJudgement',
  name: 'Swift Judgement',
  icon: 'ability_paladin_judgementred',
  kind: 'cast',
  gcdMs: 0,
  cooldownMs: 60000,
  aura: SWIFT_JUDGEMENT_AURA,
}

/**
 * Iron Creed's buff (1311033, paladin.md#protection-tree): −2% damage taken a rank, from all schools,
 * for 6 s after Holy Strike, while Righteous Fury is up [F] [client] (SpellEffect aura 87,
 * SpellDuration, SpellAuraRestrictions caster aura 25780; the talent's aura 231 on done melee-class
 * spells, 2/4/6/8/10 on curve 110345, 1.60.1.69913). A Protection paladin's Righteous Fury is up all
 * fight, so each landed Holy Strike puts it up (landed: the proc's hit mask is the server's [?]).
 */
export const ironCreedAura = (rank: number): AuraSpec => ({
  id: 'ironCreed',
  name: 'Iron Creed',
  durationMs: 6000,
  mods: { damageTaken: -2 * rank },
})

/** A paladin runs one aura at a time (paladin.md#other-abilities). */
export const PALADIN_AURA_GROUP = 'paladinAura'

/** An aura lasts until you cancel it: longer than any fight (the Fight tab's longest is 15 min ± 10%). */
const AURA_DURATION_MS = 60 * 60 * 1000

/**
 * The aura goes up first, 4.5 s before the pull: with tank duties first it's the duty, Devotion
 * Aura, and a duty comes before any threat ability (D26's fixed rule; paladin.md "Forever priority
 * list", row 0).
 */
export const PREPULL_AURA_MS = -4500

/** Righteous Fury goes up a global cooldown after the aura and before the seal (paladin.md "Forever priority list", row 0b). */
export const PREPULL_RIGHTEOUS_FURY_MS = -3000

/** A paladin aura as a `cast` the rotation puts up before the pull: no GCD cost at the pull, no mana. */
const paladinAura = (id: string, name: string, icon: string, mods: AuraSpec['mods']): AbilityDef => ({
  ...PALADIN,
  id,
  name,
  icon,
  kind: 'cast',
  aura: { id, name, durationMs: AURA_DURATION_MS, group: PALADIN_AURA_GROUP, mods },
})

/**
 * Devotion Aura r7 (10293, paladin.md#other-abilities): +735 armor for the party [F] (the buff
 * catalogue's `devotionAura`, the same buff). A Protection paladin's own, and its duty (D26): the
 * rotation keeps it up while its setting is on, and the Buffs tab's switch shows it as yours.
 */
export const DEVOTION_AURA = paladinAura('devotionAura', 'Devotion Aura', 'spell_holy_devotionaura', { armor: 735 })

/**
 * Righteous Fury (25780, paladin.md#threat-paladin-specific): +60% threat from Holy damage, 30 min [F].
 * Its threat is the plan's for the whole fight (`righteousFuryEffects`, setup.ts); this cast before
 * the pull only puts up its buff, with no mods, so the results list it up all fight. Free there, as
 * every cast before the pull is.
 */
export const RIGHTEOUS_FURY: AbilityDef = {
  ...PALADIN,
  id: 'righteousFury',
  name: 'Righteous Fury',
  icon: 'spell_holy_sealoffury',
  kind: 'cast',
  aura: { id: 'righteousFury', name: 'Righteous Fury', durationMs: AURA_DURATION_MS, mods: {} },
}

/** Retribution Aura r5 (10301), in place of Devotion Aura: its damage is `RETRIBUTION_AURA_PROC`. */
export const RETRIBUTION_AURA = paladinAura('retributionAura', 'Retribution Aura', 'spell_holy_auraoflight', {})

/**
 * Retribution Aura r5 (10301, paladin.md#other-abilities): 30 Holy damage to each attacker that
 * hits you (aura 15, a damage shield) [F] [client] (SpellEffect, 1.60.1.70009), + your spell damage
 * × `DAMAGE_SHIELD_SP_COEFFICIENT` (0.08): since 1.60.1.70009 it "will now dynamically update its
 * values based on the caster's spell power" (the dev notes) [F], and the client carries no
 * coefficient, so it takes Holy Shield's block damage's [?] (buffs doc §1.2). × Righteous Fury for its
 * threat. Like every damage shield it always lands and never crits [?]; each of the boss's swings that
 * lands on you (a hit, crit, crushing blow or block) triggers it [?]. Its share of Judgement of the
 * Crusader's bonus is its coefficient's, the default rule, as Holy Shield's.
 */
export const RETRIBUTION_AURA_DAMAGE: SpellDef = {
  ...HOLY_SHIELD_DAMAGE,
  id: 'retributionAuraDamage',
  name: 'Retribution Aura',
  icon: 'spell_holy_auraoflight',
  min: 30,
  max: 30,
  spCoefficient: DAMAGE_SHIELD_SP_COEFFICIENT,
  takenScale: DAMAGE_SHIELD_SP_COEFFICIENT,
  threatMult: 1,
}

/** Retribution Aura's damage on each of the boss's swings that lands on you, while it's up. */
export const RETRIBUTION_AURA_PROC: ProcSpec = {
  id: 'retributionAuraDamage',
  name: 'Retribution Aura',
  icon: 'spell_holy_auraoflight',
  trigger: 'meleeTaken',
  from: 'any',
  chance: { pct: 100 },
  action: { kind: 'spell', spell: RETRIBUTION_AURA_DAMAGE },
  requiresAura: RETRIBUTION_AURA.id,
  docRef: `${DOC}#other-abilities`,
}

/**
 * The plan aura of Swift Judgement's free Judgement, as the engine's free-cast aura (Clearcasting's
 * path, druid.md §2.7): the next judgement row pays nothing and uses it up. None without it.
 */
export function swiftJudgementPlan(auras: readonly { id: string }[]): Pick<Plan, 'freeCastAura'> {
  const i = auras.findIndex((a) => a.id === SWIFT_JUDGEMENT_AURA.id)
  return i >= 0 ? { freeCastAura: i } : {}
}

// --- Settings (paladin.md "Forever priority list (default)") -------------------------------------

/**
 * What the presets' help and Hammer of the Righteous's say, measured in the default setup (paladin.md
 * "Priority: Defensive, Balanced or Max TPS"; seed 31101, 100,000 fights, 2026-09-24): Defensive's
 * TPS, DPS and damage taken a second, and Max TPS and Hammer of the Righteous turned on against it, in
 * percent. protection-presets.test.ts measures them again, so a change that moves them fails until
 * they're re-measured here.
 */
export const PROTECTION_PRESET_MEASURES = {
  defensive: { tps: 752.62, dps: 466.6, damageTaken: 918.6 },
  maxTps: { tpsPct: 6.76, dpsPct: 6.68, damageTakenPct: 5.72 },
  hammerOfTheRighteous: { tpsPct: -1.64, dpsPct: 0.23, damageTakenPct: 4.92 },
} as const

const M = PROTECTION_PRESET_MEASURES
/** A measured percent for the help, whole (7%) or to a tenth (0.2%), unsigned. */
const helpPct = (x: number, digits = 0) => `${Math.abs(x).toFixed(digits)}%`

/**
 * Defaults from paladin.md's "Forever priority list (default)" for Protection, in priority order.
 * Defensive's are the best rotation found for the default setup, keeping the tank's duties
 * (decisions D23 and D26; paladin.md "Tuning the defaults", measured on TPS with
 * scripts/tune/rotation.mjs); Balanced, the default, plays as Defensive: it keeps the same upkeep,
 * Holy Strike's Iron Creed included, and its first-pass search on TPS and DPS together moved nothing
 * (D27, D28; paladin.md "Priority: Defensive, Balanced or Max TPS").
 */
export const PROTECTION_OPTIONS: RotationOption[] = [
  {
    kind: 'choice',
    id: ID.priority,
    label: 'Priority',
    // Not shown as a control: the priority list's preset picker sets it (PROTECTION_APL's presets).
    help: 'Which of the three rotations you play: Defensive, Balanced or Max TPS. The priority list’s preset picker sets it.',
    choices: [
      { value: PROTECTION_PRIORITY.duties, label: 'Defensive' },
      { value: PROTECTION_PRIORITY.balanced, label: 'Balanced' },
      { value: PROTECTION_PRIORITY.maxTps, label: 'Max TPS' },
    ],
    default: PROTECTION_PRIORITY.balanced,
  },
  {
    kind: 'toggle',
    id: ID.devotionAura,
    group: 'Cooldowns and buffs',
    label: 'Devotion Aura',
    help: 'Keep your Devotion Aura up: +735 armor. Off, you run Retribution Aura instead: the boss takes 30 Holy damage plus some of your spell damage each time it hits you, with Righteous Fury’s threat. While this is on, the Buffs tab’s Devotion Aura is yours. Off by default with Max TPS.',
    default: true,
    defaultWhen: [{ ...MAX_TPS, default: false }],
    maintainsBuff: 'devotionAura',
  },
  {
    kind: 'toggle',
    id: ID.crusader,
    // A debuff kept up all fight, like Retribution's, placed at the pull (paladin.md "the opener").
    group: 'Cooldowns and buffs',
    label: 'Judgement of the Crusader',
    help: 'Put Seal of the Crusader up before the pull and judge it at the pull, then Seal of Fury: the boss takes +161 Holy damage for 40 s, and your auto attacks keep it up. If it’s ever missing, it’s judged again the same way. While this is on, the Buffs tab’s Judgement of the Crusader is yours.',
    default: true,
    maintainsBuff: 'judgementOfTheCrusader',
  },
  {
    kind: 'toggle',
    id: ID.holyShield,
    group: 'Cooldowns and buffs',
    label: 'Holy Shield',
    help: 'Keep Holy Shield up: +20% block chance for 10 s or 4 blocks, and each block deals 221 Holy damage plus 8% of your spell damage, with 20% more threat. It stays on with Max TPS: it makes about a seventh of your threat. Needs the talent and a shield. 240 mana.',
    default: true,
    requires: { talent: 'Holy Shield', shield: true },
  },
  {
    kind: 'toggle',
    id: ID.trinkets,
    group: 'Cooldowns and buffs',
    label: 'On-use trinkets',
    help: 'Use Weakness Analyzer (+5% crit and spell crit until your next crit, for up to 20 s) and Earthstrike (+280 attack power for 20 s) on cooldown if you wear them. Other on-use trinkets aren’t simulated.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.juju,
    group: 'Consumables',
    label: 'Juju Flurry',
    help: 'Use it on cooldown from the pull: +3% attack speed for 20 s, every minute. More swings are more threat from your auto attacks and Seal of Fury.',
    default: true,
    requiresBuff: JUJU_FLURRY,
  },
  {
    kind: 'choice',
    id: ID.seal,
    group: 'Core abilities',
    label: 'Seal',
    help: 'Seal of Fury adds 35 Holy damage to each of your auto attacks, plus more the slower your weapon (untested: 21.6 more with a 1.5 s one-hander). With a shield, each also shields you from a little damage, and when a hit uses that up, Improved Seal of Fury restores mana (87 against a raid boss). Its judgement taunts. Seal of Righteousness adds the same 35 and more by weapon speed (untested: 24 with a 1.5 s one-hander), but no shield or mana, so it makes about 4% less threat with a one-hander; it does better only with a two-hander, and so without a shield.',
    choices: [
      { value: 'fury', label: 'Fury' },
      { value: 'righteousness', label: 'Righteousness' },
    ],
    default: 'fury',
  },
  {
    kind: 'number',
    id: ID.sealRefresh,
    group: 'Core abilities',
    label: 'Seal again with',
    help: 'Recast your seal when this much of it is left, so Judgement always has one. It lasts 30 s.',
    unit: 's left',
    min: 0,
    max: 29,
    step: 0.5,
    default: PROT_SEAL_REFRESH_SEC,
  },
  {
    kind: 'toggle',
    id: ID.judgement,
    group: 'Core abilities',
    label: 'Judgement',
    help: 'Judge your seal whenever Judgement is ready. It’s off the global cooldown and keeps the seal up.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.swiftJudgement,
    group: 'Core abilities',
    label: 'Swift Judgement',
    help: 'Use Swift Judgement while Judgement is cooling down, then judge again for free: one more Judgement a minute. Needs the talent. It’s off the global cooldown.',
    default: true,
    dependsOn: ID.judgement,
    requires: { talent: 'Swift Judgement' },
  },
  {
    kind: 'number',
    id: ID.swiftJudgementCooldown,
    group: 'Core abilities',
    label: 'Swift Judgement with',
    help: 'Use it only while Judgement has at least this much cooldown left, so it saves at least that much. Otherwise it waits for the next Judgement, and saves all of its cooldown.',
    unit: 's left',
    min: 0,
    max: 10,
    step: 0.5,
    default: 4.5,
    dependsOn: ID.swiftJudgement,
  },
  {
    kind: 'toggle',
    id: ID.holyStrike,
    group: 'Core abilities',
    label: 'Holy Strike',
    help: 'Use Holy Strike whenever it’s ready, every 10 s: 50% of a normalized swing plus 81 to 105 and spell damage, all Holy, with 25% more threat from Iron Creed 5/5. 20 mana.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.hammerOfTheRighteous,
    group: 'Core abilities',
    label: 'Hammer of the Righteous',
    help: `Use Hammer of the Righteous in Holy Strike’s place: 3 times your main hand’s weapon DPS as Holy damage, every 6 s, for 90 mana. They share a cooldown, so the higher of the two in the list is used, and the lower only when you can’t pay for the higher. It makes about ${helpPct(M.hammerOfTheRighteous.dpsPct, 1)} more DPS for ${helpPct(M.hammerOfTheRighteous.tpsPct, 1)} less TPS in the default setup, and Iron Creed’s extra threat and 10% lower damage taken come only with Holy Strike, so it’s off by default in every preset. Whether the weapon DPS counts your attack power is untested (Character → Advanced). Needs a one-handed axe, mace or sword: with anything else, Holy Strike is used if it’s on.`,
    // paladin.md "Priority: Defensive, Balanced or Max TPS": its measured cost (PROTECTION_PRESET_MEASURES),
    // and Balanced keeps Holy Strike's Iron Creed as active mitigation (user decision, D28).
    default: false,
  },
  {
    kind: 'toggle',
    id: ID.exorcism,
    group: 'Core abilities',
    label: 'Exorcism',
    help: 'Against Undead and Demons (set under Fight), use Exorcism whenever it’s ready. It can’t be cast on anything else.',
    default: true,
    needsCreatureType: EXORCISM_TARGETS,
  },
  manaOption(ID.exorcismMana, 'Exorcism from', 'Use it only at or above this share of your maximum mana. It costs 345.', 0, ID.exorcism, 'Core abilities'),
  {
    kind: 'toggle',
    id: ID.consecration,
    group: 'Fillers',
    label: 'Consecration',
    help: 'Put down Consecration (rank 5, 565 mana, less with Holy Conduit): 8 ticks of Holy damage over 8 s. By default it comes before Holy Strike, and only from 20% mana: below that, rank 1 goes down instead, and the rest goes to Holy Shield, your seal and Hammer of Wrath.',
    default: true,
  },
  manaOption(
    ID.consecrationMana,
    'Consecration from',
    'Use rank 5 only at or above this share of your maximum mana. 20 is set for the default setup’s 3-minute fight.',
    20,
    ID.consecration,
    'Fillers',
  ),
  {
    kind: 'toggle',
    id: ID.consecrationRank1,
    group: 'Fillers',
    label: 'Consecration (Rank 1)',
    help: 'Below rank 5’s mana threshold, put down rank 1 (135 mana). Every rank has the full spell damage bonus, so with enough spell damage it’s the most threat for the mana.',
    default: true,
  },
  manaOption(ID.consecrationRank1Mana, 'Consecration (Rank 1) from', 'Use rank 1 only at or above this share of your maximum mana.', 10, ID.consecrationRank1, 'Fillers'),
  {
    kind: 'toggle',
    id: ID.hammerOfWrath,
    group: 'Execute phase',
    label: 'Hammer of Wrath',
    help: 'In the execute phase, use Hammer of Wrath whenever it’s ready: 425 mana, and a 1 s cast that stops your auto attacks and holds Judgement until it ends. Needs an execute phase under Fight.',
    default: true,
    needsExecutePhase: true,
  },
  manaOption(ID.hammerOfWrathMana, 'Hammer of Wrath from', 'Use it only at or above this share of your maximum mana.', 0, ID.hammerOfWrath, 'Execute phase'),
  {
    kind: 'toggle',
    id: ID.manaPotion,
    group: 'Consumables',
    label: 'Major Mana Potion',
    help: 'Drink one every 2 minutes when you’re missing enough mana (under Advanced): a little early while another would still be ready before the fight ends, then only once all it can restore (up to 2,250) fits. Its mana makes threat too.',
    default: true,
    requiresBuff: MANA_POTION,
  },
  {
    kind: 'number',
    id: ID.manaPotionEarly,
    group: 'Consumables',
    label: 'Major Mana Potion early, when missing',
    help: 'While another would be ready before the fight ends, drink it once you’re missing this much mana, so you get one more. At 0, never early.',
    unit: 'mana',
    min: 0,
    max: 5000,
    step: 50,
    default: 1500,
    dependsOn: ID.manaPotion,
  },
  {
    kind: 'number',
    id: ID.manaPotionMissing,
    group: 'Consumables',
    label: 'Major Mana Potion when missing',
    help: 'Once the fight has less than 2 minutes left, or with early use off, drink it when you’re missing at least this much mana. 2,250 is the most it restores.',
    unit: 'mana',
    min: 0,
    max: 5000,
    step: 50,
    default: 2250,
    dependsOn: ID.manaPotion,
  },
  {
    kind: 'toggle',
    id: ID.rune,
    group: 'Consumables',
    label: 'Demonic Rune',
    help: 'Use one every 2 minutes, apart from the potion’s cooldown, once all it can restore (up to 1,500 mana) fits. Early use while another would still be ready is off unless you set it under Advanced.',
    default: true,
    requiresBuff: MANA_RUNE,
  },
  {
    kind: 'number',
    id: ID.runeEarly,
    group: 'Consumables',
    label: 'Demonic Rune early, when missing',
    help: 'While another would be ready before the fight ends, use it once you’re missing this much mana, so you get one more. At 0, never early.',
    unit: 'mana',
    min: 0,
    max: 5000,
    step: 50,
    default: 0,
    dependsOn: ID.rune,
  },
  {
    kind: 'number',
    id: ID.runeMissing,
    group: 'Consumables',
    label: 'Demonic Rune when missing',
    help: 'Once the fight has less than 2 minutes left, or with early use off, use it when you’re missing at least this much mana. 1,500 is the most it restores.',
    unit: 'mana',
    min: 0,
    max: 5000,
    step: 50,
    default: 1500,
    dependsOn: ID.rune,
  },
]

/**
 * What misjudging the fight's end costs the early potion line, measured with the default setup
 * (paladin.md "Tuning the defaults (C3)"): its "another will be ready" judged 10 or 20 s off.
 */
export const PROTECTION_KNOWN_FIGHT_END = 'with the default setup, judging it 10 to 20 s off costs up to 0.51%'

/**
 * What a Protection paladin always does (paladin.md "Forever priority list (default)", row 0): its
 * Righteous Fury, up all fight, with no setting.
 */
export const PROTECTION_FIXED_ROWS: FixedRotationRow[] = [
  {
    id: `${P}.righteousFury`,
    label: 'Righteous Fury',
    group: 'Cooldowns and buffs',
    help: 'Up all fight, cast before the pull: ×1.6 threat from your Holy damage. A Protection paladin never tanks without it.',
    value: 'Always on',
  },
]

/**
 * Buff catalogue ids the rotation keeps up itself with these settings, so the plan drops the Buffs
 * switch's static version: your own Devotion Aura (paladin.md "Priority", D26) and your own
 * Judgement of the Crusader (paladin.md "the opener").
 */
export function protectionMaintainedBuffs(values: Record<string, RotationValue>): string[] {
  const v = reader(PROTECTION_OPTIONS, values)
  return [...(v.on(ID.devotionAura) ? ['devotionAura'] : []), ...(v.on(ID.crusader) ? ['judgementOfTheCrusader'] : [])]
}

/** The seal the settings choose (paladin.md "Protection defaults": Seal of Fury, Seal of Righteousness selectable). */
export const protectionSeal = (values: Record<string, RotationValue>): AbilityDef =>
  reader(PROTECTION_OPTIONS, values).str(ID.seal) === 'righteousness' ? SEAL_OF_RIGHTEOUSNESS : SEAL_OF_FURY

/** Whether the main hand takes Hammer of the Righteous: a one-handed axe, mace or sword (paladin.md row 5b). */
export const hammerFits = (mainHand: { twoHand: boolean; type?: WeaponType } | null | undefined): boolean =>
  mainHand != null && !mainHand.twoHand && mainHand.type !== undefined && (HAMMER_OF_THE_RIGHTEOUS_WEAPONS as readonly string[]).includes(mainHand.type)

/** Whether Hammer of the Righteous sits above Holy Strike in the order (row 5b over row 5; the default order puts it there). */
const hammerAbove = (order: readonly string[] | undefined): boolean => {
  const current = normalizeAplOrder(PROTECTION_APL, order)
  return current.indexOf('hammerOfTheRighteous') < current.indexOf('holyStrike')
}

/** The two Consecration rows, rank 5 and rank 1 (paladin.md rows 7 and 7b), which share one cooldown. */
const CONSECRATION_ROWS = [
  { row: 'consecration', label: 'Consecration', on: ID.consecration, mana: ID.consecrationMana },
  { row: 'consecrationRank1', label: 'Consecration (Rank 1)', on: ID.consecrationRank1, mana: ID.consecrationRank1Mana },
] as const

/**
 * What the Rotation tab says under a row that's never or rarely used (docs/ux.md "Rotation"): the
 * lower of the two Consecration rows when it's never cast (consecration-rows.ts), and
 * Holy Strike or Hammer of the Righteous when the other takes its place. They share a cooldown, so
 * with both on, the higher row is used and the lower only when you can't pay for the higher: Holy
 * Strike under Hammer of the Righteous when
 * Hammer's 90 mana isn't there, and Hammer under Holy Strike never, since Holy Strike costs less.
 * Hammer of the Righteous needs a one-handed axe, mace or sword; with any other main hand it can't
 * be used, and Holy Strike is if it's on; with no main hand, neither is, and Holy Strike says so
 * too. The weapon's notes wait while the main hand isn't known (the Buffs tab's reading).
 */
export function protectionUnusedSettings(
  values: Record<string, RotationValue>,
  mainHand: { twoHand: boolean; type?: WeaponType } | null | undefined,
  order?: readonly string[],
): Record<string, string> {
  const v = reader(PROTECTION_OPTIONS, values)
  return { ...consecrationUnused(PROTECTION_APL, CONSECRATION_ROWS, v, order), ...strikeUnused(v, mainHand, order) }
}

/** Holy Strike's and Hammer of the Righteous's notes (protectionUnusedSettings). */
function strikeUnused(
  v: ReturnType<typeof reader>,
  mainHand: { twoHand: boolean; type?: WeaponType } | null | undefined,
  order: readonly string[] | undefined,
): Record<string, string> {
  const strike = v.on(ID.holyStrike)
  // No main hand: Holy Strike, a weapon strike, can't be used (TV-3), nor Hammer of the Righteous.
  const noWeapon = strike && mainHand === null ? { [ID.holyStrike]: 'Not used: needs a weapon in your main hand.' } : {}
  if (!v.on(ID.hammerOfTheRighteous)) return noWeapon
  if (mainHand !== undefined && !hammerFits(mainHand)) {
    const why = 'Not used: needs a one-handed axe, mace or sword in your main hand'
    if (mainHand === null) return { ...noWeapon, [ID.hammerOfTheRighteous]: `${why}.` }
    return { [ID.hammerOfTheRighteous]: strike ? `${why}, so Holy Strike is used.` : `${why}. Turn Holy Strike on to use it instead.` }
  }
  if (!strike) return {}
  if (!hammerAbove(order)) return { [ID.hammerOfTheRighteous]: 'Not used: Holy Strike, above it, takes its place (they share a cooldown). Move it above Holy Strike to use it instead.' }
  return mainHand === undefined
    ? {}
    : { [ID.holyStrike]: 'Rarely used: Hammer of the Righteous, above it, takes its place (they share a cooldown). It’s used when you can’t pay Hammer’s 90 mana.' }
}

/**
 * The presets' help, which the preset picker's info lists, and their short lines, which the picker
 * shows under it for the one picked (docs/ux.md "Rotation"): what each keeps and gives up, measured
 * in the default setup (paladin.md "Priority: Defensive, Balanced or Max TPS").
 */
const DEFENSIVE_SUMMARY = 'Devotion Aura, Holy Shield and Holy Strike’s Iron Creed kept: the most survival. Tuned on threat.'
const DEFENSIVE_HELP = `Keeps your Devotion Aura up, +735 armor, and Holy Shield, and uses Holy Strike, whose Iron Creed cuts your damage taken 10%. Tuned on threat. The most survival of the three: ${Math.round(M.defensive.tps)} TPS, ${Math.round(M.defensive.dps)} DPS and ${Math.round(M.defensive.damageTaken)} damage taken a second in the default setup.`
const BALANCED_SUMMARY = 'Plays as Defensive: Devotion Aura, Holy Shield and Holy Strike kept. Hammer of the Righteous is a row you can turn on.'
const BALANCED_HELP = `The default, as most tanks play fights short of progression. For a paladin it plays as Defensive: it keeps Devotion Aura and Holy Shield, and Holy Strike too, since Iron Creed’s 10% lower damage taken is active mitigation. Hammer of the Righteous is a row, off, just above Holy Strike: turned on, it takes Holy Strike’s place for about ${helpPct(M.hammerOfTheRighteous.dpsPct, 1)} more DPS and ${helpPct(M.hammerOfTheRighteous.tpsPct, 1)} less TPS, and ${helpPct(M.hammerOfTheRighteous.damageTakenPct)} more damage taken without Iron Creed.`
const MAX_TPS_SUMMARY = `Retribution Aura instead of Devotion Aura, for threat: +${helpPct(M.maxTps.tpsPct)} TPS and ${helpPct(M.maxTps.damageTakenPct)} more damage taken than Defensive.`
const MAX_TPS_HELP = `Runs Retribution Aura instead of Devotion Aura for threat, 30 Holy damage plus some of your spell damage to the boss each time it hits you: ${helpPct(M.maxTps.tpsPct)} more TPS and ${helpPct(M.maxTps.dpsPct)} more DPS than Defensive, for ${helpPct(M.maxTps.damageTakenPct)} more damage taken. Pick it when another paladin in your group keeps Devotion Aura up, or the raid covers your survival. The Buffs tab’s Devotion Aura stays off unless you turn it on there for another paladin’s.`

/**
 * The Protection paladin's rotation as a priority list (decision D31; paladin.md "Forever priority
 * list (default)"): rows 1–8 in its order, each with its switch and its own settings. Rows 0–0c,
 * the aura, Righteous Fury and the opener, are one pinned row first: the aura is D26's duty, first
 * by its fixed rule, and the opener's judgement comes at the pull. The seal (row 1) has no switch:
 * there's always one. Hammer of the Righteous (5b) takes Holy Strike's place (5) when it's on and
 * the weapon allows; each says so when the other does. The on-use trinkets are a row, last, where
 * their lines always were, so the default order plays as before; Juju Flurry and the mana
 * consumables are spec-wide, off the GCD, and always come after the list. The Priority choice is the preset
 * picker: D28's Defensive, Balanced (the default) and Max TPS set it, so it isn't shown as a
 * control of its own.
 */
export const PROTECTION_APL: AplDefinition = {
  rows: [
    {
      id: 'prepull',
      label: 'Before the pull',
      icon: 'spell_holy_devotionaura',
      optionIds: [ID.devotionAura, ID.crusader],
      summary: [
        { option: ID.devotionAura, text: 'Devotion Aura' },
        { option: ID.devotionAura, text: 'Retribution Aura', when: false },
        { text: 'Righteous Fury' },
        { option: ID.crusader, text: 'Judgement of the Crusader at the pull' },
      ],
      help: 'Your aura 4.5 s before the pull, then Righteous Fury, then the seal. The aura is Devotion Aura while it’s on, and Retribution Aura while it’s off. It always comes first.',
      pinned: true,
    },
    {
      id: 'seal',
      label: 'Seal',
      icon: SEAL_OF_FURY.icon,
      optionIds: [ID.seal, ID.sealRefresh],
      summary: [
        { option: ID.seal, text: 'Seal of {}' },
        { option: ID.sealRefresh, text: 'again with {}' },
      ],
      help: 'Keep your seal up: cast it when it’s missing, or about to end.',
    },
    { id: 'holyShield', label: 'Holy Shield', icon: HOLY_SHIELD.icon, enabledId: ID.holyShield, optionIds: [], summary: [{ text: 'whenever its buff is gone' }] },
    { id: 'judgement', label: 'Judgement', icon: JUDGEMENT_OF[SEAL_OF_FURY.id].icon, enabledId: ID.judgement, optionIds: [], summary: [{ text: 'on cooldown, off the global cooldown' }] },
    {
      id: 'swiftJudgement',
      label: 'Swift Judgement',
      icon: SWIFT_JUDGEMENT.icon,
      enabledId: ID.swiftJudgement,
      optionIds: [ID.swiftJudgementCooldown],
      summary: [{ option: ID.swiftJudgementCooldown, text: 'while Judgement has {}' }],
    },
    {
      id: 'exorcism',
      label: 'Exorcism',
      icon: EXORCISM_ABILITY.icon,
      enabledId: ID.exorcism,
      optionIds: [ID.exorcismMana],
      summary: [{ text: 'Undead and Demons' }, { option: ID.exorcismMana, text: 'from {}', hideWhen: 0 }],
    },
    {
      id: 'hammerOfWrath',
      label: 'Hammer of Wrath',
      icon: HAMMER_OF_WRATH_ABILITY.icon,
      enabledId: ID.hammerOfWrath,
      optionIds: [ID.hammerOfWrathMana],
      summary: [{ text: 'execute phase' }, { option: ID.hammerOfWrathMana, text: 'from {}', hideWhen: 0 }],
    },
    {
      id: 'consecration',
      label: 'Consecration',
      icon: CONSECRATION.icon,
      enabledId: ID.consecration,
      optionIds: [ID.consecrationMana],
      summary: [{ text: 'rank 5' }, { option: ID.consecrationMana, text: 'from {}', hideWhen: 0 }],
    },
    {
      id: 'consecrationRank1',
      label: 'Consecration (Rank 1)',
      icon: CONSECRATION_RANK1.icon,
      enabledId: ID.consecrationRank1,
      optionIds: [ID.consecrationRank1Mana],
      summary: [{ option: ID.consecrationRank1Mana, text: 'from {}', hideWhen: 0 }],
    },
    {
      id: 'hammerOfTheRighteous',
      label: 'Hammer of the Righteous',
      icon: hammerOfTheRighteousAbility().icon,
      enabledId: ID.hammerOfTheRighteous,
      optionIds: [],
      summary: [{ text: 'on cooldown, in Holy Strike’s place' }],
    },
    { id: 'holyStrike', label: 'Holy Strike', icon: HOLY_STRIKE_ABILITY.icon, enabledId: ID.holyStrike, optionIds: [], summary: [{ text: 'on cooldown' }] },
    { id: 'trinkets', label: 'On-use trinkets', icon: 'inv_jewelry_talisman_01', enabledId: ID.trinkets, optionIds: [], summary: [{ text: 'on cooldown' }] },
  ],
  specWide: [ID.juju, ID.manaPotion, ID.manaPotionEarly, ID.manaPotionMissing, ID.rune, ID.runeEarly, ID.runeMissing],
  presets: [
    { id: 'defensive', label: 'Defensive', summary: DEFENSIVE_SUMMARY, help: DEFENSIVE_HELP, values: { [ID.priority]: PROTECTION_PRIORITY.duties } },
    { id: DEFAULT_APL_PRESET, label: 'Balanced', summary: BALANCED_SUMMARY, help: BALANCED_HELP, values: {} },
    { id: 'maxTps', label: 'Max TPS', summary: MAX_TPS_SUMMARY, help: MAX_TPS_HELP, values: { [ID.priority]: PROTECTION_PRIORITY.maxTps } },
  ],
}

/**
 * The Protection priority list from the settings (paladin.md "Forever priority list (default)"),
 * its rows in `order` (PROTECTION_APL; absent: the default order). `talents` gates Holy Shield and
 * Swift Judgement and resolves costs and cooldowns; `context` gives the main hand (Seal of
 * Righteousness, Hammer of the Righteous), whether a shield is equipped (Holy Shield), the maximum
 * mana (the mana thresholds are shares of it), the creature type (Exorcism) and whether the fight
 * has an execute phase (Hammer of Wrath). Abilities 0 and 1 are the seal and its judgement, as in
 * `paladinCore`, then the opener's; the rest are indexed as their rows come, so the default order
 * gives the plan the rotation gave before the list.
 */
export function protectionRotation(
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  _auraIndex: (id: string) => number,
  context: Partial<PaladinContext> = {},
  order?: readonly string[],
): ClassRotation {
  const ctx: PaladinContext = { ...NO_CONTEXT, ...context }
  const v = reader(PROTECTION_OPTIONS, values, talents)
  // The Judgement of the Crusader rule (Character → Advanced), for another paladin's judgement on the
  // boss: each Holy hit's share of its +161, as Retribution's (paladin.md, OQ 5).
  const rule: JotcRule = ctx.jotcRule ?? 'coefficient'
  const abilities: AbilityDef[] = []
  const rotation: RotationEntry[] = []
  /** The ability's index, resolved with the build's talents and the JotC rule on first use. */
  const index = (def: AbilityDef): number => {
    const i = abilities.findIndex((a) => a.id === def.id)
    if (i >= 0) return i
    const a = withTalents(def, talents)
    abilities.push({
      ...a,
      ...(a.spellDef ? { spellDef: withJotcRule(a.spellDef, rule) } : {}),
      ...(a.tickSpellDef ? { tickSpellDef: withJotcRule(a.tickSpellDef, rule) } : {}),
    })
    return abilities.length - 1
  }
  const add = (def: AbilityDef, conditions: RotationCondition[]) => {
    const a = index(def)
    rotation.push({ ability: a, conditions, unqueueBelowTenths: 0 })
    return a
  }
  const maxManaTenths = 10 * (ctx.maxMana ?? 0)
  /** Mana ≥ the setting's share of the maximum. */
  const manaFrom = (id: string): RotationCondition[] => {
    const pct = v.num(id)
    return pct > 0 ? [{ code: COND.minMana, a: Math.round((pct / 100) * maxManaTenths), b: 0 }] : []
  }
  const auraUp = (a: number): RotationCondition => ({ code: COND.abilityAuraUp, a, b: 0 })
  const auraDown = (a: number): RotationCondition => ({ code: COND.abilityAuraDown, a, b: 0 })
  const procs: ProcSpec[] = []

  // Abilities 0 and 1: the seal and its judgement. Seal of Fury's absorb needs a shield.
  const sealDef = protectionSeal(values)
  const seal = index(sealDef)
  const judge = index(JUDGEMENT_OF[sealDef.id])
  if (sealDef.id === SEAL_OF_FURY.id && ctx.hasShield) procs.push(SEAL_OF_FURY_SHIELD_PROC)
  const refresh: RotationCondition = { code: COND.abilityAuraRefresh, a: seal, b: seconds(v, ID.sealRefresh) }
  // Row 0c's seal and judgement (paladin.md "the opener"), indexed after the seal's, as before the list.
  const crusader = v.on(ID.crusader)
  const sotc = crusader ? index(SEAL_OF_THE_CRUSADER) : -1
  const jotc = crusader ? index(JUDGE_CRUSADER) : -1
  const prepullSeal = crusader ? sotc : seal
  // Row 5b: Hammer of the Righteous, with a one-handed axe, mace or sword. It shares Holy Strike's
  // cooldown (row 5), so with both on, the shared cooldown decides, as in a real priority list: the
  // higher row is used whenever it can be, and the lower when it can't (Holy Strike when Hammer's 90
  // mana isn't there). Below Holy Strike (on), which costs less, it's never cast, so it's left out
  // of the plan, and with it its weapon-DPS assumption (TV-2).
  const hammer = v.on(ID.hammerOfTheRighteous) && hammerFits(ctx.mainHand) && (hammerAbove(order) || !v.on(ID.holyStrike))

  compileAplRows(PROTECTION_APL, order, {
    // Row 0c (paladin.md "the opener"), as Retribution's: Seal of the Crusader goes up 1.5 s before
    // the pull (the pre-pull below); while it's up and Judgement of the Crusader is missing, judge it
    // (at the pull, then only if the debuff ever drops: your landed auto attacks restart its 40 s).
    // If it's missing without the seal, cast the seal first.
    prepull: () => {
      if (!crusader) return
      add(JUDGE_CRUSADER, [auraUp(sotc), auraDown(jotc)])
      add(SEAL_OF_THE_CRUSADER, [auraDown(jotc), auraDown(sotc)])
    },
    // Row 1: the seal when it's missing or has at most refreshBelowSec left; with the opener, not
    // over Seal of the Crusader before its judgement has landed.
    seal: () => {
      if (!crusader) {
        add(sealDef, [refresh])
        return
      }
      add(sealDef, [refresh, auraDown(sotc)])
      add(sealDef, [refresh, auraUp(jotc)])
    },
    // Row 2: Holy Shield (the talent, with a shield) whenever its buff is gone: its 4 blocks used or
    // its 10 s over. Its cooldown is its duration, so that's on cooldown unless blocks end it early.
    holyShield: () => {
      if (!talents.has('Holy Shield') || !ctx.hasShield || !v.on(ID.holyShield)) return
      const shield = index(HOLY_SHIELD)
      add(HOLY_SHIELD, [{ code: COND.abilityAuraRefresh, a: shield, b: 0 }])
      procs.push(HOLY_SHIELD_PROC)
    },
    // Row 3: the seal's judgement whenever Judgement is ready, while the seal is up (it stays up).
    judgement: () => {
      if (v.on(ID.judgement)) rotation.push({ ability: judge, conditions: [auraUp(seal)], unqueueBelowTenths: 0 })
    },
    // Row 4: Swift Judgement (the talent, off the GCD) while Judgement has at least x s of cooldown
    // left and the seal is up: it ends that cooldown, and the judgement it frees costs nothing. Only
    // with Judgement on, which it's for.
    swiftJudgement: () => {
      if (!v.on(ID.judgement) || !talents.has('Swift Judgement') || !v.on(ID.swiftJudgement)) return
      add({ ...SWIFT_JUDGEMENT, endsCooldownOf: judge }, [{ code: COND.cooldownAtLeast, a: judge, b: seconds(v, ID.swiftJudgementCooldown) }, auraUp(seal)])
      abilities[judge] = { ...abilities[judge], clearcastable: true }
    },
    // Row 5: Holy Strike on cooldown, when Hammer of the Righteous above it hasn't taken the shared
    // cooldown; with Iron Creed, each that lands cuts damage taken for 6 s.
    holyStrike: () => {
      if (!v.on(ID.holyStrike)) return
      const strike = add(HOLY_STRIKE_ABILITY, [])
      const creed = talents.get('Iron Creed') ?? 0
      if (creed > 0) abilities[strike] = { ...abilities[strike], aura: ironCreedAura(creed) }
    },
    // Row 5b: Hammer of the Righteous on cooldown, in Holy Strike's place: above Holy Strike, or with
    // Holy Strike off (below Holy Strike, `hammer` leaves it out).
    hammerOfTheRighteous: () => {
      if (hammer) add(hammerOfTheRighteousAbility(ctx.hotrWeaponDps !== 'weaponOnly'), [])
    },
    // Row 6: Exorcism on cooldown against Undead and Demons, at mana ≥ x%.
    exorcism: () => {
      if (v.on(ID.exorcism) && EXORCISM_TARGETS.includes(ctx.creatureType)) add(EXORCISM_ABILITY, manaFrom(ID.exorcismMana))
    },
    // Row 7: Consecration rank 5 at mana ≥ x%; row 7b, rank 1 at mana ≥ y%. The ranks share one cooldown.
    consecration: () => {
      if (v.on(ID.consecration)) add(CONSECRATION, manaFrom(ID.consecrationMana))
    },
    consecrationRank1: () => {
      if (v.on(ID.consecrationRank1)) add(CONSECRATION_RANK1, manaFrom(ID.consecrationRank1Mana))
    },
    // Row 8: Hammer of Wrath, only in the execute phase (the ability says so), at mana ≥ x%.
    hammerOfWrath: () => {
      if (v.on(ID.hammerOfWrath) && ctx.executePhase) add(HAMMER_OF_WRATH_ABILITY, manaFrom(ID.hammerOfWrathMana))
    },
    // The on-use trinkets, off the GCD, on cooldown from the pull (consumables.ts, as Retribution's).
    trinkets: () => paladinTrinkets(v, ID.trinkets, ctx, add),
  })

  // After the list, off the GCD: Juju Flurry on cooldown from the pull, then the mana potion and
  // rune, when selected in Buffs, whenever the most they restore fits (consumables.ts, as
  // Retribution's).
  const pressed = paladinConsumables(v, ID, ctx, maxManaTenths, add)
  // The early lines rest on knowing when the fight ends (paladin.md "Tuning the defaults (C3)").
  const timed = rotation.some((e) => e.conditions.some((c) => c.code === COND.timeLeftAtLeast))

  // Rows 0 and 0b, the pre-pull, built last so the abilities keep their indexes: the aura, then
  // Righteous Fury, from 4.5 and 3 s before the pull, a GCD apart and before the seal: the duty
  // first (D26's fixed rule), Devotion Aura, or with it off (Max TPS) Retribution Aura and its
  // damage on the boss's swings. An aura lasts until you cancel it, so neither needs a line.
  const aura = index(v.on(ID.devotionAura) ? DEVOTION_AURA : RETRIBUTION_AURA)
  const fury = index(RIGHTEOUS_FURY)
  if (!v.on(ID.devotionAura)) procs.push(RETRIBUTION_AURA_PROC)

  return {
    abilities,
    rotation,
    prepull: {
      casts: [
        { ability: aura, atMs: PREPULL_AURA_MS },
        { ability: fury, atMs: PREPULL_RIGHTEOUS_FURY_MS },
        { ability: prepullSeal, atMs: PREPULL_SEAL_MS },
      ],
      chargeTenths: 0,
      keepTenths: -1,
    },
    onUse: pressed,
    procs: [...paladinProcs(abilities, talents, ctx, rule), ...procs],
    ...(timed ? { assumes: [{ id: 'knownFightEnd' as const, detail: PROTECTION_KNOWN_FIGHT_END }] } : {}),
  }
}

/**
 * The [?] assumptions a Protection plan relies on (paladin.md#open-questions), by what it has:
 * Holy Shield's block damage, Retribution Aura's, Reckoning's extra attacks, Redoubt, and Seal of
 * Fury's absorb for Improved Seal of Fury's mana.
 */
export function protectionAssumptions(plan: Plan): AssumptionId[] {
  if (plan.spec !== 'paladin-protection') return []
  const procs = new Set(plan.procs.map((p) => p.id))
  const ids: AssumptionId[] = []
  if (procs.has(HOLY_SHIELD_PROC.id)) ids.push('holyShieldDamage')
  if (procs.has(RETRIBUTION_AURA_PROC.id)) ids.push('retributionAura')
  if (procs.has('reckoning')) ids.push('reckoning')
  if (procs.has('redoubt')) ids.push('redoubt')
  if (procs.has('improvedSealOfFury')) ids.push('improvedSealOfFury')
  // paladin.md#other-abilities, OQ 11: Hammer of the Righteous's weapon DPS, by the Advanced rule.
  const hammer = plan.abilities.find((a) => a.id === 'hammerOfTheRighteous')
  if (hammer) ids.push(plan.spells?.[hammer.spell ?? -1]?.weaponDpsAp === false ? 'hammerOfTheRighteousWeaponOnly' : 'hammerOfTheRighteous')
  return ids
}
