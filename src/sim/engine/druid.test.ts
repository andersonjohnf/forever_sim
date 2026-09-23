// The druid's engine hooks against docs/classes/druid.md §2: the form weapons' swings and damage
// (§2.1, W2, W13), the power tick's Energy (§2.4, W11), combo points (§2.5), Clearcasting (§2.7),
// shapeshifts with Furor, mana and the five-second rule (§2.8, W9), bear rage
// (rage.md#bear-druid-rage), form-bound procs, and determinism. The abilities here are test rows,
// named `test…`: the cat and bear abilities come with their rotations. Base values are those in
// src/sim/stats/base-stats.ts (D24 placeholders among them); the examples set their own attack power.
import { describe, expect, it } from 'vitest'
import { NO_STRIKE, shapeshift, spiritRegenTickTenths } from '../classes/druid/abilities'
import { FORM_INDEX, formBit } from '../classes/druid/forms'
import { type TalentRanks, withDruidTalents } from '../classes/druid/modifiers'
import { defaultConfig } from '../defaults'
import { buildPlan } from '../plan/build'
import { ACTION, type AbilityDef, COND, NO_PREPULL, type Plan, POWER_TICK_MS, STANCE_ANY, TRIGGER, TRIGGER_COUNT } from '../plan/types'
import { simulate } from '../index'
import type { GearSlot, RuleProfileId, SimConfig, SpecId } from '../types'
import { runChunk } from './chunk'
import { FIELD, SOURCE_MAIN_HAND, Sim } from './sim'
import { addAura, addProc, at, counter, damages, expectMean, from, line, setAttackPower, timeline } from './test-helpers'

/**
 * A druid plan of `spec` (it fights in its form) with no buffs, abilities, procs, armor or damage
 * multipliers, and a fight of exactly `durationMs`. `talents` replaces the build.
 */
function druidPlan(spec: SpecId, durationMs: number, options: { talents?: string; profile?: RuleProfileId; head?: number; keepProcs?: boolean } = {}): Plan {
  const d = defaultConfig(spec)
  const gear: SimConfig['gear'] = options.head ? { ...d.gear, head: { itemId: options.head } as { itemId: number } } : d.gear
  const plan = buildPlan({
    ...d,
    talents: options.talents ?? d.talents,
    gear: gear as Partial<Record<GearSlot, { itemId: number }>>,
    rules: { ...d.rules, profile: options.profile ?? d.rules.profile },
    buffs: { raid: d.buffs.raid, enabled: [] },
    fight: { ...d.fight, durationVariationPct: 0 },
  }).plan
  plan.abilities = []
  plan.rotation = []
  plan.prepull = NO_PREPULL
  if (!options.keepProcs) {
    plan.procs = []
    plan.triggers = Array.from({ length: TRIGGER_COUNT }, () => [])
  }
  plan.fight.targetArmor = 0
  plan.fight.durationMs = durationMs
  plan.damageMult = 1
  plan.physicalMult = 1
  return plan
}

/** A test row: an instant attack or cast with the given druid fields (not a real ability). */
function testRow(id: string, fields: Partial<AbilityDef>): AbilityDef {
  return { id, name: id, icon: 'x', kind: 'weaponStrike', ...NO_STRIKE, costTenths: 0, cooldownMs: 0, gcdMs: 0, stances: STANCE_ANY, ...fields }
}

/** Adds an ability as the plan builder does, with the druid's talent modifiers. */
function addDruidAbility(plan: Plan, def: AbilityDef, talents: TalentRanks = new Map()): number {
  const { offHand: _, aura, vsCreature: __, window: ___, ...a } = withDruidTalents(def, talents)
  plan.sources.push({ id: a.id, name: a.name, icon: a.icon })
  plan.abilities.push({ ...a, source: plan.sources.length - 1, offHandSource: -1, aura: aura ? addAura(plan, aura) : -1, window: -1 })
  return plan.abilities.length - 1
}

