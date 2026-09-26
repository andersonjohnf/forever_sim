// The shaman's worked examples through the engine (docs/classes/shaman.md#worked-examples), and its
// procs, spells, mana, totems, buffs and base stats. The examples' inputs are synthetic test inputs
// (test-helpers.ts `examplePlan`), not base stats. The Enhancement priority list and determinism
// are enhancement.test.ts's.
import { describe, expect, it } from 'vitest'
import { decodeTalentCode, pointsPerTree, validateTalentBuild } from '@/data/talents/types'
import { talentRanksByName } from '..'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { BUFFS_BY_ID } from '../../effects/buffs'
import { buffUnusedReason, presetBuffIds } from '../../effects/presets'
import { FIELD, FIELD_COUNT, Sim } from '../../engine/sim'
import { addAbility, expectMean } from '../../engine/test-helpers'
import { buildPlan } from '../../plan/build'
import type { Plan } from '../../plan/types'
import { BASE_PLACEHOLDERS, CLASS_BASE } from '../../stats/base-stats'
import { addPaladinAbility } from '../paladin/test-helpers'
import { FROST_SHOCK, SHAMAN } from './abilities'
import { ENHANCEMENT_IDS as ID } from './enhancement'
import { withTalents } from './talents'
import { abilityOf, auraOf, damagesOf, ENH, events, examplePlan, procOf, row } from './test-helpers'

/** The level-63 boss's average partial resist for a level-60 caster: 0.75 × 24 / 300 (combat-tables §9). */
const RESIST = 0.94
const ranks = (r: Record<string, number>) => new Map(Object.entries(r))
/** A plan spell by its row id. */
const spellOf = (plan: Plan, id: string) => {
  const s = plan.spells!.find((x) => plan.sources[x.source].id === id)
  expect(s, id).toBeDefined()
  return s!
}
/** Fixes a spell's base damage at its average, so each cast deals one exact value. */
const fixSpell = (plan: Plan, id: string, base: number) => Object.assign(spellOf(plan, id), { min: base, max: base })
const counter = (sim: Sim, plan: Plan, id: string, field: number) => sim.counters[row(plan, id) * FIELD_COUNT + field]
/** No glancing-blow reduction: every landed white swing is a plain hit (for exact damage). */
const noGlancing = (plan: Plan) => Object.assign(plan.weapons[0]!, { glanceLow: 1, glanceHigh: 1 })

const SHOCK_AT_ANY_MANA = { [ID.shock]: 'earth', [ID.shockMana]: 0 }

describe('worked example 1: Earth Shock', () => {
  const talents = { Concussion: 5, 'Shamanistic Focus': 1 }

  it('costs 450 × (1 − 0.45) = 247.5 → 247 with Shamanistic Focus, 202 with Convection 5/5 too; Frost Shock 236', () => {
    const plan = examplePlan({ talents, rotation: SHOCK_AT_ANY_MANA })
    expect(plan.abilities[abilityOf(plan, 'earthShock')].costTenths).toBe(2470)
    expect(withTalents(FROST_SHOCK, ranks({ 'Shamanistic Focus': 1 })).costTenths).toBe(2360)
    const convection = examplePlan({ talents: { ...talents, Convection: 5 }, rotation: SHOCK_AT_ANY_MANA })
    expect(convection.abilities[abilityOf(convection, 'earthShock')].costTenths).toBe(2020)
  })

  it('deals (293.06–308.94 + 0.386 × SP) × 1.05 (Concussion) × 0.94 (the average resist): 335.19 at SP 100, from 327.35 to 343.02', () => {
    const es = damagesOf(examplePlan({ talents, rotation: SHOCK_AT_ANY_MANA }), 'earthShock', 40)
    expect(es.length).toBe(400)
    expect(Math.min(...es)).toBeGreaterThanOrEqual((293.06403 + 38.6) * 1.05 * RESIST - 1e-6)
    expect(Math.max(...es)).toBeLessThanOrEqual((308.93597 + 38.6) * 1.05 * RESIST + 1e-6)
    expectMean(es, 335.1852)
  })

  it('crits for ×1.5; Frost Shock deals (278.08–293.92 + 0.386 × SP) × 0.94 = 305.12, which Concussion doesn’t touch', () => {
    const crits = examplePlan({ talents, rotation: SHOCK_AT_ANY_MANA })
    crits.stats.spellCrit = 100
    fixSpell(crits, 'earthShock', 301)
    for (const d of damagesOf(crits, 'earthShock')) expect(d).toBeCloseTo(335.1852 * 1.5, 9)
    const fs = damagesOf(examplePlan({ talents, rotation: { ...SHOCK_AT_ANY_MANA, [ID.shock]: 'frost' } }), 'frostShock', 40)
    expect(Math.min(...fs)).toBeGreaterThanOrEqual((278.076 + 38.6) * RESIST - 1e-6)
    expect(Math.max(...fs)).toBeLessThanOrEqual((293.924 + 38.6) * RESIST + 1e-6)
    expectMean(fs, 305.124)
  })
})

