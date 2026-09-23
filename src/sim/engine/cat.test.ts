// The cat's abilities in the engine against docs/classes/druid.md §3 and its worked examples (§9:
// W3–W8, W11): Shred and Claw, Rake's hit and bleed, Rip by combo points and under Tiger's Fury,
// Ferocious Bite's range and extra Energy, Tiger's Fury's Energy with King of the Jungle and
// Wolfshead Helm, the combo-point flow, Clearcasting on Shred, a powershift's Energy, Berserk's
// crits, Rend and Tear on a bleeding target, Shred from behind only, Faerie Fire's armor, the Manual
// Crowd Pummeler's haste and charges, and determinism. Plans are the default cat's with no buffs,
// procs, armor or damage multipliers, and abilities added one by one, as in druid.test.ts; the
// examples set their own attack power.
import { describe, expect, it } from 'vitest'
import { NO_STRIKE, shapeshift } from '../classes/druid/abilities'
import {
  BERSERK,
  CLAW,
  FAERIE_FIRE_CAT,
  FAERIE_FIRE_ARMOR,
  FEROCIOUS_BITE,
  onUseCast,
  RAKE,
  RIP,
  SHRED,
  tigersFury,
} from '../classes/druid/cat-abilities'
import { type TalentRanks, withDruidTalents } from '../classes/druid/modifiers'
import { talentRanksByName } from '../classes/index'
import { armorReduction } from '../core/formulas'
import { defaultConfig, TALENT_DATA } from '../defaults'
import { ITEM_EFFECTS } from '../effects/items'
import { simulate } from '../index'
import { buildPlan } from '../plan/build'
import { type AbilityDef, COND, NO_PREPULL, type Plan, type RotationCondition, STANCE_ANY, TRIGGER_COUNT } from '../plan/types'
import { FOREVER } from '../rules/profiles'
import type { SimConfig } from '../types'
import { FIELD, SOURCE_MAIN_HAND, Sim } from './sim'
import { addAura, at, counter, damages, expectMean, from, line, setAttackPower, timeline } from './test-helpers'

const CAT_TALENTS = talentRanksByName(TALENT_DATA.druid, defaultConfig('druid-feral-cat').talents)
const NONE: TalentRanks = new Map()

/**
 * The default cat's plan with no buffs, abilities, procs, armor or damage multipliers, a fight of
 * exactly `durationMs`, and a target a level below (no glancing, no crit suppression), where nothing
 * is missed or dodged and nothing crits unless `crit` says so.
 */
function catPlan(durationMs: number, { crit = -100, keepProcs = false }: { crit?: number; keepProcs?: boolean } = {}): Plan {
  const d = defaultConfig('druid-feral-cat')
  const plan = buildPlan({ ...d, buffs: { raid: d.buffs.raid, enabled: [] }, fight: { ...d.fight, durationVariationPct: 0 } }).plan
  plan.abilities = []
  plan.rotation = []
  plan.prepull = NO_PREPULL
  if (!keepProcs) {
    plan.procs = []
    plan.triggers = Array.from({ length: TRIGGER_COUNT }, () => [])
  }
  plan.fight.targetArmor = 0
  plan.fight.durationMs = durationMs
  plan.fight.othersBleed = false
  plan.damageMult = 1
  plan.physicalMult = 1
  for (const form of plan.forms!) {
    form.stats.hit = 100
    form.stats.crit = crit
  }
  plan.fight.bossCanDodge = false
  plan.fight.targetLevel = 59
  return plan
}

/** Adds an ability as the plan builder does: talents, a row (and its bleed's row), its aura, Berserk's crit. */
function add(plan: Plan, def: AbilityDef, talents: TalentRanks = CAT_TALENTS): number {
  const { offHand: _, aura, vsCreature: __, window: ___, auraCrit, ...a } = withDruidTalents(def, talents)
  const source = plan.sources.push({ id: a.id, name: a.name, icon: a.icon }) - 1
  const dotSource = a.kind !== 'bleed' && a.dotTicks > 0 ? plan.sources.push({ id: `${a.id}Bleed`, name: `${a.name} (bleed)`, icon: a.icon }) - 1 : undefined
  const auraIndex = aura ? addAura(plan, aura) : -1
  if (aura?.mods.targetArmor) plan.auras[auraIndex].targetArmor = aura.mods.targetArmor
  const critAura = auraCrit ? plan.auras.findIndex((x) => x.id === auraCrit.aura) : -1
  plan.abilities.push({
    ...a,
    source,
    offHandSource: -1,
    aura: auraIndex,
    window: -1,
    ...(dotSource !== undefined ? { dotSource } : {}),
    ...(auraCrit && critAura >= 0 ? { auraCrit: { aura: critAura, pct: auraCrit.pct } } : {}),
  })
  return plan.abilities.length - 1
}

