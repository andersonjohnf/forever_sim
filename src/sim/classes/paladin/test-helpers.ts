// Hand-built paladin plans for the tests (docs/classes/paladin.md#worked-examples). Test code only.
//
// The worked examples' inputs are **synthetic test inputs, not base stats**: a level-60 paladin
// against a level-63 boss whose hits land and never crit, no buffs, a two-hander of 3.5 speed and
// 200–300 damage, 1200 attack power and 100 spell damage, all set directly on the plan.
import { expect } from 'vitest'
import { encodeTalentCode } from '@/data/talents/types'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import type { AuraSpec, ProcSpec } from '../../effects/types'
import { Sim } from '../../engine/sim'
import { addAura } from '../../engine/test-helpers'
import { buildPlan } from '../../plan/build'
import { type AbilityDef, ACTION, DEFENSE, type Plan, SCHOOL, type SpellDef, TRIGGER } from '../../plan/types'
import type { RotationValue, SpecId } from '../../types'
import { RETRIBUTION_IDS } from './retribution'
import { sealOfFuryProc } from './spells'

/** A build code from talent ranks by name (docs/data/talents.md). */
export function talentCode(ranks: Record<string, number>): string {
  const data = TALENT_DATA.paladin
  const byName = new Map(data.trees.flatMap((t) => t.talents).map((t) => [t.name, t.id]))
  const ids: Record<string, number> = {}
  for (const [name, rank] of Object.entries(ranks)) {
    const id = byName.get(name)
    if (!id) throw new Error(`No paladin talent ${name}`)
    ids[id] = rank
  }
  return encodeTalentCode(data, ids)
}

/**
 * Retribution's settings with only the core rows on (paladin.md "Forever priority list" rows 1 and
 * 3): the seal and its judgement, as the worked examples use them.
 */
export const RETRIBUTION_CORE_ONLY: Record<string, RotationValue> = {
  [RETRIBUTION_IDS.crusader]: false,
  [RETRIBUTION_IDS.holyStrike]: false,
  [RETRIBUTION_IDS.exorcism]: false,
  [RETRIBUTION_IDS.consecration]: false,
  [RETRIBUTION_IDS.consecrationRank1]: false,
  [RETRIBUTION_IDS.hammerOfWrath]: false,
  [RETRIBUTION_IDS.manaPotion]: false,
  [RETRIBUTION_IDS.rune]: false,
}

/**
 * Protection's settings for the worked examples: the Defensive rotation, with Holy Strike, which they
 * were written for (Balanced puts Hammer of the Righteous in its place, D28), and its own Judgement of
 * the Crusader off (paladin.md "the opener").
 */
export const PROTECTION_CORE_ONLY: Record<string, RotationValue> = {
  'paladin.protection.priority': 'duties',
  'paladin.protection.judgementOfTheCrusader.enabled': false,
}

export interface ExampleOptions {
  spec?: SpecId
  talents?: Record<string, number>
  /** Main-hand weapon: min, max and base speed (a two-hander unless `twoHand` is false). */
  weapon?: { min: number; max: number; speedSec: number; twoHand?: boolean }
  ap?: number
  sp?: number
  /** Hits land and never crit (the worked examples' default). */
  landNoCrit?: boolean
  durationMs?: number
  /** Keep the spec's core rotation (seal and judgement); otherwise the plan has no abilities. */
  core?: boolean
  /** Rotation settings, on top of the core-only ones (Retribution: `RETRIBUTION_CORE_ONLY`). */
  rotation?: Record<string, RotationValue>
}

/**
 * The worked examples' paladin (paladin.md#worked-examples): the spec's plan with no gear stats,
 * buffs or procs but the talents' and its rotation's, the example weapon, AP and SP set exactly,
 * no boss armor, and a fight of exactly `durationMs`.
 */
export function examplePlan(o: ExampleOptions = {}): Plan {
  const spec = o.spec ?? 'paladin-retribution'
  const d = defaultConfig(spec)
  const plan = buildPlan({
    ...d,
    talents: talentCode(o.talents ?? {}),
    // Only the main hand's weapon, unenchanted: its item stats are cleared below.
    gear: { mainHand: { itemId: d.gear.mainHand!.itemId } },
    buffs: { raid: [], enabled: [] },
    rotation: { ...(spec === 'paladin-retribution' ? RETRIBUTION_CORE_ONLY : PROTECTION_CORE_ONLY), ...o.rotation },
    fight: { ...d.fight, durationVariationPct: 0, durationSec: (o.durationMs ?? 60000) / 1000 },
  }).plan
  const w = o.weapon ?? { min: 200, max: 300, speedSec: 3.5 }
  const twoHand = w.twoHand ?? true
  plan.weapons = [
    { ...plan.weapons[0]!, min: w.min, max: w.max, speedSec: w.speedSec, twoHand, normalizedSpeed: twoHand ? 3.3 : 2.4, flatDamage: 0 },
    null,
  ]
  // The seals' procs were resolved against the real weapon: redo their PPM chances for this one, and
  // Seal of Fury's seal value (paladin.md#seal-of-fury-sof-new-the-protection-seal).
  for (const p of plan.procs) if (p.id === 'sealOfCommandProc') p.chance = [(7 * w.speedSec) / 60, 0]
  for (const p of plan.procs) {
    if (p.id !== 'sealOfFuryProc') continue
    const s = plan.spells![p.amount]
    const damage = sealOfFuryProc({ speedSec: w.speedSec, twoHand }).min
    s.min = damage
    s.max = damage
  }
  plan.fight.targetArmor = 0
  plan.fight.durationMs = o.durationMs ?? 60000
  const s = plan.stats
  // The item's own stats and ratings go; the example sets what it needs.
  for (const k of ['str', 'agi', 'sta', 'int', 'spi', 'ap', 'hitRating', 'critRating', 'spellDamage', 'holySpellDamage', 'mp5'] as const) s[k] = 0
  if (o.landNoCrit ?? true) {
    s.hit = 100
    s.spellHit = 100
    s.crit = -100
    s.spellCrit = -100
    plan.fight.bossCanDodge = false
  }
  if (!(o.core ?? true)) {
    plan.abilities = []
    plan.rotation = []
    plan.prepull = { casts: [], chargeTenths: 0, keepTenths: -1 }
  }
  setAp(plan, o.ap ?? 1200)
  setSp(plan, o.sp ?? 100)
  return plan
}