describe('worked example 2: Lightning Bolt and Maelstrom Weapon', () => {
  const talents = { Concussion: 5, 'Maelstrom Weapon': 5 }
  /** Lightning Bolt at `stacks` Maelstrom Weapon stacks, one stack a landed hit, and white swings only. */
  const boltPlan = (stacks: number) => {
    const plan = examplePlan({ talents, rotation: { [ID.bolt]: true, [ID.boltStacks]: stacks }, dropProcs: ['windfuryWeapon'], durationMs: 120000 })
    procOf(plan, 'maelstromWeapon').chance = [1, 1]
    return plan
  }

  it('deals (189.38–210.62 + 0.714 × SP) × 1.05 × 0.94 = 267.87 at SP 100; at 5 stacks it’s instant and free', () => {
    const plan = boltPlan(5)
    const lb = damagesOf(plan, 'lightningBolt', 20)
    expect(Math.min(...lb)).toBeGreaterThanOrEqual((189.3814893 + 71.4) * 1.05 * RESIST - 1e-6)
    expect(Math.max(...lb)).toBeLessThanOrEqual((210.6185107 + 71.4) * 1.05 * RESIST + 1e-6)
    expectMean(lb, 267.8718)
    const { sim, list } = events(plan)
    expect(sim.totalManaSpentTenths).toBe(0)
    // Instant: each bolt's damage comes at its use, and the swings keep their 3.6 s rhythm.
    const swings = list.filter((e) => e.kind === 'swing').map((e) => e.t)
    for (let i = 1; i < swings.length; i++) expect(swings[i] - swings[i - 1]).toBe(3600)
  })

  it('waits for its stacks: one a landed hit here, so the bolt comes on every 5th swing, and the stacks go with it', () => {
    const { list } = events(boltPlan(5))
    const swings = list.filter((e) => e.kind === 'swing').map((e) => e.t)
    const bolts = list.filter((e) => e.kind === 'use' && e.id === 'lightningBolt').map((e) => e.t)
    expect(bolts.length).toBe(Math.floor(swings.length / 5))
    bolts.forEach((t, i) => expect(t).toBe(swings[5 * i + 4]))
  })

  it('each stack cuts its 2.5 s cast and 220 mana by 20%: 4 → 0.5 s and 44, 3 → 1 s and 88, 2 → 1.5 s and 132, 1 → 2 s and 176', () => {
    for (const [stacks, castMs, cost] of [
      [4, 500, 44],
      [3, 1000, 88],
      [2, 1500, 132],
      [1, 2000, 176],
    ] as const) {
      const plan = boltPlan(stacks)
      expect(plan.abilities[abilityOf(plan, 'lightningBolt')]).toMatchObject({ castMs: 2500, costTenths: 2200, stackCastPct: 20, stackCostPct: 20 })
      const { sim, list } = events(plan)
      const swings = list.filter((e) => e.kind === 'swing').map((e) => e.t)
      const bolts = list.filter((e) => e.kind === 'use' && e.id === 'lightningBolt').map((e) => e.t)
      expect(bolts.length, `${stacks}`).toBeGreaterThan(3)
      expect(sim.totalManaSpentTenths, `${stacks}`).toBe(10 * cost * counter(sim, plan, 'lightningBolt', FIELD.casts))
      // The cast stops the swings; they start again from full when it completes [?].
      for (const t of bolts) {
        const next = swings.find((s) => s > t)
        if (next !== undefined) expect(next, `${stacks} stacks, bolt at ${t}`).toBe(t + castMs + 3600)
      }
    }
  })
})

