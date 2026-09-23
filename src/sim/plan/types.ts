// The resolved plan (decision D15: "the config is resolved once into a flat, precomputed plan").
//
// The main thread turns a SimConfig into a Plan: gear summed, buffs and talents applied,
// conditions resolved, profile values copied in. The plan is plain data, so it posts to workers
// by structured clone, and the engine that runs it imports no datasets. Everything the engine
// needs per event is a number here.
import type { AuraSpec } from '../effects/types'
import type { RulesProfile } from '../rules/profiles'
import type { StatBlock } from '../stats/stat-block'
import type { Assumption, CharacterSheet, ClassId, CreatureType, DamageTakenRageModel, Role, SpecId } from '../types'

export const HAND = { main: 0, off: 1 } as const

/** Proc triggers as integer codes (effects/types.ts ProcTrigger). */
export const TRIGGER = {
  meleeLanded: 0,
  whiteLanded: 1,
  meleeCrit: 2,
  damageTaken: 3,
  block: 4,
  dodgeParry: 5,
  swingLanded: 6,
  /** The target dodged one of the player's attacks, white or special (the Overpower window, warrior.md §2.8). */
  targetDodge: 7,
  // The boss's swings on the player (combat-tables §8), for any class's defensive procs:
  /** The player dodged (Natural Reaction). `dodgeParry` fires too. */
  dodge: 8,
  /** The player parried. `dodgeParry` fires too. */
  parry: 9,
  /**
   * A swing landed on the player: a hit, crit, crushing blow or block, whatever it costs (Redoubt).
   * Fires after `damageTaken` (if the swing cost health) and before `block` or `critTaken`.
   */
  meleeTaken: 10,
  /** The player took a crit (Reckoning). */
  critTaken: 11,
  /**
   * A landed white swing (an extra attack too), after its own crit's procs: the paladin's damage
   * seals, which fire after the swing's Vengeance (paladin.md#implementation-notes).
   */
  whiteResolved: 12,
  /** A spell crit on the magic or ranged table (combat-tables §9): Vengeance (paladin.md#retribution-tree). */
  spellCrit: 13,
} as const
export const TRIGGER_COUNT = 14

/**
 * Warrior stances as bits (docs/classes/warrior.md#21-stances). An ability's `stances` mask says
 * where it can be used; a plan's `stance` is the bit it fights in, or STANCE_ANY for a class
 * without stances.
 */
export const STANCE = { battle: 1, defensive: 2, berserker: 4 } as const
export const STANCE_ANY = 7

/**
 * What a stance changes, relative to the plan's base stance (warrior.md §2.1, §7 "Stances"). The
 * plan's static numbers (`damageMult`, `threatMult`, `damageTakenMult`, the stat block's crit) are
 * the base stance's, exactly as before stances could change; each stance carries the factors and
 * the crit delta that turn them into its own, so the base stance's are 1, 1, 1 and 0.
 */
export interface StancePlan {
  /** The STANCE bit. */
  stance: number
  /** Factor on all damage done (Defensive Stance −10%). */
  damage: number
  /** Factor on threat (the stance's own, and Defiance's in Defensive Stance with a shield). */
  threat: number
  /** Factor on damage taken (Defensive −10%, Berserker +10%). */
  damageTaken: number
  /** Aura crit %, added (Berserker Stance +3). */
  crit: number
  /** Spell crit %, added (Berserker Stance's +3 is all crit in `forever`, melee only in `classicEra`). */
  spellCrit: number
}

/** Proc actions as integer codes. */
export const ACTION = {
  extraAttacks: 0,
  aura: 1,
  spellDamage: 2,
  rage: 3,
  weaponBleed: 4,
  /** Casts a plan spell (`amount`: its index in Plan.spells): the paladin's seal procs. */
  spell: 5,
  /** Mana: `amount` % of maximum mana (Shield Specialization, paladin.md#protection-tree). */
  mana: 6,
} as const

/**
 * A spell's damage class, the client's `SpellCategories.DefenseType`, which picks its attack table
 * (paladin.md#conventions-used-below; combat-tables §3 "Defense type"): `magic` the spell table
 * (§9), `melee` the special-attack table (§3), `ranged` miss, block, then crit, `none` always hits.
 */
export const DEFENSE = { none: 0, magic: 1, melee: 2, ranged: 3 } as const

/** Spell schools as codes (ProcPlan.school's, plus physical). */
export const SCHOOL = { fire: 0, frost: 1, shadow: 2, nature: 3, arcane: 4, holy: 5, physical: 6 } as const

