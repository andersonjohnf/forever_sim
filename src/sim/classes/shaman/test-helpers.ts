// Shaman plans for the tests (docs/classes/shaman.md#worked-examples). Test code only.
//
// The worked examples' inputs are **synthetic test inputs, not base stats**: a level-60 shaman
// against a level-63 boss with no armor, whose hits land and never crit, no buffs, a two-hander of
// 3.6 speed and 200–300 damage, 1200 attack power and 100 spell damage, all set directly on the
// plan. The plan itself is the plan builder's, so the talents, the rotation's rows, Stormstrike's
// boost and Maelstrom Weapon's stacks are resolved as they are in the app.
import { expect } from 'vitest'
import { encodeTalentCode } from '@/data/talents/types'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import { type Plan, TRIGGER_COUNT } from '../../plan/types'
import type { RotationValue } from '../../types'
import { ENHANCEMENT_IDS as ID, ENHANCEMENT_OPTIONS } from './enhancement'
import { ELEMENTAL_IDS, ELEMENTAL_OPTIONS } from './elemental'

export const ENH = 'shaman-enhancement'

/** A build code from talent ranks by name (docs/data/talents.md). */
export function talentCode(ranks: Record<string, number>): string {
  const data = TALENT_DATA.shaman
  const byName = new Map(data.trees.flatMap((t) => t.talents).map((t) => [t.name, t.id]))
  const ids: Record<string, number> = {}
  for (const [name, rank] of Object.entries(ranks)) {
    const id = byName.get(name)
    if (!id) throw new Error(`No shaman talent ${name}`)
    ids[id] = rank
  }
  return encodeTalentCode(data, ids)
}

/** Every Enhancement switch off and no shock: the imbue's procs and the talents' only. */
export const ROTATION_OFF: Record<string, RotationValue> = {
  ...Object.fromEntries(ENHANCEMENT_OPTIONS.flatMap((o) => (o.kind === 'toggle' ? [[o.id, false]] : []))),
  [ID.shock]: 'none',
}

export interface ExampleOptions {
  /** Talent ranks by name (none by default). */
  talents?: Record<string, number>
  /** Rotation settings on top of ROTATION_OFF. */
  rotation?: Record<string, RotationValue>
  /** Main-hand weapon: min, max and speed (a two-hander, normalized to 3.3). */
  weapon?: { min: number; max: number; speedSec: number }
  ap?: number
  sp?: number
  /** Hits and spells land and never crit (the worked examples' default). */
  landNoCrit?: boolean
  durationMs?: number
  /** The mana pool, in tenths (default: one that never runs dry, so no example waits for mana). */
  manaTenths?: number
  /** Procs to leave out of the plan by id (e.g. `windfuryWeapon`, `maelstromWeapon`). */
  dropProcs?: string[]
}

/**
 * The worked examples' shaman (shaman.md#worked-examples): the Enhancement plan for these talents
 * and settings with no gear stats or buffs, the example weapon, AP and SP set exactly, no boss
 * armor, a mana pool that never runs dry, and a fight of exactly `durationMs`.
 */
export function examplePlan(o: ExampleOptions = {}): Plan {
  const d = defaultConfig(ENH)
  const plan = buildPlan({
    ...d,
    talents: talentCode(o.talents ?? {}),
    // Only the main hand's weapon, unenchanted: its item stats are cleared below.
    gear: { mainHand: { itemId: d.gear.mainHand!.itemId } },
    buffs: { raid: [], enabled: [] },
    rotation: { ...ROTATION_OFF, ...o.rotation },
    fight: { ...d.fight, durationVariationPct: 0, durationSec: (o.durationMs ?? 60000) / 1000 },
  }).plan
  const w = o.weapon ?? { min: 200, max: 300, speedSec: 3.6 }
  plan.weapons = [{ ...plan.weapons[0]!, min: w.min, max: w.max, speedSec: w.speedSec, twoHand: true, normalizedSpeed: 3.3, flatDamage: 0 }, null]
  plan.fight.targetArmor = 0
  plan.fight.durationMs = o.durationMs ?? 60000
  const s = plan.stats
  for (const k of ['str', 'agi', 'sta', 'int', 'spi', 'ap', 'hitRating', 'critRating', 'spellDamage', 'holySpellDamage', 'mp5'] as const) s[k] = 0
  if (o.landNoCrit ?? true) {
    s.hit = 100
    s.spellHit = 100
    s.crit = -100
    s.spellCrit = -100
    plan.fight.bossCanDodge = false
  }
  plan.mana!.maxTenths = o.manaTenths ?? 1e9
  if (o.dropProcs) dropProcs(plan, o.dropProcs)
  setAp(plan, o.ap ?? 1200)
  setSp(plan, o.sp ?? 100)
  return plan
}