/** Sets the plan's attack power to exactly `ap` through its flat AP. */
export function setAp(plan: Plan, ap: number): void {
  plan.stats.ap += ap - new Sim(plan).inspect().attackPower
  expect(new Sim(plan).inspect().attackPower).toBeCloseTo(ap, 9)
}

/** Sets the plan's Holy spell damage to exactly `sp` through its flat spell damage. */
export function setSp(plan: Plan, sp: number): void {
  plan.stats.spellDamage += sp - new Sim(plan).inspect().spellDamage
  expect(new Sim(plan).inspect().spellDamage).toBeCloseTo(sp, 9)
}

/** Adds an ability to a plan as the plan builder does: a breakdown row, its aura, and its spells. Returns its index. */
export function addPaladinAbility(plan: Plan, def: AbilityDef): number {
  const { offHand: _, aura, vsCreature: __, window: ___, auraCrit: ____, spellDef, tickSpellDef, ...a } = def
  const source = rowFor(plan, a.id, a.name, a.icon)
  plan.abilities.push({
    ...a,
    source,
    offHandSource: -1,
    aura: aura ? addPlanAura(plan, aura) : -1,
    window: -1,
    ...(spellDef ? { spell: addPlanSpell(plan, spellDef) } : {}),
    ...(tickSpellDef ? { tickSpell: addPlanSpell(plan, tickSpellDef) } : {}),
  })
  return plan.abilities.length - 1
}

/** A plan aura for `spec`, with its paladin fields (holy, holyTaken, group). */
export function addPlanAura(plan: Plan, spec: AuraSpec): number {
  const i = addAura(plan, spec)
  const a = plan.auras[i]
  a.maxStacks = spec.maxStacks ?? 1
  a.apPct = spec.mods.apPct ?? 0
  a.haste = spec.mods.haste ?? 0
  if (spec.mods.holy) a.holy = spec.mods.holy
  if (spec.mods.holyTaken) a.holyTaken = spec.mods.holyTaken
  if (spec.group) a.group = spec.group
  return i
}

/** The plan spell for `def`, added with its breakdown row as the plan builder does. */
export function addPlanSpell(plan: Plan, def: SpellDef): number {
  plan.spells ??= []
  const source = rowFor(plan, def.id, def.name, def.icon)
  const i = plan.spells.findIndex((x) => x.source === source)
  if (i >= 0) return i
  const { name: _, icon: __, school, defense, critAura: ___, ...rest } = def
  plan.spells.push({ ...rest, school: SCHOOL[school], defense: DEFENSE[defense], source })
  return plan.spells.length - 1
}

/**
 * Adds a proc as the plan builder does (build.ts resolveProc): a main-hand chance from its PPM or
 * percentage, its aura requirement, and its spell or aura. Returns its index.
 */
export function addProcSpec(plan: Plan, spec: ProcSpec): number {
  const trigger = TRIGGER[spec.trigger]
  const chance = 'ppm' in spec.chance ? (spec.chance.ppm * plan.weapons[0]!.speedSec) / 60 : 'pct' in spec.chance ? spec.chance.pct / 100 : 0
  let action: number
  let amount: number
  let source = -1
  if (spec.action.kind === 'spell') {
    action = ACTION.spell
    amount = addPlanSpell(plan, spec.action.spell)
    source = plan.spells![amount].source
  } else if (spec.action.kind === 'aura') {
    action = ACTION.aura
    amount = addPlanAura(plan, spec.action.aura)
  } else throw new Error(`addProcSpec: ${spec.action.kind}`)
  const requiresAura = spec.requiresAura === undefined ? -1 : plan.auras.findIndex((a) => a.id === spec.requiresAura)
  plan.procs.push({
    id: spec.id,
    name: spec.name,
    trigger,
    chance: [chance, chance],
    hands: spec.from === 'mainHand' ? 1 : 3,
    icdMs: spec.icdMs ?? 0,
    action,
    amount,
    a: 0,
    b: 0,
    school: 0,
    source,
    chainBit: 0,
    requiresAura,
  })
  plan.triggers[trigger].push(plan.procs.length - 1)
  return plan.procs.length - 1
}

function rowFor(plan: Plan, id: string, name: string, icon: string): number {
  const i = plan.sources.findIndex((s) => s.id === id)
  if (i >= 0) return i
  plan.sources.push({ id, name, icon })
  return plan.sources.length - 1
}

/** A breakdown row's index by id. */
export const row = (plan: Plan, id: string) => {
  const i = plan.sources.findIndex((s) => s.id === id)
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