describe('worked example 3: Stormstrike', () => {
  const ss = (o: Parameters<typeof examplePlan>[0] = {}) =>
    examplePlan({ talents: { Stormstrike: 1 }, rotation: { [ID.stormstrike]: true }, dropProcs: ['windfuryWeapon'], ...o })

  it('is normalized weapon damage: 250 + 1200 × 3.3 / 14 = 532.86 on average (482.86–582.86), whatever the weapon’s speed', () => {
    const d = damagesOf(ss(), 'stormstrike', 40)
    expect(Math.min(...d)).toBeGreaterThanOrEqual(482.857 - 1e-3)
    expect(Math.max(...d)).toBeLessThanOrEqual(582.858 + 1e-3)
    expectMean(d, 532.857)
    expectMean(damagesOf(ss({ weapon: { min: 200, max: 300, speedSec: 2.0 } }), 'stormstrike', 40), 532.857)
  })

  it('costs 125 mana, every 8 s, on the global cooldown', () => {
    const plan = ss()
    expect(plan.abilities[abilityOf(plan, 'stormstrike')]).toMatchObject({ kind: 'weaponStrike', costTenths: 1250, cooldownMs: 8000, gcdMs: 1500, normalized: true })
    const { sim, list } = events(plan)
    const uses = list.filter((e) => e.kind === 'use').map((e) => e.t)
    expect(uses).toEqual(Array.from({ length: 8 }, (_, i) => 8000 * i))
    expect(sim.totalManaSpentTenths).toBe(8 * 1250)
  })

  it('rolls the special table once: its crits are the crit slice of every strike, not a share of those that landed', () => {
    const plan = ss({ durationMs: 600000, landNoCrit: false })
    plan.stats.hit = -20
    plan.stats.crit = 30
    const th = new Sim(plan).inspect().specialThresholds
    const sim = new Sim(plan)
    for (let i = 0; i < 40; i++) sim.runFight(i)
    const casts = counter(sim, plan, 'stormstrike', FIELD.casts)
    const crits = counter(sim, plan, 'stormstrike', FIELD.crits) / casts
    const oneRoll = (th[5] - th[4]) / 100
    expect(th[0]).toBeGreaterThan(20)
    expect(Math.abs(crits - oneRoll)).toBeLessThan(4 * Math.sqrt((oneRoll * (1 - oneRoll)) / casts))
  })
})

describe('worked example 4: Stormstrike’s +20% on your next Earth Shock or Lightning Bolt', () => {
  /** Stormstrike, then the spells; the spells fixed at their average base. */
  const plan = (rotation: Record<string, unknown>, spellHit = 100) => {
    const p = examplePlan({
      talents: { Stormstrike: 1, Concussion: 5, 'Maelstrom Weapon': 5 },
      rotation: { [ID.stormstrike]: true, ...rotation } as never,
      dropProcs: ['windfuryWeapon'],
      durationMs: 300000,
    })
    p.stats.spellHit = spellHit
    for (const [id, base] of [
      ['earthShock', 301],
      ['lightningBolt', 200],
      ['frostShock', 286],
    ] as const)
      if (p.spells!.some((s) => p.sources[s.source].id === id)) fixSpell(p, id, base)
    return p
  }
  const BASE: Record<string, number> = { earthShock: 335.1852, lightningBolt: 267.8718, frostShock: 305.124 }

  /**
   * Walks a fight's events: Stormstrike (it always lands here) puts the aura up for 12 s; a landed
   * Earth Shock or Lightning Bolt while it's up deals 20% more and uses it up; a miss (a use with
   * no damage) leaves it. Returns how many boosted and plain hits and misses it saw.
   */
  function walk(p: Plan, boosted: readonly string[], fight = 0) {
    const { list } = events(p, fight)
    let until = -1
    const seen = { boosted: 0, plain: 0, misses: 0 }
    for (let i = 0; i < list.length; i++) {
      const e = list[i]
      if (e.kind === 'use' && e.id === 'stormstrike') until = e.t + 12000
      if (e.kind !== 'use' || !(e.id in BASE)) continue
      const hit = list[i + 1]?.kind === 'damage' && list[i + 1].id === e.id ? list[i + 1] : undefined
      if (!hit) {
        seen.misses++
        continue
      }
      const up = boosted.includes(e.id) && e.t < until
      expect(hit.value, `${e.id} at ${e.t}`).toBeCloseTo(BASE[e.id] * (up ? 1.2 : 1), 6)
      if (up) {
        seen.boosted++
        until = -1
      } else seen.plain++
    }
    return seen
  }

  it('Earth Shock: 335.19 × 1.2 = 402.22 while it’s up, which that shock uses up', () => {
    const p = plan(SHOCK_AT_ANY_MANA)
    const seen = walk(p, ['earthShock'])
    expect(seen.boosted).toBeGreaterThan(10)
    expect(seen.plain).toBeGreaterThan(5)
    // The opening: Stormstrike at 0, Earth Shock at 1.5 s (boosted), the next at 7.5 s (not: the aura is used up).
    const { list } = events(p)
    const shocks = list.filter((e, i) => e.kind === 'damage' && e.id === 'earthShock' && list[i - 1].id === 'earthShock')
    expect(list.find((e) => e.kind === 'use')).toMatchObject({ id: 'stormstrike', t: 0 })
    expect(shocks.slice(0, 2).map((e) => e.t)).toEqual([1500, 7500])
    expect(shocks[0].value).toBeCloseTo(402.22224, 6)
    expect(shocks[1].value).toBeCloseTo(335.1852, 6)
  })

  it('Lightning Bolt too (267.87 × 1.2 = 321.45); a missed spell keeps it', () => {
    const p = plan({ ...SHOCK_AT_ANY_MANA, [ID.bolt]: true }, -10)
    let total = { boosted: 0, plain: 0, misses: 0 }
    for (let f = 0; f < 10; f++) {
      const s = walk(p, ['earthShock', 'lightningBolt'], f)
      total = { boosted: total.boosted + s.boosted, plain: total.plain + s.plain, misses: total.misses + s.misses }
    }
    expect(total.misses).toBeGreaterThan(50)
    expect(total.boosted).toBeGreaterThan(100)
  })

  it('Frost Shock neither gets it nor uses it up: the next Lightning Bolt does', () => {
    const seen = walk(plan({ ...SHOCK_AT_ANY_MANA, [ID.shock]: 'frost', [ID.bolt]: true }), ['lightningBolt'])
    expect(seen.boosted).toBeGreaterThan(5)
  })

  it('needs Stormstrike to land: one that misses puts nothing up', () => {
    const p = plan(SHOCK_AT_ANY_MANA)
    p.stats.hit = -100
    const sim = new Sim(p)
    const es = row(p, 'earthShock')
    sim.damageTrace = (s, d) => s === es && expect(d).toBeCloseTo(335.1852, 6)
    sim.runFight(0)
    expect(counter(sim, p, 'stormstrike', FIELD.misses)).toBe(counter(sim, p, 'stormstrike', FIELD.casts))
    expect(sim.auraUpMs[auraOf(p, 'stormstrike')]).toBe(0)
  })
})

