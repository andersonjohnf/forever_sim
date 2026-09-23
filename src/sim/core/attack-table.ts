// Attack tables (docs/mechanics/combat-tables.md).
//
// Pure functions: they turn a profile plus the attacker's and defender's numbers into outcome
// chances in percentage points, and those into cumulative thresholds for a single roll in
// [0, 100). Every rule and constant is owned by combat-tables.md; the profile holds the numbers
// where Forever and Classic Era differ. Each takes an optional `out` to write into, so the engine
// re-derives its tables without allocating (docs/architecture.md, "Hot-loop discipline").
import type { RulesProfile } from '../rules/profiles'
import type { BossOutcomes } from '../types'

/** Outcome codes, also used as breakdown columns. */
export const OUTCOME = {
  miss: 0,
  dodge: 1,
  parry: 2,
  glance: 3,
  block: 4,
  crit: 5,
  hit: 6,
  crush: 7,
} as const
export type Outcome = (typeof OUTCOME)[keyof typeof OUTCOME]

/** Player level (docs/doctrine.md#1-what-were-building). */
export const PLAYER_LEVEL = 60

export interface MeleeInputs {
  attackerLevel: number
  targetLevel: number
  /** Weapon skill of the swinging weapon (S). */
  skill: number
  /** Total +hit % (H). */
  hit: number
  /** Character-sheet crit % for this hand (C). */
  sheetCrit: number
  /** Crit from auras for this hand, for the +3 suppression (combat-tables §4.4). */
  auraCrit: number
  /** Expertise % (E); 0 when the ruleset or the D12 switch turns it off. */
  expertise: number
  /** Attacking from the front: the target can parry and block (combat-tables §2.4). */
  front: boolean
  canDodge: boolean
  canParry: boolean
  canBlock: boolean
}

/** Outcome chances in percentage points, before truncation. */
export interface MeleeChances {
  miss: number
  dodge: number
  parry: number
  glance: number
  block: number
  crit: number
}

/** A zeroed MeleeChances, for callers that reuse one. */
export const emptyChances = (): MeleeChances => ({ miss: 0, dodge: 0, parry: 0, glance: 0, block: 0, crit: 0 })

/** Slices for one roll, in roll order. */
export type Slices = number[] | Float64Array

const levelDiff = (i: MeleeInputs) => Math.max(0, Math.min(3, i.targetLevel - i.attackerLevel))

/**
 * Chances for a melee attack by a player on a mob. `white` adds glancing and, when
 * `dualWieldPenalty` is set, the +19% dual-wield miss; specials never glance and never take the
 * penalty (combat-tables §2.2, §3, §5). Written into `out` and returned.
 */
export function meleeChances(
  profile: RulesProfile,
  i: MeleeInputs,
  white: boolean,
  dualWieldPenalty: boolean,
  out: MeleeChances = emptyChances(),
): MeleeChances {
  const c = profile.combat
  const d = levelDiff(i)
  const D = 5 * i.targetLevel
  const cap = 5 * i.attackerLevel
  const S = i.skill
  const dw = white && dualWieldPenalty ? c.dualWieldPenalty : 0
  // docs/mechanics/combat-tables.md#23-glancing-blows: skill is capped at 5 × level for the chance.
  const glance = white && i.targetLevel >= i.attackerLevel ? Math.max(0, 10 + 2 * (D - Math.min(S, cap))) : 0
  const suppression = d >= 3 ? Math.min(Math.max(0, i.auraCrit), c.auraCritSuppression) : 0

  if (c.model === 'foreverUi') {
    // docs/mechanics/combat-tables.md#22-outcome-formulas (forever)
    const k = c.perSkillPoint * (D - S - 5 * d)
    out.miss = Math.max(0, c.missBase[d] + k + dw - i.hit)
    out.dodge = i.canDodge ? Math.max(0, c.dodgeBase[d] + k - i.expertise) : 0
    out.parry = i.front && i.canParry ? Math.max(0, c.parryBase[d] + k - i.expertise) : 0
    out.glance = glance
    out.block = i.front && i.canBlock ? c.mobBlock : 0
    out.crit = i.sheetCrit - c.perSkillPoint * (D - S) - suppression
    return out
  }

  // docs/mechanics/combat-tables.md#22-outcome-formulas (classicEra)
  const diff = D - S
  const missBase = 5 + (diff > 10 ? 0.2 : 0.1) * diff
  // docs/mechanics/combat-tables.md#43-hit-suppression
  const hitSuppression = diff > 10 ? (diff - 10) * 0.2 : 0
  out.miss = Math.max(0, missBase + dw - Math.max(0, i.hit - hitSuppression))
  out.dodge = i.canDodge ? Math.max(0, 5 + 0.1 * diff) : 0
  out.parry = i.front && i.canParry ? c.parryBase[d] : 0
  out.glance = glance
  out.block = i.front && i.canBlock ? Math.min(c.mobBlock, 5 + 0.1 * diff) : 0
  out.crit = i.sheetCrit - 0.2 * (D - Math.min(S, cap)) - suppression
  return out
}