/** Leaves these procs out of the plan, and refiles the rest under their triggers. */
export function dropProcs(plan: Plan, ids: readonly string[]): void {
  plan.procs = plan.procs.filter((p) => !ids.includes(p.id))
  plan.triggers = Array.from({ length: TRIGGER_COUNT }, () => [])
  plan.procs.forEach((p, i) => plan.triggers[p.trigger].push(i))
}

/** Sets the plan's attack power to exactly `ap` through its flat AP. */
export function setAp(plan: Plan, ap: number): void {
  plan.stats.ap += ap - new Sim(plan).inspect().attackPower
  expect(new Sim(plan).inspect().attackPower).toBeCloseTo(ap, 9)
}

/** Sets the plan's spell damage (Nature and Frost: all schools) to exactly `sp` through its flat spell damage. */
export function setSp(plan: Plan, sp: number): void {
  plan.stats.spellDamage += sp - new Sim(plan).inspect().spellDamage
  expect(new Sim(plan).inspect().spellDamage).toBeCloseTo(sp, 9)
}

/** A plan's proc by id. */
export const procOf = (plan: Plan, id: string) => {
  const p = plan.procs.find((x) => x.id === id)
  expect(p, id).toBeDefined()
  return p!
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

/** A plan aura's index by id. */
export const auraOf = (plan: Plan, id: string) => {
  const i = plan.auras.findIndex((a) => a.id === id)
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

/** One fight's events in order: white swings (by row), ability uses (by id) and damage (by row), with their times. */
export function events(plan: Plan, fight = 0) {
  const sim = new Sim(plan)
  const list: { kind: 'swing' | 'use' | 'damage' | 'tick'; id: string; t: number; value: number }[] = []
  let now = 0
  sim.trace = (source, hand, t) => {
    now = t
    if (hand >= 0) list.push({ kind: 'swing', id: plan.sources[source].id, t, value: hand })
  }
  sim.castTrace = (a, t, pool) => {
    now = t
    list.push({ kind: 'use', id: plan.abilities[a].id, t, value: pool })
  }
  sim.damageTrace = (source, d) => list.push({ kind: 'damage', id: plan.sources[source].id, t: now, value: d })
  sim.manaTrace = (t, tenths) => {
    now = t
    list.push({ kind: 'tick', id: 'mana', t, value: tenths })
  }
  sim.runFight(fight)
  return { sim, list }
}

// --- Elemental (docs/classes/shaman.md#elemental-worked-examples) --------------------------------------

export const ELE = 'shaman-elemental'

/** Every Elemental switch off, Chain Lightning never and no downrank: Lightning Bolt rank 10 alone. */
export const ELEMENTAL_OFF: Record<string, RotationValue> = {
  ...Object.fromEntries(ELEMENTAL_OPTIONS.flatMap((o) => (o.kind === 'toggle' ? [[o.id, false]] : []))),
  [ELEMENTAL_IDS.chainLightning]: 'never',
}

export interface ElementalExampleOptions {
  /** Talent ranks by name; absent, the default build. */
  talents?: Record<string, number>
  /** Rotation settings on top of ELEMENTAL_OFF. */
  rotation?: Record<string, RotationValue>
  /** Spell damage for every school. */
  sp?: number
  /** Spells land and never crit (the worked examples' default). */
  landNoCrit?: boolean
  durationMs?: number
  manaTenths?: number
  /** Procs to leave out by id (e.g. `elementalFocus`, `lightningOverload`). */
  dropProcs?: string[]
  race?: string
}

/**
 * The Elemental worked examples' shaman (shaman.md#elemental-worked-examples): the Elemental plan for
 * these talents and settings with no gear or buffs, spell damage set exactly, a mana pool that never
 * runs dry and a fight of exactly `durationMs`.
 */
export function elementalPlan(o: ElementalExampleOptions = {}): Plan {
  const d = defaultConfig(ELE, o.race)
  const plan = buildPlan({
    ...d,
    ...(o.talents ? { talents: talentCode(o.talents) } : {}),
    gear: {},
    buffs: { raid: [], enabled: [] },
    rotation: { ...ELEMENTAL_OFF, ...o.rotation },
    fight: { ...d.fight, durationVariationPct: 0, durationSec: (o.durationMs ?? 60000) / 1000 },
  }).plan
  plan.fight.durationMs = o.durationMs ?? 60000
  const s = plan.stats
  for (const k of ['str', 'agi', 'sta', 'int', 'spi', 'ap', 'hitRating', 'critRating', 'spellDamage', 'holySpellDamage', 'mp5'] as const) s[k] = 0
  if (o.landNoCrit ?? true) {
    s.spellHit = 100
    s.spellCrit = -100
  }
  plan.mana!.maxTenths = o.manaTenths ?? 1e9
  if (o.dropProcs) dropProcs(plan, o.dropProcs)
  setSp(plan, o.sp ?? 400)
  return plan
}