/** In every form, nothing avoids white swings or specials; no crits; no glancing (the target is a level below). */
function landAll(plan: Plan, crit = -100): void {
  for (const form of plan.forms!) {
    form.stats.hit = 100
    form.stats.crit = crit
  }
  plan.fight.bossCanDodge = false
  plan.fight.targetLevel = 59
}

describe('form attacks (druid.md §2.1)', () => {
  it('cat swings every 1.0 s and bear every 2.5 s, whatever the equipped weapon', () => {
    expect(timeline(druidPlan('druid-feral-cat', 5000)).swings[0]).toEqual([0, 1000, 2000, 3000, 4000])
    expect(timeline(druidPlan('druid-feral-bear', 6000)).swings[0]).toEqual([0, 2500, 5000])
  })

  it('W2: a cat white swing at 1200 AP is 129.554–151.474, 140.514 on average; a crit 2.0× (no Predatory Instincts)', () => {
    const plan = druidPlan('druid-feral-cat', 60000)
    landAll(plan)
    setAttackPower(plan, 1200)
    const hits = damages(plan, SOURCE_MAIN_HAND, 40)
    expect(Math.min(...hits)).toBeGreaterThanOrEqual(43.84 + 1200 / 14 - 1e-9)
    expect(Math.max(...hits)).toBeLessThanOrEqual(65.76 + 1200 / 14 + 1e-9)
    expectMean(hits, 140.514)
    landAll(plan, 200)
    expectMean(damages(plan, SOURCE_MAIN_HAND, 40), 281.029)
  })

  it('W13: a dire bear white swing at 1200 AP is 323.886–378.686, 351.286 on average', () => {
    const plan = druidPlan('druid-feral-bear', 60000)
    landAll(plan)
    setAttackPower(plan, 1200)
    const hits = damages(plan, SOURCE_MAIN_HAND, 100)
    expect(Math.min(...hits)).toBeGreaterThanOrEqual(109.6 + (1200 * 2.5) / 14 - 1e-9)
    expect(Math.max(...hits)).toBeLessThanOrEqual(164.4 + (1200 * 2.5) / 14 + 1e-9)
    expectMean(hits, 351.286)
  })
})

