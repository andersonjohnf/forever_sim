// The results model (docs/ux.md#results): "Cooldowns and buffs" (casts per fight and uptimes of
// what deals no damage) and bleed rows (applications and ticks), from merged chunk results.
import { describe, expect, it } from 'vitest'
import { BLOOD_FURY, BLOODRAGE, REND } from '../classes/warrior/abilities'
import { defaultConfig } from '../defaults'
import { CHUNK_SIZE, runChunk } from '../engine/chunk'
import { FIELD, FIELD_COUNT, Sim } from '../engine/sim'
import { addAbility, addAura, armsPlan } from '../engine/test-helpers'
import { buildPlan } from '../plan/build'
import type { Plan } from '../plan/types'
import type { SimConfig, SimResult } from '../types'
import { type Aggregate, cooldownResults, emptyAggregate, mergeChunk, toResult } from './aggregate'

function run(config: SimConfig, fights = 1000): SimResult {
  const bundle = buildPlan({ ...config, run: { mode: 'fixed', iterations: fights, seed: 3 } })
  const sim = new Sim(bundle.plan)
  let agg = emptyAggregate(bundle.plan.sources.length, bundle.plan.auras.length)
  for (let k = 0; k * CHUNK_SIZE < fights; k++) agg = mergeChunk(agg, runChunk(bundle.plan, k, CHUNK_SIZE, sim))
  return toResult(bundle, agg, 0)
}

const row = (result: SimResult, id: string) => result.cooldowns.find((r) => r.id === id)

describe('Cooldowns and buffs', () => {
  /** Blood Fury (a cast with a buff), Bloodrage (a cast without one), a proc's buff and Rend's marker. */
  function handPlan(): { plan: Plan; agg: Aggregate } {
    const plan = armsPlan(100000)
    plan.auras = []
    const bf = addAbility(plan, BLOOD_FURY)
    const br = addAbility(plan, BLOODRAGE)
    addAbility(plan, REND)
    addAura(plan, { id: 'flurry', name: 'Flurry', durationMs: 15000, mods: {} })
    const agg = emptyAggregate(plan.sources.length, plan.auras.length)
    agg.fights = 4
    agg.durationMs = 400000
    agg.counters[plan.abilities[bf].source * FIELD_COUNT + FIELD.casts] = 4
    agg.counters[plan.abilities[br].source * FIELD_COUNT + FIELD.casts] = 6
    agg.auraUpMs[plan.abilities[bf].aura] = 60000
    agg.auraUpMs[plan.auras.findIndex((a) => a.id === 'flurry')] = 100000
    agg.auraUpMs[plan.auras.findIndex((a) => a.id === 'rend')] = 350000
    return { plan, agg }
  }

  it('lists the casts in the rotation’s order with casts per fight and their buff’s uptime, then the other buffs', () => {
    const { plan, agg } = handPlan()
    expect(cooldownResults(plan, agg)).toEqual([
      { id: 'bloodFury', name: 'Blood Fury', icon: BLOOD_FURY.icon, uptimePct: 15, castsPerFight: 1 },
      { id: 'bloodrage', name: 'Bloodrage', icon: BLOODRAGE.icon, uptimePct: null, castsPerFight: 1.5 },
      { id: 'flurry', name: 'Flurry', icon: 'x', uptimePct: 25, castsPerFight: null },
    ])
  })

  it('leaves out a bleed’s marker (it’s on the boss) and damaging abilities', () => {
    const { plan, agg } = handPlan()
    const ids = cooldownResults(plan, agg).map((r) => r.id)
    expect(ids).not.toContain('rend')
  })

  it('reports nothing up and no casts before any fight is merged', () => {
    const { plan } = handPlan()
    const rows = cooldownResults(plan, emptyAggregate(plan.sources.length, plan.auras.length))
    expect(rows.map((r) => [r.uptimePct, r.castsPerFight])).toEqual([
      [0, 0],
      [null, 0],
      [0, null],
    ])
  })

  it('shows the default Fury warrior’s cooldowns, Battle Shout, potion and procs, but no damage rows', () => {
    const result = run(defaultConfig('warrior-fury'))
    expect(result.cooldowns.map((r) => r.name)).toEqual([
      'Battle Shout',
      'Death Wish',
      'Recklessness',
      'Bloodrage',
      'Mighty Rage Potion',
      'Holy Strength (main hand)',
      'Holy Strength (off hand)',
      'Enrage',
      'Flurry',
    ])
    // Death Wish (3 min) once or twice in a 162–198 s fight, 30 s each; Recklessness once for 15 s.
    expect(row(result, 'deathWish')!.castsPerFight).toBeGreaterThan(1)
    expect(row(result, 'deathWish')!.castsPerFight).toBeLessThan(2)
    expect(row(result, 'deathWish')!.uptimePct).toBeGreaterThan(15)
    expect(row(result, 'deathWish')!.uptimePct).toBeLessThan(2 * (100 * 30) / 162)
    expect(row(result, 'recklessness')!.castsPerFight).toBeCloseTo(1, 9)
    expect(row(result, 'recklessness')!.uptimePct).toBeGreaterThan(7.5)
    expect(row(result, 'recklessness')!.uptimePct).toBeLessThan(9)
    // Shouted before the pull and kept up: up the whole fight; the pre-pull shout counts as a cast.
    expect(row(result, 'battleShout')!.uptimePct).toBeGreaterThan(99.9)
    expect(row(result, 'battleShout')!.castsPerFight).toBeGreaterThanOrEqual(1)
    expect(row(result, 'bloodrage')!.uptimePct).toBeNull()
    expect(row(result, 'mightyRagePotion')!.castsPerFight).toBeCloseTo(1, 9)
    // No incoming damage by default, so Enrage never comes up.
    expect(row(result, 'enrage')!.uptimePct).toBe(0)
    expect(row(result, 'flurry')!.castsPerFight).toBeNull()
    expect(row(result, 'flurry')!.uptimePct).toBeGreaterThan(50)
    // The casts still stay out of the damage breakdown.
    expect(result.abilities.map((a) => a.id)).not.toContain('deathWish')
  })

  it('shows the Arms warrior’s Overpower window, named after it, with Overpower’s icon', () => {
    const result = run(defaultConfig('warrior-arms'))
    const window = row(result, 'overpowerWindow')!
    expect(window).toMatchObject({ name: 'Overpower window', icon: 'ability_meleedamage', castsPerFight: null })
    expect(window.uptimePct).toBeGreaterThan(0)
    // A two-hander's Crusader needs no hand in its name.
    expect(result.cooldowns.map((r) => r.name)).toContain('Holy Strength')
  })
})

