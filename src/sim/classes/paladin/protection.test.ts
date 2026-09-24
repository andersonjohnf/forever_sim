// The Protection paladin (docs/classes/paladin.md "Protection: model and rotation", #protection-tree,
// #threat-paladin-specific): its settings and the Max TPS priority (D26), its priority list, Holy
// Shield (worked example 12, its charges and its threat), Swift Judgement, Reckoning, Redoubt,
// Devotion Aura and Retribution Aura, Seal of Fury's absorb with Improved Seal of Fury's mana, the
// threat of each ability, mana over a long fight, and determinism.
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../defaults'
import { runChunk } from '../../engine/chunk'
import { BOSS_OUTCOME, FIELD, FIELD_COUNT, Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import { ACTION, COND, type Plan, TRIGGER } from '../../plan/types'
import { presetBuffIds } from '../../effects/presets'
import { FULL_RAID } from '../../defaults'
import { CHUNK_SIZE } from '../../engine/chunk'
import { type Aggregate, emptyAggregate, mergeChunk, toResult } from '../../run/aggregate'
import { maintainedBuffs } from '../rotation'
import { rotationGroups, unmetRequirements, unusedRotationSettings } from '../../index'
import type { SimConfig } from '../../types'
import { resolveRotationValues } from '../options'
import { talentRanksByName } from '..'
import { TALENT_DATA } from '../../defaults'
import {
  HOLY_SHIELD,
  HOLY_SHIELD_DAMAGE,
  PROTECTION_IDS as ID,
  PROTECTION_OPTIONS,
  PROTECTION_PRIORITY,
  protectionRotation,
  RETRIBUTION_AURA_DAMAGE,
  SEAL_OF_FURY_SHIELD_AURA,
  SWIFT_JUDGEMENT,
} from './protection'
import { addPaladinAbility, setSp } from './test-helpers'
import { JUDGEMENT_OF } from './abilities'

const PROT = 'paladin-protection'
const TALENTS = talentRanksByName(TALENT_DATA.paladin, defaultConfig(PROT).talents)
const NO_BUFFS: SimConfig['buffs'] = { raid: [], enabled: [] }
const MAX_TPS = { [ID.priority]: PROTECTION_PRIORITY.maxTps }

/** The default Protection paladin, with `patch`: no buffs unless it says so. */
const config = (patch: Partial<SimConfig> = {}): SimConfig => ({ ...defaultConfig(PROT), buffs: NO_BUFFS, ...patch })
const protPlan = (patch: Partial<SimConfig> = {}): Plan => buildPlan(config(patch)).plan
const rowOf = (plan: Plan, id: string) => {
  const i = plan.sources.findIndex((s) => s.id === id)
  expect(i, id).toBeGreaterThanOrEqual(0)
  return i
}
const field = (sim: Sim, plan: Plan, id: string, f: number) => sim.counters[rowOf(plan, id) * FIELD_COUNT + f]
const auraOf = (plan: Plan, id: string) => plan.auras.findIndex((a) => a.id === id)
/** The engine's current time, for traces that don't pass it. */
const nowOf = (sim: Sim) => (sim as unknown as { now: number }).now
const LANDED: ReadonlySet<number> = new Set([BOSS_OUTCOME.block, BOSS_OUTCOME.crit, BOSS_OUTCOME.crush, BOSS_OUTCOME.hit])

function runFights(plan: Plan, fights: number): Aggregate {
  const sim = new Sim(plan)
  let agg = emptyAggregate(plan.sources.length, plan.auras.length)
  for (let k = 0; k * CHUNK_SIZE < fights; k++) agg = mergeChunk(agg, runChunk(plan, k, Math.min(CHUNK_SIZE, fights - k * CHUNK_SIZE), sim))
  return agg
}

describe('Protection rotation options (paladin.md "Forever priority list (default)")', () => {
  it('declares valid, uniquely named settings in its spec’s namespace, the priority first without a heading', () => {
    const ids = PROTECTION_OPTIONS.map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
    const [priority, ...rest] = PROTECTION_OPTIONS
    expect(priority).toMatchObject({ kind: 'choice', id: 'paladin.protection.priority', default: 'duties' })
    expect(priority.group).toBeUndefined()
    for (const [i, option] of rest.entries()) {
      expect(option.id).toMatch(/^paladin\.protection\.[a-zA-Z0-9]+\.[a-zA-Z]+$/)
      expect(option.label.length).toBeGreaterThan(0)
      expect(option.help.length).toBeGreaterThan(0)
      expect(rotationGroups, option.id).toContain(option.group)
      if (option.kind === 'number') {
        expect(option.default).toBeGreaterThanOrEqual(option.min)
        expect(option.default).toBeLessThanOrEqual(option.max)
      }
      // docs/ux.md "Rotation": a dependent setting sits under its parent, in the same heading.
      if (option.dependsOn !== undefined) {
        const p = rest.findIndex((o) => o.id === option.dependsOn)
        expect(p, option.id).toBeGreaterThanOrEqual(0)
        expect(p, option.id).toBeLessThan(i)
        expect(rest[p].group).toBe(option.group)
      }
    }
    // No heading over a single setting.
    for (const group of rotationGroups) {
      const n = rest.filter((o) => o.group === group).length
      if (n > 0) expect(n, group).toBeGreaterThanOrEqual(2)
    }
  })

  it('has the tuned defaults (paladin.md "Tuning the defaults")', () => {
    expect(resolveRotationValues(PROTECTION_OPTIONS, {}, TALENTS)).toMatchObject({
      [ID.priority]: 'duties',
      [ID.seal]: 'fury',
      [ID.sealRefresh]: 2,
      [ID.holyShield]: true,
      [ID.swiftJudgement]: true,
      [ID.swiftJudgementCooldown]: 4.5,
      [ID.devotionAura]: true,
      [ID.judgement]: true,
      [ID.holyStrike]: true,
      [ID.consecration]: true,
      [ID.exorcismMana]: 0,
      [ID.consecrationMana]: 90,
      [ID.consecrationRank1]: false,
      [ID.hammerOfWrath]: true,
      [ID.hammerOfWrathMana]: 0,
    })
  })
})

describe('Max TPS (paladin.md "Priority: tank duties first, or Max TPS", D26)', () => {
  it('drops Devotion Aura, the paladin’s duty, for Retribution Aura, and moves nothing else', () => {
    const duties = resolveRotationValues(PROTECTION_OPTIONS, {}, TALENTS)
    const max = resolveRotationValues(PROTECTION_OPTIONS, MAX_TPS, TALENTS)
    expect([duties[ID.devotionAura], max[ID.devotionAura]]).toEqual([true, false])
    const moved = Object.keys(duties).filter((id) => duties[id] !== max[id])
    expect(moved.sort()).toEqual([ID.priority, ID.devotionAura].sort())
    const devotion = PROTECTION_OPTIONS.find((o) => o.id === ID.devotionAura)!
    expect(devotion).toMatchObject({ kind: 'toggle', maintainsBuff: 'devotionAura' })
    expect(devotion.help).toContain('Max TPS')
  })

  it('keeps a value you set yourself, and the tank-duties choice is the default', () => {
    const own = resolveRotationValues(PROTECTION_OPTIONS, { ...MAX_TPS, [ID.devotionAura]: true }, TALENTS)
    expect(own[ID.devotionAura]).toBe(true)
    const back = resolveRotationValues(PROTECTION_OPTIONS, { [ID.priority]: PROTECTION_PRIORITY.duties }, TALENTS)
    expect(back).toEqual(resolveRotationValues(PROTECTION_OPTIONS, {}, TALENTS))
  })

  it('your Devotion Aura is yours: the rotation puts it up, and the Buffs tab’s counts once; Max TPS leaves the Buffs tab’s off', () => {
    const d = defaultConfig(PROT)
    // D26: the raid preset leaves out a Protection paladin's own Devotion Aura, and a warrior tank's
    // Thunder Clap and Demoralizing Shout (you can add them in the Buffs tab).
    for (const preset of ['raid', 'max'] as const) {
      for (const id of ['devotionAura', 'thunderClap', 'demoralizingShout']) expect(presetBuffIds(preset, PROT, FULL_RAID), id).not.toContain(id)
    }
    expect(presetBuffIds('raid', 'warrior-protection', FULL_RAID)).toEqual(expect.arrayContaining(['devotionAura', 'thunderClap', 'demoralizingShout']))
    expect(maintainedBuffs(PROT, {})).toEqual(['devotionAura'])
    expect(maintainedBuffs(PROT, MAX_TPS)).toEqual([])
    const duties = buildPlan(d)
    const max = buildPlan({ ...d, rotation: MAX_TPS })
    // Righteous Fury, then the aura, are casts before the pull, a GCD apart and before the seal:
    // Devotion Aura's +735 armor, or Retribution Aura.
    const aura = (b: typeof duties) => b.plan.abilities[b.plan.prepull.casts[1].ability]
    expect(duties.plan.prepull.casts.map((c) => c.atMs)).toEqual([-4500, -3000, -1500])
    expect(duties.plan.abilities[duties.plan.prepull.casts[0].ability].id).toBe('righteousFury')
    expect(aura(duties).id).toBe('devotionAura')
    expect(duties.plan.auras[aura(duties).aura]).toMatchObject({ armor: 735, group: 'paladinAura' })
    expect(aura(max).id).toBe('retributionAura')
    expect(max.plan.procs.find((p) => p.id === 'retributionAuraDamage')).toMatchObject({ trigger: TRIGGER.meleeTaken, chance: [1, 1] })
    expect(duties.plan.procs.some((p) => p.id === 'retributionAuraDamage')).toBe(false)
    // The sheet shows your own Devotion Aura's armor; the fight gets it from the aura, once.
    expect(duties.sheet.armor - max.sheet.armor).toBe(735)
    expect(duties.plan.armor).toBe(max.plan.armor)
    // Another paladin's Devotion Aura, turned on in the Buffs tab: with tank duties it adds nothing
    // more (the same aura); with Max TPS it counts.
    const withBuff = (rotation: SimConfig['rotation']) => buildPlan({ ...d, rotation, buffs: { ...d.buffs, enabled: [...d.buffs.enabled, 'devotionAura'] } })
    expect(withBuff({}).plan.armor).toBe(duties.plan.armor)
    expect(withBuff(MAX_TPS).plan.armor - max.plan.armor).toBe(735)
  })

  it('Devotion Aura saves damage taken, and costs Retribution Aura’s threat', () => {
    const d = defaultConfig(PROT)
    const run = (rotation: SimConfig['rotation']) => {
      const plan = buildPlan({ ...d, rotation }).plan
      return toResult({ plan, sheet: buildPlan({ ...d, rotation }).sheet, assumptions: [] }, runFights(plan, 400), 0)
    }
    const duties = run({})
    const max = run(MAX_TPS)
    expect(max.tps.mean).toBeGreaterThan(duties.tps.mean * 1.04)
    expect(max.tank!.dtps.mean).toBeGreaterThan(duties.tank!.dtps.mean * 1.03)
  })
})

describe('the Protection priority list (paladin.md rows 0–8)', () => {
  const ctx = { hasShield: true, maxMana: 2000, executePhase: true, mainHand: { speedSec: 1.5, twoHand: false } }
  const ids = (r: ReturnType<typeof protectionRotation>) => r.rotation.map((e) => r.abilities[e.ability].id)

  it('the default: the seal, Holy Shield, Judgement, Swift Judgement, Holy Strike, Consecration and Hammer of Wrath', () => {
    const r = protectionRotation({}, TALENTS, () => -1, ctx)
    expect(ids(r)).toEqual(['sealOfFury', 'holyShield', 'judgementOfFury', 'swiftJudgement', 'holyStrike', 'consecration', 'hammerOfWrath'])
    // Abilities 0 and 1 are the seal and its judgement (paladinCore's order), the seal up 1.5 s before the pull.
    expect(r.abilities.slice(0, 2).map((a) => a.id)).toEqual(['sealOfFury', 'judgementOfFury'])
    // Righteous Fury 4.5 s before the pull, Devotion Aura at 3 s, then the seal.
    const fury = r.abilities.findIndex((a) => a.id === 'righteousFury')
    const devotion = r.abilities.findIndex((a) => a.id === 'devotionAura')
    expect(r.prepull.casts).toEqual([
      { ability: fury, atMs: -4500 },
      { ability: devotion, atMs: -3000 },
      { ability: 0, atMs: -1500 },
    ])
    // Righteous Fury's buff has no mods: its ×1.9 Holy threat is the plan's all fight.
    expect(r.abilities[fury].aura).toMatchObject({ id: 'righteousFury', mods: {} })
    const lines = Object.fromEntries(r.rotation.map((e) => [r.abilities[e.ability].id, e.conditions]))
    const shield = r.abilities.findIndex((a) => a.id === 'holyShield')
    expect(lines.sealOfFury).toEqual([{ code: COND.abilityAuraRefresh, a: 0, b: 2000 }])
    expect(lines.holyShield).toEqual([{ code: COND.abilityAuraRefresh, a: shield, b: 0 }])
    expect(lines.judgementOfFury).toEqual([{ code: COND.abilityAuraUp, a: 0, b: 0 }])
    expect(lines.swiftJudgement).toEqual([
      { code: COND.cooldownAtLeast, a: 1, b: 4500 },
      { code: COND.abilityAuraUp, a: 0, b: 0 },
    ])
    expect(lines.holyStrike).toEqual([])
    // 90% of 2,000 mana, in tenths.
    expect(lines.consecration).toEqual([{ code: COND.minMana, a: 18000, b: 0 }])
    expect(lines.hammerOfWrath).toEqual([])
    // Swift Judgement ends the judgement's cooldown, and its buff makes that judgement free.
    const swift = r.abilities.find((a) => a.id === 'swiftJudgement')!
    expect(swift).toMatchObject({ kind: 'cast', gcdMs: 0, cooldownMs: 60000, costTenths: 0, endsCooldownOf: 1 })
    expect(r.abilities[1].clearcastable).toBe(true)
    // Improved Judgement 2/2: an 8 s Judgement.
    expect(r.abilities[1].cooldownMs).toBe(8000)
    expect(r.procs.map((p) => p.id)).toEqual(['sealOfFuryProc', 'sealOfFuryShield', 'holyShieldProc'])
  })

  it('needs the talents and a shield for Holy Shield, the talent for Swift Judgement, and Undead or Demons for Exorcism', () => {
    const none = protectionRotation({}, new Map(), () => -1, ctx)
    expect(ids(none)).toEqual(['sealOfFury', 'judgementOfFury', 'holyStrike', 'consecration', 'hammerOfWrath'])
    expect(none.abilities[1].clearcastable).toBeUndefined()
    const noShield = protectionRotation({}, TALENTS, () => -1, { ...ctx, hasShield: false })
    expect(ids(noShield)).not.toContain('holyShield')
    // No absorb without a shield either.
    expect(noShield.procs.map((p) => p.id)).toEqual(['sealOfFuryProc'])
    const undead = protectionRotation({}, TALENTS, () => -1, { ...ctx, creatureType: 'undead' })
    expect(ids(undead)).toContain('exorcism')
    expect(ids(protectionRotation({}, TALENTS, () => -1, { ...ctx, executePhase: false }))).not.toContain('hammerOfWrath')
  })

  it('Seal of Righteousness in place of Seal of Fury: its proc and judgement, and no absorb', () => {
    const r = protectionRotation({ [ID.seal]: 'righteousness' }, TALENTS, () => -1, ctx)
    expect(r.abilities.slice(0, 2).map((a) => a.id)).toEqual(['sealOfRighteousness', 'judgementOfRighteousness'])
    expect(r.procs.map((p) => p.id)).toEqual(['sealOfRighteousnessProc', 'holyShieldProc'])
  })

  it('Consecration rank 1 below rank 5’s threshold when it’s on, the ranks sharing one cooldown', () => {
    const r = protectionRotation({ [ID.consecrationRank1]: true }, TALENTS, () => -1, ctx)
    const ranks = r.abilities.filter((a) => a.id.startsWith('consecration'))
    expect(ranks.map((a) => [a.id, a.category])).toEqual([
      ['consecration', 'consecration'],
      ['consecrationRank1', 'consecration'],
    ])
  })
})

describe('worked example 12: Holy Shield (paladin.md#worked-examples)', () => {
  it('SP 300: 221 + 0.08 × 300 = 245 a block, threat 245 × 1.9 × 1.2 = 558.6; at SP 0, 221 × 1.2 × 1.9 = 503.88 (threat.md T10)', () => {
    for (const [sp, damage, threat] of [
      [300, 245, 558.6],
      [0, 221, 503.88],
    ] as const) {
      const plan = protPlan({ gear: { mainHand: defaultConfig(PROT).gear.mainHand, offHand: defaultConfig(PROT).gear.offHand } })
      setSp(plan, sp)
      // Nothing else raises Holy damage or threat: no Holy talents or buffs.
      expect(plan.threatMult).toBe(1)
      const sim = new Sim(plan)
      for (let i = 0; i < 5; i++) sim.runFight(i)
      const hits = field(sim, plan, 'holyShieldProc', FIELD.hits)
      expect(hits).toBeGreaterThan(20)
      expect(field(sim, plan, 'holyShieldProc', FIELD.damage) / hits).toBeCloseTo(damage, 9)
      expect(field(sim, plan, 'holyShieldProc', FIELD.threat) / hits).toBeCloseTo(threat, 9)
    }
  })

  it('never crits or misses, even at 100% spell crit and 0% spell hit, and triggers no procs', () => {
    const plan = protPlan()
    plan.stats.spellCrit = 100
    plan.stats.spellHit = -100
    const sim = new Sim(plan)
    for (let i = 0; i < 5; i++) sim.runFight(i)
    expect(field(sim, plan, 'holyShieldProc', FIELD.hits)).toBeGreaterThan(20)
    expect(field(sim, plan, 'holyShieldProc', FIELD.crits)).toBe(0)
    expect(field(sim, plan, 'holyShieldProc', FIELD.misses)).toBe(0)
    expect(HOLY_SHIELD_DAMAGE).toMatchObject({ defense: 'none', cannotCrit: true, triggersProcs: false, threatMult: 1.2, spCoefficient: 0.08, min: 221, max: 221 })
  })
})

describe('Holy Shield’s charges (paladin.md#other-abilities; combat-tables §8)', () => {
  it('+20% block for 10 s or 4 blocks: each block while it’s up deals its damage, the 4th too, and the 5th finds it gone', () => {
    const plan = protPlan()
    // Every swing that isn't missed, dodged or parried is blocked: no crits or crushing blows.
    plan.stats.baseBlock = 100
    const shield = rowOf(plan, 'holyShield')
    const holyShield = plan.abilities.findIndex((a) => a.id === 'holyShield')
    expect(plan.auras[plan.abilities[holyShield].aura]).toMatchObject({ durationMs: 10000, blockCharges: 4, block: 20 })
    expect(plan.abilities[holyShield]).toMatchObject({ kind: 'cast', costTenths: 2400, cooldownMs: 10000, gcdMs: 1500 })
    const sim = new Sim(plan)
    // What happened, in the order it happened: casts of Holy Shield, blocks, and its damage.
    const log: [event: 'cast' | 'block' | 'damage', time: number][] = []
    const damageRow = rowOf(plan, 'holyShieldProc')
    sim.castTrace = (a, t) => {
      if (a === holyShield) log.push(['cast', t])
    }
    sim.swingTakenTrace = (o) => {
      if (o === BOSS_OUTCOME.block) log.push(['block', nowOf(sim)])
    }
    sim.damageTrace = (s) => {
      if (s === damageRow) log.push(['damage', nowOf(sim)])
    }
    sim.runFight(0)
    const casts = log.filter(([e]) => e === 'cast').length
    expect(casts).toBeGreaterThan(10)
    expect(field(sim, plan, 'holyShield', FIELD.casts)).toBe(casts)
    expect(shield).toBeGreaterThanOrEqual(0)
    // After each cast, the first 4 blocks within its 10 s deal its damage at once, and no other
    // block does. (A block at the very millisecond it runs out may come just before or after.)
    let charges = 0
    let until = -Infinity
    let dealt = 0
    let lastCharge = 0
    for (const [k, [event, t]] of log.entries()) {
      if (event === 'cast') [charges, until] = [4, t + 10000]
      if (event !== 'block') continue
      const next = log[k + 1]
      const damaged = next !== undefined && next[0] === 'damage' && next[1] === t
      if (t === until) {
        if (damaged) charges--
        continue
      }
      expect(damaged, `block at ${t}`).toBe(charges > 0 && t < until)
      if (damaged) {
        if (charges === 1) lastCharge++
        charges--
        dealt++
      }
    }
    expect(dealt).toBe(log.filter(([e]) => e === 'damage').length)
    expect(lastCharge).toBeGreaterThan(5)
    // Its 4 charges end it early: it's recast only on its 10 s cooldown, so it's down a while each time.
    expect(sim.auraUpMs[plan.abilities[holyShield].aura]).toBeLessThan(0.95 * casts * 10000)
  })
})

describe('Swift Judgement (paladin.md#protection-tree)', () => {
  it('ends Judgement’s cooldown once a minute, right after a Judgement, and the Judgement it frees costs nothing', () => {
    const plan = protPlan({ fight: { ...defaultConfig(PROT).fight, durationSec: 130, durationVariationPct: 0 } })
    const judge = 1
    const swift = plan.abilities.findIndex((a) => a.id === SWIFT_JUDGEMENT.id)
    expect(plan.freeCastAura).toBe(auraOf(plan, 'swiftJudgement'))
    const sim = new Sim(plan)
    const events: [id: string, time: number, mana: number][] = []
    sim.castTrace = (a, t, mana) => {
      if (a === judge || a === swift) events.push([plan.abilities[a].id, t, mana])
    }
    sim.runFight(0)
    const swifts = events.filter(([id]) => id === 'swiftJudgement')
    expect(swifts.map(([, t]) => t)).toEqual([0, 64000, 128000])
    for (const [, t] of swifts) {
      // Judge, Swift Judgement, judge again: all at once, off the GCD.
      const at = events.filter(([, time]) => time === t).map(([id]) => id)
      expect(at).toEqual(['judgementOfFury', 'swiftJudgement', 'judgementOfFury'])
      const [first, , second] = events.filter(([, time]) => time === t)
      // The first judgement pays 90; the second finds the same mana, and is free.
      expect(first[2] - second[2]).toBe(900)
    }
    // Judgements every 8 s from the pull, and two at each Swift Judgement.
    const judgements = events.filter(([id]) => id === 'judgementOfFury').map(([, t]) => t)
    expect(judgements.length).toBe(Math.floor(128000 / 8000) + 1 + swifts.length)
    expect(sim.auraUpMs[auraOf(plan, 'swiftJudgement')]).toBe(0)
  })

  it('ends the cooldown of every judgement in Judgement’s category, and never one that can’t be used again', () => {
    const plan = protPlan({ fight: { ...defaultConfig(PROT).fight, durationSec: 130, durationVariationPct: 0 } })
    const swift = plan.abilities.findIndex((a) => a.id === SWIFT_JUDGEMENT.id)
    // Two more judgements in the category, with no line: Righteousness's, and one this setup can
    // never use (a two-hander's, with a one-hander: never ready, at Infinity).
    const other = addPaladinAbility(plan, JUDGEMENT_OF.sealOfRighteousness)
    const never = addPaladinAbility(plan, { ...JUDGEMENT_OF.sealOfCommand, twoHandOnly: true })
    const sim = new Sim(plan)
    const readyAt = (sim as unknown as { abReadyAt: Float64Array }).abReadyAt
    const seen: [time: number, other: number, never: number][] = []
    let after = -1
    sim.castTrace = (a, t) => {
      // The free Judgement right after Swift Judgement: the category's cooldowns have just ended.
      if (a === 1 && t === after) seen.push([t, readyAt[other], readyAt[never]])
      if (a === swift) after = t
    }
    sim.runFight(0)
    expect(seen.map(([t]) => t)).toEqual([0, 64000, 128000])
    for (const [t, readyOther, readyNever] of seen) {
      expect(readyOther, `at ${t}`).toBeLessThanOrEqual(t)
      expect(readyNever).toBe(Infinity)
    }
  })

  it('without the Judgement it frees, its free Judgement’s mana is spent as usual', () => {
    const r = protPlan({ rotation: { [ID.swiftJudgement]: false } })
    expect(r.freeCastAura).toBeUndefined()
    expect(r.abilities.some((a) => a.id === 'swiftJudgement')).toBe(false)
  })
})

describe('Reckoning (paladin.md#protection-tree)', () => {
  it('5/5: an extra attack at once after 40% of blocks and every crit taken; during Hammer of Wrath’s cast, when it ends', () => {
    const plan = protPlan()
    const reckoning = plan.procs.filter((p) => p.id === 'reckoning')
    expect(reckoning.map((p) => [p.trigger, p.chance[0], p.action, p.amount])).toEqual([
      [TRIGGER.block, 0.4, ACTION.extraAttacks, 1],
      [TRIGGER.critTaken, 1, ACTION.extraAttacks, 1],
    ])
    // Some crits: defense below 440.
    plan.stats.defense -= 30
    const extra = rowOf(plan, 'reckoning')
    const hammer = plan.abilities.findIndex((a) => a.id === 'hammerOfWrath')
    const sim = new Sim(plan)
    let blocks = 0
    let crits = 0
    let atOnce = 0
    let afterCast = 0
    let pending = -1
    let castEnd = -1
    sim.castTrace = (a, t) => {
      if (a === hammer) castEnd = t + 1000
    }
    sim.swingTakenTrace = (o) => {
      if (o === BOSS_OUTCOME.block) blocks++
      if (o === BOSS_OUTCOME.crit) crits++
      pending = nowOf(sim)
    }
    sim.trace = (source, _hand, t) => {
      if (source !== extra) return
      // Each of Reckoning's swings comes at the time of the boss's swing that gave it, or, if that
      // came during Hammer of Wrath's cast, which stops your swings, as the cast ends.
      if (t === pending) atOnce++
      else if (t === castEnd && pending >= castEnd - 1000 && pending < castEnd) afterCast++
    }
    for (let i = 0; i < 200; i++) sim.runFight(i)
    const swings = field(sim, plan, 'reckoning', FIELD.casts)
    expect(afterCast).toBeGreaterThan(0)
    expect(atOnce + afterCast).toBe(swings)
    expect(crits).toBeGreaterThan(100)
    // Every crit gives one; 40% of blocks give one more (a binomial: within 4 standard deviations).
    const fromBlocks = swings - crits
    const sd = Math.sqrt(blocks * 0.4 * 0.6)
    expect(Math.abs(fromBlocks - 0.4 * blocks)).toBeLessThan(4 * sd)
  })
})

describe('Redoubt (paladin.md#protection-tree)', () => {
  it('5/5: a 10% chance on each landed swing for +30% block, 10 s or 5 blocks; with a shield only', () => {
    const redoubt = protPlan().procs.find((p) => p.id === 'redoubt')!
    expect(redoubt).toMatchObject({ trigger: TRIGGER.meleeTaken, chance: [0.1, 0.1], action: ACTION.aura })
    const plan = protPlan()
    expect(plan.auras[redoubt.amount]).toMatchObject({ durationMs: 10000, blockCharges: 5, block: 30 })
    const noShield = protPlan({ gear: { mainHand: defaultConfig(PROT).gear.mainHand } })
    expect(noShield.procs.some((p) => p.id === 'redoubt')).toBe(false)
  })

  it('in the fight: procs from 10% of landed swings, adds 30% block while up, and each later block uses a charge; the swing that procs it uses none', () => {
    // Holy Shield off, so Redoubt is the only aura blocks use up.
    const plan = protPlan({ rotation: { [ID.holyShield]: false } })
    const aura = auraOf(plan, 'redoubt')
    const sim = new Sim(plan)
    const inside = sim as unknown as { auraActive: Uint8Array; auraGen: Int32Array; auraBlockCharges: Int32Array; thrBoss: Float64Array }
    // Before each swing: whether Redoubt is up, its charges and generation, and the table's block slice.
    let prev: { outcome: number; up: boolean; charges: number; gen: number } | null = null
    let landed = 0
    let procs = 0
    let used = 0
    let lastBlocks = 0
    const blockUp: number[] = []
    const blockDown: number[] = []
    sim.swingTakenTrace = (o) => {
      const up = inside.auraActive[aura] === 1
      const charges = inside.auraBlockCharges[aura]
      const gen = inside.auraGen[aura]
      const th = inside.thrBoss
      // This swing's table, as it was rolled: block is the slice between parry and crit.
      ;(up ? blockUp : blockDown).push(th[3] - th[2])
      if (prev && LANDED.has(prev.outcome)) {
        landed++
        const reapplied = up && gen !== prev.gen
        if (reapplied) {
          // The swing that procced it, blocked or not, used none of its 5 charges.
          procs++
          expect(charges).toBe(5)
        } else if (prev.up && prev.outcome === BOSS_OUTCOME.block) {
          // A block while it was up used a charge; the 5th ended it.
          used++
          if (prev.charges === 1) {
            lastBlocks++
            expect(up).toBe(false)
          } else expect(charges).toBe(prev.charges - 1)
        }
      }
      prev = { outcome: o, up, charges, gen }
    }
    for (let i = 0; i < 300; i++) {
      prev = null
      sim.runFight(i)
    }
    // 10% of landed swings (a binomial: within 4 standard deviations).
    expect(Math.abs(procs - 0.1 * landed)).toBeLessThan(4 * Math.sqrt(landed * 0.1 * 0.9))
    expect(used).toBeGreaterThan(300)
    // Five blocks in its 10 s are rare; its 10 s end it far more often.
    expect(lastBlocks).toBeGreaterThan(2)
    // While it's up the table blocks 30 points more (nothing else here changes block).
    expect(Math.max(...blockUp) - Math.max(...blockDown)).toBeCloseTo(30, 9)
  })
})

describe('Seal of Fury’s absorb and Improved Seal of Fury (paladin.md#protection-tree, OQ 10)', () => {
  /** A plan whose own swings always land, with a slow weapon, so two boss swings can come between them. */
  function slowPlan(): Plan {
    const plan = protPlan()
    plan.weapons = [{ ...plan.weapons[0]!, speedSec: 5 }, null]
    plan.stats.hit = 100
    plan.fight.bossCanDodge = false
    plan.fight.bossCanParry = false
    return plan
  }

  it('restores 60 mana × 1.45 = 87 against a level-63 boss when a hit that costs health uses up the absorb', () => {
    const plan = protPlan()
    const improved = plan.procs.find((p) => p.id === 'improvedSealOfFury')!
    expect(improved).toMatchObject({ trigger: TRIGGER.damageTaken, action: ACTION.manaFlat, amount: 870, requiresAura: auraOf(plan, 'sealOfFuryShield') })
    expect(plan.auras[auraOf(plan, 'sealOfFuryShield')]).toMatchObject({ durationMs: SEAL_OF_FURY_SHIELD_AURA.durationMs, takenCharges: 1 })
    // A level-61 boss: 15% more.
    const low = protPlan({ fight: { ...defaultConfig(PROT).fight, bossLevel: 61 } })
    expect(low.procs.find((p) => p.id === 'improvedSealOfFury')!.amount).toBe(690)
  })

  it('one absorb at a time: each of your landed swings puts it up, and the next hit that costs you health uses it', () => {
    const plan = slowPlan()
    const sim = new Sim(plan)
    const improvedRow = rowOf(plan, 'improvedSealOfFury')
    const spy = sim as unknown as { gainMana: (tenths: number, source: number) => void }
    const gain = spy.gainMana.bind(sim)
    let restored = 0
    spy.gainMana = (tenths, source) => {
      if (source === improvedRow) {
        expect(tenths).toBe(870)
        restored++
      }
      gain(tenths, source)
    }
    // Expected: hits that cost health with at least one of your swings since the last such hit (all
    // land) while Seal of Fury was up: a white swing or an extra attack (Reckoning's, the Flurry Axe's),
    // each traced on the main hand.
    const seal = auraOf(plan, 'sealOfFury')
    const active = (sim as unknown as { auraActive: Uint8Array }).auraActive
    let swung = false
    let expected = 0
    sim.trace = (_source, hand) => {
      if (hand === 0 && active[seal]) swung = true
    }
    sim.swingTakenTrace = (o, lost) => {
      if (LANDED.has(o) && lost > 0) {
        if (swung) expected++
        swung = false
      }
    }
    for (let i = 0; i < 20; i++) {
      swung = false
      sim.runFight(i)
    }
    expect(expected).toBeGreaterThan(200)
    expect(restored).toBe(expected)
  })

  it('needs Seal of Fury and a shield', () => {
    expect(protPlan({ rotation: { [ID.seal]: 'righteousness' } }).procs.some((p) => p.id === 'improvedSealOfFury')).toBe(false)
    expect(protPlan({ gear: { mainHand: defaultConfig(PROT).gear.mainHand } }).procs.some((p) => p.id === 'improvedSealOfFury')).toBe(false)
  })
})

describe('Retribution Aura (paladin.md#other-abilities)', () => {
  it('30 Holy to the boss on each of its swings that lands on you, blocked ones too, × 1.9 threat; it never crits', () => {
    // Devotion Aura off: Retribution Aura instead.
    const plan = protPlan({ rotation: MAX_TPS })
    plan.stats.spellCrit = 100
    const sim = new Sim(plan)
    let landed = 0
    sim.swingTakenTrace = (o) => {
      if (LANDED.has(o)) landed++
    }
    let ms = 0
    for (let i = 0; i < 10; i++) {
      sim.runFight(i)
      ms += sim.fightMs
    }
    const hits = field(sim, plan, 'retributionAuraDamage', FIELD.hits)
    expect(hits).toBe(landed)
    expect(field(sim, plan, 'retributionAuraDamage', FIELD.crits)).toBe(0)
    expect(field(sim, plan, 'retributionAuraDamage', FIELD.damage) / hits).toBeCloseTo(30, 9)
    // × the Threat gloves' 2% (the default gear's enchant).
    expect(plan.threatMult).toBeCloseTo(1.02, 12)
    expect(field(sim, plan, 'retributionAuraDamage', FIELD.threat) / hits).toBeCloseTo(57 * 1.02, 9)
    // It's up all fight, from its cast before the pull.
    expect(sim.auraUpMs[auraOf(plan, 'retributionAura')]).toBe(ms)
    expect(RETRIBUTION_AURA_DAMAGE).toMatchObject({ spCoefficient: 0, takenScale: 0, cannotCrit: true })
  })
})

describe('threat per ability (paladin.md#threat-paladin-specific; threat.md)', () => {
  it('Holy × 1.9 with Righteous Fury, Holy Strike × 1.25 more, Holy Shield × 1.2 more; white hits × 1; mana 0.5 a point', () => {
    const plan = protPlan({ rotation: { ...MAX_TPS, [ID.consecrationMana]: 0 } })
    const sim = new Sim(plan)
    for (let i = 0; i < 20; i++) sim.runFight(i)
    // Everything also × the Threat gloves' 2% (the default gear's enchant).
    const ratio = (id: string) => field(sim, plan, id, FIELD.threat) / field(sim, plan, id, FIELD.damage) / plan.threatMult
    for (const id of ['sealOfFuryProc', 'judgementOfFury', 'consecration', 'hammerOfWrath', 'retributionAuraDamage']) expect(ratio(id), id).toBeCloseTo(1.9, 12)
    expect(ratio('holyStrike')).toBeCloseTo(1.9 * 1.25, 12)
    expect(ratio('holyShieldProc')).toBeCloseTo(1.9 * 1.2, 12)
    for (const id of ['mainHand', 'reckoning']) expect(ratio(id), id).toBeCloseTo(1, 12)
    // Improved Seal of Fury's 87 mana and Shield Specialization's: 0.5 threat a point of mana gained.
    const restores = field(sim, plan, 'improvedSealOfFury', FIELD.threat) / (0.5 * 87 * plan.threatMult)
    expect(restores).toBeGreaterThan(100)
    expect(field(sim, plan, 'shieldSpecialization', FIELD.threat)).toBeGreaterThan(0)
  })
})

describe('mana over a long fight (paladin.md "Protection: model and rotation", #mana-model)', () => {
  it('10 minutes: the seal, Holy Shield, Judgement and Holy Strike stay up; Consecration goes down at the pull', () => {
    const plan = protPlan({ buffs: defaultConfig(PROT).buffs, fight: { ...defaultConfig(PROT).fight, durationSec: 600, durationVariationPct: 0 } })
    const sim = new Sim(plan)
    const fights = 20
    let low = Infinity
    // The pool's mean by minute, sampled at each power tick (every 2 s).
    const sum = new Float64Array(10)
    const ticks = new Float64Array(10)
    sim.manaTrace = (t) => {
      const mana = sim.resources().mana
      low = Math.min(low, mana)
      const minute = Math.min(9, Math.floor(t / 60000))
      sum[minute] += mana
      ticks[minute]++
    }
    for (let i = 0; i < fights; i++) sim.runFight(i)
    const share = (minute: number) => sum[minute] / ticks[minute] / plan.mana!.maxTenths
    // It holds: from the second minute to the eighth the pool stays around 70% (Consecration takes
    // what's above 90%). Then, in the execute phase from 8 minutes (the last 20%), Hammer of Wrath
    // runs it down: under 10% on average in the last minute.
    for (let minute = 1; minute < 8; minute++) expect(share(minute), `minute ${minute}`).toBeGreaterThan(0.6)
    expect(share(8)).toBeLessThan(0.4)
    expect(share(9)).toBeLessThan(0.1)
    const up = (id: string) => sim.auraUpMs[auraOf(plan, id)] / (fights * 600000)
    expect(up('sealOfFury')).toBeGreaterThan(0.98)
    expect(up('holyShield')).toBeGreaterThan(0.9)
    const perFight = (id: string) => field(sim, plan, id, FIELD.casts) / fights
    // Judgement every 8 s and twice at each of 10 Swift Judgements; Holy Strike every 10 s.
    expect(perFight('judgementOfFury')).toBeGreaterThan(0.97 * (600 / 8 + 10))
    expect(perFight('holyStrike')).toBeGreaterThan(0.97 * 60)
    // Consecration from 90% of maximum mana: at the pull, and seldom after; its cooldown allows 75.
    expect(perFight('consecration')).toBeLessThan(15)
    expect(low).toBeGreaterThanOrEqual(0)
  })
})

describe('Iron Creed’s damage taken (paladin.md#protection-tree)', () => {
  it('5/5: each landed Holy Strike cuts damage taken by 10% for 6 s; none without the talent', () => {
    const plan = protPlan()
    const strike = plan.abilities.find((a) => a.id === 'holyStrike')!
    const aura = auraOf(plan, 'ironCreed')
    expect(strike.aura).toBe(aura)
    expect(plan.auras[aura]).toMatchObject({ durationMs: 6000, damageTaken: -10 })
    // A boss whose swings are all the same size: a normal hit costs one amount, or 90% of it with Iron Creed up.
    plan.fight.bossSwing = { ...plan.fight.bossSwing!, minDamage: 5000, maxDamage: 5000 }
    const sim = new Sim(plan)
    const active = (sim as unknown as { auraActive: Uint8Array }).auraActive
    const hits = new Map<boolean, Set<number>>([
      [true, new Set()],
      [false, new Set()],
    ])
    sim.swingTakenTrace = (o, lost) => {
      if (o === BOSS_OUTCOME.hit) hits.get(active[aura] === 1)!.add(Math.round(lost * 1e6) / 1e6)
    }
    let ms = 0
    for (let i = 0; i < 20; i++) {
      sim.runFight(i)
      ms += sim.fightMs
    }
    const [up] = [...hits.get(true)!]
    const [down] = [...hits.get(false)!]
    expect(hits.get(true)!.size).toBe(1)
    expect(hits.get(false)!.size).toBe(1)
    expect(up / down).toBeCloseTo(0.9, 9)
    // Holy Strike every 10 s, a landed one up for 6 s: under 60% of the fight.
    const uptime = sim.auraUpMs[aura] / ms
    expect(uptime).toBeGreaterThan(0.3)
    expect(uptime).toBeLessThan(0.6)
    const without = protectionRotation({}, new Map([['Improved Holy Strike', 2]]), () => -1, { hasShield: true, maxMana: 2000 })
    expect(without.abilities.find((a) => a.id === 'holyStrike')!.aura).toBeNull()
  })
})

describe('what the fix round’s engine rules do in a Protection fight', () => {
  it('a damage-taken proc that puts up an aura hits use up keeps it: only one up before the hit pays (the block charges’ rule)', () => {
    const plan = protPlan()
    const absorb = auraOf(plan, 'sealOfFuryShield')
    // A proc on each hit that costs health, putting the absorb up again.
    const puts = plan.procs.find((p) => p.id === 'sealOfFuryShield')!
    plan.procs = [...plan.procs, { ...puts, trigger: TRIGGER.damageTaken, requiresAura: -1 }]
    plan.triggers = plan.triggers.map(() => [])
    plan.procs.forEach((p, i) => plan.triggers[p.trigger].push(i))
    const sim = new Sim(plan)
    const active = (sim as unknown as { auraActive: Uint8Array }).auraActive
    let afterHit = false
    let checked = 0
    sim.swingTakenTrace = (o, lost) => {
      // Before this swing: a hit that cost health came last, so its proc's absorb is still up.
      if (afterHit) {
        expect(active[absorb]).toBe(1)
        checked++
      }
      afterHit = LANDED.has(o) && lost > 0
    }
    for (let i = 0; i < 5; i++) {
      afterHit = false
      sim.runFight(i)
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('a spell that can’t crit never does, on the melee and ranged tables too', () => {
    const plan = protPlan()
    plan.stats.crit = 100
    const jof = plan.spells!.findIndex((s) => plan.sources[s.source].id === 'judgementOfFury')
    const how = plan.spells!.findIndex((s) => plan.sources[s.source].id === 'hammerOfWrath')
    const run = () => {
      const sim = new Sim(plan)
      for (let i = 0; i < 20; i++) sim.runFight(i)
      return [field(sim, plan, 'judgementOfFury', FIELD.crits), field(sim, plan, 'hammerOfWrath', FIELD.crits)]
    }
    expect(Math.min(...run())).toBeGreaterThan(20)
    plan.spells![jof] = { ...plan.spells![jof], cannotCrit: true }
    plan.spells![how] = { ...plan.spells![how], cannotCrit: true }
    expect(run()).toEqual([0, 0])
  })

  it('with no main hand, Judgement of Fury and Hammer of Wrath still roll their tables, unarmed', () => {
    const plan = protPlan({ gear: { offHand: defaultConfig(PROT).gear.offHand } })
    // Mana to spare: without a weapon there's no Seal of Fury absorb, so no Improved Seal of Fury mana.
    plan.mana = { ...plan.mana!, maxTenths: 1e9 }
    const sim = new Sim(plan)
    for (let i = 0; i < 50; i++) sim.runFight(i)
    for (const id of ['judgementOfFury', 'hammerOfWrath']) {
      expect(field(sim, plan, id, FIELD.hits), id).toBeGreaterThan(50)
      expect(field(sim, plan, id, FIELD.crits), id).toBeGreaterThan(0)
      expect(field(sim, plan, id, FIELD.misses), id).toBeGreaterThan(0)
    }
    // No weapon, no Holy Strike.
    expect(plan.sources.some((s) => s.id === 'holyStrike') ? field(sim, plan, 'holyStrike', FIELD.casts) : 0).toBe(0)
  })

  it('Holy Shield is the first global cooldown at the pull, after Righteous Fury, the aura and the seal before it (D26)', () => {
    const plan = protPlan()
    const sim = new Sim(plan)
    const first: string[] = []
    sim.castTrace = (a, t) => {
      if (t >= 0 && plan.abilities[a].gcdMs > 0 && first.length < 2) first.push(`${plan.abilities[a].id}@${t}`)
    }
    sim.runFight(0)
    expect(first).toEqual(['holyShield@0', 'holyStrike@1500'])
  })

  it('Hammer of Wrath’s cast has its own note, not Slam’s; Retribution’s instant one has none', () => {
    const notes = (spec: 'paladin-protection' | 'paladin-retribution' | 'warrior-arms') => buildPlan(defaultConfig(spec)).assumptions.map((a) => a.id)
    expect(notes('paladin-protection')).toContain('hammerOfWrathCast')
    expect(notes('paladin-protection')).not.toContain('slamCast')
    expect(notes('paladin-retribution')).not.toContain('hammerOfWrathCast')
    expect(notes('paladin-retribution')).not.toContain('slamCast')
    expect(notes('warrior-arms')).toContain('slamCast')
  })
})

describe('the results’ rows (docs/ux.md#results)', () => {
  it('Holy Shield’s damage counts blocks and shows no crit or avoided; Reckoning counts extra attacks; the mana rows their mana; Swift Judgement no uptime', () => {
    const bundle = buildPlan(defaultConfig(PROT))
    const result = toResult(bundle, runFights(bundle.plan, 200), 0)
    const row = (id: string) => result.abilities.find((a) => a.id === id)!
    expect(row('holyShieldProc')).toMatchObject({ certain: true, counts: 'blocks' })
    expect(row('holyShieldProc').casts).toBe(row('holyShieldProc').hits)
    expect(row('reckoning')).toMatchObject({ counts: 'extraAttacks' })
    expect(row('reckoning').certain).toBeUndefined()
    for (const id of ['improvedSealOfFury', 'shieldSpecialization']) {
      // 0.5 threat a mana (threat.md).
      expect(row(id).mana! * 0.5, id).toBeCloseTo(row(id).threat, 6)
      expect(row(id).damage).toBe(0)
    }
    expect(row('mainHand').mana).toBeUndefined()
    const cd = (id: string) => result.cooldowns.find((c) => c.id === id)!
    expect(cd('swiftJudgement').uptimePct).toBeNull()
    expect(cd('swiftJudgement').castsPerFight).toBeGreaterThan(3)
    expect(cd('righteousFury')).toMatchObject({ uptimePct: 100, castsPerFight: 1 })
    expect(cd('ironCreed').uptimePct).toBeGreaterThan(30)
    // Max TPS: Retribution Aura's damage always lands and never crits.
    const max = buildPlan({ ...defaultConfig(PROT), rotation: MAX_TPS })
    expect(max.plan.sources.find((s) => s.id === 'retributionAuraDamage')).toMatchObject({ certain: true })
  })

  it('the boss’s table with Holy Shield up: 20% more block, from the same sheet', () => {
    const { sheet } = buildPlan(defaultConfig(PROT))
    expect(sheet.bossTableUp).toMatchObject({ name: 'Holy Shield', auraId: 'holyShield', blockPct: 20 })
    const [start, up] = [sheet.bossTable!, sheet.bossTableUp!.table]
    expect(up.block - start.block).toBeCloseTo(20, 9)
    expect(up.miss).toBe(start.miss)
    // The 20 points come off the bottom of the table: normal hits (and crushing blows past them).
    expect(start.hit + start.crush - (up.hit + up.crush)).toBeCloseTo(20, 9)
    expect(buildPlan({ ...defaultConfig(PROT), rotation: { [ID.holyShield]: false } }).sheet.bossTableUp).toBeUndefined()
    expect(buildPlan({ ...defaultConfig(PROT), gear: { mainHand: defaultConfig(PROT).gear.mainHand } }).sheet.bossTableUp).toBeUndefined()
    expect(buildPlan(defaultConfig('warrior-arms')).sheet.bossTableUp).toBeUndefined()
  })
})

describe('what Holy Shield and Swift Judgement need (docs/ux.md "Rotation")', () => {
  it('Holy Shield its talent and a shield, Swift Judgement its talent (main’s `requires`); Exorcism its target', () => {
    const d = defaultConfig(PROT)
    const option = (id: string) => PROTECTION_OPTIONS.find((o) => o.id === id)
    expect(option(ID.holyShield)).toMatchObject({ requires: { talent: 'Holy Shield', shield: true } })
    expect(option(ID.swiftJudgement)).toMatchObject({ requires: { talent: 'Swift Judgement' } })
    const holyShield = { talent: 'Holy Shield', shield: true }
    expect(unmetRequirements(d, holyShield)).toEqual({})
    expect(unmetRequirements({ ...d, gear: { mainHand: d.gear.mainHand } }, holyShield)).toEqual({ shield: true })
    expect(unmetRequirements({ ...d, talents: '', gear: { mainHand: d.gear.mainHand } }, holyShield)).toEqual({ talent: 'Holy Shield', shield: true })
    expect(unmetRequirements({ ...d, talents: '' }, { talent: 'Swift Judgement' })).toEqual({ talent: 'Swift Judgement' })
    // Nothing else is unused in the default setup; Exorcism's target is its option's.
    expect(unusedRotationSettings(d)).toEqual({})
    expect(option(ID.exorcism)).toMatchObject({ needsCreatureType: ['undead', 'demon'] })
  })
})

describe('determinism', () => {
  it('the same config and seed give the same fights, with either priority; another seed doesn’t', () => {
    for (const rotation of [{}, MAX_TPS]) {
      const plan = buildPlan({ ...defaultConfig(PROT), rotation }).plan
      const a = runChunk(plan, 0, 50)
      const b = runChunk(plan, 0, 50)
      expect(Array.from(b.counters)).toEqual(Array.from(a.counters))
      expect(b.tps).toEqual(a.tps)
      expect(b.damageTaken).toEqual(a.damageTaken)
      expect(runChunk({ ...plan, seed: plan.seed + 1 }, 0, 50).tps.mean).not.toBe(a.tps.mean)
    }
  })
})

describe('HOLY_SHIELD', () => {
  it('is the client’s r3: 240 mana, 10 s, on the GCD', () => {
    expect(HOLY_SHIELD).toMatchObject({ id: 'holyShield', kind: 'cast', costTenths: 2400, cooldownMs: 10000, gcdMs: 1500, resource: 'mana' })
  })
})
