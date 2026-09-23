// Hand-built plans for the engine's ability tests (arms.test.ts, stances.test.ts): a default
// warrior with two-hander T and nothing else, abilities added one by one as the plan builder adds
// them, rotation lines and conditions, and traces of what a fight did. Test code only.
import { expect } from 'vitest'
import { rotationOptions } from '../classes/rotation'
import { type TalentRanks, withTalents } from '../classes/warrior/modifiers'
import { addSample, emptyMoments, stdev } from '../core/welford'
import { defaultConfig } from '../defaults'
import type { AuraSpec } from '../effects/types'
import { buildPlan } from '../plan/build'
import {
  type AbilityDef,
  ACTION,
  COND,
  type Plan,
  type ProcPlan,
  type RotationCondition,
  STANCE,
  TRIGGER,
  TRIGGER_COUNT,
  type WeaponPlan,
  weaponPercentVs,
} from '../plan/types'
import type { CreatureType, SpecId } from '../types'
import { FIELD_COUNT, Sim } from './sim'

/** "Two-hander T" and "one-hander O" of warrior.md §8. */
export const T: Partial<WeaponPlan> = { min: 105, max: 157, speedSec: 3.8, twoHand: true, normalizedSpeed: 3.3 }
export const O: Partial<WeaponPlan> = { min: 106, max: 198, speedSec: 2.6, twoHand: false, normalizedSpeed: 2.4 }
/** Two-hander T's average roll, fixed so a hit is exactly the average. */
export const W = 131

/**
 * The default warrior of `spec` (Arms: Battle Stance; Fury: Berserker) with two-hander T, no
 * buffs, procs, periodic rage, armor or damage multipliers, a fight of exactly `durationMs`, and no
 * abilities yet: each test adds its own with `addAbility` and `line`. The stance factors are the
 * build's, relative to its base stance.
 */
export function armsPlan(durationMs: number, spec: SpecId = 'warrior-arms'): Plan {
  const d = defaultConfig(spec)
  const plan = buildPlan({
    ...d,
    rotation: spec === 'warrior-fury' ? Object.fromEntries(FURY_ROWS_OFF.map((id) => [id, false])) : d.rotation,
    buffs: { raid: d.buffs.raid, enabled: [] },
    fight: { ...d.fight, durationVariationPct: 0 },
  }).plan
  if (spec === 'warrior-arms') expect(plan.stance).toBe(STANCE.battle)
  plan.abilities = []
  plan.rotation = []
  plan.prepull = { casts: [], chargeTenths: 0, keepTenths: -1 }
  plan.weapons = [{ ...plan.weapons[0]!, ...T }, null]
  plan.procs = []
  plan.triggers = Array.from({ length: TRIGGER_COUNT }, () => [])
  plan.periodicRage = []
  plan.fight.targetArmor = 0
  plan.fight.durationMs = durationMs
  plan.damageMult = 1
  plan.physicalMult = 1
  return plan
}

/**
 * Every rotation switch of a spec off: its white swings, talents, buffs and procs only, and the Buffs
 * tab's debuffs on the boss, not its own (Protection's tank tests of the boss's swings, which predate
 * its rotation).
 */
export const rotationOff = (spec: SpecId): Record<string, boolean> =>
  Object.fromEntries(rotationOptions(spec).flatMap((o) => (o.kind === 'toggle' ? [[o.id, false]] : [])))

/** Fury's rotation switches, so its plan comes with no cooldown auras either. */
const FURY_ROWS_OFF = [
  'warrior.fury.battleShout.enabled',
  'warrior.fury.deathWish.enabled',
  'warrior.fury.racial.enabled',
  'warrior.fury.trinkets.enabled',
  'warrior.fury.recklessness.enabled',
  'warrior.fury.bloodrage.enabled',
  'warrior.fury.prepull.bloodrage',
]

/** Adds an aura to a plan (or finds it by id), as the plan builder does. */
export function addAura(plan: Plan, spec: AuraSpec): number {
  const i = plan.auras.findIndex((a) => a.id === spec.id)
  if (i >= 0) return i
  const m = spec.mods
  plan.auras.push({
    id: spec.id,
    name: spec.name,
    icon: 'x',
    durationMs: spec.durationMs,
    maxStacks: spec.maxStacks ?? 1,
    whiteSwingCharges: 0,
    critCharges: 0,
    str: 0,
    agi: 0,
    ap: m.ap ?? 0,
    apPct: 0,
    crit: m.crit ?? 0,
    spellCrit: m.spellCrit ?? 0,
    haste: m.haste ?? 0,
    damage: m.damage ?? 0,
    // Tank auras (Shield Block) and debuffs on the boss (Sunder Armor, Thunder Clap, Demoralizing Shout).
    ...(m.block ? { block: m.block } : {}),
    ...(spec.blockCharges ? { blockCharges: spec.blockCharges } : {}),
    ...(m.targetArmor ? { targetArmor: m.targetArmor } : {}),
    ...(m.bossSlow ? { bossSlow: m.bossSlow } : {}),
    ...(m.bossAp ? { bossAp: m.bossAp } : {}),
  })
  return plan.auras.length - 1
}

/**
 * Adds an ability to a plan as the plan builder does (build.ts): the build's talents, a breakdown
 * row, its aura or bleed marker and its window, and its weapon share against the creature type.
 * Returns its index.
 */