/** A test row (not a real ability): a free, instant cast or attack with the given fields. */
const testRow = (id: string, fields: Partial<AbilityDef>): AbilityDef => ({
  id,
  name: id,
  icon: 'x',
  kind: 'cast',
  ...NO_STRIKE,
  costTenths: 0,
  cooldownMs: 0,
  gcdMs: 0,
  stances: STANCE_ANY,
  ...fields,
})

const minCp = (cp: number): RotationCondition => ({ code: COND.minComboPoints, a: cp, b: 0 })
const row = (plan: Plan, a: number) => plan.abilities[a].source
/** Fight-long totals of one breakdown row, per fight, over `fights` fights. */
function totals(plan: Plan, source: number, fights: number) {
  const sim = new Sim(plan)
  for (let i = 0; i < fights; i++) sim.runFight(i)
  const f = (field: number) => counter(sim, source, field) / fights
  return { damage: f(FIELD.damage), casts: f(FIELD.casts), hits: f(FIELD.hits), crits: f(FIELD.crits), misses: f(FIELD.misses), sim }
}

describe('builders (druid.md §3.1, §3.2)', () => {
  it('W3: Shred at 1200 AP, no talents, is 1.55 × (W + 80): 324.809–358.785, 341.797 on average', () => {
    const plan = catPlan(60000)
    setAttackPower(plan, 1200)
    const shred = add(plan, SHRED, NONE)
    line(plan, shred)
    const hits = damages(plan, row(plan, shred), 20)
    expect(Math.min(...hits)).toBeGreaterThanOrEqual(324.809 - 1e-3)
    expect(Math.max(...hits)).toBeLessThanOrEqual(358.785 + 1e-3)
    expectMean(hits, 341.797)
  })

  it('W3: with Savage Fury 2/2 375.977 on average, and a crit with Predatory Instincts 2/2 827.149', () => {
    const plan = catPlan(60000)
    setAttackPower(plan, 1200)
    line(plan, add(plan, SHRED))
    expectMean(damages(plan, row(plan, 0), 20), 375.977)
    const crits = catPlan(60000, { crit: 200 })
    setAttackPower(crits, 1200)
    line(crits, add(crits, SHRED))
    expectMean(damages(crits, row(crits, 0), 20), 827.149)
  })

  it('W4: Claw at 1200 AP is 1.10 × (W + 115): 269.010–293.122, 281.066 on average; 309.172 with Savage Fury', () => {
    const plan = catPlan(60000)
    setAttackPower(plan, 1200)
    line(plan, add(plan, CLAW, NONE))
    const hits = damages(plan, row(plan, 0), 20)
    expect(Math.min(...hits)).toBeGreaterThanOrEqual(269.01 - 1e-3)
    expect(Math.max(...hits)).toBeLessThanOrEqual(293.122 + 1e-3)
    expectMean(hits, 281.066)
    const talented = catPlan(60000)
    setAttackPower(talented, 1200)
    line(talented, add(talented, CLAW))
    expectMean(damages(talented, row(talented, 0), 20), 309.172)
  })

  it('costs 42 (Shred) and 40 (Claw) Energy with the default build, with the 1 s cat GCD', () => {
    const plan = catPlan(3000)
    const shred = add(plan, SHRED)
    line(plan, shred)
    const { uses, rageAtUse } = timeline(plan)
    // 100 at the pull: Shreds at 0 and 1 s (100 → 58 → 16 + the ticks by then).
    expect(uses[shred].slice(0, 2)).toEqual([0, 1000])
    expect(rageAtUse[shred][0]).toBe(1000)
    expect(plan.abilities[shred].costTenths).toBe(420)
    expect(withDruidTalents(CLAW, CAT_TALENTS).costTenths).toBe(400)
  })

  it('Shred needs you behind the boss: from the front it’s never used, and a Claw line that waits for it fires instead', () => {
    const plan = catPlan(5000)
    plan.fight.front = true
    const shred = add(plan, SHRED)
    const claw = add(plan, CLAW)
    line(plan, shred)
    line(plan, claw, [{ code: COND.cooldownAtLeast, a: shred, b: 1 }])
    const { uses } = timeline(plan)
    expect(uses[shred]).toEqual([])
    expect(uses[claw][0]).toBe(0)
    // From behind, the Claw line never fires.
    const behind = catPlan(5000)
    const s = add(behind, SHRED)
    const c = add(behind, CLAW)
    line(behind, s)
    line(behind, c, [{ code: COND.cooldownAtLeast, a: s, b: 1 }])
    const b = timeline(behind)
    expect(b.uses[c]).toEqual([])
    expect(b.uses[s][0]).toBe(0)
  })
})

