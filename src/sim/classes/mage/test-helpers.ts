// Mage plans for the tests (docs/classes/mage.md#worked-examples). Test code only.
//
// The examples' inputs are **synthetic test inputs, not base stats**: a level-60 mage against a
// level-63 boss, no gear, no buffs unless a test names them, spells that land and never crit unless
// a test says so, the spell damage of every school set exactly, and a mana pool that never runs dry
// and doesn't regenerate. The plan itself is the plan builder's, so the talents, the rotation's rows,
// the procs, Ignite, Combustion and the stacking auras are resolved as they are in the app.
import { expect } from 'vitest'
import { encodeTalentCode } from '@/data/talents/types'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { CHUNK_SIZE, type ChunkResult, runChunk } from '../../engine/chunk'
import { Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import { type Plan, SCHOOL, TRIGGER_COUNT } from '../../plan/types'
import { type Aggregate, emptyAggregate, mergeChunk } from '../../run/aggregate'
import type { ChunkExecutor } from '../../run/driver'
import type { RotationValue, SpecId } from '../../types'
import { MAGE_OPTIONS } from './rotation'

export type MageSpec = 'fire' | 'frost' | 'arcane'
export const SPEC_ID: Record<MageSpec, SpecId> = { fire: 'mage-fire', frost: 'mage-frost', arcane: 'mage-arcane' }

/** A build code from talent ranks by name (docs/data/talents.md). */
export function talentCode(ranks: Record<string, number>): string {
  const data = TALENT_DATA.mage
  const byName = new Map(data.trees.flatMap((t) => t.talents).map((t) => [t.name, t.id]))
  const ids: Record<string, number> = {}
  for (const [name, rank] of Object.entries(ranks)) {
    const id = byName.get(name)
    if (!id) throw new Error(`No mage talent ${name}`)
    ids[id] = rank
  }
  return encodeTalentCode(data, ids)
}

/** Every switch of a spec off: its filler only (Fireball, Frostbolt, Arcane Missiles). */
export const rotationOff = (spec: MageSpec): Record<string, RotationValue> =>
  Object.fromEntries(MAGE_OPTIONS[spec].flatMap((o) => (o.kind === 'toggle' ? [[o.id, false]] : [])))

export interface ExampleOptions {
  spec?: MageSpec
  /** Talent ranks by name (none by default). */
  talents?: Record<string, number>
  /** Rotation settings on top of every switch off. */
  rotation?: Record<string, RotationValue>
  /** Spell damage of every school (default 0). */
  sp?: number
  /** Spell crit % on the sheet (default −100: never crits; 200: always crits). */
  spellCrit?: number
  /** Spell hit % on the sheet (default 100: never misses). */
  spellHit?: number
  durationMs?: number
  /**
   * The mana pool, in tenths (default: one that never runs dry); `plan`: the plan's own, which the
   * rotation's mana thresholds were computed from.
   */
  manaTenths?: number | 'plan'
  /** Buff catalogue ids to enable (none by default), with the full raid present. */
  buffs?: string[]
  /** The race (the spec's default by default): a Gnome's Eureka! (classes/eureka.ts). */
  race?: string
}

/**
 * The worked examples' mage (mage.md#worked-examples): the spec's plan for these talents and
 * settings, with no gear, no buffs unless named, the stats set exactly, no regeneration, and a
 * fight of exactly `durationMs`.
 */
export function examplePlan(o: ExampleOptions = {}): Plan {
  const spec = o.spec ?? 'fire'
  const d = defaultConfig(SPEC_ID[spec])
  const plan = buildPlan({
    ...d,
    ...(o.race ? { race: o.race } : {}),
    talents: talentCode(o.talents ?? {}),
    gear: {},
    buffs: { raid: d.buffs.raid, enabled: o.buffs ?? [] },
    rotation: { ...rotationOff(spec), ...o.rotation },
    fight: { ...d.fight, durationVariationPct: 0, durationSec: (o.durationMs ?? 60000) / 1000 },
  }).plan
  plan.fight.durationMs = o.durationMs ?? 60000
  const s = plan.stats
  for (const k of ['int', 'spi', 'hitRating', 'critRating', 'spellDamage', 'fireSpellDamage', 'frostSpellDamage', 'arcaneSpellDamage', 'mp5'] as const) s[k] = 0
  s.spellHit = o.spellHit ?? 100
  s.spellCrit = o.spellCrit ?? -100
  plan.mana = { ...plan.mana!, maxTenths: o.manaTenths === 'plan' ? plan.mana!.maxTenths : (o.manaTenths ?? 1e9), regenTickTenths: 0, mp5TickTenths: 0 }
  setSp(plan, o.sp ?? 0)
  return plan
}

/** Sets every school's spell damage to exactly `sp` through the flat spell damage. */
export function setSp(plan: Plan, sp: number): void {
  plan.stats.spellDamage += sp - new Sim(plan).inspect().schoolSpellDamage[SCHOOL.fire]
  const schools = new Sim(plan).inspect().schoolSpellDamage
  for (const k of [SCHOOL.fire, SCHOOL.frost, SCHOOL.arcane]) expect(schools[k]).toBeCloseTo(sp, 9)
}

/** Leaves these procs out of the plan, and refiles the rest under their triggers. */
export function dropProcs(plan: Plan, ids: readonly string[]): void {
  plan.procs = plan.procs.filter((p) => !ids.includes(p.id))
  plan.triggers = Array.from({ length: TRIGGER_COUNT }, () => [])
  plan.procs.forEach((p, i) => plan.triggers[p.trigger].push(i))
}

/** Keeps only the rotation lines of these abilities (by id), in their order. */
export function onlyLines(plan: Plan, ...ids: string[]): void {
  plan.rotation = plan.rotation.filter((r) => ids.includes(plan.abilities[r.ability].id))
}

/** A plan spell by its row id. */
export const spellOf = (plan: Plan, id: string) => {
  const s = plan.spells!.find((x) => plan.sources[x.source].id === id)
  expect(s, id).toBeDefined()
  return s!
}

/** Fixes a spell's base damage, so each cast deals one exact value. */
export const fixSpell = (plan: Plan, id: string, base: number) => Object.assign(spellOf(plan, id), { min: base, max: base })

export const procOf = (plan: Plan, id: string) => {
  const p = plan.procs.find((x) => x.id === id)
  expect(p, id).toBeDefined()
  return p!
}

export const row = (plan: Plan, id: string) => {
  const i = plan.sources.findIndex((s) => s.id === id)
  expect(i, id).toBeGreaterThanOrEqual(0)
  return i
}

export const abilityOf = (plan: Plan, id: string) => {
  const i = plan.abilities.findIndex((a) => a.id === id)
  expect(i, id).toBeGreaterThanOrEqual(0)
  return i
}

export const auraOf = (plan: Plan, id: string) => {
  const i = plan.auras.findIndex((a) => a.id === id)
  expect(i, id).toBeGreaterThanOrEqual(0)
  return i
}

/** The engine's aura state, read by the tests between events (not part of its API). */
interface AuraState {
  auraActive: Uint8Array
  auraStacks: Int32Array
  auraCritCharges: Int32Array
  abReadyAt: Float64Array
  auraUpMs: Float64Array
  schMiss: Float64Array
  schCrit: Float64Array
  now: number
  critAuraPct(spell: number): number
}
export const auraState = (sim: Sim) => sim as unknown as AuraState

export interface TimelineEvent {
  kind: 'use' | 'damage'
  id: string
  t: number
  /** A use: the pool (tenths) as it's used; damage: the damage. */
  value: number
  /** A use: the watched auras' stacks as it's used (0 while down). */
  stacks: Record<string, number>
  /** A use: the watched auras' crit charges left as it's used. */
  charges: Record<string, number>
}

/**
 * One fight's ability uses (with the pool and the watched auras' stacks as each is used) and damage
 * (by row), in order, with their times.
 */
export function events(plan: Plan, watch: string[] = [], fight = 0) {
  const sim = new Sim(plan)
  const st = auraState(sim)
  const watched = watch.map((id) => [id, auraOf(plan, id)] as const)
  const list: TimelineEvent[] = []
  sim.castTrace = (a, t, pool) => {
    const stacks: Record<string, number> = {}
    const charges: Record<string, number> = {}
    for (const [id, i] of watched) {
      stacks[id] = st.auraActive[i] ? st.auraStacks[i] : 0
      charges[id] = st.auraActive[i] ? st.auraCritCharges[i] : 0
    }
    list.push({ kind: 'use', id: plan.abilities[a].id, t, value: pool, stacks, charges })
  }
  sim.damageTrace = (source, d) => list.push({ kind: 'damage', id: plan.sources[source].id, t: st.now, value: d, stacks: {}, charges: {} })
  sim.runFight(fight)
  return { sim, list, uses: (id: string) => list.filter((e) => e.kind === 'use' && e.id === id), damage: (id: string) => list.filter((e) => e.kind === 'damage' && e.id === id) }
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

/** `fights` fights of a plan in chunks, aggregated as the app does (the goldens'). */
export function runFights(plan: Plan, fights: number): Aggregate {
  const sim = new Sim(plan)
  let agg = emptyAggregate(plan.sources.length, plan.auras.length)
  for (let k = 0; k * CHUNK_SIZE < fights; k++) agg = mergeChunk(agg, runChunk(plan, k, Math.min(CHUNK_SIZE, fights - k * CHUNK_SIZE), sim))
  return agg
}

/** A fake pool: `lanes` chunks at once, finishing out of order (engine.test.ts). */
export function racingExecutor(plan: Plan, lanes: number): ChunkExecutor {
  const sims = Array.from({ length: lanes }, () => new Sim(plan))
  let n = 0
  return {
    lanes,
    run: (chunk, fights) =>
      new Promise<ChunkResult>((resolve) => {
        const result = runChunk(plan, chunk, fights, sims[n++ % lanes])
        setTimeout(() => resolve(result), (chunk * 7919) % 13)
      }),
  }
}

/** Runs `fights` fights on one Sim and returns it (its counters sum them). */
export function run(plan: Plan, fights = 1): Sim {
  const sim = new Sim(plan)
  for (let i = 0; i < fights; i++) sim.runFight(i)
  return sim
}