export function addAbility(plan: Plan, def: AbilityDef, talents: TalentRanks = new Map(), creatureType: CreatureType = 'none'): number {
  const resolved = withTalents(def, talents)
  const { offHand: _, aura, vsCreature: __, window, auraCrit: ___, ...a } = resolved
  plan.sources.push({ id: a.id, name: a.name, icon: a.icon })
  const source = plan.sources.length - 1
  plan.abilities.push({
    ...a,
    weaponPercent: weaponPercentVs(resolved, creatureType),
    source,
    offHandSource: -1,
    aura: aura ? addAura(plan, aura) : -1,
    window: window ? addAura(plan, window) : -1,
  })
  return plan.abilities.length - 1
}

/** Adds a proc and files it under its trigger. */
export function addProc(plan: Plan, proc: Omit<ProcPlan, 'id' | 'name' | 'icdMs' | 'school' | 'source' | 'chainBit' | 'a'> & Partial<ProcPlan>): number {
  plan.procs.push({ id: 'test', name: 'Test', icdMs: 0, school: 0, source: -1, chainBit: 0, a: 0, ...proc })
  const i = plan.procs.length - 1
  plan.triggers[proc.trigger].push(i)
  return i
}

/**
 * The Overpower window's dodge opener for a reactive ability, as the rotation adds it
 * (abilities.ts `overpowerWindowProcs`): a target's dodge of any attack opens the ability's window.
 */
export const opensOnDodge = (plan: Plan, ability: number) =>
  addProc(plan, { id: 'overpowerDodge', trigger: TRIGGER.targetDodge, chance: [1, 1], hands: 3, action: ACTION.aura, amount: plan.abilities[ability].window, b: 0 })

export const line = (plan: Plan, ability: number, conditions: RotationCondition[] = [], danceTo = 0) =>
  plan.rotation.push({ ability, conditions, unqueueBelowTenths: 0, ...(danceTo ? { danceTo } : {}) })
/** Usable from `t` ms into a fight of `durationMs` (time left ≤ durationMs − t). */
export const from = (plan: Plan, t: number): RotationCondition => ({ code: COND.timeLeftAtMost, a: plan.fight.durationMs - t, b: 0 })
/** Usable only at `t` (time left ≥ and ≤ durationMs − t). */
export const at = (plan: Plan, t: number): RotationCondition[] => [from(plan, t), { code: COND.timeLeftAtLeast, a: plan.fight.durationMs - t, b: 0 }]
/** Rend missing from the target, or under `ms` of ticks left. */
export const refresh = (ability: number, ms: number): RotationCondition => ({ code: COND.abilityAuraRefresh, a: ability, b: ms })
/** Rage at the pull, in rage (Plan.prepull's Charge rage, with no stance cap). */
export const rageAtPull = (plan: Plan, rage: number) => (plan.prepull = { casts: [], chargeTenths: rage * 10, keepTenths: -1 })

/** Every attack lands (100% hit, no dodge) and never crits. */
export function alwaysLandNoCrit(plan: Plan): void {
  plan.stats.hit = 100
  plan.stats.crit = -100
  plan.fight.bossCanDodge = false
}

export function setAttackPower(plan: Plan, ap: number): void {
  plan.stats.ap += ap - new Sim(plan).inspect().attackPower
  expect(new Sim(plan).inspect().attackPower).toBeCloseTo(ap, 9)
}

/** Damage events of one breakdown row over `fights` fights. */
export function damages(plan: Plan, row: number, fights: number): number[] {
  const sim = new Sim(plan)
  const out: number[] = []
  sim.damageTrace = (s, damage) => {
    if (s === row) out.push(damage)
  }
  for (let i = 0; i < fights; i++) sim.runFight(i)
  return out
}

/** The sample mean is within 4 standard errors of `expected`. */
export function expectMean(xs: number[], expected: number) {
  const m = emptyMoments()
  for (const x of xs) addSample(m, x)
  const se = stdev(m) / Math.sqrt(m.n)
  expect(Math.abs(m.mean - expected), `mean ${m.mean} vs ${expected} (SE ${se})`).toBeLessThanOrEqual(4 * se)
}

/** One fight's white swings per hand, bleed ticks, uses per ability (with rage at each), and stance swaps. */
export function timeline(plan: Plan, fight = 0) {
  const sim = new Sim(plan)
  const swings: [number[], number[]] = [[], []]
  const ticks: number[] = []
  const uses: number[][] = plan.abilities.map(() => [])
  const rageAtUse: number[][] = plan.abilities.map(() => [])
  const swaps: { stance: number; time: number; before: number; after: number }[] = []
  sim.trace = (_source, hand, time) => (hand >= 0 ? swings[hand].push(time) : ticks.push(time))
  sim.castTrace = (a, time, rage) => {
    uses[a].push(time)
    rageAtUse[a].push(rage)
  }
  sim.stanceTrace = (stance, time, before, after) => swaps.push({ stance, time, before, after })
  sim.runFight(fight)
  return { sim, swings, ticks, uses, rageAtUse, swaps }
}

export const counter = (sim: Sim, row: number, field: number) => sim.counters[row * FIELD_COUNT + field]