/**
 * A damaging spell, as data (paladin.md#conventions-used-below): a seal's proc, a judgement, Holy
 * Strike, Exorcism. One engine function resolves them all. Damage is `min…max` (weapon-based:
 * `weaponPercent` × (main-hand roll + flat weapon damage + AP/14 × speed + `min…max`)), plus
 * `spCoefficient` × spell damage, × `damageMult` and the school's multipliers, then plus the
 * target's flat damage taken of its school (Judgement of the Crusader) × `takenScale`, and × the
 * crit multiplier on a crit.
 */
export interface SpellDef {
  id: string
  name: string
  icon: string
  school: keyof typeof SCHOOL
  defense: keyof typeof DEFENSE
  /** Can't be dodged, parried or blocked (SpellMisc Attr0 0x200000, "No Active Defense"). */
  noActiveDefense: boolean
  /** Never misses (SpellMisc Attr3 0x40000, "Always Hit"). */
  alwaysHit: boolean
  /**
   * Its hits and crits trigger procs: on-hit and crit procs, and crit charges. A spell you cast
   * always does; a spell that another spell or an aura triggers (a seal's proc, a judgement's
   * damage, a periodic tick) only with SpellMisc Attr3 0x200, "NOT_A_PROC" [?]
   * (paladin.md#conventions-used-below).
   */
  triggersProcs: boolean
  min: number
  max: number
  weaponPercent: number
  normalized: boolean
  spCoefficient: number
  /** Share of the target's flat damage taken of this school it gets (JotC: the coefficient, paladin.md). */
  takenScale: number
  critMultiplier: number
  bonusCrit: number
  /** Its own damage multiplier (Improved Seals, Sacred Arbiter). */
  damageMult: number
  /** Threat = damage × mult + bonus, before the school's and the global multipliers (threat.md). */
  threatMult: number
  threatBonus: number
}

export interface SpellPlan extends Omit<SpellDef, 'name' | 'icon' | 'school' | 'defense'> {
  school: number
  defense: number
  /** Breakdown row. */
  source: number
}

export interface WeaponPlan {
  name: string
  icon: string
  min: number
  max: number
  speedSec: number
  twoHand: boolean
  /** Flat weapon damage (stones, enchants), added to the roll (damage-and-timing §2.1). */
  flatDamage: number
  /** Damage share of this hand: 1 main hand; 0.5 × (1 + DWS) off hand (damage-and-timing §2.3). */
  handMult: number
  skill: number
  /** Hit % only this hand gets (Dual Wield Specialization's off-hand hit). */
  hitBonus: number
  /** Aura crit % only this hand's attacks get (Weaponmaster's axe and polearm crit, warrior.md §2.7). */
  critBonus: number
  /** Fraction of the target's armor this hand ignores (Weaponmaster, maces). */
  armorPenPct: number
  /** Multiplier on this hand's white rage after the profile's off-hand base (Dual Wield Specialization). */
  rageMult: number
  /** Glancing damage factor range at this hand's skill (combat-tables §2.3). */
  glanceLow: number
  glanceHigh: number
  /** Speed for normalized abilities: 2.4 one-hand, 1.7 dagger, 3.3 two-hand (damage-and-timing §2.2). */
  normalizedSpeed: number
}

export interface AuraPlan {
  id: string
  /** For the results' "Cooldowns and buffs"; a weapon's own proc names its hand when both have one. */
  name: string
  /** WoW icon name: the proc's or the ability's that applies it. */
  icon: string
  durationMs: number
  maxStacks: number
  whiteSwingCharges: number
  str: number
  agi: number
  ap: number
  /** Attack power %, multiplicative with the stat block's AP multiplier (Blood Fury, warrior.md §2.9). */
  apPct: number
  crit: number
  /** Spell crit % (all-crit auras, 290: Recklessness, Elune's Light, Weakness Analyzer). */
  spellCrit: number
  /** Attack speed %, multiplicative. */
  haste: number
  /** Physical damage %, multiplicative. */
  damage: number
  /** Crits dealt that end it early (Weakness Analyzer: 1; 0 = none). */
  critCharges: number
  // Defensive mods (combat-tables §8), absent = 0: dodge, parry and block chance %, block value,
  // bonus armor, and damage taken % (multiplicative; −75 is ×0.25).
  dodge?: number
  parry?: number
  block?: number
  blockValue?: number
  armor?: number
  damageTaken?: number
  /** Blocks that end it early (Holy Shield 4, Redoubt 5; absent or 0 = none). */
  blockCharges?: number
  /** Holy damage done %, multiplicative (Vengeance, paladin.md#retribution-tree). */
  holy?: number
  /** Flat Holy damage the target takes (Judgement of the Crusader, paladin.md). */
  holyTaken?: number
  /**
   * Auras in the same group exclude each other: putting one up ends the others (one seal per
   * paladin, one judgement debuff per paladin on the target; paladin.md#seals).
   */
  group?: string
}

