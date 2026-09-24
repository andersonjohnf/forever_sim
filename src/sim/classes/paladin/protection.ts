// The Protection priority list and its settings (docs/classes/paladin.md "Protection: model and
// rotation": "Forever priority list (default)", rows 0–8, and "Protection defaults").
//
// Rows: Righteous Fury is up all fight (row 0, the plan's static Holy threat, setup.ts); the seal
// (row 1: Seal of Fury, or Seal of Righteousness) before the pull and whenever it's missing or about
// to end; Holy Shield whenever its buff is gone (row 2); the seal's judgement (row 3) and Swift
// Judgement right after it (row 4); Holy Strike (row 5); Exorcism against Undead and Demons (row 6);
// Consecration rank 5 and rank 1 by mana (row 7); Hammer of Wrath in the execute phase (row 8); the
// consumables: on-use trinkets, Juju Flurry, the mana potion and the rune (consumables.ts); and the
// paladin's aura, Devotion Aura (its duty) or Retribution Aura. A Priority choice at the top picks
// the tank's duties first (the default) or Max TPS (decision D26), which moves defaults the way
// Warrior Protection's does. Setting ids are `paladin.protection.<ability>.<param>`; mana
// thresholds are percentages of maximum mana. Abilities are resolved with the build's talents
// (talents.ts) before their costs or spells feed anything. Hammer of the Righteous (row 5b) is off
// by default and not simulated yet.
import type { AuraSpec, ProcSpec } from '../../effects/types'
import { type AbilityDef, COND, type Plan, type RotationCondition, type RotationEntry, type SpellDef } from '../../plan/types'
import type { AssumptionId } from '../../plan/assumptions'
import type { FixedRotationRow, RotationOption, RotationValue } from '../../types'
import { NO_CONTEXT, reader, seconds, type ClassRotation } from '../warrior/shared'
import {
  CONSECRATION,
  CONSECRATION_RANK1,
  EXORCISM_ABILITY,
  HAMMER_OF_WRATH_ABILITY,
  HOLY_STRIKE_ABILITY,
  JUDGEMENT_OF,
  PALADIN,
  SEAL_OF_FURY,
  SEAL_OF_RIGHTEOUSNESS,
} from './abilities'
import { JUJU_FLURRY, MANA_POTION, MANA_RUNE, paladinConsumables } from './consumables'
import { EXORCISM_TARGETS, manaOption } from './retribution'
import { type PaladinContext, paladinProcs, PREPULL_SEAL_MS } from './setup'
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
  judgement: `${P}.judgement.enabled`,
  holyStrike: `${P}.holyStrike.enabled`,
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
 * The priority choice's values (paladin.md "Max TPS", decision D26): the default keeps the tank's
 * duties; Max TPS gives them up for threat alone.
 */
export const PROTECTION_PRIORITY = { duties: 'duties', maxTps: 'maxTps' } as const
const MAX_TPS = { option: ID.priority, is: PROTECTION_PRIORITY.maxTps } as const

/**
 * Protection recasts its seal with 2 s left, half a second earlier than the core's 1.5 s, so a
 * global cooldown on Holy Shield never lets it drop (paladin.md "Tuning the defaults").
 */
const PROT_SEAL_REFRESH_SEC = 2


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
 * 20% more threat, multiplied with Righteous Fury's (×1.9 × 1.2 = ×2.28) [?]
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

/** Put up 3 s before the pull, a global cooldown before the seal (paladin.md "Forever priority list", row 0b). */
export const PREPULL_AURA_MS = -3000