describe('worked example 5: Windfury Weapon', () => {
  const wf = (talents: Record<string, number> = { 'Elemental Weapons': 3 }, o: Parameters<typeof examplePlan>[0] = {}) => examplePlan({ talents, ...o })

  it('grants 2 extra attacks with 333 × 1.4 = 466.2 more attack power at Elemental Weapons 3/3 (333 without)', () => {
    expect(procOf(wf(), 'windfuryWeapon')).toMatchObject({ amount: 2, icdMs: 1500, chance: [0.2, 0.2], hands: 1 })
    expect(procOf(wf(), 'windfuryWeapon').a).toBeCloseTo(466.2, 9)
    expect(procOf(wf({}), 'windfuryWeapon').a).toBe(333)
  })

  it('each extra attack is a white swing with that attack power: 250 + (1200 + 466.2) / 14 × 3.6 = 678.45', () => {
    const plan = wf(undefined, { weapon: { min: 250, max: 250, speedSec: 3.6 } })
    noGlancing(plan)
    procOf(plan, 'windfuryWeapon').chance = [1, 1]
    const d = damagesOf(plan, 'windfuryWeapon', 5)
    expect(d.length).toBeGreaterThan(20)
    for (const x of d) expect(x).toBeCloseTo(250 + (1666.2 / 14) * 3.6, 9)
  })

  it('procs from 20% of the landed main-hand hits, white or Stormstrike, at most once every 1.5 s, and never from its own extra attacks', () => {
    const plan = wf({ 'Elemental Weapons': 3, Stormstrike: 1 }, { rotation: { [ID.stormstrike]: true }, durationMs: 300000 })
    let eligible = 0
    let procs = 0
    for (let f = 0; f < 30; f++) {
      const { list } = events(plan, f)
      let lastProc = -Infinity
      const extras = new Map<number, number>()
      for (let i = 0; i < list.length; i++) {
        const e = list[i]
        if (e.kind === 'swing' && e.id === 'windfuryWeapon') {
          extras.set(e.t, (extras.get(e.t) ?? 0) + 1)
          continue
        }
        const root = (e.kind === 'swing' && e.id !== 'windfuryWeapon') || (e.kind === 'use' && e.id === 'stormstrike')
        if (!root) continue
        // A root hit procs when the next swing is an extra attack at the same moment.
        const procced = list.slice(i + 1).find((x) => x.kind === 'swing' || (x.kind === 'use' && x.id === 'stormstrike'))
        const isProc = procced?.kind === 'swing' && procced.id === 'windfuryWeapon' && procced.t === e.t
        if (e.t - lastProc >= 1500) {
          eligible++
          if (isProc) {
            procs++
            lastProc = e.t
          }
        } else expect(isProc, `a proc ${e.t - lastProc} ms after the last`).toBe(false)
      }
      // Exactly 2 extra attacks a proc: they never proc it again.
      for (const [t, n] of extras) expect(n, `extra attacks at ${t}`).toBe(2)
    }
    expect(eligible).toBeGreaterThan(3000)
    expect(Math.abs(procs / eligible - 0.2)).toBeLessThan(4 * Math.sqrt((0.2 * 0.8) / eligible))
  })
})