describe('Energy (druid.md §2.4)', () => {
  it('ticks 20 every 2 s from a random phase in [0, 2 s), full at the pull, capped at 100', () => {
    const phases = new Set<number>()
    for (let fight = 0; fight < 20; fight++) {
      const plan = druidPlan('druid-feral-cat', 20000)
      // A test cast that spends 40 Energy whenever it can, with no GCD.
      const spend = addDruidAbility(plan, testRow('testSpend', { kind: 'cast', resource: 'energy', costTenths: 400 }))
      line(plan, spend)
      const { uses, rageAtUse } = timeline(plan, fight)
      // 100 at the pull → 60; each tick is a decision point: 80 → 40, 60 → 20, 40 → 0, then every other tick.
      const phase = uses[spend][1]
      expect(phase).toBeGreaterThanOrEqual(0)
      expect(phase).toBeLessThan(POWER_TICK_MS)
      expect(uses[spend]).toEqual([0, phase, phase + 2000, phase + 4000, ...[8000, 12000, 16000].map((t) => phase + t).filter((t) => t < 20000)])
      expect(rageAtUse[spend].slice(0, 5)).toEqual([1000, 800, 600, 400, 400])
      phases.add(phase)
      // The same fight draws the same phase (determinism).
      expect(timeline(plan, fight).uses[spend]).toEqual(uses[spend])
    }
    expect(phases.size).toBeGreaterThan(10)
  })

  it('W11 (regeneration part): 15 ticks and 300 Energy in 30 s, none lost when it’s spent; at the cap every tick is lost', () => {
    const plan = druidPlan('druid-feral-cat', 30000)
    const spend = addDruidAbility(plan, testRow('testSpend', { kind: 'cast', resource: 'energy', costTenths: 200 }))
    line(plan, spend)
    const sim = new Sim(plan)
    sim.runFight(0)
    expect(sim.totalEnergyGainedTenths).toBe(3000)
    expect(sim.totalEnergyWastedTenths).toBe(0)
    const idle = new Sim(druidPlan('druid-feral-cat', 30000))
    idle.runFight(0)
    expect(idle.totalEnergyGainedTenths).toBe(0)
    expect(idle.totalEnergyWastedTenths).toBe(3000)
  })

  it('the Energy totals count only Cat Form’s Energy, and each chunk counts its own', () => {
    // A bear's tick brings no Energy it can use: nothing gained or lost.
    const bear = new Sim(druidPlan('druid-feral-bear', 30000))
    bear.runFight(0)
    expect([bear.totalEnergyGainedTenths, bear.totalEnergyWastedTenths]).toEqual([0, 0])
    // An idle cat at the cap shifts to bear at 10 s: the 5 ticks before it are lost (fight 0's
    // phase isn't 0, so none falls at 10 s), and the 10 in bear aren't counted.
    const shifted = druidPlan('druid-feral-cat', 30000)
    line(shifted, addDruidAbility(shifted, shapeshift('bear', 0)), at(shifted, 10000))
    const sim = new Sim(shifted)
    sim.runFight(0)
    expect(sim.resources().form).toBe(FORM_INDEX.bear)
    expect([sim.totalEnergyGainedTenths, sim.totalEnergyWastedTenths]).toEqual([0, 1000])
    // A worker's Sim runs chunk after chunk: each chunk's totals are its own, 15 lost ticks a fight.
    const plan = druidPlan('druid-feral-cat', 30000)
    const reused = new Sim(plan)
    runChunk(plan, 0, 3, reused)
    runChunk(plan, 1, 3, reused)
    expect([reused.totalEnergyGainedTenths, reused.totalEnergyWastedTenths]).toEqual([0, 3 * 3000])
  })

  it('a builder that’s avoided refunds 80% of its Energy; a finisher refunds nothing and keeps its combo points', () => {
    const plan = druidPlan('druid-feral-cat', 1000)
    landAll(plan)
    // Every avoidable attack is dodged (expertise far below zero); the test builder can't be.
    plan.fight.bossCanDodge = true
    plan.stats.expertise = -1000
    const builder = addDruidAbility(plan, testRow('testBuilder', { resource: 'energy', costTenths: 300, refundShare: 0.8, comboPoints: 1, unavoidable: true }))
    const finisher = addDruidAbility(plan, testRow('testFinisher', { resource: 'energy', costTenths: 350, finisher: true, damagePerComboPoint: 100 }))
    line(plan, finisher, [{ code: COND.minComboPoints, a: 2, b: 0 }])
    line(plan, builder)
    const { sim, uses, rageAtUse } = timeline(plan)
    // 100 → builder (70, 1 CP) → builder (40, 2 CP) → finisher dodged: 35 spent, nothing back, CP kept.
    expect(uses[builder]).toEqual([0, 0])
    expect(rageAtUse[builder]).toEqual([1000, 700])
    expect(uses[finisher]).toEqual([0])
    expect(rageAtUse[finisher]).toEqual([400])
    expect(counter(sim, plan.abilities[finisher].source, FIELD.dodges)).toBe(1)
    expect(counter(sim, plan.abilities[finisher].source, FIELD.damage)).toBe(0)
    expect(sim.resources().comboPoints).toBe(2)
    expect(sim.resources().energy).toBeLessThanOrEqual(50 + 200)
    // An avoided builder: 80% back.
    const refund = druidPlan('druid-feral-cat', 1000)
    refund.fight.bossCanDodge = true
    refund.stats.hit = 100
    refund.stats.expertise = -1000
    const avoided = addDruidAbility(refund, testRow('testBuilder', { resource: 'energy', costTenths: 400, refundShare: 0.8, comboPoints: 1 }))
    line(refund, avoided)
    const r = timeline(refund)
    // Each dodged use costs 8 Energy net: 100, 92, 84, … while at least 40 is left.
    expect(r.rageAtUse[avoided]).toEqual([1000, 920, 840, 760, 680, 600, 520, 440])
    expect(r.sim.resources().comboPoints).toBe(0)
  })
})