describe('Rake: a hit and a bleed (druid.md §3.3, W5)', () => {
  it('its hit is 67.10 and its bleed 3 ticks of 39.27 every 3 s, on the bleed’s own row; +1 combo point', () => {
    const plan = catPlan(12000)
    const rake = add(plan, RAKE)
    line(plan, rake, at(plan, 0))
    const { sim, uses, ticks } = timeline(plan)
    expect(uses[rake]).toEqual([0])
    const hit = plan.abilities[rake]
    expect(counter(sim, hit.source, FIELD.damage)).toBeCloseTo(67.1, 9)
    expect(counter(sim, hit.dotSource!, FIELD.damage)).toBeCloseTo(3 * 39.27, 9)
    // One application, three ticks.
    expect(counter(sim, hit.dotSource!, FIELD.casts)).toBe(1)
    expect(counter(sim, hit.dotSource!, FIELD.hits)).toBe(3)
    expect(ticks).toEqual([3000, 6000, 9000])
    expect(sim.resources().comboPoints).toBe(1)
    // Its marker is up for the 9 s its ticks run.
    expect(sim.auraUpMs[hit.aura]).toBe(9000)
  })

  it('a dodged Rake deals nothing, lands no bleed and refunds 80% of its 35 Energy', () => {
    const plan = catPlan(12000)
    plan.fight.bossCanDodge = true
    plan.stats.expertise = -1000
    const rake = add(plan, RAKE)
    const probe = add(plan, testRow('testProbe', { usesPerFight: 1 }))
    line(plan, rake, at(plan, 0))
    line(plan, probe, at(plan, 0))
    const { sim } = timeline(plan)
    const hit = plan.abilities[rake]
    expect(counter(sim, hit.source, FIELD.dodges)).toBe(1)
    expect(counter(sim, hit.source, FIELD.damage)).toBe(0)
    expect(counter(sim, hit.dotSource!, FIELD.casts)).toBe(0)
    // Right after it: 100 − 35 + 28 = 93.
    const again = new Sim(plan)
    let energy = -1
    again.castTrace = (a) => {
      if (a === probe) energy = again.resources().energy
    }
    again.runFight(0)
    expect(energy).toBe(930)
    expect(sim.resources().comboPoints).toBe(0)
  })

  it('in `forever` its ticks crit at the crit chance it landed with (×2.2); in `classicEra` they can’t', () => {
    const crits = (profile: 'forever' | 'classicEra') => {
      const plan = catPlan(12000, { crit: 200 })
      plan.profile = profile === 'forever' ? plan.profile : { ...plan.profile, combat: { ...plan.profile.combat, periodicCrits: false } }
      const rake = add(plan, RAKE)
      line(plan, rake, at(plan, 0))
      const { sim } = timeline(plan)
      return counter(sim, plan.abilities[rake].dotSource!, FIELD.crits)
    }
    expect(crits('forever')).toBe(3)
    expect(crits('classicEra')).toBe(0)
  })
})

describe('Rip (druid.md §3.4, W6)', () => {
  /** One Rip at `cp` combo points (a test builder gives them), at 1200 AP, with these talents. */
  function rip(cp: number, talents: TalentRanks, tf = false) {
    const plan = catPlan(20000)
    setAttackPower(plan, 1200)
    const builder = add(plan, testRow('testBuilder', { kind: 'weaponStrike', resource: 'energy', unavoidable: true, comboPoints: cp, usesPerFight: 1 }), talents)
    const r = add(plan, RIP, talents)
    if (tf) line(plan, add(plan, tigersFury(0, false), talents), at(plan, 0))
    line(plan, builder, at(plan, 0))
    line(plan, r, at(plan, 100))
    const { sim, uses } = timeline(plan)
    expect(uses[r]).toEqual([100])
    expect(sim.resources().comboPoints).toBe(0)
    return { perTick: counter(sim, plan.abilities[r].source, FIELD.damage) / 6, total: counter(sim, plan.abilities[r].source, FIELD.damage) }
  }

  it('per tick 15 + 25.5 × CP + 1% of AP × min(CP, 4): 52.5, 127.5, 190.5 at 1, 3 and 5 CP; 6 ticks', () => {
    expect(rip(1, NONE).perTick).toBeCloseTo(52.5, 9)
    expect(rip(3, NONE).perTick).toBeCloseTo(127.5, 9)
    expect(rip(5, NONE).total).toBeCloseTo(1143, 9)
  })

  it('with Genesis 5/5, 1200.15 at 5 CP; applied under Tiger’s Fury, it keeps its +15%: 1380.17', () => {
    const genesis = new Map([['Genesis', 5]])
    expect(rip(5, genesis).total).toBeCloseTo(1200.15, 6)
    expect(rip(5, genesis, true).total).toBeCloseTo(1380.1725, 6)
  })

  it('a dodged Rip keeps its combo points and refunds nothing', () => {
    const plan = catPlan(3000)
    plan.fight.bossCanDodge = true
    plan.stats.expertise = -1000
    const builder = add(plan, testRow('testBuilder', { kind: 'weaponStrike', resource: 'energy', unavoidable: true, comboPoints: 5, usesPerFight: 1 }))
    const r = add(plan, RIP)
    line(plan, builder, at(plan, 0))
    line(plan, r, at(plan, 100))
    const { sim } = timeline(plan)
    expect(counter(sim, plan.abilities[r].source, FIELD.dodges)).toBe(1)
    expect(counter(sim, plan.abilities[r].source, FIELD.damage)).toBe(0)
    expect(sim.resources().comboPoints).toBe(5)
  })
})