describe('worked example 6: Rockbiter Weapon', () => {
  it('+653 × 1.2 = 783.6 attack power with Elemental Weapons 3/3, on before the pull: the sheet rounds it down to 1,983, so a swing deals 250 + 1983 / 14 × 3.6 = 759.91', () => {
    const plan = examplePlan({ talents: { 'Elemental Weapons': 3 }, rotation: { [ID.imbue]: 'rockbiter' }, weapon: { min: 250, max: 250, speedSec: 3.6 } })
    noGlancing(plan)
    const a = abilityOf(plan, 'rockbiterWeapon')
    expect(plan.prepull.casts).toEqual([{ ability: a, atMs: -3000 }])
    expect(plan.auras[plan.abilities[a].aura].ap).toBeCloseTo(783.6, 9)
    expect(plan.procs.map((p) => p.id)).not.toContain('windfuryWeapon')
    const sim = new Sim(plan)
    const white = row(plan, plan.sources[0].id)
    sim.damageTrace = (s, d) => s === white && expect(d).toBeCloseTo(250 + (1983 / 14) * 3.6, 9)
    sim.runFight(0)
    expect(sim.auraUpMs[plan.abilities[a].aura]).toBe(60000)
    expect(sim.totalManaSpentTenths).toBe(0)
  })
})

describe('worked example 7: Flurry’s charges with Windfury Weapon', () => {
  /** Flurry 5/5 up with 3 charges from before the pull, no crits to refresh it, Windfury Weapon on every hit. */
  function flurryPlan(chargeIcdMs?: number) {
    const plan = examplePlan({ talents: { Flurry: 5, 'Elemental Weapons': 3 }, durationMs: 20000 })
    procOf(plan, 'windfuryWeapon').chance = [1, 1]
    const flurry = auraOf(plan, 'shamanFlurry')
    expect(plan.auras[flurry]).toMatchObject({ whiteSwingCharges: 3, whiteSwingChargeIcdMs: 500, haste: 25 })
    if (chargeIcdMs !== undefined) plan.auras[flurry].whiteSwingChargeIcdMs = chargeIcdMs
    const up = addAbility(plan, { ...SHAMAN, id: 'flurryUp', name: 'Flurry', icon: 'x', kind: 'cast', gcdMs: 0, aura: { id: 'shamanFlurry', name: 'Flurry', durationMs: 15000, mods: {} } })
    plan.prepull = { casts: [{ ability: up, atMs: -1000 }], chargeTenths: 0, keepTenths: -1 }
    return plan
  }
  const timerSwings = (plan: Plan) => events(plan).list.filter((e) => e.kind === 'swing' && e.id !== 'windfuryWeapon').map((e) => e.t)

  it('uses at most one charge per 500 ms: the extra attacks at a swing use none, so Flurry lasts 3 swings (0, 2.88, 5.76 s, then 9.36 s)', () => {
    expect(timerSwings(flurryPlan()).slice(0, 5)).toEqual([0, 2880, 5760, 9360, 12960])
  })

  it('without the 500 ms rule the swing and its 2 extra attacks would use all 3 at once', () => {
    expect(timerSwings(flurryPlan(0)).slice(0, 3)).toEqual([0, 3600, 7200])
  })
})

describe('worked example 8: Elemental Devastation', () => {
  it('3/3: a spell crit gives +9% melee crit for 10 s', () => {
    const plan = (ed: number, spellCrit: number) => {
      const p = examplePlan({ talents: { 'Elemental Devastation': ed }, rotation: SHOCK_AT_ANY_MANA, dropProcs: ['windfuryWeapon'], landNoCrit: false, durationMs: 120000 })
      Object.assign(p.stats, { hit: 100, spellHit: 100, crit: 10, spellCrit })
      p.fight.bossCanDodge = false
      return p
    }
    const on = plan(3, 100)
    expect(on.auras[auraOf(on, 'elementalDevastation')]).toMatchObject({ durationMs: 10000, crit: 9 })
    const whiteCrits = (p: Plan) => {
      const sim = new Sim(p)
      for (let i = 0; i < 150; i++) sim.runFight(i)
      const r = p.sources[0].id
      return { share: counter(sim, p, r, FIELD.crits) / counter(sim, p, r, FIELD.casts), up: sim.auraUpMs, n: counter(sim, p, r, FIELD.casts) }
    }
    const a = whiteCrits(on)
    // The shock at 0 crits, and one every 6 s keeps it up all fight.
    expect(a.up[auraOf(on, 'elementalDevastation')]).toBeCloseTo(150 * 120000, -4)
    const b = whiteCrits(plan(3, -100))
    expect(b.up[auraOf(on, 'elementalDevastation')]).toBe(0)
    expect(Math.abs(a.share - b.share - 0.09)).toBeLessThan(4 * Math.sqrt((0.25 * 2) / a.n))
  })
})

