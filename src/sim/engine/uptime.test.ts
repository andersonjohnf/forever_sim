// Aura uptimes in the engine (docs/architecture.md "Auras and procs"; the results' "Cooldowns and
// buffs", docs/ux.md#results): each plan aura's time up, exact for known spans, from the pull to
// its end or the fight's, through refreshes and early ends, summed over fights and chunks.
import { describe, expect, it } from 'vitest'
import { BLOOD_FURY } from '../classes/warrior/abilities'
import { defaultConfig } from '../defaults'
import { buildPlan } from '../plan/build'
import { ACTION, type Plan, TRIGGER } from '../plan/types'
import { CHUNK_SIZE, runChunk } from './chunk'
import { Sim } from './sim'
import { addAbility, addAura, addProc, alwaysLandNoCrit, armsPlan, at, line, timeline } from './test-helpers'

/** Blood Fury (15 s, 2 min cooldown, no cost) used once, at `t` ms, in an Arms plan of `durationMs`. */
function bloodFuryAt(durationMs: number, t: number): { plan: Plan; aura: number } {
  const plan = armsPlan(durationMs)
  const bf = addAbility(plan, BLOOD_FURY)
  line(plan, bf, at(plan, t))
  return { plan, aura: plan.abilities[bf].aura }
}

describe('aura uptime (Sim.auraUpMs)', () => {
  it('counts a cast’s buff for exactly its duration, summed over fights', () => {
    const { plan, aura } = bloodFuryAt(100000, 10000)
    const sim = new Sim(plan)
    sim.runFight(0)
    expect(sim.auraUpMs[aura]).toBe(15000)
    sim.runFight(1)
    expect(sim.auraUpMs[aura]).toBe(30000)
  })

  it('counts a buff still up when the fight ends until the end', () => {
    const { plan, aura } = bloodFuryAt(100000, 90000)
    const sim = new Sim(plan)
    sim.runFight(0)
    expect(sim.auraUpMs[aura]).toBe(10000)
  })

  it('counts a pre-pull buff from the pull, not from its cast', () => {
    const plan = armsPlan(100000)
    const bf = addAbility(plan, BLOOD_FURY)
    plan.prepull = { casts: [{ ability: bf, atMs: -5000 }], chargeTenths: 0, keepTenths: -1 }
    const sim = new Sim(plan)
    sim.runFight(0)
    expect(sim.auraUpMs[plan.abilities[bf].aura]).toBe(10000)
  })

  it('keeps counting through refreshes: a proc buff on every swing is up from each swing for its duration', () => {
    for (const durationMs of [3000, 5000]) {
      const plan = armsPlan(40000)
      alwaysLandNoCrit(plan)
      const aura = addAura(plan, { id: 'test', name: 'Test', durationMs, mods: {} })
      addProc(plan, { trigger: TRIGGER.whiteLanded, chance: [1, 1], hands: 1, action: ACTION.aura, amount: aura, b: 0 })
      const { sim, swings } = timeline(plan)
      // The union of [swing, swing + duration), cut at the fight's end.
      let expected = 0
      let upTo = 0
      for (const t of swings[0]) {
        const end = Math.min(t + durationMs, 40000)
        expected += end - Math.max(t, upTo)
        upTo = end
      }
      expect(swings[0].length).toBeGreaterThan(5)
      expect(sim.auraUpMs[aura], `${durationMs} ms`).toBe(expected)
      // 5 s on a 3.8 s swing never drops: up from the first swing (at the pull) to the end.
      if (durationMs === 5000) expect(expected).toBe(40000)
    }
  })

  it('stops counting when a charge ends the buff early', () => {
    const plan = armsPlan(40000)
    alwaysLandNoCrit(plan)
    const bf = addAbility(plan, BLOOD_FURY)
    line(plan, bf, at(plan, 1000))
    const aura = plan.abilities[bf].aura
    // One white swing's charge, like a one-charge Flurry: the next swing after the cast ends it.
    plan.auras[aura].whiteSwingCharges = 1
    const { sim, swings } = timeline(plan)
    const next = swings[0].find((t) => t > 1000)!
    expect(next).toBeLessThan(1000 + 15000)
    expect(sim.auraUpMs[aura]).toBe(next - 1000)
  })

  it('sums per chunk: the same totals from a fresh engine or a used one, fight by fight or as a chunk', () => {
    const plan = buildPlan(defaultConfig('warrior-arms')).plan
    const whole = runChunk(plan, 0, CHUNK_SIZE)
    const used = new Sim(plan)
    runChunk(plan, 7, 30, used)
    expect(Array.from(runChunk(plan, 0, CHUNK_SIZE, used).auraUpMs)).toEqual(Array.from(whole.auraUpMs))
    const byFight = new Sim(plan)
    for (let i = 0; i < CHUNK_SIZE; i++) byFight.runFight(i)
    expect(Array.from(byFight.auraUpMs)).toEqual(Array.from(whole.auraUpMs))
    // Every aura of the default Arms warrior comes up, and none is up longer than the fights.
    for (let a = 0; a < plan.auras.length; a++) {
      expect(whole.auraUpMs[a], plan.auras[a].id).toBeGreaterThan(0)
      expect(whole.auraUpMs[a], plan.auras[a].id).toBeLessThanOrEqual(whole.durationMs)
    }
  })
})