/**
 * Cumulative thresholds for a one-roll table in the given order, truncated at 100: each slice is
 * clamped at ≥ 0 first, then gets min(p, 100 − running total) (combat-tables §2.1). An outcome
 * is the first index whose threshold exceeds the roll; past the last threshold is a normal hit.
 * Written to out[offset …].
 */
export function thresholds(slices: ArrayLike<number>, out: Float64Array, offset = 0): Float64Array {
  let acc = 0
  for (let k = 0; k < slices.length; k++) {
    const p = Math.max(0, slices[k])
    acc += Math.min(p, 100 - acc)
    out[offset + k] = acc
  }
  return out
}

/** Slices of the white table in roll order: miss, dodge, parry, glance, block, crit (combat-tables §2.1). */
export function whiteSlices<T extends Slices = number[]>(ch: MeleeChances, out: T = [0, 0, 0, 0, 0, 0] as T): T {
  out[0] = ch.miss
  out[1] = ch.dodge
  out[2] = ch.parry
  out[3] = ch.glance
  out[4] = ch.block
  out[5] = ch.crit
  return out
}

/** Weapon-damage specials: one roll over miss, dodge, parry, block, crit (combat-tables §3). */
export function specialSlices<T extends Slices = number[]>(ch: MeleeChances, bonusCrit = 0, out: T = [0, 0, 0, 0, 0, 0] as T): T {
  out[0] = ch.miss
  out[1] = ch.dodge
  out[2] = ch.parry
  out[3] = 0
  out[4] = ch.block
  out[5] = ch.crit + bonusCrit
  return out
}

/** Truncated probabilities per outcome from cumulative thresholds (for tests and closed forms). */
export function probabilities(th: Float64Array, n: number): number[] {
  const p: number[] = []
  let prev = 0
  for (let k = 0; k < n; k++) {
    p.push(th[k] - prev)
    prev = th[k]
  }
  p.push(100 - prev)
  return p
}

/** Mean-preserving range of the glancing damage factor (combat-tables §2.3). */
export function glanceRange(profile: RulesProfile, targetLevel: number, skill: number): [number, number] {
  const diff = 5 * targetLevel - skill
  const bump = profile.combat.glance === 'foreverUi' && diff > 10 ? 0.1 : 0
  const low = Math.min(0.91, Math.max(0.01, 1.3 - 0.05 * diff + bump))
  const high = Math.min(0.99, Math.max(0.2, 1.2 - 0.03 * diff + bump))
  return [low, high]
}

// Boss → player (docs/mechanics/combat-tables.md#8-boss--player-tanks).

/**
 * Each point of defense above the attacker's weapon skill adds 0.04% to its miss chance and takes
 * 0.04% from its crit chance; each point of attacker skill above 5 × the player's level takes
 * 0.04% from the player's dodge, parry and block (combat-tables §8; character-stats#defense-skill).
 */