describe('Ferocious Bite (druid.md §3.5, W7)', () => {
  /** One Bite at `cp` combo points with `energy` Energy when it's used, at 1200 AP, no talents. */
  function bite(cp: number, energy: number, fights = 400) {
    const plan = catPlan(3000)
    setAttackPower(plan, 1200)
    const spend = add(plan, testRow('testSpend', { resource: 'energy', costTenths: 1000 - 10 * energy, usesPerFight: 1 }), NONE)
    const builder = add(plan, testRow('testBuilder', { kind: 'weaponStrike', resource: 'energy', unavoidable: true, comboPoints: cp, usesPerFight: 1 }), NONE)
    const fb = add(plan, FEROCIOUS_BITE, NONE)
    const probe = add(plan, testRow('testProbe', { usesPerFight: 1 }), NONE)
    line(plan, spend, at(plan, 0))
    line(plan, builder, at(plan, 0))
    line(plan, fb, at(plan, 0))
    line(plan, probe, at(plan, 0))
    const hits = damages(plan, row(plan, fb), fights)
    const sim = new Sim(plan)
    let energyAtUse = -1
    let after = { energy: -1, comboPoints: -1 }
    sim.castTrace = (a, _t, pool) => {
      if (a === fb) energyAtUse = pool
      if (a === probe) after = sim.resources()
    }
    sim.runFight(0)
    return { hits, energyAtUse, after }
  }

  it('5 CP with exactly 35 Energy: 967–1027, 997 on average (52–112 + 735 + 180); a landed Bite spends all the Energy', () => {
    const { hits, energyAtUse, after } = bite(5, 35)
    expect(energyAtUse).toBe(350)
    expect(Math.min(...hits)).toBeGreaterThanOrEqual(967 - 1e-9)
    expect(Math.max(...hits)).toBeLessThanOrEqual(1027 + 1e-9)
    expectMean(hits, 997)
    expect(after.energy).toBe(0)
    expect(after.comboPoints).toBe(0)
    // With 60, the Energy is spent all the same.
    expect(bite(5, 60).after.energy).toBe(0)
  })

  it('5 CP with 60 Energy: 25 extra at 2.7 each, 1034.5–1094.5; 4 CP with 35: 814 on average', () => {
    const extra = bite(5, 60).hits
    expect(Math.min(...extra)).toBeGreaterThanOrEqual(1034.5 - 1e-9)
    expect(Math.max(...extra)).toBeLessThanOrEqual(1094.5 + 1e-9)
    expectMean(extra, 1064.5)
    expectMean(bite(4, 35).hits, 814)
  })
})

