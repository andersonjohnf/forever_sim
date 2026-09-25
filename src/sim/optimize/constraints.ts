// Limits a candidate must meet besides scoring well (docs/optimizer.md#constraints, decision D30:
// "what the sim can't measure is a constraint or a tie-break, never a guess").
//
// For a tank, TPS alone favours a glass cannon: more health means less rage from each hit taken,
// and an avoided hit gives none, so survival costs threat. The optimizer keeps survival in its own
// terms instead of weighing it against threat: a constraint reads the character sheet before any
// fight (health, armor, defense, effective health, the boss's crit and crush chances), and a
// candidate that misses one is left out of the race. Sheet values are exact, so there's nothing to
// judge in the race. There are no limits on fight results, such as damage taken or TPS (D30, cut at
// step 6 of O1's review: judging them with intervals in the race kept breaking).
// A bound is absolute, or relative to a reference setup's value (1.02 is 102% of it): the baseline's,
// or another the caller names (a tank's survival preset, for the effective-health floor).
//
// **Effective health** (D30, user decision): max health ÷ (1 − armor's damage reduction against
// the boss's level), the physical damage it takes to kill you. Avoidance and block aren't in it:
// they lower average damage but don't survive a spike. A tank's search keeps at least 90% of the
// reference's by default (`defaultConstraints`).
//
// **Crit and crush immunity** (D30, user decision; off by default): the boss's crit and crushing
// blow chances against you, read from the same tables the engine rolls and the Results show
// (`sheet.bossTable`, combat-tables §8). Crit immune is `bossCritPct<=0` (440 defense against a
// level-63 boss), on the table without any block buff: defense alone decides it. Crush immune is
// `bossCrushPct<=0` (miss + dodge + parry + block push crushing blows off the table), on the table
// with the rotation's block buff up when it keeps one (`sheet.bossTableUp`, a Protection paladin's
// Holy Shield). There's no damage-taken cap: D30 replaced it with these.
import { armorReduction } from '../core/formulas'
import type { PlanBundle } from '../plan/types'
import type { BossOutcomes, Role } from '../types'

/** The sheet's numbers a constraint can read: the character sheet's, and effective health (`ehp`). */
export const SHEET_STATS = [
  'ehp',
  'health',
  'armor',
  'stamina',
  'defense',
  'dodgePct',
  'parryPct',
  'blockPct',
  'blockValue',
  'critReductionPct',
  'hitPct',
  'critPct',
  'attackPower',
  'bossCritPct',
  'bossCrushPct',
] as const
export type SheetStat = (typeof SHEET_STATS)[number]
export type SheetValues = Record<SheetStat, number>

/** Max health ÷ (1 − armor's reduction of the boss's hits), from the plan's own numbers (D30). */
export function effectiveHealth(bundle: PlanBundle): number {
  const { plan, sheet } = bundle
  return sheet.health / (1 - armorReduction(plan.armor, plan.fight.targetLevel, plan.profile))
}

/**
 * The boss's tables against the sheet, for crit and crush immunity (null for a spec the boss doesn't
 * attack). Crit reads the table as the fight starts, with no block buff: a block buff doesn't move
 * crit, which only defense pushes off, and a crit immunity that held only while Holy Shield is up
 * wouldn't be one. Crush reads the table with the block buff the rotation keeps up when it has one (a
 * Protection paladin's Holy Shield; the Results' second table, docs/ux.md#results), since that's the
 * table most of the fight's swings roll on, and the paladin's classic way to be uncrushable.
 */
export function immunityTables(bundle: PlanBundle): { crit: BossOutcomes | null; crush: BossOutcomes | null } {
  const { sheet } = bundle
  return { crit: sheet.bossTable, crush: sheet.bossTableUp?.table ?? sheet.bossTable }
}

/** A setup's sheet numbers, effective health and the boss's crit and crush chances included: no fights needed. */
export function sheetValues(bundle: PlanBundle): SheetValues {
  const { sheet } = bundle
  // A spec the boss doesn't attack takes no crits or crushing blows.
  const tables = immunityTables(bundle)
  return {
    ehp: effectiveHealth(bundle),
    health: sheet.health,
    armor: sheet.armor,
    stamina: sheet.stamina,
    defense: sheet.defense,
    dodgePct: sheet.dodgePct,
    parryPct: sheet.parryPct,
    blockPct: sheet.blockPct,
    blockValue: sheet.blockValue,
    critReductionPct: sheet.critReductionPct,
    hitPct: sheet.hitPct,
    critPct: sheet.critPct,
    attackPower: sheet.attackPower,
    bossCritPct: share(tables.crit?.crit),
    bossCrushPct: share(tables.crush?.crush),
  }
}