describe('worked example 9: mana ticks and the five-second rule', () => {
  it('the default setup: 3,925 mana, Spirit 168 → 15 + 168 / 5 = 48.6 a tick, mp5 61 → 24.4 a tick', () => {
    const plan = buildPlan(defaultConfig(ENH)).plan
    expect(plan.mana).toMatchObject({ maxTenths: 39250, regenTickTenths: 486, mp5TickTenths: 244, fiveSecondRuleMs: 5000 })
    // Improved Stormstrike's 50% inside the rule is its aura's mana hook (docs/mechanics/spells.md §8).
    expect(plan.auras.find((a) => a.id === 'improvedStormstrike')?.castingRegen).toBe(50)
  })

  /** Every mana tick of a fight with Stormstrike every 8 s, and the last Stormstrike before each. */
  function ticks(improved: number) {
    const plan = examplePlan({ talents: { Stormstrike: 1, 'Improved Stormstrike': improved }, rotation: { [ID.stormstrike]: true }, dropProcs: ['windfuryWeapon'], durationMs: 120000 })
    Object.assign(plan.mana!, { regenTickTenths: 486, mp5TickTenths: 244 })
    const { list } = events(plan)
    let last = -Infinity
    const out: { since: number; tenths: number }[] = []
    for (const e of list) {
      if (e.kind === 'use' && e.id === 'stormstrike') last = e.t
      if (e.kind === 'tick') out.push({ since: e.t - last, tenths: e.value })
    }
    return out
  }

  it('73.0 a tick outside the rule, 24.4 inside it, and 24.4 + 24.3 = 48.7 inside it with Improved Stormstrike’s 50%', () => {
    for (const [improved, inside] of [
      [0, 244],
      [2, 244 + 243],
    ] as const) {
      const list = ticks(improved)
      expect(list.length).toBe(60)
      for (const { since, tenths } of list) expect(tenths, `${since} ms after Stormstrike`).toBeCloseTo(since >= 5000 ? 730 : inside, 9)
      expect(list.some((x) => x.since < 5000)).toBe(true)
      expect(list.some((x) => x.since >= 5000)).toBe(true)
    }
  })

  it('a free Lightning Bolt (5 stacks) starts no five-second rule; one that costs mana does', () => {
    for (const [stacks, anyInside] of [
      [5, false],
      [4, true],
    ] as const) {
      const plan = examplePlan({ talents: { 'Maelstrom Weapon': 5 }, rotation: { [ID.bolt]: true, [ID.boltStacks]: stacks }, dropProcs: ['windfuryWeapon'] })
      procOf(plan, 'maelstromWeapon').chance = [1, 1]
      Object.assign(plan.mana!, { regenTickTenths: 486, mp5TickTenths: 0 })
      const values = events(plan).list.filter((e) => e.kind === 'tick').map((e) => e.value)
      expect(values.some((v) => v === 0), `${stacks}`).toBe(anyInside)
      expect(values.some((v) => v === 486)).toBe(true)
    }
  })
})

describe('worked example 10: Intellect’s attack power and spell damage', () => {
  it('the default setup’s 179 Intellect gives +179 attack power (Mental Dexterity 3/3) and +53 spell damage (30%, rounded down; Mental Quickness 2/2)', () => {
    const bundle = buildPlan(defaultConfig(ENH))
    expect(bundle.sheet.intellect).toBe(179)
    expect(bundle.plan.stats).toMatchObject({ apPerInt: 1, spellDamagePerIntPct: 30, intMult: expect.closeTo(1.21, 12) })
    const withIt = new Sim(bundle.plan).inspect()
    const bare = buildPlan(defaultConfig(ENH)).plan
    Object.assign(bare.stats, { apPerInt: 0, spellDamagePerIntPct: 0 })
    const without = new Sim(bare).inspect()
    expect(withIt.attackPower - without.attackPower).toBe(179)
    expect(withIt.spellDamage).toBe(53)
    expect(without.spellDamage).toBe(0)
    expect(bundle.sheet.spell!.holyDamage).toBe(53)
  })
})