describe('Tiger’s Fury (druid.md §3.6, W8, W11)', () => {
  it('W8: King of the Jungle 3/3 with Wolfshead Helm, pressed at 30 Energy: 30 + 80 caps at 100, 10 lost', () => {
    const plan = catPlan(1000)
    const spend = add(plan, testRow('testSpend', { resource: 'energy', costTenths: 700, usesPerFight: 1 }))
    const tf = add(plan, tigersFury(3, true))
    const probe = add(plan, testRow('testProbe', { usesPerFight: 1 }))
    line(plan, spend, at(plan, 0))
    line(plan, tf, at(plan, 0))
    line(plan, probe, at(plan, 0))
    const sim = new Sim(plan)
    let wastedBefore = -1
    let energy = -1
    let wasted = -1
    sim.castTrace = (a) => {
      if (a === spend) wastedBefore = sim.totalEnergyWastedTenths
      if (a === probe) {
        energy = sim.resources().energy
        wasted = sim.totalEnergyWastedTenths - wastedBefore
      }
    }
    sim.runFight(0)
    expect(energy).toBe(1000)
    expect(wasted).toBe(100)
    // An energize: 5 threat per Energy gained, on its row.
    expect(counter(sim, row(plan, tf), FIELD.threat)).toBe(70 * 5)
  })

  it('W11: Energy per 30 s with Tiger’s Fury on cooldown is 300 + 60 = 360 (380 with Wolfshead Helm)', () => {
    for (const [wolfshead, total] of [
      [false, 3600],
      [true, 3800],
    ] as const) {
      const plan = catPlan(30000)
      // Spend 20 whenever there's 20: nothing is ever lost at the cap after the pull's full bar.
      const spend = add(plan, testRow('testSpend', { resource: 'energy', costTenths: 200 }))
      line(plan, spend)
      // As the rotation uses it: only when all its Energy fits.
      line(plan, add(plan, tigersFury(3, wolfshead)), [{ code: COND.maxEnergy, a: wolfshead ? 200 : 400, b: 0 }])
      const sim = new Sim(plan)
      sim.runFight(0)
      expect(sim.totalEnergyGainedTenths).toBe(total)
      expect(sim.totalEnergyWastedTenths).toBe(0)
    }
  })

  it('+15% physical damage for 6 s, on white swings too, and off the GCD', () => {
    const plan = catPlan(12000)
    setAttackPower(plan, 1200)
    const tf = add(plan, tigersFury(0, false))
    line(plan, tf, at(plan, 0))
    const sim = new Sim(plan)
    const during: number[] = []
    const after: number[] = []
    let t = 0
    sim.trace = (_s, hand, time) => {
      if (hand === 0) t = time
    }
    sim.damageTrace = (s, d) => {
      if (s === SOURCE_MAIN_HAND) (t < 6000 ? during : after).push(d)
    }
    for (let i = 0; i < 30; i++) sim.runFight(i)
    // W2's 140.514 a swing, × 1.15 for the 6 swings (0–5 s) under it.
    expectMean(during, 140.514 * 1.15)
    expectMean(after, 140.514)
    expect(sim.auraUpMs[plan.abilities[tf].aura]).toBe(30 * 6000)
  })
})

describe('combo points and Clearcasting with the real abilities (druid.md §2.5, §2.7)', () => {
  it('Shred builds a point a hit; Rip at 5 spends them all; two Shreds after it start again at 1 and 2', () => {
    const plan = catPlan(40000)
    const shred = add(plan, SHRED)
    const r = add(plan, RIP)
    line(plan, r, [minCp(5)])
    line(plan, shred)
    const trace: number[] = []
    const sim = new Sim(plan)
    sim.castTrace = (a) => trace.push(a === r ? -1 : sim.resources().comboPoints)
    sim.runFight(0)
    // Combo points before each Shred: 0, 1, 2, 3, 4; then Rip (−1); then 0, 1, …
    expect(trace.slice(0, 8)).toEqual([0, 1, 2, 3, 4, -1, 0, 1])
  })

  it('Primal Fury: a critting Shred gives 2 points, so 3 Shreds make 5 (not 6)', () => {
    const plan = catPlan(20000, { crit: 200 })
    const shred = add(plan, SHRED)
    const r = add(plan, RIP)
    line(plan, r, [minCp(5)])
    line(plan, shred)
    const trace: number[] = []
    const sim = new Sim(plan)
    sim.castTrace = (a) => trace.push(a === r ? -1 : sim.resources().comboPoints)
    sim.runFight(0)
    expect(trace.slice(0, 5)).toEqual([0, 2, 4, -1, 0])
  })

  it('Clearcasting pays a Shred: no Energy spent, and it’s used up', () => {
    const plan = catPlan(3000, { keepProcs: true })
    const clearcasting = plan.freeCastAura!
    plan.procs.find((p) => p.id === 'omenOfClarity')!.chance = [1, 1]
    const shred = add(plan, SHRED)
    // The swing at 0 procs Clearcasting; Shred from 0.5 s.
    line(plan, shred, [from(plan, 500)])
    const { sim, uses, rageAtUse } = timeline(plan)
    expect(uses[shred][0]).toBe(500)
    expect(rageAtUse[shred][0]).toBe(1000)
    // The next Shred, a GCD later, finds the full bar still there.
    expect(rageAtUse[shred][1]).toBe(1000)
    expect(sim.auraUpMs[clearcasting]).toBe(500)
  })

  it('a powershift (cat into cat) with Furor 5/5 keeps the Energy: it gains nothing (§2.8)', () => {
    const plan = catPlan(4000)
    const shred = add(plan, SHRED)
    const shift = add(plan, shapeshift('cat', 0))
    const probe = add(plan, testRow('testProbe', { usesPerFight: 1 }))
    line(plan, shred, at(plan, 0))
    line(plan, shift, at(plan, 1000))
    line(plan, probe, at(plan, 1000))
    for (let fight = 0; fight < 10; fight++) {
      const sim = new Sim(plan)
      let before = -1
      let after = -1
      sim.castTrace = (a) => {
        if (a === shift) before = sim.resources().energy
        if (a === probe) after = sim.resources().energy
      }
      sim.runFight(fight)
      // 100 − 42 and a tick or none by 1 s: 58 or 78, the same after the shift.
      expect([580, 780]).toContain(before)
      expect(after).toBe(before)
      expect(sim.resources().form).toBe(plan.form)
    }
  })
})