export interface ProcPlan {
  id: string
  name: string
  trigger: number
  /** Chance per trigger as a fraction, per hand [main, off]; for non-weapon triggers index 0. */
  chance: [number, number]
  /** Bit mask of hands that can trigger it (1 = main, 2 = off). */
  hands: number
  icdMs: number
  action: number
  /** extraAttacks: count; rage: tenths; aura: aura index; weaponBleed: ticks. */
  amount: number
  /** extraAttacks: bonus AP; spellDamage: min; weaponBleed: share. */
  a: number
  /** spellDamage: max; weaponBleed: tick period in ms. */
  b: number
  /** spellDamage: school code (0 fire, 1 frost, 2 shadow, 3 nature, 4 arcane, 5 holy). */
  school: number
  /** Breakdown row for what it does, or −1. */
  source: number
  /** Chain bit for extra-attack procs (damage-and-timing §5.4), 0 otherwise. */
  chainBit: number
  /**
   * Rolled only while this plan aura is up (Bloodthrill: your Rend on the target, warrior.md §2.8);
   * absent or −1 for none.
   */
  requiresAura?: number
  /**
   * A PPM proc's rate (damage-and-timing §5.1), kept so a shapeshift can re-resolve its main-hand
   * chance from the new form's swing speed (druid.md §2.1); absent for flat chances.
   */
  ppm?: number
  /**
   * Bit mask of the plan's forms (1 << index into `Plan.forms`) it can be rolled in (Primal Fury's
   * rage: bear only, druid.md §4.8); absent or 0 for any form.
   */
  forms?: number
}

export interface SourcePlan {
  id: string
  name: string
  icon: string
  /**
   * A bleed's row (Rend, Deep Wounds): its casts, misses, dodges and parries count applications,
   * its hits and crits count ticks. Whether the ticks can crit and an application can be avoided.
   */
  bleed?: { ticksCanCrit: boolean; avoidable: boolean }
}

/**
 * An active ability, as data. The engine resolves every ability with one switch on `kind`, so a
 * new ability adds a row, not a code path. Numbers come from src/data/client/spells.json (doc
 * fallback), per ability in classes/warrior/abilities.ts.
 */