describe('combo points (druid.md §2.5)', () => {
  function builderAndFinisher(critChance: number, crit: number) {
    const plan = druidPlan('druid-feral-cat', 20000)
    landAll(plan, crit)
    const builder = addDruidAbility(plan, testRow('testBuilder', { resource: 'energy', costTenths: 100, comboPoints: 1, critComboPointChance: critChance, gcdMs: 1000 }))
    const finisher = addDruidAbility(plan, testRow('testFinisher', { resource: 'energy', costTenths: 100, finisher: true, damagePerComboPoint: 100, gcdMs: 1000 }))
    line(plan, finisher, [{ code: COND.minComboPoints, a: 5, b: 0 }])
    line(plan, builder)
    return { plan, builder, finisher }
  }

  it('a builder adds one; a finisher at 5 spends them all for its damage per point', () => {
    const { plan, builder, finisher } = builderAndFinisher(0, -100)
    const { uses } = timeline(plan)
    // Five builders, then the finisher, one a second.
    expect(uses[builder].slice(0, 6)).toEqual([0, 1000, 2000, 3000, 4000, 6000])
    expect(uses[finisher][0]).toBe(5000)
    expect(new Set(damages(plan, plan.abilities[finisher].source, 1))).toEqual(new Set([500]))
  })

  it('Primal Fury: a builder’s crit adds one more, up to 5 (three critting builders make 5, not 6)', () => {
    const { plan, builder, finisher } = builderAndFinisher(1, 200)
    const { uses } = timeline(plan)
    expect(uses[builder].slice(0, 4)).toEqual([0, 1000, 2000, 4000])
    expect(uses[finisher][0]).toBe(3000)
    // The finisher crits too (×2): 5 points, 1000.
    expect(new Set(damages(plan, plan.abilities[finisher].source, 1))).toEqual(new Set([1000]))
  })

  it('a finisher can’t be used without a combo point', () => {
    const plan = druidPlan('druid-feral-cat', 5000)
    landAll(plan)
    const finisher = addDruidAbility(plan, testRow('testFinisher', { resource: 'energy', costTenths: 100, finisher: true, damagePerComboPoint: 100 }))
    line(plan, finisher)
    expect(timeline(plan).uses[finisher]).toEqual([])
  })
})

describe('Clearcasting (druid.md §2.7)', () => {
  it('pays the next ability with a cost and is used up; a free ability leaves it', () => {
    const plan = druidPlan('druid-feral-cat', 3000, { keepProcs: true })
    landAll(plan)
    const clearcasting = plan.freeCastAura!
    expect(plan.auras[clearcasting].id).toBe('clearcasting')
    // Omen of Clarity procs on the first landed swing (a test chance of 100%).
    const ooc = plan.procs.find((p) => p.id === 'omenOfClarity')!
    ooc.chance = [1, 1]
    const free = addDruidAbility(plan, testRow('testFree', { kind: 'cast', resource: 'energy', costTenths: 0, clearcastable: true }))
    const builder = addDruidAbility(plan, testRow('testBuilder', { resource: 'energy', costTenths: 400, clearcastable: true, gcdMs: 1000 }))
    line(plan, free, at(plan, 400))
    line(plan, builder, [from(plan, 500)])
    const { sim, uses, rageAtUse } = timeline(plan)
    expect(uses[free]).toEqual([400])
    expect(uses[builder].slice(0, 2)).toEqual([500, 1500])
    // At 500 Clearcasting pays, so 100 Energy is still there at 1500 (ticks can't raise it past 100).
    expect(rageAtUse[builder][0]).toBe(1000)
    expect(rageAtUse[builder][1]).toBe(1000)
    // Up from the swing at 0 until the builder at 500; Omen of Clarity then waits 10 s.
    expect(sim.auraUpMs[clearcasting]).toBe(500)
  })

  it('survives a shapeshift, which pays its mana, and then pays a bear ability', () => {
    const plan = druidPlan('druid-feral-cat', 3000, { keepProcs: true })
    landAll(plan)
    const clearcasting = plan.freeCastAura!
    plan.procs.find((p) => p.id === 'omenOfClarity')!.chance = [1, 1]
    const shift = addDruidAbility(plan, shapeshift('bear', 0))
    // 50 rage: more than the bear has at 2 s (Furor's 10 and a swing's 8.65), so only Clearcasting pays it.
    const bearAttack = addDruidAbility(plan, testRow('testBearAttack', { resource: 'rage', costTenths: 500, clearcastable: true, forms: formBit('bear'), gcdMs: 1000 }))
    line(plan, shift, at(plan, 400))
    line(plan, bearAttack, [from(plan, 2000)])
    const mana0 = new Sim(plan).inspect().mana
    const { sim, uses } = timeline(plan)
    expect(uses[shift]).toEqual([400])
    expect(sim.resources().form).toBe(FORM_INDEX.bear)
    // The shift paid its 684 mana (druid.md §2.7: a shapeshift doesn't use Clearcasting) …
    expect(mana0 - sim.resources().mana).toBe(6840)
    // … so the charge from the swing at 0 was still there for the bear attack at 2 s.
    expect(uses[bearAttack]).toEqual([2000])
    expect(sim.resources().rage).toBeLessThan(500)
    expect(sim.auraUpMs[clearcasting]).toBe(2000)
  })
})