describe('Berserk (druid.md §3.7)', () => {
  it('for 15 s every landed Shred crits and gives 2 combo points; after it, crits are back to the sheet’s', () => {
    const plan = catPlan(40000, { crit: 0 })
    const berserk = add(plan, BERSERK)
    const shred = add(plan, SHRED)
    line(plan, berserk, at(plan, 0))
    line(plan, shred)
    const sim = new Sim(plan)
    // Every Shred lands (100% hit, no dodge): one damage event per use, whose crit the counter shows.
    const times: number[] = []
    const crits: boolean[] = []
    let seen = 0
    sim.castTrace = (a, t) => {
      if (a === shred) times.push(t)
    }
    sim.damageTrace = (s) => {
      if (s !== row(plan, shred)) return
      const c = counter(sim, row(plan, shred), FIELD.crits)
      crits.push(c > seen)
      seen = c
    }
    sim.runFight(0)
    expect(crits.length).toBe(times.length)
    const during = crits.filter((_, i) => times[i] < 15000)
    const after = crits.filter((_, i) => times[i] >= 15000)
    expect(during.length).toBeGreaterThanOrEqual(4)
    expect(during.every((c) => c)).toBe(true)
    expect(after.filter((c) => c).length).toBeLessThan(after.length / 2)
    expect(sim.auraUpMs[plan.abilities[berserk].aura]).toBe(15000)
  })

  it('doesn’t reach Rip or Ferocious Bite, which aren’t in its class mask', () => {
    expect(RIP.auraCrit).toBeUndefined()
    expect(FEROCIOUS_BITE.auraCrit).toBeUndefined()
    expect([SHRED, CLAW, RAKE].map((d) => d.auraCrit)).toEqual(Array(3).fill({ aura: 'berserk', pct: 100 }))
  })
})

describe('Rend and Tear: +10% on a bleeding target (druid.md §5.1, Q9)', () => {
  function shredMean(othersBleed: boolean, rakeFirst: boolean) {
    const plan = catPlan(8000)
    setAttackPower(plan, 1200)
    plan.fight.othersBleed = othersBleed
    const shred = add(plan, SHRED)
    if (rakeFirst) line(plan, add(plan, RAKE), at(plan, 0))
    line(plan, shred, [from(plan, 1000)])
    // Shreds within Rake's 9 s.
    return damages(plan, row(plan, shred), 200)
  }

  it('from others’ bleeds (a raid’s warriors) or your own Rake: 375.977 × 1.10; nothing bleeding: 375.977', () => {
    expectMean(shredMean(false, false), 375.977)
    expectMean(shredMean(true, false), 375.977 * 1.1)
    expectMean(shredMean(false, true), 375.977 * 1.1)
  })

  it('not on auto attacks or bleed ticks', () => {
    const plan = catPlan(12000)
    setAttackPower(plan, 1200)
    plan.fight.othersBleed = true
    const rake = add(plan, RAKE)
    line(plan, rake, at(plan, 0))
    const { sim } = timeline(plan)
    expect(counter(sim, plan.abilities[rake].dotSource!, FIELD.damage)).toBeCloseTo(3 * 39.27, 9)
    // Rake's hit gets it: 67.10 × 1.10.
    expect(counter(sim, plan.abilities[rake].source, FIELD.damage)).toBeCloseTo(67.1 * 1.1, 9)
    const white = catPlan(20000)
    setAttackPower(white, 1200)
    white.fight.othersBleed = true
    expectMean(damages(white, SOURCE_MAIN_HAND, 20), 140.514)
  })
})