export interface AbilityPlan {
  id: string
  name: string
  icon: string
  /** Breakdown row. */
  source: number
  /**
   * How it rolls (docs/mechanics/combat-tables.md#3-special-yellow-attacks):
   * `weaponStrike`: one roll over miss, dodge, parry, block, crit (every special except the
   * melee spells: Whirlwind, Mortal Strike, Hamstring, …);
   * `meleeSpell`: roll 1 for miss, dodge, parry, block, roll 2 for crit (Bloodthirst, Execute,
   * Shield Slam, Revenge);
   * `onNextSwing`: queued off the GCD, replaces the next main-hand swing and rolls like a
   * `weaponStrike` (Heroic Strike, Cleave; warrior.md §2.4);
   * `cast`: no attack: it puts `aura` on the warrior and grants its rage (Battle Shout,
   * Bloodrage, Death Wish, Recklessness, Berserker Rage, racial cooldowns, on-use items and
   * consumables; warrior.md §3.2, §2.9, §5.2). The damage fields are unused;
   * `bleed`: one roll for miss, dodge and parry and no crit; if it lands it puts its bleed on the
   * target (`dotTicks` ticks of `dotTickDamage`) and `aura` marks it there (Rend, warrior.md
   * §3.1; damage-and-timing §4). The direct-damage fields are unused;
   * `shift`: no attack: a druid's shapeshift into form `shiftTo`, with the form's entry rules for
   * Energy and rage (Furor, druid.md §2.8). The damage fields are unused.
   */
  kind: 'weaponStrike' | 'meleeSpell' | 'onNextSwing' | 'cast' | 'bleed' | 'shift' | 'spell'
  /** Rage cost in tenths after the build's talent reductions (warrior.md §2.3 "Cost reductions"). */
  costTenths: number
  cooldownMs: number
  /** 0 = off the GCD (damage-and-timing §3.5). */
  gcdMs: number
  /**
   * Cast time in ms, 0 for an instant (Slam: 1500 − 250 per Improved Slam rank, warrior.md §3.1).
   * The GCD starts with the cast, and no GCD ability starts before it completes; off-GCD lines
   * still act. When it completes the ability pays its cost (it fails with too little rage then),
   * starts its cooldown and strikes (warrior.md §7).
   */
  castMs: number
  /**
   * No white swings during the cast, and both swing timers restart from full when it completes
   * (Slam without Improved Slam; damage-and-timing §3.3). Otherwise the timers are untouched.
   */
  castStopsSwings: boolean
  /** Needs a two-handed weapon (Spearing Strike, warrior.md §3.1): never used with one-handers. */
  twoHandOnly: boolean
  /**
   * Can't be dodged, parried or blocked (Overpower, warrior.md §3.1): its one roll is miss, then
   * crit, then hit (combat-tables §3).
   */
  unavoidable: boolean
  /**
   * The plan aura that must be on the warrior for it to be usable, and that using it ends, or −1:
   * the Overpower window a dodge or Bloodthrill opens (warrior.md §2.8, §7).
   */
  window: number
  /** STANCE bits of the stances it can be used in (warrior.md §3.1 "Stance"); STANCE_ANY for any. */
  stances: number
  /** Usable only in the execute phase, at or below the target's execute health (Execute; encounter §3). */
  executePhaseOnly: boolean
  /**
   * Weapon damage share (0 = not weapon-based), and whether its AP bonus uses the normalized
   * speed (damage-and-timing §2.2). Weapon-based damage is (roll + flat weapon damage + AP/14 ×
   * speed + `flatDamage`) × `weaponPercent` × the hand's multiplier; otherwise it is
   * `flatDamage` + `apCoefficient` × AP (+ `damagePerExtraRage` × rage; damage-and-timing §2.6).
   */
  weaponPercent: number
  normalized: boolean
  flatDamage: number
  apCoefficient: number
  /**
   * Execute: damage per point of rage left after paying the cost, read when it's cast; a landed
   * hit then spends all the rage (warrior.md §3.1 "Execute details"). 0 for everything else.
   */
  damagePerExtraRage: number
  /** Extra crit % for this ability (Improved Overpower) and its crit multiplier (2.2 with Impale, warrior.md §2.5). */
  bonusCrit: number
  critMultiplier: number
  /** Share of the cost refunded on a miss, dodge or parry (rage.md#rage-refunds-on-avoided-abilities). */
  refundShare: number
  /** Threat = damage × mult + bonus on a landed hit (threat.md#per-ability-threat-at-max-rank). */
  threatMult: number
  threatBonus: number
  /**
   * Breakdown row of a second strike with the off hand, or −1: Raging Blows' off-hand Whirlwind
   * (warrior.md §3.1). It rolls the off hand's special table and deals the weapon damage at the
   * off hand's speed and hand multiplier; it costs nothing more and refunds nothing.
   */
  offHandSource: number
  /**
   * `cast`: the plan aura it puts on the warrior, or −1 (Death Wish, Recklessness, Blood Fury, …).
   * `bleed`: the plan aura that marks the bleed on the target, with no stat mods: up from the
   * application until its last tick, so rotation conditions can read it, as Bloodthrill's proc
   * will (Rend).
   */
  aura: number
  /**
   * `bleed`: damage per tick before physical damage modifiers, after the ability's own talents
   * (Rend: 21 × Improved Rend's 1.12 / 1.23 / 1.35, W13), and `dotTicks` ticks every `dotTickMs`
   * from the application. The ticks ignore armor, never miss, and snapshot the caster's
   * multipliers and crit chance at the application (damage-and-timing §4).
   */
  dotTickDamage: number
  dotTicks: number
  dotTickMs: number
  /**
   * `bleed`: the spell's periodic-crit flag (SpellMisc Attributes[8] 0x200). Its ticks may crit
   * only in a profile whose periodic effects can crit (`forever`), at `critMultiplier`
   * (damage-and-timing §2.5, §4).
   */
  periodicCanCrit: boolean
  /**
   * `cast`: rage in tenths, `rageTenths` at once and then `rageTicks` ticks of `rageTickTenths`
   * every `rageTickMs` from the cast (Bloodrage: 100, then 10 × 10 every 1000 ms; warrior.md
   * §2.3). These are energizes: capped at max rage, with 5 threat per rage gained
   * (rage.md#rage-pool-cap-and-decay, threat.md#threat-from-healing-power-gains-and-buffs).
   */
  rageTenths: number
  /**
   * `cast`: a random extra of 0 to this many tenths on the rage at once, a whole number drawn
   * uniformly from the proc stream (Mighty Rage Potion: 450 + 0…300, warrior.md §5.2 row 16).
   */
  rageSpreadTenths: number
  rageTickTenths: number
  rageTicks: number
  rageTickMs: number
  /** Uses per fight, then never again (Mighty Rage Potion: once, warrior.md §5.2 row 16); 0 = no limit. */
  usesPerFight: number
  // --- Druid resources and forms (docs/classes/druid.md §2). All optional: a row without them is
  // a rage ability usable in any form, as every warrior row is. ---
  /**
   * The pool `costTenths` is paid from, refunds go back to, a `cast`'s `rageTenths` and ticks go to,
   * and `damagePerExtraRage` reads and a landed hit then spends (Ferocious Bite's Energy, druid.md
   * §3.5; the paladin's mana, paladin.md#mana-model). All pools are in tenths. Absent: rage.
   */
  resource?: 'rage' | 'energy' | 'mana'
  /** Bit mask of the plan's forms (1 << index into `Plan.forms`) it can be used in; absent or 0: any. */
  forms?: number
  /** Combo points it awards when it lands (a cat builder: 1, druid.md §2.5). */
  comboPoints?: number
  /** Chance of one more combo point on a non-periodic crit (Primal Fury: 0.5 per rank, druid.md §2.5). */
  critComboPointChance?: number
  /**
   * A finisher (Rip, Ferocious Bite, druid.md §2.5): usable only with a combo point, and a landed hit
   * spends them all; a miss, dodge or parry keeps them.
   */
  finisher?: boolean
  /** Damage per combo point spent, and attack-power coefficient per combo point (Ferocious Bite, druid.md §3.5). */
  damagePerComboPoint?: number
  apCoefficientPerComboPoint?: number
  /** The most combo points the attack-power terms count (Rip: 4, druid.md §3.4); absent: 5. */
  comboPointApCap?: number
  /**
   * `bleed`: tick damage per combo point, and attack power per combo point per tick, snapshotted at
   * the application (Rip, druid.md §3.4, §2.9).
   */
  dotTickPerComboPoint?: number
  dotApCoefficientPerComboPoint?: number
  /** A Clearcasting charge (`Plan.freeCastAura`) makes it cost nothing, and is used up (druid.md §2.7). */
  clearcastable?: boolean
  /** `shift`: the form it shifts into (an index into `Plan.forms`, druid.md §2.8). */
  shiftTo?: number
  // --- Spells, mana returns and shared cooldowns (the paladin, docs/classes/paladin.md). ---
  /**
   * `spell` (and `cast`): the plan spell it casts on use (Plan.spells), and the one each tick casts
   * (Consecration), or −1 / absent. A `spell` ability rolls nothing itself: its spell does.
   */
  spell?: number
  tickSpell?: number
  /**
   * Mana in tenths it returns, with this chance, when it lands (its spell doesn't miss, or it has
   * none): Sanctified Judgement's share of the judged seal's cost (paladin.md#judgement).
   */
  manaReturnTenths?: number
  manaReturnChance?: number
  /**
   * A cooldown category: using any ability of a category starts the cooldown it was used with on
   * all of them (Holy Strike and Hammer of the Righteous, paladin.md#other-abilities; the
   * judgements of each seal). Absent for none.
   */
  category?: string
}

