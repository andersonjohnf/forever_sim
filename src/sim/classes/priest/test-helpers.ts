// Shadow Priest plans for the tests (docs/classes/priest.md#worked-examples). Test code only.
//
// The worked examples' inputs are **synthetic test inputs, not base stats**: a level-60 priest
// against a level-63 boss, 500 Shadow spell damage, no gear, no buffs, and spells that land and never
// crit unless a test says so, all set directly on the plan. The plan itself is the plan builder's, so
// the talents, Shadowform, the rotation's rows and Shadow Weaving's proc are resolved as in the app.
import { expect } from 'vitest'
import { encodeTalentCode } from '@/data/talents/types'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import { type Plan, SCHOOL, TRIGGER_COUNT } from '../../plan/types'
import type { RotationValue, SimConfig } from '../../types'
import { SHADOW_IDS as ID, SHADOW_OPTIONS } from './shadow'

export const SHADOW = 'priest-shadow'

/** A build code from talent ranks by name (docs/data/talents.md). */
export function talentCode(ranks: Record<string, number>): string {
  const data = TALENT_DATA.priest
  const byName = new Map(data.trees.flatMap((t) => t.talents).map((t) => [t.name, t.id]))
  const ids: Record<string, number> = {}
  for (const [name, rank] of Object.entries(ranks)) {
    const id = byName.get(name)
    if (!id) throw new Error(`No priest talent ${name}`)
    ids[id] = rank
  }
  return encodeTalentCode(data, ids)
}

/** Every Shadow switch off: nothing is cast unless a test turns it on. */
export const ROTATION_OFF: Record<string, RotationValue> = Object.fromEntries(SHADOW_OPTIONS.flatMap((o) => (o.kind === 'toggle' ? [[o.id, false]] : [])))

export interface ExampleOptions {
  /** Talent ranks by name (none by default). */
  talents?: Record<string, number>
  /** Rotation settings on top of ROTATION_OFF. */
  rotation?: Record<string, RotationValue>
  race?: string
  /** Shadow spell damage (all schools here). */
  sp?: number
  /** Spells land and never crit (the default); `crit: true` makes every spell crit. */
  landNoCrit?: boolean
  crit?: boolean
  durationMs?: number
  /** The mana pool, in tenths (default: one that never runs dry), and its regeneration (default none). */
  manaTenths?: number
  regen?: boolean
  /** Procs to leave out of the plan by id (e.g. `shadowWeaving`). */
  dropProcs?: string[]
  config?: Partial<SimConfig>
}

/**
 * The worked examples' priest (priest.md#worked-examples): the Shadow plan for these talents and
 * settings with no gear or buffs, 500 spell damage, and a fight of exactly `durationMs`.
 */
export function examplePlan(o: ExampleOptions = {}): Plan {
  const d = defaultConfig(SHADOW)
  const plan = buildPlan({
    ...d,
    race: o.race ?? d.race,
    talents: talentCode(o.talents ?? {}),
    gear: {},
    buffs: { raid: [], enabled: [] },
    rotation: { ...ROTATION_OFF, ...o.rotation },
    fight: { ...d.fight, durationVariationPct: 0, durationSec: (o.durationMs ?? 60000) / 1000 },
    ...o.config,
  }).plan
  plan.fight.durationMs = o.durationMs ?? 60000
  const s = plan.stats
  for (const k of ['hitRating', 'critRating', 'spellDamage', 'holySpellDamage', 'shadowSpellDamage', 'mp5'] as const) s[k] = 0
  if (o.landNoCrit ?? true) {
    s.spellHit = 100
    s.spellCrit = o.crit ? 100 : -100
  }
  plan.mana!.maxTenths = o.manaTenths ?? 1e9
  if (!(o.regen ?? false)) {
    plan.mana!.regenTickTenths = 0
    plan.mana!.mp5TickTenths = 0
  }
  if (o.dropProcs) dropProcs(plan, o.dropProcs)
  setShadowSp(plan, o.sp ?? 500)
  return plan
}

/** Leaves these procs out of the plan, and refiles the rest under their triggers. */
export function dropProcs(plan: Plan, ids: readonly string[]): void {
  plan.procs = plan.procs.filter((p) => !ids.includes(p.id))
  plan.triggers = Array.from({ length: TRIGGER_COUNT }, () => [])
  plan.procs.forEach((p, i) => plan.triggers[p.trigger].push(i))
}

/** Sets the plan's Shadow spell damage to exactly `sp` through its flat all-schools spell damage. */
export function setShadowSp(plan: Plan, sp: number): void {
  const now = () => new Sim(plan).inspect().schoolSpellDamage[SCHOOL.shadow]
  plan.stats.spellDamage += sp - now()
  expect(now()).toBeCloseTo(sp, 9)
}

/** A breakdown row's index by id. */
export const row = (plan: Plan, id: string) => {
  const i = plan.sources.findIndex((s) => s.id === id)
  expect(i, id).toBeGreaterThanOrEqual(0)
  return i
}

/** A plan ability's index by id. */
export const abilityOf = (plan: Plan, id: string) => {
  const i = plan.abilities.findIndex((a) => a.id === id)
  expect(i, id).toBeGreaterThanOrEqual(0)
  return i
}

/** Every damage event of a row over `fights` fights. */
export function damagesOf(plan: Plan, id: string, fights = 1): number[] {
  const r = row(plan, id)
  const sim = new Sim(plan)
  const out: number[] = []
  sim.damageTrace = (s, d) => {
    if (s === r) out.push(d)
  }
  for (let i = 0; i < fights; i++) sim.runFight(i)
  return out
}

/** One fight's ability uses (by id) and damage (by row), with their times. */
export function events(plan: Plan, fight = 0) {
  const sim = new Sim(plan)
  const list: { kind: 'use' | 'damage'; id: string; t: number; value: number }[] = []
  let now = 0
  sim.trace = (_source, _hand, t) => {
    now = t
  }
  sim.castTrace = (a, t, pool) => {
    now = t
    list.push({ kind: 'use', id: plan.abilities[a].id, t, value: pool })
  }
  sim.damageTrace = (source, d) => list.push({ kind: 'damage', id: plan.sources[source].id, t: now, value: d })
  sim.runFight(fight)
  return { sim, list }
}

export { ID }