describe('shapeshifts, Furor and mana (druid.md §2.8)', () => {
  it('a powershift costs 684 mana and a 1.5 s GCD, and Furor 5/5 keeps the Energy: it gains nothing', () => {
    const plan = druidPlan('druid-feral-cat', 4000)
    landAll(plan)
    const spend = addDruidAbility(plan, testRow('testSpend', { kind: 'cast', resource: 'energy', costTenths: 630 }))
    const shift = addDruidAbility(plan, shapeshift('cat', 0))
    const gcd = addDruidAbility(plan, testRow('testGcd', { kind: 'cast', gcdMs: 1000 }))
    line(plan, spend, at(plan, 0))
    line(plan, shift, at(plan, 100))
    line(plan, gcd, [from(plan, 100)])
    const mana0 = new Sim(plan).inspect().mana
    const { sim, uses } = timeline(plan)
    expect(uses[shift]).toEqual([100])
    // The shapeshift's GCD holds the next GCD ability until 1.6 s.
    expect(uses[gcd][0]).toBe(1600)
    const probe = new Sim(plan)
    let energyAfter = -1
    probe.castTrace = (a) => {
      if (a === gcd && energyAfter < 0) energyAfter = probe.resources().energy
    }
    probe.runFight(0)
    // 37 Energy left before the shift, 37 after it (plus any ticks by 1.6 s, at most +20 each).
    const ticks = Math.floor((1600 + POWER_TICK_MS) / POWER_TICK_MS)
    expect(energyAfter).toBeGreaterThanOrEqual(370)
    expect(energyAfter).toBeLessThanOrEqual(370 + 200 * ticks)
    expect(sim.resources().form).toBe(FORM_INDEX.cat)
    // 684 mana; no spirit regeneration for 5 s after it.
    expect(mana0 - sim.resources().mana).toBe(6840)
    expect(counter(sim, plan.abilities[shift].source, FIELD.casts)).toBe(1)
  })

  it('W9: without Furor, entering cat sets Energy to 0; Wolfshead Helm adds nothing', () => {
    const energyAfterShift = (talents?: string, head?: number) => {
      const plan = druidPlan('druid-feral-cat', 1000, { talents, head })
      const shift = addDruidAbility(plan, shapeshift('cat', 0))
      line(plan, shift, at(plan, 0))
      const sim = new Sim(plan)
      let energy = -1
      sim.castTrace = () => undefined
      sim.runFight(0)
      energy = sim.resources().energy
      return { energy, plan }
    }
    const noFuror = '050022-5520002123032213051-'
    // Nothing but the pull's full bar was left: Furor 5/5 keeps 100, none gives 0 (and the ticks before 1 s).
    expect(energyAfterShift().energy).toBeGreaterThanOrEqual(1000)
    const none = energyAfterShift(noFuror).energy
    expect(none).toBeLessThanOrEqual(200)
    expect(energyAfterShift(noFuror, 8345).energy).toBe(none)
  })

  it('the five-second rule: spirit regeneration, 15 + Spirit / 5 a tick, stops for 5 s after mana is spent', () => {
    const shifted = (durationMs: number) => {
      const plan = druidPlan('druid-feral-cat', durationMs)
      line(plan, addDruidAbility(plan, shapeshift('cat', 0)), at(plan, 0))
      const sim = new Sim(plan)
      sim.runFight(0)
      return { plan, sim }
    }
    const { plan, sim } = shifted(4999)
    expect(plan.mana!.regenTickTenths).toBe(spiritRegenTickTenths(plan.stats.baseSpi + plan.stats.spi))
    // Nothing back within 5 s of spending 684 mana.
    expect(sim.resources().mana).toBe(plan.mana!.maxTenths - 6840)
    // By 20 s, the ticks at 5 s or later (7 or 8 of them, by the tick's phase) have restored some.
    const later = shifted(20000)
    const ticks = (later.sim.resources().mana - (plan.mana!.maxTenths - 6840)) / plan.mana!.regenTickTenths
    expect([7, 8]).toContain(ticks)
  })

  it('a shift the mana can’t pay for isn’t used: the druid stays in its form', () => {
    const plan = druidPlan('druid-feral-cat', 5000)
    // Mana for one 684-mana shift and 683 more, and no spirit regeneration.
    plan.mana!.maxTenths = 6840 + 6830
    plan.mana!.regenTickTenths = 0
    const toBear = addDruidAbility(plan, shapeshift('bear', 0))
    const toCat = addDruidAbility(plan, shapeshift('cat', 0))
    line(plan, toBear, at(plan, 1000))
    line(plan, toCat, [from(plan, 3000)])
    const { sim, uses } = timeline(plan)
    expect(uses[toBear]).toEqual([1000])
    expect(uses[toCat]).toEqual([])
    expect(counter(sim, plan.abilities[toCat].source, FIELD.casts)).toBe(0)
    expect(sim.resources().form).toBe(FORM_INDEX.bear)
    expect(sim.resources().mana).toBe(6830)
  })

  it('the power tick keeps its phase through a shapeshift: a powershift, and bear and back (druid.md §2.4)', () => {
    /** A cat that spends 40 Energy on every tick that brings it to 40, as in the first Energy test. */
    const spender = () => {
      const plan = druidPlan('druid-feral-cat', 20000)
      const spend = addDruidAbility(plan, testRow('testSpend', { kind: 'cast', resource: 'energy', costTenths: 400, forms: formBit('cat') }))
      line(plan, spend)
      return { plan, spend }
    }
    const alone = spender()
    const phase = timeline(alone.plan).uses[alone.spend][1]
    // Halfway between ticks, with 0 Energy (100 → 60 at the pull; 80 → 40, 60 → 20, 40 → 0 on the ticks).
    const powershift = spender()
    const shift = addDruidAbility(powershift.plan, shapeshift('cat', 0))
    line(powershift.plan, shift, at(powershift.plan, phase + 5000))
    const p = timeline(powershift.plan)
    expect(p.uses[shift]).toEqual([phase + 5000])
    // Furor 5/5 keeps the 0 Energy; the spends stay on the pull's ticks, every other one from 8 s on.
    // A timer restarted by the shift would tick at phase + 7 s, 9 s, … instead.
    expect(p.uses[powershift.spend]).toEqual(timeline(alone.plan).uses[alone.spend])
    // Into bear and back: the spends after it are still on the pull's ticks.
    const bearAndBack = spender()
    const toBear = addDruidAbility(bearAndBack.plan, shapeshift('bear', 0))
    const toCat = addDruidAbility(bearAndBack.plan, shapeshift('cat', 0))
    line(bearAndBack.plan, toBear, at(bearAndBack.plan, phase + 5000))
    line(bearAndBack.plan, toCat, at(bearAndBack.plan, phase + 9000))
    const b = timeline(bearAndBack.plan)
    expect([b.uses[toBear], b.uses[toCat]]).toEqual([[phase + 5000], [phase + 9000]])
    const after = b.uses[bearAndBack.spend].filter((t) => t > phase + 9000)
    expect(after.length).toBeGreaterThan(0)
    for (const t of after) expect((t - phase) % POWER_TICK_MS).toBe(0)
  })

  it('cat into bear: rage to 0 then Furor’s 10, the bear’s swing and attack power, and bear-only procs', () => {
    const plan = druidPlan('druid-feral-cat', 8000)
    landAll(plan, 200)
    const shift = addDruidAbility(plan, shapeshift('bear', 0))
    line(plan, shift, at(plan, 2500))
    // Primal Fury's rage, bound to bear (as the plan builder keeps it once a shapeshift can reach bear).
    const source = plan.sources.push({ id: 'primalFury', name: 'Primal Fury', icon: 'x' }) - 1
    addProc(plan, { id: 'primalFury', trigger: TRIGGER.meleeCrit, chance: [1, 1], hands: 1, action: ACTION.rage, amount: 50, b: 0, source, forms: formBit('bear') })
    const catAp = new Sim(plan).inspect().attackPower
    const { sim, swings } = timeline(plan)
    // Cat swings at 0, 1, 2; the shift at 2.5 s; the 3 s swing is the first with the bear's speed.
    expect(swings[0]).toEqual([0, 1000, 2000, 3000, 5500])
    expect(sim.resources().form).toBe(FORM_INDEX.bear)
    // Rage: 0 at the shift, +10 Furor, then 5 per crit in bear (2 swings × (Primal Fury 5 + 8.65 white)).
    expect(sim.resources().rage).toBe(100 + 2 * 50 + Math.floor(2 * 86.5))
    // In bear the Agility stops adding attack power and Dire Bear Form's adds 180 − 120.
    const bearForm = plan.forms![FORM_INDEX.bear].stats
    expect(bearForm.apPerAgi).toBe(0)
    expect(catAp).toBeGreaterThan(0)
    // The next fight starts in cat again.
    sim.runFight(1)
    expect(sim.resources().form).toBe(FORM_INDEX.bear)
    expect(new Sim(plan).inspect().form).toBe(FORM_INDEX.cat)
  })
})