/**
 * An ability before the plan gives it breakdown rows and resolves its aura and target. `offHand`
 * asks for a second strike with the off hand (Raging Blows' Whirlwind, warrior.md §3.1); `aura`
 * is the buff a `cast` puts on the warrior, or a bleed's marker on the target, which the plan adds
 * to its auras; `vsCreature` is a different weapon share against some creature types (Spearing
 * Strike), which the plan resolves against the encounter's creature type (encounter §6).
 */
export type AbilityDef = Omit<AbilityPlan, 'source' | 'offHandSource' | 'aura' | 'window' | 'spell' | 'tickSpell'> & {
  offHand: boolean
  aura: AuraSpec | null
  /** The spell it casts on use, and on each tick (paladin abilities); the plan adds them to Plan.spells. */
  spellDef?: SpellDef
  tickSpellDef?: SpellDef
  vsCreature?: { types: readonly CreatureType[]; weaponPercent: number }
  /** The reactive window it needs and ends (the Overpower window, warrior.md §2.8); the plan adds it to its auras. */
  window?: AuraSpec
}

/** An ability's weapon share against the encounter's creature type (Spearing Strike ×3 vs Giants and Dragonkin, warrior.md §3.1). */
export const weaponPercentVs = (def: AbilityDef, creatureType: CreatureType): number =>
  def.vsCreature && def.vsCreature.types.includes(creatureType) ? def.vsCreature.weaponPercent : def.weaponPercent

