// Attack tables (docs/mechanics/combat-tables.md).
//
// Pure functions: they turn a profile plus the attacker's and defender's numbers into outcome
// chances in percentage points, and those into cumulative thresholds for a single roll in
// [0, 100). Every rule and constant is owned by combat-tables.md; the profile holds the numbers
// where Forever and Classic Era differ.
import type { RulesProfile } from '../rules/profiles'

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

const levelDiff = (i: MeleeInputs) => Math.max(0, Math.min(3, i.targetLevel - i.attackerLevel))

/**
 * Chances for a melee attack by a player on a mob. `white` adds glancing and, when
 * `dualWieldPenalty` is set, the +19% dual-wield miss; specials never glance and never take the
 * penalty (combat-tables §2.2, §3, §5).
 */
export function meleeChances(
  profile: RulesProfile,
  i: MeleeInputs,
  white: boolean,
  dualWieldPenalty: boolean,
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
    return {
      miss: Math.max(0, c.missBase[d] + k + dw - i.hit),
      dodge: i.canDodge ? Math.max(0, c.dodgeBase[d] + k - i.expertise) : 0,
      parry: i.front && i.canParry ? Math.max(0, c.parryBase[d] + k - i.expertise) : 0,
      glance,
      block: i.front && i.canBlock ? c.mobBlock : 0,
      crit: i.sheetCrit - c.perSkillPoint * (D - S) - suppression,
    }
  }

  // docs/mechanics/combat-tables.md#22-outcome-formulas (classicEra)
  const diff = D - S
  const missBase = 5 + (diff > 10 ? 0.2 : 0.1) * diff
  // docs/mechanics/combat-tables.md#43-hit-suppression
  const hitSuppression = diff > 10 ? (diff - 10) * 0.2 : 0
  return {
    miss: Math.max(0, missBase + dw - Math.max(0, i.hit - hitSuppression)),
    dodge: i.canDodge ? Math.max(0, 5 + 0.1 * diff) : 0,
    parry: i.front && i.canParry ? c.parryBase[d] : 0,
    glance,
    block: i.front && i.canBlock ? Math.min(c.mobBlock, 5 + 0.1 * diff) : 0,
    crit: i.sheetCrit - 0.2 * (D - Math.min(S, cap)) - suppression,
  }
}

/**
 * Cumulative thresholds for a one-roll table in the given order, truncated at 100: each slice is
 * clamped at ≥ 0 first, then gets min(p, 100 − running total) (combat-tables §2.1). An outcome
 * is the first index whose threshold exceeds the roll; past the last threshold is a normal hit.
 */
export function thresholds(slices: readonly number[], out: Float64Array): Float64Array {
  let acc = 0
  for (let k = 0; k < slices.length; k++) {
    const p = Math.max(0, slices[k])
    acc += Math.min(p, 100 - acc)
    out[k] = acc
  }
  return out
}

/** Slices of the white table in roll order: miss, dodge, parry, glance, block, crit (combat-tables §2.1). */
export function whiteSlices(ch: MeleeChances): number[] {
  return [ch.miss, ch.dodge, ch.parry, ch.glance, ch.block, ch.crit]
}

/** Weapon-damage specials: one roll over miss, dodge, parry, block, crit (combat-tables §3). */
export function specialSlices(ch: MeleeChances, bonusCrit = 0): number[] {
  return [ch.miss, ch.dodge, ch.parry, 0, ch.block, ch.crit + bonusCrit]
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
}

/** Boss melee on a player, in roll order: miss, dodge, parry, block, crit, crushing (combat-tables §8). */
export function bossSlices(i: DefenderInputs): number[] {
  const bossSkill = 5 * i.bossLevel
  const skillGap = (bossSkill - 5 * i.playerLevel) * 0.04
  const miss = Math.max(0, 5 + (i.defense - bossSkill) * 0.04)
  const dodge = Math.max(0, i.dodge - skillGap)
  const parry = Math.max(0, i.parry - skillGap)
  const block = Math.max(0, i.block - skillGap)
  const crit = Math.max(0, 5 + (bossSkill - i.defense) * 0.04)
  const crush =
    i.canCrush && i.bossLevel - i.playerLevel >= 3
      ? Math.max(0, (bossSkill - Math.min(i.defense, 5 * i.playerLevel)) * 2 - 15)
      : 0
  return [miss, dodge, parry, block, crit, crush]
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