describe('bleed rows', () => {
  it('Rend counts applications and ticks apart: tick crits in Forever, avoidable applications, and its uptime on the boss', () => {
    const result = run(defaultConfig('warrior-arms'))
    const rend = result.abilities.find((a) => a.id === 'rend')!
    expect(rend.bleed).toMatchObject({ ticksCanCrit: true, avoidable: true })
    expect(rend.bleed!.uptimePct).toBeGreaterThan(80)
    expect(rend.bleed!.uptimePct).toBeLessThanOrEqual(100)
    // Seven ticks per landed application at most, so ticks far outnumber applications.
    const landed = rend.casts - rend.misses - rend.dodges - rend.parries
    expect(rend.hits + rend.crits).toBeGreaterThan(landed)
    expect(rend.hits + rend.crits).toBeLessThanOrEqual(7 * landed)
    expect(rend.crits).toBeGreaterThan(0)
  })

  it('Rend’s ticks can’t crit in Classic Era', () => {
    const d = defaultConfig('warrior-arms')
    const result = run({ ...d, rules: { ...d.rules, profile: 'classicEra' } }, 250)
    const rend = result.abilities.find((a) => a.id === 'rend')!
    expect(rend.bleed).toMatchObject({ ticksCanCrit: false, avoidable: true })
    expect(rend.crits).toBe(0)
  })

  it('Deep Wounds’ ticks neither crit nor get avoided, and its uptime isn’t tracked', () => {
    const result = run(defaultConfig('warrior-fury'), 250)
    const dw = result.abilities.find((a) => a.id === 'deepWounds')!
    expect(dw.bleed).toEqual({ ticksCanCrit: false, avoidable: false, uptimePct: null })
    expect(dw.crits + dw.misses + dw.dodges + dw.parries).toBe(0)
  })

  it('leaves every other row without bleed information', () => {
    const result = run(defaultConfig('warrior-fury'), 250)
    expect(result.abilities.filter((a) => a.bleed).map((a) => a.id)).toEqual(['deepWounds'])
  })
})