/** Rotation condition codes (docs/classes/warrior.md#51-conventions-for-rotation-settings). */
export const COND = {
  /** rage ≥ a (tenths) */
  minRage: 0,
  /** ability a has at least b ms of cooldown left */
  cooldownAtLeast: 1,
  /** GCD-safe: every ability in bit mask a has at least b ms (one GCD) of cooldown left */
  gcdSafe: 2,
  /** aura a is down (a = −1: always true) */
  auraDown: 3,
  /**
   * a = 1: in the execute phase; a = 0: not in it (encounter §3, warrior.md §5.1). The engine
   * resolves it up front into one priority list per phase rather than checking it per walk.
   */
  executePhase: 4,
  /** attack power ≥ a */
  apAtLeast: 5,
  /** attack power < a */
  apBelow: 6,
  /** rage ≤ a (tenths): Bloodrage and Berserker Rage wait so their rage isn't lost at the cap (warrior.md §5.2) */
  maxRage: 7,
  /**
   * the fight has at most a ms left (each fight's drawn length is known; encounter §3). Like the
   * phase, the engine resolves it up front: into a window of times per line for each fight, and
   * a wake-up of the rotation when it becomes true.
   */
  timeLeftAtMost: 8,
  /** the fight has at least a ms left (resolved the same way; it only becomes false, so no wake-up) */
  timeLeftAtLeast: 9,
  /**
   * the aura that ability a puts on the warrior is up (the racial synced with Death Wish, warrior.md
   * §5.2); for a bleed, its bleed is on the target (Rend)
   */
  abilityAuraUp: 10,
  /**
   * the aura that ability a puts on the warrior is down, or has at most b ms left and would end
   * before the fight does (Battle Shout's upkeep, warrior.md §5.2 row 1); for a bleed, its bleed
   * is missing from the target or has at most b ms of ticks left ("Rend missing or under x s").
   * Like the time-left conditions, the engine resolves it into the line's window of times, moved
   * whenever the aura starts or ends, and wakes the rotation when the window opens.
   */
  abilityAuraRefresh: 11,
  /**
   * aura a (an ability's window) is up. The engine puts it first on every line of an ability with a
   * window (the Overpower window, warrior.md §2.8, §7), so a plan needn't, and lines without one pay
   * nothing for it.
   */
  windowOpen: 12,
  /**
   * the execute phase starts in at most a ms, or has started (encounter §3; Arms Recklessness,
   * warrior.md §5.3 row 4). Never true in a fight without one. Each fight's phase start is known,
   * so the engine resolves it like the time-left conditions: into the line's window of times, with
   * a wake-up of the rotation at `execute start − a`.
   */
  executeWithin: 13,
  /** Energy ≥ a (tenths; druid.md §6.2) */
  minEnergy: 14,
  /** Energy ≤ a (tenths): Tiger's Fury waits so its Energy isn't lost at the cap (druid.md §6.2) */
  maxEnergy: 15,
  /** combo points ≥ a (druid.md §2.5, §6.2) */
  minComboPoints: 16,
  // 17 is reserved for `abilityAuraDown` (Cat and Retribution).
  /** mana ≥ a, in tenths (paladin.md "mana% ≥ x" settings, as mana at the plan's maximum) */
  minMana: 18,
  // 19 is reserved for `maxMana`; 20 is Warrior Protection's, 21–24 the bear's, 25–28 the
  // Protection paladin's: tracks that merge separately.
  /**
   * the execute phase starts in more than a ms: `executeWithin`'s opposite, always true in a fight
   * without one (Fury's potion with a Recklessness that came by its clock, warrior.md §5.2 row 16).
   * Resolved the same way, into the end of the line's window at `execute start − a`; it only becomes
   * false, so no wake-up.
   */
  executeNotWithin: 29,
} as const

export interface RotationCondition {
  code: number
  a: number
  b: number
}

/**
 * One line of a spec's priority list (warrior.md §5.1). Whenever the warrior can act, the engine
 * uses every line in order whose ability is usable (off cooldown, enough rage, the GCD free if
 * it needs it, the right stance, the execute phase if it needs it) and whose conditions all
 * hold; one GCD ability per decision, plus off-GCD ones. An ability may have several lines
 * (Bloodthirst in and out of the execute phase).
 */
export interface RotationEntry {
  ability: number
  conditions: RotationCondition[]
  /** On-next-swing only: cancel the queue if rage falls below this before the swing (tenths; 0 = never; warrior.md §2.4). */
  unqueueBelowTenths: number
  /**
   * A stance dance (warrior.md §7 "Stance dancing"): when the current stance refuses the ability,
   * swap to this STANCE bit first (if the swap cooldown allows and the rage the swap keeps pays for
   * it), then use it; the engine swaps back to the base stance once the swap cooldown allows.
   * Absent or 0: no dance, so the line waits for a stance that allows the ability.
   */
  danceTo?: number
  /**
   * With `danceTo`: once the line's ability is used, the stance it was used in becomes the base
   * stance for the rest of the fight, so the engine no longer swaps back (Arms Recklessness, which
   * swaps to Berserker Stance and stays; warrior.md §5.3 row 4, §7 "Stance dancing").
   */
  stay?: boolean
}

/**
 * Before the pull (warrior.md §5.2 row 0). Each cast uses an ability of `Plan.abilities` at
 * `atMs` < 0, without paying its cost (its rage came before the pull): its aura starts then, so
 * it has `durationMs + atMs` left at the pull, its cooldown runs from then, its rage at once is
 * there at the pull, and its ticks keep their phase. Then the opener: Charge's rage, and the
 * stance swap that keeps at most `keepTenths`. Pre-pull rage makes no threat.
 */