describe('bear rage (rage.md#bear-druid-rage)', () => {
  it('Forever: 8.65 rage per landed bear swing, whatever it hits for; Classic Era: from its damage', () => {
    const plan = druidPlan('druid-feral-bear', 10000)
    landAll(plan)
    plan.fight.bossSwing = null
    const sim = new Sim(plan)
    sim.runFight(0)
    // Swings at 0, 2.5, 5, 7.5: 4 × 86.5 tenths, the fractions carried (rage.md#rounding).
    expect(sim.totalRageGainedTenths).toBe(346)
    // A cat gains none from its swings: its power is Energy.
    const cat = druidPlan('druid-feral-cat', 10000)
    landAll(cat)
    const catSim = new Sim(cat)
    catSim.runFight(0)
    expect(catSim.totalRageGainedTenths).toBe(0)
    const classic = druidPlan('druid-feral-bear', 10000, { profile: 'classicEra' })
    landAll(classic)
    classic.fight.bossSwing = null
    const c = new Sim(classic)
    c.runFight(0)
    expect(c.totalRageGainedTenths).not.toBe(346)
    expect(c.totalRageGainedTenths).toBeGreaterThan(0)
  })

  it('a bear refund that reaches the cap sets the pool to it and drops the fraction, as a warrior’s does (rage.md#rounding, R33)', () => {
    // As R33 (mechanics.test.ts): a test ability refunds 3 × its 1-rage cost, and a second spends
    // the capped pool. Every attack is dodged, so no white rage; the rage is from hits taken of
    // 10 × 21 ÷ 200 = 1.05 rage, at 1 s and 2 s, so each carries 0.05.
    const plan = druidPlan('druid-feral-bear', 2500)
    expect(plan.rage.damageTakenModel).toBe('forever')
    plan.fight.bossSwing = null
    plan.fight.bossCanDodge = true
    plan.stats.hit = 100
    plan.stats.crit = -100
    plan.stats.expertise = -1000
    plan.fight.damageTakenPerHit = 21
    plan.fight.damageTakenIntervalMs = 1000
    plan.rage.maxHealth = 200
    plan.rage.maxTenths = 30
    const bear = formBit('bear')
    const refunds = addDruidAbility(plan, testRow('testRefunds', { resource: 'rage', costTenths: 10, refundShare: 3, forms: bear }))
    const spends = addDruidAbility(plan, testRow('testSpends', { resource: 'rage', costTenths: 30, forms: bear }))
    line(plan, refunds, at(plan, 1500))
    line(plan, spends, at(plan, 1500))
    const { sim, uses, rageAtUse } = timeline(plan)
    expect(counter(sim, plan.abilities[refunds].source, FIELD.dodges)).toBe(1)
    // 1.0 at 1 s; at 1.5 s 1.0 − 1 + 3 reaches the cap of 3, then all 3 is spent.
    expect([uses[refunds], rageAtUse[refunds], uses[spends], rageAtUse[spends]]).toEqual([[1500], [10], [1500], [30]])
    // The hit at 2 s gives 1.0 (its 1.05, with nothing carried). Had the fraction stayed, 1.1.
    expect(sim.totalRageGainedTenths).toBe(10 + 10)
    expect(sim.resources().rage).toBe(10)
  })
})