describe('worked example 11: the shocks on the spell table', () => {
  it('miss 17% − spell hit against a level-63 boss (the default setup’s 8% → 9%), and are never dodged, parried or blocked', () => {
    expect(new Sim(buildPlan(defaultConfig(ENH)).plan).inspect().spellMiss).toBe(9)
    const plan = examplePlan({ rotation: SHOCK_AT_ANY_MANA, durationMs: 600000, dropProcs: ['windfuryWeapon'] })
    plan.stats.spellHit = 0
    Object.assign(plan.fight, { bossCanDodge: true, bossCanParry: true, bossCanBlock: true })
    expect(new Sim(plan).inspect().spellMiss).toBe(17)
    const sim = new Sim(plan)
    for (let i = 0; i < 40; i++) sim.runFight(i)
    const casts = counter(sim, plan, 'earthShock', FIELD.casts)
    const misses = counter(sim, plan, 'earthShock', FIELD.misses) / casts
    expect(Math.abs(misses - 0.17)).toBeLessThan(4 * Math.sqrt((0.17 * 0.83) / casts))
    for (const f of [FIELD.dodges, FIELD.parries, FIELD.blocks, FIELD.glances]) expect(counter(sim, plan, 'earthShock', f)).toBe(0)
  })

  it('share one 6 s cooldown: with Frost Shock first in the list, Earth Shock never goes', () => {
    const plan = examplePlan({ talents: { 'Shamanistic Focus': 1 }, rotation: SHOCK_AT_ANY_MANA, dropProcs: ['windfuryWeapon'] })
    const fs = addPaladinAbility(plan, withTalents(FROST_SHOCK, ranks({ 'Shamanistic Focus': 1 })))
    plan.rotation.unshift({ ability: fs, conditions: [], unqueueBelowTenths: 0 })
    const { list } = events(plan)
    const uses = list.filter((e) => e.kind === 'use')
    expect(uses.map((e) => e.id)).toEqual(Array(10).fill('frostShock'))
    expect(uses.map((e) => e.t)).toEqual(Array.from({ length: 10 }, (_, i) => 6000 * i))
  })
})

describe('Windfury Totem and Windfury Weapon (shaman.md#totems)', () => {
  const config = (imbue: string) => {
    const d = defaultConfig(ENH)
    return { ...d, rotation: { [ID.imbue]: imbue }, buffs: { ...d.buffs, enabled: [...d.buffs.enabled.filter((b) => b !== 'graceOfAir'), 'windfuryTotem'] } }
  }

  it('Windfury Weapon leaves the totem’s proc out, and the results say so', () => {
    const bundle = buildPlan(config('windfury'))
    const ids = bundle.plan.procs.map((p) => p.id)
    expect(ids).toContain('windfuryWeapon')
    expect(ids).not.toContain('windfury')
    expect(bundle.assumptions.map((a) => a.id)).toContain('windfuryWeaponTotem')
  })

  it('Rockbiter Weapon keeps it', () => {
    const bundle = buildPlan(config('rockbiter'))
    expect(bundle.plan.procs.map((p) => p.id)).toContain('windfury')
    expect(bundle.assumptions.map((a) => a.id)).not.toContain('windfuryWeaponTotem')
  })

  it('no preset gives the Enhancement shaman Windfury Totem: its air totem is its own Grace of Air, with Strength of Earth and Mana Spring', () => {
    for (const preset of ['raid', 'max'] as const) {
      const ids = presetBuffIds(preset, ENH, defaultConfig(ENH).buffs.raid)
      expect(ids, preset).not.toContain('windfuryTotem')
      expect(ids, preset).toEqual(expect.arrayContaining(['graceOfAir', 'strengthOfEarth', 'manaSpringTotem']))
      expect(presetBuffIds(preset, 'warrior-fury', defaultConfig(ENH).buffs.raid), preset).toContain('windfuryTotem')
    }
    // They're its own: Self only brings them, with no other shaman in the raid.
    expect(presetBuffIds('self', ENH, []).sort()).toEqual(['graceOfAir', 'manaSpringTotem', 'strengthOfEarth'])
    expect(presetBuffIds('raid', ENH, [])).toEqual(expect.arrayContaining(['graceOfAir', 'strengthOfEarth', 'manaSpringTotem']))
  })
})