export interface PrepullPlan {
  /** In time order. */
  casts: { ability: number; atMs: number }[]
  /** Charge's rage at the pull (0 = no Charge). */
  chargeTenths: number
  /** The most rage the stance swap after Charge keeps (−1 = no swap). */
  keepTenths: number
}

export const NO_PREPULL: PrepullPlan = { casts: [], chargeTenths: 0, keepTenths: -1 }

/** The boss's melee on the player (combat-tables §8, encounter.md §5). */
export interface BossSwingPlan {
  /** Between swings, after attack-speed slows (damage-and-timing §3.2). */
  speedSec: number
  /** Each swing's damage, uniform in [min, max], before the player's mitigation; AP debuffs included. */
  minDamage: number
  maxDamage: number
  canCrush: boolean
  /** Parry haste, both ways: on the boss's swing when it parries, and on the tank's when the tank parries (encounter.md §5). */
  parryHaste: boolean
  /** The swings come from in front of the player, so it can dodge, parry and block them (combat-tables §8, "Direction"). */
  front: boolean
}

export interface Plan {
  spec: SpecId
  classId: ClassId
  role: Role
  headline: 'dps' | 'tps'
  profile: RulesProfile
  applyUnmeasured: boolean
  seed: number
  playerLevel: number
  /**
   * STANCE bit the warrior fights in, its base stance (warrior.md §5; Arms: its setting, §5.3), or
   * STANCE_ANY for classes without stances. Stance dances leave it and come back, and a line that
   * stays makes its stance the base for the rest of the fight (warrior.md §7).
   */
  stance: number
  /** What each stance changes relative to the base stance (empty for classes without stances). */
  stances: StancePlan[]
  /**
   * Stance swaps (warrior.md §2.1): the cooldown the three stances share, and the most rage a swap
   * keeps (`forever`: 10 + 3 × Improved Tactical Mastery; `classicEra`: 5 × the rank; rage.md).
   */
  stanceSwap: { cooldownMs: number; keepTenths: number }
  fight: {
    durationMs: number
    /** Fight-length variation as a fraction (encounter §3). */
    variation: number
    /** The execute phase is the last `executePct`% of boss health, from t_exec (encounter §3). */
    executePct: number
    targetLevel: number
    front: boolean
    bossCanDodge: boolean
    bossCanParry: boolean
    bossCanBlock: boolean
    /** Boss armor after debuffs, before the player's own armor penetration. */
    targetArmor: number
    /** Boss melee on the player (tank specs), or null. */
    bossSwing: BossSwingPlan | null
    /**
     * Incoming damage for DPS specs: a hit this size every `damageTakenIntervalMs` (0 = none). The
     * size is before your mitigation, and nothing mitigates it, so it's also the health each hit
     * costs (encounter.md §4).
     */
    damageTakenPerHit: number
    damageTakenIntervalMs: number
  }
  /** The static stat block; the engine adds aura deltas to it and re-derives. */
  stats: StatBlock
  /** [main hand, off hand]; the off hand is null unless dual wielding. */
  weapons: [WeaponPlan | null, WeaponPlan | null]
  hasShield: boolean
  /**
   * Multiplier on all damage (the base stance, creature-type racials) and on physical damage only
   * (2H spec, Bastion). These, `damageTakenMult` and `threatMult` are the base stance's; `stances`
   * changes them for the others.
   */
  damageMult: number
  physicalMult: number
  damageTakenMult: number
  threatMult: number
  /** Player armor after static sources, for boss hits. */
  armor: number
  rage: {
    maxTenths: number
    /** Rage from damage taken (rage.md#rage-from-damage-taken; `damageTakenRage` in core/formulas.ts). */
    damageTakenModel: DamageTakenRageModel
    /**
     * Max health, which the `forever` and `foreverHealthLost` models divide by. Its base health is
     * a Classic-based stand-in while unmeasured (character-stats OQ-2, D24).
     */
    maxHealth: number
    /**
     * Hits that land on the player can give rage (rage.md#rage-from-damage-taken): true for
     * warriors, and for a druid whose fight can be in Bear Form (its start form or a shapeshift's;
     * rage.md#bear-druid-rage). False for classes without rage. A druid gains it only while in a
     * form whose `FormPlan.rage` is set. Either way, a hit that costs health fires the damage-taken
     * procs.
     */
    fromDamageTaken: boolean
  }
  periodicRage: { periodMs: number; tenths: number; source: number }[]
  auras: AuraPlan[]
  procs: ProcPlan[]
  /** Proc indices per trigger code. */
  triggers: number[][]
  sources: SourcePlan[]
  /** Active abilities and the priority list that uses them (empty for specs without a rotation yet). */
  abilities: AbilityPlan[]
  rotation: RotationEntry[]
  prepull: PrepullPlan
  /**
   * A druid's forms (docs/classes/druid.md §2.1, §2.2, §2.8), or absent for classes without them.
   * The plan's static stats, main hand and threat multiplier are those of `forms[form]`, the form it
   * fights in; a `shift` ability swaps in another's, and the boss's swings then meet its armor and
   * dodge. `armor` and `rage.maxHealth` stay the starting form's (druid.md §2.8).
   */
  forms?: FormPlan[]
  /** The index into `forms` of the form the fight starts in. */
  form?: number
  /** What entering a form does to Energy and rage (druid.md §2.8); absent without forms. */
  shapeshift?: ShapeshiftPlan
  /** Energy (druid.md §2.4): absent for classes without it. */
  energy?: EnergyPlan
  /** Mana and its regeneration (druid.md §2.8, paladin.md#mana-model): absent unless the plan can spend mana. */
  mana?: ManaPlan
  /** The plan aura that makes the next ability with a cost free (Clearcasting, druid.md §2.7), or absent. */
  freeCastAura?: number
  /** Damaging spells (seal procs, judgements, Holy Strike), indexed by abilities and procs. */
  spells?: SpellPlan[]
  /** Multiplier on Holy damage done, static (paladin.md#conventions-used-below). */
  holyMult?: number
  /** Multiplier on Holy threat, static: Righteous Fury ×1.9 (paladin.md#threat-paladin-specific). */
  holyThreatMult?: number
}

