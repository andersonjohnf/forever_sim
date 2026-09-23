// Generic mana pieces the Retribution rotation uses (docs/classes/paladin.md#mana-model): a cast's
// mana at once (a mana potion or rune, buffs doc §3.5), the "mana ≤ x" condition, and the
// per-walk "aura down" condition a line can have several of.
import { describe, expect, it } from 'vitest'
import { PALADIN, SEAL_OF_COMMAND, SEAL_OF_RIGHTEOUSNESS } from '../classes/paladin/abilities'
import { addPaladinAbility, examplePlan } from '../classes/paladin/test-helpers'
import { type AbilityDef, COND, type Plan } from '../plan/types'
import { FIELD, FIELD_COUNT, Sim } from './sim'

/** A mana-restoring cast off the GCD, usable once (its cooldown outlasts the fight). */
const restore = (manaTenths: number, manaSpreadTenths = 0): AbilityDef => ({
  ...PALADIN,
  id: 'restore',
  name: 'Restore',
  icon: 'x',
  kind: 'cast',
  gcdMs: 0,
  cooldownMs: 1e9,
  manaTenths,
  manaSpreadTenths,
})
/** A mana sink at the pull, off the GCD, once. */
const sink = (costTenths: number): AbilityDef => ({ ...restore(0), id: 'sink', name: 'Sink', costTenths })

function noRegen(): Plan {
  const plan = examplePlan({ core: false, durationMs: 10000 })
  plan.mana = { ...plan.mana!, maxTenths: 50000, regenTickTenths: 0, mp5TickTenths: 0 }
  return plan
}

describe('mana from a cast', () => {
  it('adds its mana at once, capped at the maximum, with 0.5 threat per mana on its row', () => {
    const plan = noRegen()
    plan.rotation.push({ ability: addPaladinAbility(plan, sink(20000)), conditions: [], unqueueBelowTenths: 0 })
    const r = addPaladinAbility(plan, restore(30000))
    plan.rotation.push({ ability: r, conditions: [], unqueueBelowTenths: 0 })
    const sim = new Sim(plan)
    sim.runFight(0)
    // 3,000 mana restored into a pool missing 2,000: 2,000 of it counts.
    expect(sim.totalManaGainedTenths).toBe(20000)
    expect(sim.counters[plan.abilities[r].source * FIELD_COUNT + FIELD.threat]).toBeCloseTo(0.5 * 2000, 9)
  })

  it('rolls a whole number of tenths from 0 to its spread, from the proc stream', () => {
    const gains = new Set<number>()
    for (let fight = 0; fight < 50; fight++) {
      const plan = noRegen()
      plan.rotation.push({ ability: addPaladinAbility(plan, sink(40000)), conditions: [], unqueueBelowTenths: 0 })
      plan.rotation.push({ ability: addPaladinAbility(plan, restore(10000, 5000)), conditions: [], unqueueBelowTenths: 0 })
      const sim = new Sim(plan)
      sim.runFight(fight)
      const g = sim.totalManaGainedTenths
      expect(g).toBeGreaterThanOrEqual(10000)
      expect(g).toBeLessThanOrEqual(15000)
      expect(Number.isInteger(g)).toBe(true)
      gains.add(g)
    }
    expect(gains.size).toBeGreaterThan(40)
  })
})

describe('rotation conditions', () => {
  it('maxMana: a line waits until mana is at most a (tenths)', () => {
    const plan = noRegen()
    const s = addPaladinAbility(plan, { ...sink(1000), cooldownMs: 1000 })
    const r = addPaladinAbility(plan, restore(100))
    plan.rotation.push({ ability: r, conditions: [{ code: COND.maxMana, a: 46000, b: 0 }], unqueueBelowTenths: 0 })
    plan.rotation.push({ ability: s, conditions: [], unqueueBelowTenths: 0 })
    const sim = new Sim(plan)
    const uses: [string, number, number][] = []
    sim.castTrace = (a, t, _rage, mana) => uses.push([plan.abilities[a].id, t, mana])
    sim.runFight(0)
    // The sink spends 100 mana a second: 5,000 → 4,600 at 4 s, when the restore goes.
    const restoreUse = uses.find(([id]) => id === 'restore')!
    expect(restoreUse[1]).toBe(4000)
    expect(restoreUse[2]).toBe(46000)
  })

  it('abilityAuraDown: every one on a line must hold, checked on each walk', () => {
    const plan = noRegen()
    const soc = addPaladinAbility(plan, { ...SEAL_OF_COMMAND, gcdMs: 0 })
    const sor = addPaladinAbility(plan, { ...SEAL_OF_RIGHTEOUSNESS, gcdMs: 0 })
    plan.prepull = { casts: [{ ability: soc, atMs: -1500 }], chargeTenths: 0, keepTenths: -1 }
    // Righteousness only while neither seal is up: not while Command lasts (28.5 s from the pull),
    // nor while its own does.
    plan.rotation.push({
      ability: sor,
      conditions: [
        { code: COND.abilityAuraDown, a: soc, b: 0 },
        { code: COND.abilityAuraDown, a: sor, b: 0 },
      ],
      unqueueBelowTenths: 0,
    })
    plan.fight.durationMs = 40000
    const sim = new Sim(plan)
    const uses: [number, number][] = []
    sim.castTrace = (a, t) => uses.push([a, t])
    sim.runFight(0)
    // Command runs out at 28.5 s; Righteousness goes up then (the aura's end wakes the rotation), once.
    expect(uses.filter(([a]) => a === sor).map(([, t]) => t)).toEqual([28500])
  })
})
