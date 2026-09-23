// The resolved plan (decision D15: "the config is resolved once into a flat, precomputed plan").
//
// The main thread turns a SimConfig into a Plan: gear summed, buffs and talents applied,
// conditions resolved, profile values copied in. The plan is plain data, so it posts to workers
// by structured clone, and the engine that runs it imports no datasets. Everything the engine
// needs per event is a number here.
import type { RulesProfile } from '../rules/profiles'
import type { StatBlock } from '../stats/stat-block'
import type { Assumption, CharacterSheet, ClassId, DamageTakenRageModel, Role, SpecId } from '../types'

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
} as const
export const TRIGGER_COUNT = 7

/**
 * Warrior stances as bits (docs/classes/warrior.md#21-stances). An ability's `stances` mask says
 * where it can be used; a plan's `stance` is the bit it fights in, or STANCE_ANY for a class
 * without stances.
 */
export const STANCE = { battle: 1, defensive: 2, berserker: 4 } as const
export const STANCE_ANY = 7

/** Proc actions as integer codes. */
export const ACTION = {
  extraAttacks: 0,
  aura: 1,
  spellDamage: 2,
  rage: 3,
  weaponBleed: 4,
} as const

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
  /** Aura crit % only this hand gets (racial and Weaponmaster weapon crit). */
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
  name: string
  durationMs: number
  maxStacks: number
  whiteSwingCharges: number
  str: number
  agi: number
  ap: number
  crit: number
  /** Attack speed %, multiplicative. */
  haste: number
  /** Physical damage %, multiplicative. */
  damage: number
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
}

export interface SourcePlan {
  id: string
  name: string
  icon: string
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
   * `weaponStrike` (Heroic Strike, Cleave; warrior.md §2.4).
   */
  kind: 'weaponStrike' | 'meleeSpell' | 'onNextSwing'
  /** Rage cost in tenths after the build's talent reductions (warrior.md §2.3 "Cost reductions"). */
  costTenths: number
  cooldownMs: number
  /** 0 = off the GCD (damage-and-timing §3.5). */
  gcdMs: number
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
}

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
}

export interface BossSwingPlan {
  speedSec: number
  minDamage: number
  maxDamage: number
  canCrush: boolean
  parryHaste: boolean
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
  /** STANCE bit the warrior fights in (warrior.md §5), or STANCE_ANY for classes without stances. */
  stance: number
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
    /** Incoming damage for DPS specs: this much every `damageTakenIntervalMs` (0 = none). */
    damageTakenPerHit: number
    damageTakenIntervalMs: number
  }
  /** The static stat block; the engine adds aura deltas to it and re-derives. */
  stats: StatBlock
  /** [main hand, off hand]; the off hand is null unless dual wielding. */
  weapons: [WeaponPlan | null, WeaponPlan | null]
  hasShield: boolean
  /** Multiplier on all damage (stance, creature-type racials) and on physical damage only (2H spec, Bastion). */
  damageMult: number
  physicalMult: number
  damageTakenMult: number
  threatMult: number
  /** Player armor after static sources, for boss hits. */
  armor: number
  rage: {
    maxTenths: number
    damageTakenModel: DamageTakenRageModel
    /** Max health for the health-based damage-taken models. */
    maxHealth: number
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
}

/** What the main thread keeps next to the plan: the sheet and assumptions for the result. */
export interface PlanBundle {
  plan: Plan
  sheet: CharacterSheet
  assumptions: Assumption[]
}