describe('Faerie Fire in Cat Form (druid.md §3.8)', () => {
  it('takes 505 armor off the boss while it’s up; free, a 1 s GCD, a 6 s cooldown', () => {
    const plan = catPlan(60000)
    plan.fight.targetArmor = 3000
    plan.fight.targetLevel = 63
    const ff = add(plan, FAERIE_FIRE_CAT)
    line(plan, ff, [{ code: COND.abilityAuraRefresh, a: ff, b: 0 }])
    const { sim, uses } = timeline(plan)
    // Cast at 0; again 6 s after a miss, otherwise once it runs out.
    expect(uses[ff][0]).toBe(0)
    for (let i = 1; i < uses[ff].length; i++) expect(uses[ff][i] - uses[ff][i - 1]).toBeGreaterThanOrEqual(6000)
    expect(plan.abilities[ff].gcdMs).toBe(1000)
    expect(plan.abilities[ff].costTenths).toBe(0)
    expect(sim.auraUpMs[plan.abilities[ff].aura]).toBeGreaterThan(40000)
    // Against a level-59 target it can't miss (4% − Nature's Reach's 4%): cast at 0, before the
    // swing at 0, every white swing of a 30 s fight hits 3,000 − 505 armor.
    const white = (withFf: boolean) => {
      const p = catPlan(30000)
      setAttackPower(p, 1200)
      p.fight.targetArmor = 3000
      if (withFf) line(p, add(p, FAERIE_FIRE_CAT), at(p, 0))
      return damages(p, SOURCE_MAIN_HAND, 20)
    }
    expectMean(white(true), 140.514 * (1 - armorReduction(3000 - FAERIE_FIRE_ARMOR, 60, FOREVER)))
    expectMean(white(false), 140.514 * (1 - armorReduction(3000, 60, FOREVER)))
  })

  it('rolls spell hit: a miss applies nothing (9% against a level-63 boss: 17% less the default cat’s 8%)', () => {
    const plan = catPlan(600000)
    plan.fight.targetLevel = 63
    const ff = add(plan, FAERIE_FIRE_CAT)
    line(plan, ff)
    // Spell hit 8%: Nature's Reach's 4%, the Tauren's 1% and the gear's (combat-tables §9).
    expect(new Sim(plan).inspect().spellMiss).toBe(9)
    // About 5,000 casts in 50 fights of 10 min (one every 6 s): 9% ± 0.4% (one standard error).
    const { casts, misses } = totals(plan, row(plan, ff), 50)
    expect(misses / casts).toBeGreaterThan(0.08)
    expect(misses / casts).toBeLessThan(0.1)
  })
})

describe('abilityAuraDown, condition 17 (druid.md §6.2 row 9)', () => {
  /** Rip at 5 combo points when it's off the boss, Rake when its bleed is (and, with `hold`, while Rip is off too), else Shred. */
  function uses(hold: boolean) {
    const plan = catPlan(120000)
    plan.fight.targetLevel = 63
    const rip = add(plan, RIP)
    const rake = add(plan, RAKE)
    const shred = add(plan, SHRED)
    line(plan, rip, [{ code: COND.minComboPoints, a: 5, b: 0 }, { code: COND.abilityAuraRefresh, a: rip, b: 0 }])
    line(plan, rake, [{ code: COND.abilityAuraRefresh, a: rake, b: 0 }, ...(hold ? [{ code: COND.abilityAuraDown, a: rip, b: 0 }] : [])])
    line(plan, shred)
    const { uses: u } = timeline(plan)
    return { rip: u[rip], rake: u[rake] }
  }
  // Every hit lands, so each Rip bleeds its full 12 s from the moment it's used.
  const ripUp = (rips: number[], t: number) => rips.some((r) => t >= r && t < r + 12000)

  it('holds Rake back while your Rip bleeds, and lets it go once Rip is off the boss', () => {
    const held = uses(true)
    expect(held.rip.length).toBeGreaterThan(3)
    expect(held.rake.length).toBeGreaterThan(1)
    for (const t of held.rake) expect(ripUp(held.rip, t), `Rake at ${t} ms`).toBe(false)
    // Without the condition, Rake comes back each time its own bleed ends, Rip or not.
    const free = uses(false)
    expect(free.rake.some((t) => ripUp(free.rip, t))).toBe(true)
  })
})

describe('the Manual Crowd Pummeler (druid.md §7.3)', () => {
  it('+50% attack speed for 30 s, a 3 min cooldown, 3 charges a fight', () => {
    const plan = catPlan(900000)
    const mcp = add(plan, onUseCast(ITEM_EFFECTS[9449].use!))
    line(plan, mcp)
    const { uses, swings } = timeline(plan)
    expect(uses[mcp]).toEqual([0, 180000, 360000])
    // Swings every 1000 / 1.5 ms while it's up (the first comes after the cast at 0), 1 s after.
    const gaps = (xs: number[]) => xs.slice(1).map((x, i) => x - xs[i])
    for (const g of gaps(swings[0].slice(0, 20))) expect(g).toBeCloseTo(1000 / 1.5, -1)
    for (const g of gaps(swings[0].filter((t) => t > 31000 && t < 40000))) expect(g).toBe(1000)
  })
})