describe('weapon stones and oils (shaman.md#weapon-imbues)', () => {
  it('are unused for a shaman, whose imbue is its main hand’s temporary enchant; the plan leaves them out', () => {
    for (const id of ['denseSharpeningStone', 'elementalSharpeningStone']) {
      expect(buffUnusedReason(BUFFS_BY_ID.get(id)!, ENH), id).toBe('Not used: your weapon imbue is your main hand’s temporary enchant')
      expect(buffUnusedReason(BUFFS_BY_ID.get(id)!, 'warrior-fury'), id).toBeUndefined()
    }
    expect(buffUnusedReason(BUFFS_BY_ID.get('elixirOfTheMongoose')!, ENH)).toBeUndefined()
    const d = defaultConfig(ENH)
    const plain = buildPlan(d).plan
    const stoned = buildPlan({ ...d, buffs: { ...d.buffs, enabled: [...d.buffs.enabled, 'elementalSharpeningStone'] } }).plan
    expect(stoned.weapons).toEqual(plain.weapons)
    expect(stoned.stats).toEqual(plain.stats)
  })
})

describe('base stats (shaman.md#base-stats)', () => {
  it('the attributes, attack power, health, crit and spell crit are D24 placeholders, and the sheet says so', () => {
    const bundle = buildPlan(defaultConfig(ENH))
    expect(bundle.sheet.placeholders).toEqual(['base attributes', 'base attack power', 'base health', 'base crit', 'base spell crit'])
    expect(bundle.assumptions.map((a) => a.id)).toContain('baseStatPlaceholders')
    expect(bundle.plan.stats).toMatchObject({ baseStr: 88, baseAgi: 52, baseSta: 97, baseInt: 87, baseSpi: 103, baseAp: 100, baseCrit: 1.7, baseSpellCrit: 2.3, baseHealth: 1280, baseMana: 1520 })
    expect(BASE_PLACEHOLDERS.shaman).toMatchObject({ baseAp: 100, baseHealth: 1280, baseCrit: 1.7, baseSpellCrit: 2.3, baseDodge: 1.7 })
    expect(BASE_PLACEHOLDERS.shaman.attributes).toEqual({
      'horde-orc': { str: 88, agi: 52, sta: 97, int: 87, spi: 103 },
      'horde-tauren': { str: 90, agi: 50, sta: 97, int: 85, spi: 102 },
      'horde-troll': { str: 86, agi: 57, sta: 96, int: 86, spi: 101 },
      'horde-skyborne-windshaper': { str: 85, agi: 55, sta: 95, int: 90, spi: 100 },
      'alliance-dwarf': { str: 87, agi: 51, sta: 98, int: 89, spi: 99 },
    })
  })

  it('the client’s values: 1,520 base mana, 19.69 Agility and 59.17 Intellect per 1% crit', () => {
    expect(CLASS_BASE.shaman).toMatchObject({ baseMana: 1520, critPerAgi: 0.0508, spellCritPerInt: 0.0169, baseParry: 0 })
    expect(1 / CLASS_BASE.shaman.critPerAgi).toBeCloseTo(19.69, 2)
    expect(1 / CLASS_BASE.shaman.spellCritPerInt).toBeCloseTo(59.17, 2)
  })
})

describe('the default talents (shaman.md#talents)', () => {
  const DEFAULT = '050003-055030031005102251-05005'

  it('decode to Elemental 8 / Enhancement 33 / Restoration 10, a valid build', () => {
    const data = TALENT_DATA.shaman
    expect(defaultConfig(ENH).talents).toBe(DEFAULT)
    const ids = decodeTalentCode(data, DEFAULT)
    expect(pointsPerTree(data, ids)).toEqual([8, 33, 10])
    expect(validateTalentBuild(data, ids)).toEqual([])
    expect(Object.fromEntries(talentRanksByName(data, DEFAULT))).toEqual({
      Concussion: 5,
      'Elemental Devastation': 3,
      'Thundering Strikes': 5,
      'Ancestral Knowledge': 5,
      'Mental Dexterity': 3,
      'Elemental Weapons': 3,
      'Shamanistic Focus': 1,
      Flurry: 5,
      Stormstrike: 1,
      'Mental Quickness': 2,
      'Improved Stormstrike': 2,
      'Maelstrom Weapon': 5,
      'Rage of the Farseer': 1,
      'Totemic Focus': 5,
      'Tidal Focus': 5,
    })
  })

  it('give +5% crit to attacks and spells alike, +5% hit to both, and +10% Intellect', () => {
    const stats = buildPlan(defaultConfig(ENH)).plan.stats
    const bare = buildPlan({ ...defaultConfig(ENH), talents: '' }).plan.stats
    expect(stats.crit - bare.crit).toBe(5)
    expect(stats.spellCrit - bare.spellCrit).toBe(5)
    expect(stats.hit - bare.hit).toBe(5)
    expect(stats.spellHit - bare.spellHit).toBe(5)
    expect(stats.intMult / bare.intMult).toBeCloseTo(1.1, 12)
  })
})