describe('determinism and the default druids', () => {
  const fixed = (config: SimConfig): SimConfig => ({ ...config, run: { ...config.run, mode: 'fixed', iterations: 250 } })

  it('the same config and seed give the same result, for cat and bear', async () => {
    for (const spec of ['druid-feral-cat', 'druid-feral-bear'] as const) {
      const a = await simulate(fixed(defaultConfig(spec)))
      const b = await simulate(fixed(defaultConfig(spec)))
      expect(a.dps).toEqual(b.dps)
      expect(a.tps).toEqual(b.tps)
      expect(a.dps.mean).toBeGreaterThan(0)
      // White swings only until the rotations arrive; Clearcasting shows among the buffs.
      expect(a.assumptions.map((x) => x.id)).toContain('whiteSwingsOnly')
      expect(a.cooldowns.map((x) => x.id)).toContain('clearcasting')
    }
  })

  it('a plan with a shapeshift is bit-identical run to run (forms restored between fights)', () => {
    const plan = druidPlan('druid-feral-cat', 60000, { keepProcs: true })
    const shift = addDruidAbility(plan, shapeshift('bear', 0))
    line(plan, shift, at(plan, 30000))
    const run = () => {
      const sim = new Sim(plan)
      const out: number[] = []
      for (let i = 0; i < 20; i++) {
        sim.runFight(i)
        out.push(sim.fightDamage, sim.fightThreat)
      }
      return out
    }
    expect(run()).toEqual(run())
  })

  it('a reused Sim runs the next fight as a fresh one does, after a fight that ends in another form', () => {
    const plan = druidPlan('druid-feral-cat', 20000, { keepProcs: true })
    const spend = addDruidAbility(plan, testRow('testSpend', { resource: 'energy', costTenths: 400, forms: formBit('cat'), clearcastable: true, gcdMs: 1000 }))
    line(plan, spend)
    line(plan, addDruidAbility(plan, shapeshift('bear', 0)), at(plan, 12000))
    /** Fight 1's damage events and its end state. */
    const fightOne = (sim: Sim) => {
      const events: [number, number][] = []
      sim.damageTrace = (source, damage) => events.push([source, damage])
      sim.runFight(1)
      return { events, damage: sim.fightDamage, threat: sim.fightThreat, ms: sim.fightMs, end: sim.resources() }
    }
    const reused = new Sim(plan)
    reused.runFight(0)
    expect(reused.resources().form).toBe(FORM_INDEX.bear)
    const fresh = fightOne(new Sim(plan))
    expect(fresh.events.length).toBeGreaterThan(10)
    expect(fightOne(reused)).toEqual(fresh)
  })
})