describe('the default cat (druid.md §6.2, §7)', () => {
  const fixed = (config: SimConfig): SimConfig => ({ ...config, run: { ...config.run, mode: 'fixed', iterations: 300 } })

  it('the same config and seed give the same result; a new seed another', async () => {
    const a = await simulate(fixed(defaultConfig('druid-feral-cat')))
    const b = await simulate(fixed(defaultConfig('druid-feral-cat')))
    expect(a.dps).toEqual(b.dps)
    expect(a.abilities).toEqual(b.abilities)
    const c = await simulate({ ...fixed(defaultConfig('druid-feral-cat')), run: { mode: 'fixed', iterations: 300, seed: 99 } })
    expect(c.dps.mean).not.toBe(a.dps.mean)
  })

  it('uses its abilities and cooldowns, lists the cat’s assumptions, and keeps Faerie Fire up itself', async () => {
    const result = await simulate(fixed(defaultConfig('druid-feral-cat')))
    const ids = result.abilities.map((x) => x.id)
    for (const id of ['mainHand', 'shred', 'rip', 'ferociousBite']) expect(ids).toContain(id)
    const cooldowns = Object.fromEntries(result.cooldowns.map((x) => [x.id, x]))
    // Berserk and the Manual Crowd Pummeler from the pull, every 3 min; Tiger's Fury every 30 s or so.
    expect(cooldowns.berserk.castsPerFight).toBeGreaterThanOrEqual(1)
    expect(cooldowns.manualCrowdPummeler.castsPerFight).toBeGreaterThanOrEqual(1)
    expect(cooldowns.tigersFury.castsPerFight).toBeGreaterThan(5)
    expect(cooldowns.faerieFire.uptimePct).toBeGreaterThan(95)
    const assumed = result.assumptions.map((x) => x.id)
    for (const id of ['catShredFlat', 'catFinisherAp', 'catBleeds', 'predatoryInstincts', 'rendAndTear', 'berserkCrits', 'formHaste', 'energyTicks'])
      expect(assumed).toContain(id)
    for (const id of ['whiteSwingsOnly', 'rendTickCrits', 'rendOnHit', 'executeRageTenths']) expect(assumed).not.toContain(id)
    // The Manual Crowd Pummeler is pressed; the Counterattack Lodestone trinket isn't simulated.
    expect(result.assumptions.find((x) => x.id === 'onUseConsumables')?.text).not.toContain('Pummeler')
    // The rip row shows its uptime on the boss.
    expect(result.abilities.find((x) => x.id === 'rip')?.bleed?.uptimePct).toBeGreaterThan(25)
  })

  it('its Faerie Fire is its own: no preset adds the Buffs tab’s, which counts only when you turn it on with yours off', () => {
    const d = defaultConfig('druid-feral-cat')
    // The raid's Faerie Fire is assumed to be yours (druid.md §6.2): the default raid leaves it out.
    expect(d.buffs.enabled).not.toContain('faerieFire')
    const off = { ...d, rotation: { 'druid.cat.faerieFire.enabled': false } }
    const none = buildPlan(off).plan
    expect(none.abilities.some((a) => a.id === 'faerieFire')).toBe(false)
    // Another druid's, turned on in Buffs: the static debuff.
    const other = buildPlan({ ...off, buffs: { ...d.buffs, enabled: [...d.buffs.enabled, 'faerieFire'] } }).plan
    expect(none.fight.targetArmor - other.fight.targetArmor).toBe(FAERIE_FIRE_ARMOR)
    // With yours on, the Buffs tab's adds nothing more, turned on or not.
    const own = buildPlan({ ...d, buffs: { ...d.buffs, enabled: [...d.buffs.enabled, 'faerieFire'] } }).plan
    expect(own.fight.targetArmor).toBe(none.fight.targetArmor)
    expect(own.auras.find((a) => a.id === 'faerieFire')?.targetArmor).toBe(FAERIE_FIRE_ARMOR)
  })

  it('counts its own Faerie Fire when it judges negative armor: 3,009 armor under the Standard raid goes below 0', () => {
    const d = defaultConfig('druid-feral-cat')
    const light = { ...d, fight: { ...d.fight, bossArmor: 3009 } }
    const { plan, assumptions } = buildPlan(light)
    // The static armor (Sunder Armor ×5 and Curse of Recklessness) stays above 0; Faerie Fire's 505,
    // an aura in the fight, takes it below.
    const faerieFire = plan.auras.find((a) => a.id === 'faerieFire')!
    expect(plan.fight.targetArmor).toBeGreaterThan(0)
    expect(plan.fight.targetArmor - faerieFire.targetArmor!).toBeLessThan(0)
    expect(assumptions.map((a) => a.id)).toContain('negativeArmor')
    // Without your Faerie Fire (and the Buffs tab's off), it stays above 0: no note.
    const off = buildPlan({ ...light, rotation: { 'druid.cat.faerieFire.enabled': false }, buffs: { ...d.buffs, enabled: d.buffs.enabled.filter((id) => id !== 'faerieFire') } })
    expect(off.assumptions.map((a) => a.id)).not.toContain('negativeArmor')
  })

  it('from the front, Claw builds instead of Shred', async () => {
    const d = defaultConfig('druid-feral-cat')
    const result = await simulate(fixed({ ...d, fight: { ...d.fight, position: 'front' } }))
    const ids = result.abilities.map((x) => x.id)
    expect(ids).toContain('claw')
    expect(ids).not.toContain('shred')
  })
})