export const DEFENSE_PER_POINT = 0.04
/** A mob's miss and crit chance, %, against a player whose defense equals its weapon skill (combat-tables §8). */
export const MOB_BASE_MISS = 5
export const MOB_BASE_CRIT = 5
/**
 * Crushing blows: 2% per point of the attacker's weapon skill above the player's defense, that
 * defense capped at 5 × the player's level, minus 15%; only from attackers 3 or more levels above
 * the player. 15% from a level-63 boss whatever the defense (combat-tables §8).
 */
export const CRUSH_PER_POINT = 2
export const CRUSH_OFFSET = 15
export const CRUSH_MIN_LEVEL_GAP = 3

export interface DefenderInputs {
  playerLevel: number
  bossLevel: number
  /** The tank's total defense skill (Df). */
  defense: number
  /** Character-sheet dodge, parry and block %, each 0 when the tank can't (e.g. no shield). */
  dodge: number
  parry: number
  block: number
  canCrush: boolean
  /**
   * The attack comes from in front of the player, who faces it. A player dodges, parries and
   * blocks only attacks from the front (combat-tables §8, "Direction"); a tank faces its boss.
   */
  front: boolean
}

/** A mob's weapon skill: 5 × its level, 315 for a level-63 boss (combat-tables §8). */
export const mobSkill = (level: number) => 5 * level

/**
 * Boss melee on a player, in roll order: miss, dodge, parry, block, crit, crushing
 * (combat-tables §8). Each is clamped at ≥ 0 here; `thresholds` truncates them at 100 in this
 * order, so crushing blows fall off the table first, then crits.
 */
export function bossSlices<T extends Slices = number[]>(i: DefenderInputs, out: T = [0, 0, 0, 0, 0, 0] as T): T {
  const bossSkill = mobSkill(i.bossLevel)
  // The sheet's dodge, parry and block assume an attacker of the player's level (§8).
  const skillGap = (bossSkill - 5 * i.playerLevel) * DEFENSE_PER_POINT
  const miss = Math.max(0, MOB_BASE_MISS + (i.defense - bossSkill) * DEFENSE_PER_POINT)
  const dodge = i.front ? Math.max(0, i.dodge - skillGap) : 0
  const parry = i.front ? Math.max(0, i.parry - skillGap) : 0
  const block = i.front ? Math.max(0, i.block - skillGap) : 0
  const crit = Math.max(0, MOB_BASE_CRIT + (bossSkill - i.defense) * DEFENSE_PER_POINT)
  const crush =
    i.canCrush && i.bossLevel - i.playerLevel >= CRUSH_MIN_LEVEL_GAP
      ? Math.max(0, (bossSkill - Math.min(i.defense, 5 * i.playerLevel)) * CRUSH_PER_POINT - CRUSH_OFFSET)
      : 0
  out[0] = miss
  out[1] = dodge
  out[2] = parry
  out[3] = block
  out[4] = crit
  out[5] = crush
  return out
}

/** The boss → player table as shares that add up to 100: the slices of `bossSlices`, truncated (combat-tables §8, §2.1). */
export function bossOutcomeShares(i: DefenderInputs): BossOutcomes {
  const [miss, dodge, parry, block, crit, crush, hit] = probabilities(thresholds(bossSlices(i), new Float64Array(6)), 6)
  return { miss, dodge, parry, block, crit, crush, hit }
}

/** Spell miss chance vs a target (combat-tables §9). */
export function spellMiss(profile: RulesProfile, attackerLevel: number, targetLevel: number, hit: number): number {
  const d = Math.max(0, Math.min(3, targetLevel - attackerLevel))
  return Math.max(profile.combat.spellMissFloor, profile.combat.spellMiss[d] - hit)
}

/** Average partial resist for a non-binary, non-Holy spell (combat-tables §9). */
export function averageResist(resistance: number, casterLevel: number): number {
  return Math.min(0.75, (0.75 * resistance) / (5 * casterLevel))
}