/** One druid form (druid.md §2.1, §2.2, §2.3): everything a shapeshift swaps in. */
export interface FormPlan {
  id: 'caster' | 'cat' | 'bear'
  name: string
  /** The stat block in the form: the shared one plus the form's own effects and form-bound talents. */
  stats: StatBlock
  /** The main hand in the form: the form's own weapon (cat, bear), the equipped one (caster), or none. */
  mainHand: WeaponPlan | null
  /** The global threat multiplier in the form (the plan's static sources × the form's own, threat.md). */
  threatMult: number
  /**
   * White hits and hits taken give rage in this form: only in bear, whose power is rage (druid.md
   * §2.4, §8 "Rage from hits"; rage.md#bear-druid-rage). Hits taken also need the plan's
   * `rage.fromDamageTaken`, which is set when the fight can be in such a form. An energize adds
   * rage in whatever form it fires in: Furor's and Primal Fury's fire only in bear, so outside it
   * that's Natural Reaction and a potion.
   */
  rage: boolean
}

/** Entering a form (druid.md §2.8, rage.md#bear-druid-rage). */
export interface ShapeshiftPlan {
  /** Indices into `Plan.forms` (−1 when the plan has no such form). */
  caster: number
  cat: number
  bear: number
  /** Furor's rank: the Energy kept on entering cat (core/formulas.ts `furorCatEnergyTenths`). */
  furorRank: number
  /** Rage on entering bear, after rage is set to 0, and its chance (Furor: 10 rage at 20% per rank). */
  bearRageTenths: number
  bearRageChance: number
}

/** Energy (druid.md §2.4), in tenths. */
export interface EnergyPlan {
  maxTenths: number
  /** At the pull. */
  startTenths: number
  /** Gained on every power tick. */
  tickTenths: number
}

/**
 * Mana (druid.md §2.8, paladin.md#mana-model, character-stats.md#spirit-and-mana-regeneration), in
 * tenths: the pool starts full, and every power tick it regains `mp5TickTenths` always, plus the
 * Spirit regen `regenTickTenths` if no mana was spent in the last `fiveSecondRuleMs`, or
 * `inFsrShare` of it if some was.
 */
export interface ManaPlan {
  maxTenths: number
  /** Spirit regeneration per power tick, outside the five-second rule. */
  regenTickTenths: number
  /** How long after spending mana spirit regeneration stops (the five-second rule). */
  fiveSecondRuleMs: number
  /** mp5 per power tick (mp5 × 2/5), inside the five-second rule too (the paladin's gear and buffs); absent: 0. */
  mp5TickTenths?: number
  /** Share of the Spirit regeneration that continues inside the five-second rule (Reverence); absent: 0. */
  inFsrShare?: number
}

/**
 * The player-global power tick (druid.md §2.4; character-stats.md#spirit-and-mana-regeneration):
 * Energy and mana regenerate every this many ms, from a random phase in [0, tick) at the pull [?].
 */
export const POWER_TICK_MS = 2000

/** What the main thread keeps next to the plan: the sheet and assumptions for the result. */
export interface PlanBundle {
  plan: Plan
  sheet: CharacterSheet
  assumptions: Assumption[]
}
