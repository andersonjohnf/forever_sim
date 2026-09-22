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
} as const
export const TRIGGER_COUNT = 6

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
 * An active ability, as data (M2). The engine resolves abilities with one switch on `kind`, so
 * adding the warrior's Bloodthirst, Mortal Strike, Heroic Strike and so on adds rows, not code
 * paths. Numbers come from docs/classes/warrior.md §3 (and later src/data/client/spells.json).
 */
export interface AbilityPlan {
  id: string
  name: string
  icon: string
  /** Breakdown row. */
  source: number
  /**
   * `weaponStrike`: weapon damage, one roll (Mortal Strike, Whirlwind, Overpower, Slam);
   * `meleeSpell`: two rolls (Bloodthirst, Execute, Shield Slam, Revenge; combat-tables §3);
   * `onNextSwing`: replaces the next main-hand swing (Heroic Strike, Cleave; warrior.md §2.4);
   * `aura`: a self-buff or target debuff (Battle Shout, Death Wish, Sunder Armor).
   */
  kind: 'weaponStrike' | 'meleeSpell' | 'onNextSwing' | 'aura'
  costTenths: number
  cooldownMs: number
  /** 0 = off the GCD (damage-and-timing §3.5). */
  gcdMs: number
  /** Weapon strikes: normalized speed (damage-and-timing §2.2) and share of weapon damage. */
  normalized: boolean
  weaponPercent: number
  /** Flat damage (+157 Heroic Strike) and AP coefficient (0.35 Bloodthirst). */
  flatDamage: number
  apCoefficient: number
  /** Extra crit % for this ability (Improved Overpower) and its crit multiplier (2.2 with Impale). */
  bonusCrit: number
  critMultiplier: number
  /** 80% of the cost back on a miss, dodge or parry (rage.md#rage-refunds-on-avoided-abilities). */
  refundOnAvoid: boolean
  /** Threat = damage × mult + bonus (threat.md#per-ability-threat-at-max-rank). */
  threatMult: number
  threatBonus: number
  /** Aura applied on use (abilities of kind `aura`), or −1. */
  aura: number
}

/** One line of a spec's priority list (M2; docs/classes/warrior.md#51-conventions-for-rotation-settings). */
export interface RotationEntry {
  ability: number
  minRageTenths: number
  maxRageTenths: number
  /** Only in, never in, or regardless of the execute phase. */
  executePhase: 'any' | 'only' | 'never'
  /** Skip if using it would delay a higher-priority ability ("GCD-safe"). */
  gcdSafe: boolean
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
  fight: {
    durationMs: number
    /** Fight-length variation as a fraction (encounter §3). */
    variation: number
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
  /** Active abilities and the priority list that uses them: empty until M2's rotations. */
  abilities: AbilityPlan[]
  rotation: RotationEntry[]
}

/** What the main thread keeps next to the plan: the sheet and assumptions for the result. */
export interface PlanBundle {
  plan: Plan
  sheet: CharacterSheet
  assumptions: Assumption[]
}
