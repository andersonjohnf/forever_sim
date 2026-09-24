// Engine paths every class shares, held to the rules the main paths follow (issue #9): a spell-table
// ability's hit roll, a Holy magic proc's multipliers, a pet's parried attack, a Skyborne's casting
// speed and an on-use item's charges.
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../defaults'
import { buildPlan } from '../plan/build'
import { ACTION, type Plan, SCHOOL, SCHOOL_COUNT, TRIGGER, TRIGGER_COUNT } from '../plan/types'
import type { SimConfig, SpecId } from '../types'
import { FIELD, Sim } from './sim'

const counter = (sim: Sim, row: number, field: number) => sim.counters[row * Object.keys(FIELD).length + field]

/** Refiles the plan's procs under their triggers after a test adds one. */
function refile(plan: Plan): void {
  plan.triggers = Array.from({ length: TRIGGER_COUNT }, () => [])
  plan.procs.forEach((p, i) => plan.triggers[p.trigger].push(i))
}

describe('a spell-table ability’s hit roll (combat-tables §9; spells.md §2, §3)', () => {
  // The bear's Faerie Fire: a binary Nature spell on the spell table, resisted whole at the school's
  // average resistance. It now reads the plan's school numbers, as castSpell does.
  function faerieFire(schools: (plan: Plan) => void) {
    const plan = buildPlan(defaultConfig('druid-feral-bear')).plan
    schools(plan)
    const row = plan.abilities.find((a) => a.id === 'faerieFire')!.source
    const sim = new Sim(plan)
    for (let i = 0; i < 400; i++) sim.runFight(i)
    return counter(sim, row, FIELD.misses) / counter(sim, row, FIELD.casts)
  }
  const plain = (resistance: number, hit = 0) => (plan: Plan) => {
    plan.schools = {
      damage: Array(SCHOOL_COUNT).fill(1),
      taken: Array(SCHOOL_COUNT).fill(1),
      crit: Array(SCHOOL_COUNT).fill(0),
      resistance: Array(SCHOOL_COUNT).fill(resistance),
      ...(hit ? { hit: Array(SCHOOL_COUNT).fill(hit) } : {}),
    }
  }

  it('takes the boss’s resistance after spell penetration and debuffs, and the school’s own spell hit', () => {
    const base = faerieFire(() => {})
    // 300 resistance: a 75% resist chance on top of the miss (the level-based one alone is about 6%).
    expect(faerieFire(plain(300))).toBeGreaterThan(base + 0.5)
    // No resistance and +30% Nature hit: only the 1% floor misses.
    expect(faerieFire(plain(0, 30))).toBeLessThan(0.03)
  })
})

describe('a Holy magic proc (paladin.md#conventions-used-below)', () => {
  it('takes the Holy damage multiplier (Vengeance’s), as a Holy spell does', () => {
    const damage = (holyMult: number) => {
      const plan = buildPlan(defaultConfig('paladin-retribution')).plan
      plan.holyMult = holyMult
      plan.stats.spellCrit = -100
      plan.stats.spellHit = 100
      plan.sources.push({ id: 'testHoly', name: 'Test Holy proc', icon: '' })
      const source = plan.sources.length - 1
      plan.procs.push({
        id: 'testHoly',
        name: 'Test Holy proc',
        trigger: TRIGGER.meleeLanded,
        chance: [1, 1],
        hands: 3,
        icdMs: 0,
        action: ACTION.spellDamage,
        amount: 0,
        a: 100,
        b: 100,
        school: SCHOOL.holy,
        source,
        chainBit: 0,
      })
      refile(plan)
      const sim = new Sim(plan)
      const hits: number[] = []
      sim.damageTrace = (s, d) => {
        if (s === source) hits.push(d)
      }
      sim.runFight(0)
      expect(hits.length).toBeGreaterThan(10)
      return hits[0]
    }
    expect(damage(1.5) / damage(1)).toBeCloseTo(1.5, 9)
  })
})

describe('a pet’s parried attack (damage-and-timing §3.4)', () => {
  it('hastes the boss’s next swing, as your own parried attacks do', () => {
    const swings = (parryHaste: boolean) => {
      const plan = buildPlan(defaultConfig('hunter-beast-mastery')).plan
      // The pet in front of a boss that swings (a tank's fight): the boss parries it.
      plan.pet!.front = true
      plan.fight.bossSwing = { speedSec: 2, unslowedSec: 2, slow: 0, minDamage: 0, maxDamage: 0, canCrush: false, parryHaste, front: false }
      const sim = new Sim(plan)
      let n = 0
      sim.bossTrace = () => n++
      for (let i = 0; i < 50; i++) sim.runFight(i)
      const pet = plan.pet!.source
      return { n, parries: counter(sim, pet, FIELD.parries) }
    }
    const hasted = swings(true)
    const not = swings(false)
    expect(hasted.parries).toBeGreaterThan(100)
    expect(hasted.n).toBeGreaterThan(not.n)
  })
})

describe('Wind Blessed, the Skyborne’s +1% haste (character-stats racials)', () => {
  it('speeds casts too (aura 65), for every class that casts', () => {
    const cases: [SpecId, string][] = [
      ['druid-balance', 'horde-skyborne-windshaper'],
      ['shaman-elemental', 'horde-skyborne-windshaper'],
      ['mage-frost', 'alliance-skyborne-high-order'],
    ]
    for (const [spec, race] of cases) {
      const cast = (r: string) => new Sim(buildPlan({ ...defaultConfig(spec), race: r }).plan).inspect().castHaste
      const human = spec === 'shaman-elemental' ? 'horde-tauren' : spec === 'druid-balance' ? 'horde-tauren' : 'alliance-human'
      expect(cast(race) / cast(human), spec).toBeCloseTo(1.01, 9)
    }
  })
})

describe('an on-use item’s charges (effects/types.ts OnUseSpec.charges)', () => {
  it('cap the Manual Crowd Pummeler at 3 uses a fight, whichever class presses it', () => {
    const cases: [SpecId, SimConfig['rotation']][] = [
      ['warrior-arms', {}],
      ['paladin-retribution', {}],
      ['shaman-enhancement', {}],
      ['druid-feral-cat', {}],
    ]
    for (const [spec, rotation] of cases) {
      const d = defaultConfig(spec)
      const config: SimConfig = { ...d, gear: { ...d.gear, mainHand: { itemId: 9449 }, offHand: undefined }, rotation: { ...d.rotation, ...rotation }, fight: { ...d.fight, durationSec: 900 } }
      const plan = buildPlan(config).plan
      const mcp = plan.abilities.find((a) => a.id === 'manualCrowdPummeler')
      expect(mcp, spec).toBeDefined()
      expect(mcp!.usesPerFight, spec).toBe(3)
      const sim = new Sim(plan)
      let uses = 0
      sim.castTrace = (a) => {
        if (plan.abilities[a].id === 'manualCrowdPummeler') uses++
      }
      sim.runFight(0)
      // A 15-minute fight has room for 5 uses on the 3-minute cooldown; the charges allow 3.
      expect(uses, spec).toBe(3)
    }
  })
})