/** A share of the boss's table, with the rounding left by its truncation at 100% (1e-9 points) taken as none. */
const share = (pct: number | undefined) => (pct === undefined || pct < 1e-9 ? 0 : pct)

/** Crit immunity (D30, off by default): the boss's crit chance against you is 0. */
export const CRIT_IMMUNE: Constraint = { stat: 'bossCritPct', max: 0 }
/** Crush immunity (D30, off by default): your avoidance and block push crushing blows off the boss's table. */
export const CRUSH_IMMUNE: Constraint = { stat: 'bossCrushPct', max: 0 }

/** The share of the reference's effective health a tank keeps by default (D30, user decision). */
export const EHP_FLOOR = 0.9

/**
 * The constraints a role's search has unless the player changes them: a tank keeps 90% of the
 * reference's effective health. Crit and crush immunity are off by default, and there's no
 * damage-taken cap (D30).
 */
export function defaultConstraints(role: Role): Constraint[] {
  return role === 'tank' ? [{ stat: 'ehp', min: EHP_FLOOR, relative: true }] : []
}

/** Fight results, which a constraint can't read (D30): `parseConstraint` names them to say so. */
const RESULT_METRICS = ['dps', 'tps', 'taken'] as const

export interface Bound {
  min?: number
  max?: number
  /** The bounds are shares of the baseline's value (1 is the baseline's own). */
  relative?: boolean
}

/** A limit on a sheet number. */
export type Constraint = { stat: SheetStat } & Bound

/** The absolute limits of a bound, given the baseline's value. */
export function limits(bound: Bound, baseline: number): { min: number; max: number } {
  const k = bound.relative ? baseline : 1
  return { min: bound.min === undefined ? -Infinity : bound.min * k, max: bound.max === undefined ? Infinity : bound.max * k }
}

/** Whether sheet values meet every constraint, relative ones against the reference's. */
export function meetsSheet(values: SheetValues, reference: SheetValues, constraints: readonly Constraint[]): boolean {
  return constraints.every((c) => {
    const { min, max } = limits(c, reference[c.stat])
    return values[c.stat] >= min && values[c.stat] <= max
  })
}

/**
 * A constraint from its command-line form: `ehp>=90%` (of the reference's), `health>=8000`,
 * `armor>=6500`, `defense>=440`. The names are SHEET_STATS; a fight result (dps, tps, taken) is
 * refused with a line that says the race takes no result limits.
 */
export function parseConstraint(text: string): Constraint {
  const m = /^\s*([A-Za-z]+)\s*(<=|>=)\s*(-?[0-9.]+)\s*(%?)\s*$/.exec(text)
  if (!m) throw new Error(`A constraint is name>=value or name<=value, with % for a share of the baseline's: got "${text}"`)
  const [, name, op, number, pct] = m
  const value = Number(number) / (pct ? 100 : 1)
  if (!Number.isFinite(value)) throw new Error(`"${number}" isn't a number in "${text}"`)
  const bound: Bound = { ...(op === '>=' ? { min: value } : { max: value }), ...(pct ? { relative: true } : {}) }
  if ((RESULT_METRICS as readonly string[]).includes(name))
    throw new Error(`"${name}" is a fight result: the optimizer takes limits only on the sheet (${SHEET_STATS.join(', ')}), not on results (D30)`)
  if ((SHEET_STATS as readonly string[]).includes(name)) return { stat: name as SheetStat, ...bound }
  throw new Error(`"${name}" isn't a sheet stat (${SHEET_STATS.join(', ')})`)
}

/** A constraint's name in words: "crit immune", "crush immune", or its command-line form. */
export function constraintName(c: Constraint): string {
  if (c.stat === 'bossCritPct' && c.max === 0 && c.min === undefined && !c.relative) return 'crit immune'
  if (c.stat === 'bossCrushPct' && c.max === 0 && c.min === undefined && !c.relative) return 'crush immune'
  return formatConstraint(c)
}

/** A constraint in its command-line form. */
export function formatConstraint(c: Constraint): string {
  const parts: string[] = []
  const show = (v: number) => (c.relative ? `${+(v * 100).toFixed(2)}%` : `${v}`)
  if (c.min !== undefined) parts.push(`${c.stat}>=${show(c.min)}`)
  if (c.max !== undefined) parts.push(`${c.stat}<=${show(c.max)}`)
  return parts.join(', ')
}