/** Righteous Fury goes up a global cooldown before the aura (paladin.md "Forever priority list", row 0). */
export const PREPULL_RIGHTEOUS_FURY_MS = -4500

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
 * Righteous Fury (25780, paladin.md#threat-paladin-specific): +90% threat from Holy damage, 30 min [F].
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
 * hits you (aura 15, a damage shield; no spell damage coefficient) [F] [client] (SpellEffect,
 * 1.60.1.69913), × Righteous Fury for its threat. Like every damage shield it always lands and
 * never crits [?]; each of the boss's swings that lands on you (a hit, crit, crushing blow or block)
 * triggers it [?].
 */
export const RETRIBUTION_AURA_DAMAGE: SpellDef = {
  ...HOLY_SHIELD_DAMAGE,
  id: 'retributionAuraDamage',
  name: 'Retribution Aura',
  icon: 'spell_holy_auraoflight',
  min: 30,
  max: 30,
  spCoefficient: 0,
  takenScale: 0,
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
 * Defaults from paladin.md's "Forever priority list (default)" for Protection, in priority order.
 * They're the best rotation found for the default setup, keeping the tank's duties (decisions D23
 * and D26; paladin.md "Tuning the defaults", measured on TPS with scripts/tune/rotation.mjs).
 */
export const PROTECTION_OPTIONS: RotationOption[] = [
  {
    kind: 'choice',
    id: ID.priority,
    label: 'Priority',
    help: 'Tank duties first keeps your Devotion Aura up, for its 735 armor. Max TPS runs Retribution Aura instead: the boss takes 30 Holy damage each time it hits you, for about 5% more TPS and 5% more damage taken in the default setup. Pick it when threat is short and your healers can take the damage, or when another paladin in your group keeps Devotion Aura up. It turns Devotion Aura off by default, here and in the Buffs tab.',
    choices: [
      { value: PROTECTION_PRIORITY.duties, label: 'Tank duties first' },
      { value: PROTECTION_PRIORITY.maxTps, label: 'Max TPS' },
    ],
    default: PROTECTION_PRIORITY.duties,
  },
  {
    kind: 'toggle',
    id: ID.holyShield,
    group: 'Cooldowns and buffs',
    label: 'Holy Shield',
    help: 'Keep Holy Shield up: +20% block chance for 10 s or 4 blocks, and each block deals 221 Holy damage plus 8% of your spell damage, with 20% more threat. Needs the talent and a shield. 240 mana.',
    default: true,
    requires: { talent: 'Holy Shield', shield: true },
  },
  {
    kind: 'toggle',
    id: ID.devotionAura,
    group: 'Cooldowns and buffs',
    label: 'Devotion Aura',
    help: 'Keep your Devotion Aura up: +735 armor. Off, you run Retribution Aura instead: the boss takes 30 Holy damage each time it hits you, with Righteous Fury’s threat. While this is on, the Buffs tab’s Devotion Aura is yours. Off by default with Max TPS.',
    default: true,
    defaultWhen: [{ ...MAX_TPS, default: false }],
    maintainsBuff: 'devotionAura',
  },
  {
    kind: 'toggle',
    id: ID.trinkets,
    group: 'Cooldowns and buffs',
    label: 'On-use trinkets',
    help: 'Use Weakness Analyzer on cooldown if you wear it: +5% crit and spell crit until your next crit, for up to 20 s. Other on-use trinkets aren’t simulated.',
    default: true,
  },
  {
    kind: 'toggle',
    id: ID.juju,
    group: 'Cooldowns and buffs',
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
    help: 'Seal of Fury adds 35 Holy damage to each of your auto attacks. With a shield, each also shields you from a little damage, and when a hit uses that up, Improved Seal of Fury restores mana (87 against a raid boss). Its judgement taunts. Seal of Righteousness adds Holy damage that grows with your weapon’s speed instead; it does better only with a two-hander, and so without a shield.',
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
    help: 'Use Holy Strike whenever it’s ready: 40% of a normalized swing plus spell damage, all Holy, with 25% more threat from Iron Creed 5/5. 20 mana.',
    default: true,
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
    help: 'Put down Consecration (rank 5, 565 mana): 8 ticks of Holy damage over 8 s. By default only from 90% mana, so at the pull and seldom after: the mana does more for Holy Shield, your seal and Hammer of Wrath.',
    default: true,
  },
  manaOption(
    ID.consecrationMana,
    'Consecration from',
    'Use rank 5 only at or above this share of your maximum mana. 90 is tuned for 3-minute fights with a 20% execute phase, where Hammer of Wrath spends the mana better at the end. For fights of 90 s or less, or without an execute phase, 40 to 60 does better, by up to 7% of TPS.',
    90,
    ID.consecration,
    'Fillers',
  ),
  {
    kind: 'toggle',
    id: ID.consecrationRank1,
    group: 'Fillers',
    label: 'Consecration (Rank 1)',
    help: 'Below rank 5’s mana threshold, put down rank 1 (135 mana). Every rank has the full spell damage bonus, so with enough spell damage it’s the most threat for the mana.',
    default: false,
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
export const PROTECTION_KNOWN_FIGHT_END = 'with the default setup, judging it 10 to 20 s off costs under 0.01%'

/**
 * What a Protection paladin always does (paladin.md "Forever priority list (default)", row 0): its
 * Righteous Fury, up all fight, with no setting.
 */
export const PROTECTION_FIXED_ROWS: FixedRotationRow[] = [
  {
    id: `${P}.righteousFury`,
    label: 'Righteous Fury',
    group: 'Cooldowns and buffs',
    help: 'Up all fight, cast before the pull: ×1.9 threat from your Holy damage. A Protection paladin never tanks without it.',
    value: 'Always on',
  },
]

/**
 * Buff catalogue ids the rotation keeps up itself with these settings, so the plan drops the Buffs
 * switch's static version: your own Devotion Aura (paladin.md "Priority", D26).
 */
export function protectionMaintainedBuffs(values: Record<string, RotationValue>): string[] {
  return reader(PROTECTION_OPTIONS, values).on(ID.devotionAura) ? ['devotionAura'] : []
}

/** The seal the settings choose (paladin.md "Protection defaults": Seal of Fury, Seal of Righteousness selectable). */
export const protectionSeal = (values: Record<string, RotationValue>): AbilityDef =>
  reader(PROTECTION_OPTIONS, values).str(ID.seal) === 'righteousness' ? SEAL_OF_RIGHTEOUSNESS : SEAL_OF_FURY

/**
 * The Protection priority list from the settings (paladin.md "Forever priority list (default)").
 * `talents` gates Holy Shield and Swift Judgement and resolves costs and cooldowns; `context` gives
 * the main hand (Seal of Righteousness), whether a shield is equipped (Holy Shield), the maximum
 * mana (the mana thresholds are shares of it), the creature type (Exorcism) and whether the fight
 * has an execute phase (Hammer of Wrath). Abilities 0 and 1 are the seal and its judgement, as in
 * `paladinCore`.
 */
export function protectionRotation(
  values: Record<string, RotationValue>,
  talents: TalentRanks,
  _auraIndex: (id: string) => number,
  context: Partial<PaladinContext> = {},
): ClassRotation {
  const ctx: PaladinContext = { ...NO_CONTEXT, ...context }
  const v = reader(PROTECTION_OPTIONS, values, talents)
  const abilities: AbilityDef[] = []
  const rotation: RotationEntry[] = []
  /** The ability's index, resolved with the build's talents on first use. */
  const index = (def: AbilityDef): number => {
    const i = abilities.findIndex((a) => a.id === def.id)
    if (i >= 0) return i
    abilities.push(withTalents(def, talents))
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
  const procs: ProcSpec[] = []

  // Abilities 0 and 1: the seal and its judgement. Seal of Fury's absorb needs a shield.
  const sealDef = protectionSeal(values)
  const seal = index(sealDef)
  const judge = index(JUDGEMENT_OF[sealDef.id])
  if (sealDef.id === SEAL_OF_FURY.id && ctx.hasShield) procs.push(SEAL_OF_FURY_SHIELD_PROC)

  // Row 1: the seal when it's missing or has at most refreshBelowSec left.
  add(sealDef, [{ code: COND.abilityAuraRefresh, a: seal, b: seconds(v, ID.sealRefresh) }])

  // Row 2: Holy Shield (the talent, with a shield) whenever its buff is gone: its 4 blocks used or
  // its 10 s over. Its cooldown is its duration, so that's on cooldown unless blocks end it early.
  if (talents.has('Holy Shield') && ctx.hasShield && v.on(ID.holyShield)) {
    const shield = index(HOLY_SHIELD)
    add(HOLY_SHIELD, [{ code: COND.abilityAuraRefresh, a: shield, b: 0 }])
    procs.push(HOLY_SHIELD_PROC)
  }

  if (v.on(ID.judgement)) {
    // Row 3: the seal's judgement whenever Judgement is ready, while the seal is up (it stays up).
    rotation.push({ ability: judge, conditions: [auraUp(seal)], unqueueBelowTenths: 0 })
    // Row 4: Swift Judgement (the talent, off the GCD) while Judgement has at least x s of cooldown
    // left and the seal is up: it ends that cooldown, and the judgement it frees costs nothing.
    if (talents.has('Swift Judgement') && v.on(ID.swiftJudgement)) {
      add({ ...SWIFT_JUDGEMENT, endsCooldownOf: judge }, [{ code: COND.cooldownAtLeast, a: judge, b: seconds(v, ID.swiftJudgementCooldown) }, auraUp(seal)])
      abilities[judge] = { ...abilities[judge], clearcastable: true }
    }
  }

  // Row 5: Holy Strike on cooldown; with Iron Creed, each that lands cuts damage taken for 6 s.
  if (v.on(ID.holyStrike)) {
    const strike = add(HOLY_STRIKE_ABILITY, [])
    const creed = talents.get('Iron Creed') ?? 0
    if (creed > 0) abilities[strike] = { ...abilities[strike], aura: ironCreedAura(creed) }
  }

  // Row 6: Exorcism on cooldown against Undead and Demons, at mana ≥ x%.
  if (v.on(ID.exorcism) && EXORCISM_TARGETS.includes(ctx.creatureType)) add(EXORCISM_ABILITY, manaFrom(ID.exorcismMana))

  // Row 7: Consecration rank 5 at mana ≥ x%, else rank 1 at mana ≥ y%. The ranks share one cooldown.
  if (v.on(ID.consecration)) add(CONSECRATION, manaFrom(ID.consecrationMana))
  if (v.on(ID.consecrationRank1)) add(CONSECRATION_RANK1, manaFrom(ID.consecrationRank1Mana))

  // Row 8: Hammer of Wrath, only in the execute phase (the ability says so), at mana ≥ x%.
  if (v.on(ID.hammerOfWrath) && ctx.executePhase) add(HAMMER_OF_WRATH_ABILITY, manaFrom(ID.hammerOfWrathMana))

  // On-use trinkets and Juju Flurry on cooldown from the pull, then the mana potion and rune, when
  // selected in Buffs, whenever the most they restore fits (consumables.ts, as Retribution's).
  const pressed = paladinConsumables(v, ID, ctx, maxManaTenths, add)
  // The early lines rest on knowing when the fight ends (paladin.md "Tuning the defaults (C3)").
  const timed = rotation.some((e) => e.conditions.some((c) => c.code === COND.timeLeftAtLeast))

  // Righteous Fury, then the aura, from 4.5 and 3 s before the pull, a GCD apart and before the
  // seal: Devotion Aura, or Retribution Aura and its damage on the boss's swings. They need no line.
  const fury = index(RIGHTEOUS_FURY)
  const aura = index(v.on(ID.devotionAura) ? DEVOTION_AURA : RETRIBUTION_AURA)
  if (!v.on(ID.devotionAura)) procs.push(RETRIBUTION_AURA_PROC)

  return {
    abilities,
    rotation,
    prepull: {
      casts: [
        { ability: fury, atMs: PREPULL_RIGHTEOUS_FURY_MS },
        { ability: aura, atMs: PREPULL_AURA_MS },
        { ability: seal, atMs: PREPULL_SEAL_MS },
      ],
      chargeTenths: 0,
      keepTenths: -1,
    },
    onUse: pressed,
    procs: [...paladinProcs(abilities, talents, ctx), ...procs],
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
  return ids
}
