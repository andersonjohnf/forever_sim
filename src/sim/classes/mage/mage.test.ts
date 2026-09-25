// The mage's worked examples through the engine (docs/classes/mage.md#worked-examples), and its
// talents, cooldowns, procs, mana and priority lists. The examples' inputs are synthetic test inputs
// (test-helpers.ts `examplePlan`), not base stats. The goldens and determinism are the
// {fire,frost,arcane}-golden.test.ts files'; the numbers against the client are data.test.ts's.
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../defaults'
import { FIELD, FIELD_COUNT, Sim } from '../../engine/sim'
import { at } from '../../engine/test-helpers'
import { buildPlan } from '../../plan/build'
import { COND, type Plan, SCHOOL } from '../../plan/types'
import { addPaladinAbility } from '../paladin/test-helpers'
import { FROSTBOLT, FROSTBOLT_SPELL, PRESENCE_OF_MIND } from './abilities'
import { FIRE_WAIT_MS, MAGE_IDS, MAGE_OPTIONS } from './rotation'
import { withSpellTalents, withTalents } from './talents'
import { toResult } from '../../run/aggregate'
import { abilityOf, auraOf, auraState, damagesOf, events, examplePlan, fixSpell, procOf, row, run, runFights, SPEC_ID, spellOf, type MageSpec } from './test-helpers'

/** The level-63 boss's average partial resist for a level-60 caster: 0.75 × 24 / 300 (combat-tables §9). */
const RESIST = 0.94
const F = MAGE_IDS.fire
const FR = MAGE_IDS.frost
const A = MAGE_IDS.arcane
const ranks = (r: Record<string, number>) => new Map(Object.entries(r))
const counter = (sim: Sim, plan: Plan, id: string, field: number) => sim.counters[row(plan, id) * FIELD_COUNT + field]
/** The pool between consecutive uses of an ability, in tenths: what each use cost (no regeneration in the examples). */
const spent = (uses: { value: number }[]) => uses.slice(1).map((u, i) => uses[i].value - u.value)
const near = (x: number, p: number, n: number) => expect(Math.abs(x - p)).toBeLessThanOrEqual(4 * Math.sqrt((p * (1 - p)) / n) + 1e-12)

describe('worked examples (docs/classes/mage.md#worked-examples)', () => {
  it('1. a Fireball hit: (483 + 400) × 1.10 Fire Power × 1.03 Arcane Instability × 1.15 five Fire Vulnerability × 1.10 Curse of the Elements × 0.94 = 1,189.62', () => {
    const plan = examplePlan({
      talents: { 'Fire Power': 5, 'Arcane Instability': 3, 'Improved Scorch': 3 },
      rotation: { [F.scorch]: true },
      sp: 400,
      buffs: ['curseOfTheElements'],
    })
    // Curse of the Elements' −75 can't take the boss below its own 0: the level's 24 stays (spells.md §3).
    expect(plan.schools!.resistance[SCHOOL.fire]).toBe(24)
    expect(plan.schools!.taken[SCHOOL.fire]).toBeCloseTo(1.1, 12)
    fixSpell(plan, 'fireball', 451)
    const { damage, uses } = events(plan, ['fireVulnerability'])
    expect(uses('fireball')[0].stacks.fireVulnerability).toBe(5)
    const expected = 851 * 1.1 * 1.03 * 1.15 * 1.1 * RESIST
    expect(expected).toBeCloseTo(1146.510005, 5)
    for (const d of damage('fireball')) expect(d.value).toBeCloseTo(expected, 9)
    // Its range: 396.57–505.43 base, so 1,073.18 to 1,219.84.
    const fb = spellOf(examplePlan({ talents: { 'Fire Power': 5 } }), 'fireball')
    expect(((fb.min + 400) * 1.1 * 1.03 * 1.15 * 1.1 * RESIST).toFixed(2)).toBe('1073.18')
    expect(((fb.max + 400) * 1.1 * 1.03 * 1.15 * 1.1 * RESIST).toFixed(2)).toBe('1219.84')
  })

  it('2. a Frostbolt r10 crit with Ice Shards 5/5: (397.6 + 0.814 × 400) × 2.0 = 1,446.4; binary, so no partial resist', () => {
    const plan = examplePlan({ spec: 'frost', talents: { 'Ice Shards': 5 }, sp: 400, spellCrit: 200 })
    expect(spellOf(plan, 'frostbolt').critMultiplier).toBeCloseTo(2, 12)
    fixSpell(plan, 'frostbolt', 397.6)
    const bolts = damagesOf(plan, 'frostbolt')
    expect(bolts.length).toBeGreaterThan(10)
    for (const d of bolts) expect(d).toBeCloseTo(1446.4, 9)
    const fb = spellOf(examplePlan({ spec: 'frost' }), 'frostbolt')
    expect(((fb.min + 325.6) * 2).toFixed(2)).toBe('1416.97')
    expect(((fb.max + 325.6) * 2).toFixed(2)).toBe('1475.83')
  })

  it('3. Ignite from one 1,000 crit: 40% = 400 in the pool, 2 ticks of 200 × 0.94 = 188, 2 s and 4 s after it', () => {
    const plan = examplePlan({ talents: { Ignite: 5 }, spellCrit: 200, durationMs: 9500 })
    // One Fireball crit of exactly 1,000 at 5 s (a 5 s cast, so the next lands at 10 s, after the fight).
    fixSpell(plan, 'fireball', 1000 / (1.5 * RESIST))
    plan.abilities[abilityOf(plan, 'fireball')].castMs = 5000
    const { damage } = events(plan)
    expect(damage('fireball').map((d) => [d.t, Math.round(d.value * 1e6) / 1e6])).toEqual([[5000, 1000]])
    expect(damage('ignite').map((d) => d.t)).toEqual([7000, 9000])
    for (const d of damage('ignite')) expect(d.value).toBeCloseTo(188, 9)
  })

  it('4. Scorch refresh: five Scorches (0–7.5 s) keep 5 stacks to 37.5 s; the Fireball at 32 s sees 5.5 s left, at 35.5 s 2 s ≤ 5 s, so Scorch, landing at 37 s', () => {
    const plan = examplePlan({ talents: { 'Improved Scorch': 3 }, rotation: { [F.scorch]: true } })
    const { uses } = events(plan, ['fireVulnerability'])
    expect(uses('scorch').map((u) => u.t)).toEqual([0, 1500, 3000, 4500, 6000, 35500])
    expect(uses('scorch').map((u) => u.stacks.fireVulnerability)).toEqual([0, 1, 2, 3, 4, 5])
    expect(uses('fireball').map((u) => u.t).slice(0, 9)).toEqual([7500, 11000, 14500, 18000, 21500, 25000, 28500, 32000, 37000])
  })

  it('5. Pyroblast at 3 Hot Streak stacks: 6 s × (1 − 3 × 0.25) = 1.5 s', () => {
    const plan = examplePlan({ talents: { 'Hot Streak': 1, Pyroblast: 1 }, rotation: { [F.pyroblast]: true, [F.pyroblastStacks]: 3 }, spellCrit: 200 })
    const { list } = events(plan, ['hotStreak'])
    const casts = list.filter((e) => e.kind === 'use').slice(0, 5)
    expect(casts.map((u) => [u.id, u.t, u.stacks.hotStreak])).toEqual([
      ['fireball', 0, 0],
      ['fireball', 3500, 1],
      ['fireball', 7000, 2],
      ['pyroblast', 10500, 3],
      ['fireball', 12000, 0],
    ])
  })
})

describe('Ignite (docs/classes/mage.md#ignite): pooled and rolling [?]', () => {
  /** Fireball crits of exactly 1,000 × 0.94 × 1.5 = 1,410, every 3.5 s. */
  const ignitePlan = (o: Parameters<typeof examplePlan>[0] = {}) => {
    const plan = examplePlan({ talents: { Ignite: 5 }, spellCrit: 200, ...o })
    fixSpell(plan, 'fireball', 1000)
    return plan
  }

  it('puts 40% (8% a rank) of each Fire crit in a pool dealt over 2 ticks, 2 s apart; a crit while a tick is due keeps its time and resets the ticks left to 2', () => {
    expect(examplePlan({ talents: { Ignite: 1 } }).ignite).toMatchObject({ pct: 8, ticks: 2, tickMs: 2000, school: SCHOOL.fire })
    expect(examplePlan().ignite).toBeUndefined()
    const { damage } = events(ignitePlan())
    const crit = 1000 * RESIST * 1.5
    const first = ((0.4 * crit) / 2) * RESIST
    // 3.5 s: 564 in; 5.5 s: 282 out. 7 s: 282 + 564 = 846 over 2 ticks, the one due at 7.5 s keeping its time.
    const rolled = ((0.4 * crit) / 2 + 0.4 * crit) / 2 * RESIST
    expect(first).toBeCloseTo(265.08, 9)
    expect(rolled).toBeCloseTo(397.62, 9)
    const ticks = damage('ignite').slice(0, 6)
    expect(ticks.map((d) => d.t)).toEqual([5500, 7500, 9500, 12500, 14500, 16500])
    ticks.forEach((d, i) => expect(d.value, String(d.t)).toBeCloseTo([first, rolled, rolled][i % 3], 9))
  })

  it('takes the average resist again at each tick, but not the boss’s Fire damage taken: the crit carries it (Curse of the Elements: 1,551 crit, 291.59 a first tick; 1.60.1.70009’s no double dip)', () => {
    const { damage } = events(ignitePlan({ buffs: ['curseOfTheElements'] }))
    expect(damage('fireball')[0].value).toBeCloseTo(1000 * 1.1 * RESIST * 1.5, 9)
    expect(damage('ignite')[0].value).toBeCloseTo(((0.4 * 1551) / 2) * RESIST, 9)
    expect(damage('ignite')[0].value).toBeCloseTo(291.588, 9)
  })

  it('never crits or misses; its row counts the crits that fed it (casts) and its ticks (hits); a non-crit feeds nothing', () => {
    const plan = ignitePlan({ spellHit: 0 })
    const sim = run(plan, 20)
    const fed = counter(sim, plan, 'ignite', FIELD.casts)
    expect(fed).toBe(counter(sim, plan, 'fireball', FIELD.crits))
    expect(counter(sim, plan, 'fireball', FIELD.misses)).toBeGreaterThan(0)
    expect(counter(sim, plan, 'ignite', FIELD.crits)).toBe(0)
    expect(counter(sim, plan, 'ignite', FIELD.misses)).toBe(0)
    expect(counter(sim, plan, 'ignite', FIELD.hits)).toBe(damagesOf(plan, 'ignite', 20).length)
    const none = ignitePlan({ spellCrit: -100 })
    expect(damagesOf(none, 'ignite', 3)).toEqual([])
  })

  it('isn’t fed by a Frost or Arcane crit', () => {
    const frost = examplePlan({ spec: 'frost', talents: { Ignite: 5 }, spellCrit: 200 })
    expect(damagesOf(frost, 'ignite', 2)).toEqual([])
    expect(damagesOf(frost, 'frostbolt', 2).length).toBeGreaterThan(0)
  })
})

describe('Improved Scorch (docs/classes/mage.md#improved-scorch)', () => {
  const scorchPlan = (o: Parameters<typeof examplePlan>[0] = {}) => {
    const plan = examplePlan({ talents: { 'Improved Scorch': 3 }, rotation: { [F.scorch]: true }, ...o })
    fixSpell(plan, 'scorch', 100)
    fixSpell(plan, 'fireball', 1000)
    return plan
  }

  it('each landed Scorch adds a Fire Vulnerability stack (+3% Fire damage taken, 5 at most, 30 s), after its own damage; 33 / 67 / 100% by rank', () => {
    const plan = scorchPlan()
    expect(procOf(plan, 'improvedScorch').chance[0]).toBe(1)
    expect(procOf(examplePlan({ talents: { 'Improved Scorch': 1 }, rotation: { [F.scorch]: true } }), 'improvedScorch').chance[0]).toBeCloseTo(0.33, 12)
    const fv = plan.auras[auraOf(plan, 'fireVulnerability')]
    expect([fv.durationMs, fv.maxStacks]).toEqual([30000, 5])
    const { damage } = events(plan)
    expect(damage('scorch').slice(0, 5).map((d) => d.t)).toEqual([1500, 3000, 4500, 6000, 7500])
    damage('scorch')
      .slice(0, 5)
      .forEach((d, k) => expect(d.value).toBeCloseTo(100 * RESIST * (1 + 0.03 * k), 9))
    // Fireballs and their DoT ticks at 5 stacks: ×1.15.
    for (const d of damage('fireball').filter((x) => x.t < 37000)) expect(d.value).toBeCloseTo(1000 * RESIST * 1.15, 9)
    for (const d of damage('fireballDot').filter((x) => x.t < 37000)) expect(d.value).toBeCloseTo(14 * RESIST * 1.15, 9)
  })

  it('multiplies the crit that feeds Ignite, not Ignite’s ticks again: 1,621.5 crit, a first tick of 0.4 × 1,621.5 / 2 × 0.94 (1.60.1.70009’s no double dip)', () => {
    const plan = scorchPlan({ talents: { 'Improved Scorch': 3, Ignite: 5 } })
    // Only Fireball crits (Scorch never does), so the Scorches feed nothing.
    spellOf(plan, 'fireball').bonusCrit = 300
    const { damage } = events(plan)
    const crit = 1000 * RESIST * 1.15 * 1.5
    expect(damage('fireball')[0]).toMatchObject({ t: 11000 })
    expect(damage('fireball')[0].value).toBeCloseTo(crit, 9)
    expect(damage('ignite')[0]).toMatchObject({ t: 13000 })
    expect(damage('ignite')[0].value).toBeCloseTo(((0.4 * crit) / 2) * RESIST, 9)
  })

  it('the Fire priority casts Scorch until 5 stacks (COND 42), and again at ≤ the refresh setting’s time left (COND 43) or before a Fireball would let them run out (COND 44)', () => {
    const plan = scorchPlan()
    const scorch = abilityOf(plan, 'scorch')
    const fv = auraOf(plan, 'fireVulnerability')
    const lines = plan.rotation.filter((r) => r.ability === scorch)
    expect(lines.map((r) => r.conditions)).toEqual([
      [{ code: COND.auraStacksBelow, a: fv, b: 5 }],
      [{ code: COND.auraEndsWithin, a: fv, b: 5000 }],
      [{ code: COND.auraEndsBeforeCasts, a: fv, b: abilityOf(plan, 'fireball') }],
    ])
    // At 10 s left, the Fireball landing at 28.5 s (9 s left) is followed by a Scorch.
    const ten = scorchPlan({ rotation: { [F.scorch]: true, [F.scorchRefresh]: 10 } })
    expect(events(ten).uses('scorch').map((u) => u.t)).toEqual([0, 1500, 3000, 4500, 6000, 28500, 51000])
    // Without the talent there's no Scorch line.
    expect(examplePlan({ rotation: { [F.scorch]: true } }).abilities.some((a) => a.id === 'scorch')).toBe(false)
  })
})

describe('Combustion (docs/classes/mage.md#combustion)', () => {
  const combustionPlan = (o: Parameters<typeof examplePlan>[0] = {}) => examplePlan({ talents: { Combustion: 1 }, rotation: { [F.combustion]: true }, ...o })

  it('gives the first Fire spell after it +10% Fire crit, +10% more for each Fire spell that hits (up to 10 stacks)', () => {
    const plan = combustionPlan()
    const sim = new Sim(plan)
    const st = auraState(sim)
    const comb = auraOf(plan, 'combustion')
    const seen: [number, number][] = []
    sim.castTrace = (a) => {
      if (plan.abilities[a].id === 'fireball') seen.push([st.auraActive[comb] ? st.auraStacks[comb] : 0, st.schCrit[SCHOOL.fire]])
    }
    sim.runFight(0)
    expect(seen.slice(0, 12)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10].map((n) => [n, 10 * n]))
  })

  it('ends after 4 Fire crits; its 3 min cooldown starts as it ends', () => {
    const plan = combustionPlan({ spellCrit: 200, durationMs: 400000 })
    const { uses } = events(plan, ['combustion'])
    expect(uses('fireball').slice(0, 5).map((u) => [u.t, u.stacks.combustion, u.charges.combustion])).toEqual([
      [0, 1, 4],
      [3500, 2, 3],
      [7000, 3, 2],
      [10500, 4, 1],
      [14000, 0, 0],
    ])
    // The 4th crit lands at 14 s: ready at 194 s, the first moment the rotation walks after it.
    const again = uses('combustion').map((u) => u.t)
    expect(again[0]).toBe(0)
    expect(again[1]).toBeGreaterThanOrEqual(194000)
    expect(again[1]).toBeLessThan(194000 + 3500)
  })

  it('a Frost crit uses no charge, and a Frost hit adds no stack', () => {
    const plan = combustionPlan({ spellCrit: 200 })
    const t = ranks({ Combustion: 1 })
    const fb = addPaladinAbility(plan, { ...withTalents(FROSTBOLT, t), cooldownMs: 10000 })
    // Frostbolt first when it's ready, else Fireball.
    plan.rotation.splice(plan.rotation.length - 1, 0, { ability: fb, conditions: [], unqueueBelowTenths: 0 })
    const { list } = events(plan, ['combustion'])
    const casts = list.filter((e) => e.kind === 'use' && e.id !== 'combustion').slice(0, 7)
    expect(casts.map((u) => [u.id, u.t, u.stacks.combustion, u.charges.combustion])).toEqual([
      ['frostbolt', 0, 1, 4],
      ['fireball', 3000, 1, 4],
      ['fireball', 6500, 2, 3],
      ['fireball', 10000, 3, 2],
      ['frostbolt', 13500, 4, 1],
      ['fireball', 16500, 4, 1],
      ['fireball', 20000, 0, 0],
    ])
  })

  it('holds Presence of Mind (category 1151) while it’s up, and gives it the same cooldown as it ends', () => {
    const plan = combustionPlan({ talents: { Combustion: 1, 'Presence of Mind': 1 }, spellCrit: 200, durationMs: 200000 })
    const pom = addPaladinAbility(plan, withTalents(PRESENCE_OF_MIND, ranks({ 'Presence of Mind': 1 })))
    const fireball = abilityOf(plan, 'fireball')
    plan.abilities[fireball].instantAura = auraOf(plan, 'presenceOfMind')
    expect([plan.abilities[abilityOf(plan, 'combustion')].category, plan.abilities[pom].category]).toEqual(['talentDps', 'talentDps'])
    // Combustion once, at the pull; Presence of Mind whenever it's ready.
    plan.rotation[0].conditions = at(plan, 0)
    plan.rotation.splice(1, 0, { ability: pom, conditions: [], unqueueBelowTenths: 0 })
    const { uses, sim } = events(plan)
    expect(uses('combustion').map((u) => u.t)).toEqual([0])
    const pomAt = uses('presenceOfMind').map((u) => u.t)
    expect(pomAt.length).toBe(1)
    expect(pomAt[0]).toBeGreaterThanOrEqual(194000)
    expect(pomAt[0]).toBeLessThan(194000 + 3500)
    expect(auraState(sim).abReadyAt[abilityOf(plan, 'combustion')]).toBe(194000 + 180000)
  })
})

describe('Hot Streak (docs/classes/mage.md#hot-streak)', () => {
  it('crits of Fireball, Fire Blast and Scorch add stacks, up to 3; Pyroblast’s own crit doesn’t', () => {
    const all = examplePlan({ talents: { 'Hot Streak': 1, Pyroblast: 1, 'Improved Scorch': 3 }, rotation: { [F.scorch]: true, [F.fireBlast]: true } })
    expect(all.procs.filter((p) => p.id.startsWith('hotStreak')).map((p) => [p.id, p.fromSource])).toEqual(
      ['fireball', 'fireBlast', 'scorch'].map((id) => [`hotStreak.${id}`, row(all, id)]),
    )
    // A spell the plan doesn't cast leaves its proc out.
    const plan = examplePlan({ talents: { 'Hot Streak': 1, Pyroblast: 1 }, spellCrit: 200 })
    expect(plan.procs.filter((p) => p.id.startsWith('hotStreak')).map((p) => p.id)).toEqual(['hotStreak.fireball'])
    expect(plan.auras[auraOf(plan, 'hotStreak')]).toMatchObject({ maxStacks: 3, durationMs: 20000 })
    expect(events(plan, ['hotStreak']).uses('fireball').slice(0, 6).map((u) => u.stacks.hotStreak)).toEqual([0, 1, 2, 3, 3, 3])
    const pyro = examplePlan({ talents: { 'Hot Streak': 1, Pyroblast: 1 }, rotation: { [F.pyroblast]: true, [F.pyroblastStacks]: 1 }, spellCrit: 200 })
    // Pyroblast at 1 stack: 6 s × 0.75 = 4.5 s, and it leaves none.
    const casts = events(pyro, ['hotStreak']).list.filter((e) => e.kind === 'use').slice(0, 4)
    expect(casts.map((u) => [u.id, u.t, u.stacks.hotStreak])).toEqual([
      ['fireball', 0, 0],
      ['pyroblast', 3500, 1],
      ['fireball', 8000, 0],
      ['pyroblast', 11500, 1],
    ])
  })

  it('cuts only the cast time: Pyroblast pays its 440 mana, and under Clearcasting nothing', () => {
    const plan = examplePlan({ talents: { 'Hot Streak': 1, Pyroblast: 1 }, rotation: { [F.pyroblast]: true, [F.pyroblastStacks]: 3 }, spellCrit: 200 })
    const pool = (p: Plan) => {
      const { list } = events(p)
      const u = list.filter((e) => e.kind === 'use')
      const i = u.findIndex((e) => e.id === 'pyroblast')
      return u[i].value - u[i + 1].value
    }
    expect(pool(plan)).toBe(4400)
    const cc = examplePlan({ talents: { 'Hot Streak': 1, Pyroblast: 1, 'Arcane Concentration': 5 }, rotation: { [F.pyroblast]: true, [F.pyroblastStacks]: 3 }, spellCrit: 200 })
    procOf(cc, 'arcaneConcentration').chance = [1, 1]
    expect(pool(cc)).toBe(0)
  })
})

describe('Presence of Mind (docs/classes/mage.md#presence-of-mind)', () => {
  it('makes the next spell with a cast time instant and is used up; every 3 min', () => {
    const plan = examplePlan({ spec: 'frost', talents: { 'Presence of Mind': 1 }, rotation: { [FR.presenceOfMind]: true }, durationMs: 200000 })
    expect(plan.abilities[abilityOf(plan, 'frostbolt')].instantAura).toBe(auraOf(plan, 'presenceOfMind'))
    const { uses, damage } = events(plan, ['presenceOfMind'])
    expect(uses('frostbolt').slice(0, 3).map((u) => [u.t, u.stacks.presenceOfMind])).toEqual([
      [0, 1],
      [1500, 0],
      [4500, 0],
    ])
    // The instant one lands as it's used; the next takes its 3 s.
    expect(damage('frostbolt').slice(0, 2).map((d) => d.t)).toEqual([0, 4500])
    const pom = uses('presenceOfMind').map((u) => u.t)
    expect(pom[0]).toBe(0)
    expect(pom[1]).toBeGreaterThanOrEqual(180000)
    expect(pom[1]).toBeLessThan(183000)
  })

  it('Arcane: an instant Pyroblast while it’s up, then Arcane Missiles', () => {
    const plan = examplePlan({ spec: 'arcane', talents: { 'Presence of Mind': 1, Pyroblast: 1 }, rotation: { [A.presenceOfMind]: true } })
    const { list, damage } = events(plan)
    expect(
      list
        .filter((e) => e.kind === 'use')
        .slice(0, 4)
        .map((u) => [u.id, u.t]),
    ).toEqual([
      ['presenceOfMind', 0],
      ['pyroblast', 0],
      ['arcaneMissiles', 1500],
      ['arcaneMissiles', 6500],
    ])
    expect(damage('pyroblast').map((d) => d.t)).toEqual([0])
  })
})

describe('Winter’s Chill (docs/classes/mage.md#winters-chill)', () => {
  it('each landed Frost spell may add a stack (20% a rank, up to 1 a rank, 15 s), each +2% crit on Frostbolt', () => {
    const plan = examplePlan({ spec: 'frost', talents: { "Winter's Chill": 5 }, spellCrit: 0 })
    const wc = auraOf(plan, 'wintersChill')
    expect(plan.auras[wc]).toMatchObject({ maxStacks: 5, durationMs: 15000 })
    expect(procOf(plan, 'wintersChill').chance[0]).toBe(1)
    const two = examplePlan({ spec: 'frost', talents: { "Winter's Chill": 2 } })
    expect(two.auras[auraOf(two, 'wintersChill')].maxStacks).toBe(2)
    expect(procOf(two, 'wintersChill').chance[0]).toBeCloseTo(0.4, 12)
    const bolt = spellOf(plan, 'frostbolt')
    expect(bolt).toMatchObject({ critAura: wc, critAuraPct: 2 })
    const s = plan.spells!.indexOf(bolt)
    const sim = new Sim(plan)
    const st = auraState(sim)
    const seen: number[] = []
    sim.castTrace = (a) => {
      if (plan.abilities[a].id === 'frostbolt') seen.push(st.critAuraPct(s))
    }
    sim.runFight(0)
    expect(seen.slice(0, 7)).toEqual([0, 2, 4, 6, 8, 10, 10])
  })

  it('Frostbolt crits at 2% a stack from them (10% at 5, with no other crit); another Frost spell gets none', () => {
    const plan = examplePlan({ spec: 'frost', talents: { "Winter's Chill": 5 }, spellCrit: 0 })
    fixSpell(plan, 'frostbolt', 100)
    const sim = new Sim(plan)
    const r = row(plan, 'frostbolt')
    let n = 0
    let crits = 0
    let k = 0
    sim.damageTrace = (source, d) => {
      // From the 6th Frostbolt of a fight, 5 stacks are up.
      if (source === r && ++k > 5) {
        n++
        if (d > 100) crits++
      }
    }
    for (let i = 0; i < 300; i++) {
      k = 0
      sim.runFight(i)
    }
    near(crits / n, 0.1, n)
    // Only Frostbolt reads them (class mask: Frostbolt and Ice Lance): another Frost spell's crit is its own.
    const t = ranks({ "Winter's Chill": 5 })
    expect(withSpellTalents(FROSTBOLT_SPELL, t).critAura).toEqual({ aura: 'wintersChill', pctPerStack: 2 })
    expect(withSpellTalents({ ...FROSTBOLT_SPELL, id: 'coneOfCold', name: 'Cone of Cold' }, t).critAura).toBeUndefined()
    expect(withSpellTalents(FROSTBOLT_SPELL, new Map()).critAura).toBeUndefined()
  })
})

describe('Arcane Power (docs/classes/mage.md#arcane-power)', () => {
  it('for 15 s: every spell’s damage ×1.3 and mana cost ×1.3, to a tenth (Arcane Missiles 595 → 773.5)', () => {
    const plan = examplePlan({ spec: 'arcane', talents: { 'Arcane Power': 1 }, rotation: { [A.arcanePower]: true } })
    expect(plan.auras[auraOf(plan, 'arcanePower')]).toMatchObject({ durationMs: 15000, manaCostPct: 30 })
    const { uses, damage } = events(plan)
    expect(uses('arcanePower').map((u) => u.t)).toEqual([0])
    const am = uses('arcaneMissiles')
    expect(am.slice(0, 5).map((u) => u.t)).toEqual([0, 5000, 10000, 15000, 20000])
    expect(spent(am).slice(0, 2)).toEqual([7735, 7735])
    expect(spent(am)[3]).toBe(5950)
    const missiles = damage('arcaneMissiles')
    expect(missiles.length).toBeGreaterThan(20)
    for (const d of missiles.filter((x) => x.t !== 15000)) expect(d.value, String(d.t)).toBeCloseTo(174.6 * RESIST * (d.t < 15000 ? 1.3 : 1), 9)
  })
})

describe('Clearcasting (docs/classes/mage.md#talents): Arcane Concentration', () => {
  it('a 2% chance a rank on a landed damage spell, at most once a second; the next damage spell costs nothing, and it’s used up', () => {
    const plan = examplePlan({ talents: { 'Arcane Concentration': 5 } })
    expect(plan.freeCastAura).toBe(auraOf(plan, 'clearcasting'))
    const p = procOf(plan, 'arcaneConcentration')
    expect(p.chance[0]).toBeCloseTo(0.1, 12)
    expect(p.icdMs).toBe(1000)
    // One Clearcasting, from the first Fireball: the second is free, the third paid.
    p.chance = [1, 1]
    p.icdMs = 1e9
    const fb = events(plan, ['clearcasting']).uses('fireball')
    expect(spent(fb).slice(0, 3)).toEqual([3950, 0, 3950])
    expect(fb.slice(0, 4).map((u) => u.stacks.clearcasting)).toEqual([0, 1, 0, 0])
    expect(examplePlan().freeCastAura).toBeUndefined()
  })

  it('makes an Arcane Missiles channel free', () => {
    const plan = examplePlan({ spec: 'arcane', talents: { 'Arcane Concentration': 5 } })
    const p = procOf(plan, 'arcaneConcentration')
    p.chance = [1, 1]
    p.icdMs = 1e9
    expect(spent(events(plan).uses('arcaneMissiles')).slice(0, 3)).toEqual([5950, 0, 5950])
  })
})

describe('Master of Elements (docs/classes/mage.md#talents)', () => {
  it('a Fire or Frost crit returns 10% a rank of its spell’s cost: 118.5 of Fireball’s 395, 78 of Frostbolt’s 260 at 3/3; not an Arcane crit', () => {
    const fire = examplePlan({ talents: { 'Master of Elements': 3 }, spellCrit: 200 })
    const fb = events(fire)
    expect(spent(fb.uses('fireball')).slice(0, 4)).toEqual([2765, 2765, 2765, 2765])
    const crits = counter(fb.sim, fire, 'fireball', FIELD.crits)
    expect(fb.sim.manaBySource[row(fire, 'masterOfElements')]).toBe(1185 * crits)
    const frost = examplePlan({ spec: 'frost', talents: { 'Master of Elements': 3 }, spellCrit: 200 })
    expect(spent(events(frost).uses('frostbolt')).slice(0, 3)).toEqual([1820, 1820, 1820])
    const noCrit = examplePlan({ talents: { 'Master of Elements': 3 } })
    expect(spent(events(noCrit).uses('fireball')).slice(0, 3)).toEqual([3950, 3950, 3950])
    const arcane = examplePlan({ spec: 'arcane', talents: { 'Master of Elements': 3 }, spellCrit: 200 })
    expect(spent(events(arcane).uses('arcaneMissiles')).slice(0, 3)).toEqual([5950, 5950, 5950])
  })
})

describe('spell hit by school (docs/classes/mage.md#talents)', () => {
  it('Elemental Precision lowers only Fire and Frost spells’ miss, 1% a rank; Arcane Focus only Arcane’s', () => {
    const plan = examplePlan({ talents: { 'Elemental Precision': 5, 'Arcane Focus': 2 }, spellHit: 0 })
    expect(plan.schools!.hit).toEqual([5, 5, 0, 0, 2, 0, 0])
    const sim = new Sim(plan)
    expect(sim.inspect().spellMiss).toBe(17)
    const miss = auraState(sim).schMiss
    expect([miss[SCHOOL.fire], miss[SCHOOL.frost], miss[SCHOOL.arcane], miss[SCHOOL.shadow]]).toEqual([12, 12, 15, 17])
    const s = run(plan, 200)
    const n = counter(s, plan, 'fireball', FIELD.casts)
    near(counter(s, plan, 'fireball', FIELD.misses) / n, 0.12, n)
    // Frostbolt is binary: its miss and its whole resist in one roll, 12 + 88 × 6% = 17.28%.
    const frost = examplePlan({ spec: 'frost', talents: { 'Elemental Precision': 5 }, spellHit: 0 })
    const fs = run(frost, 200)
    const m = counter(fs, frost, 'frostbolt', FIELD.casts)
    near(counter(fs, frost, 'frostbolt', FIELD.misses) / m, 0.12 + 0.88 * 0.06, m)
  })
})

describe('the character sheet (docs/ux.md#results; docs/classes/mage.md#talents)', () => {
  it('shows each school’s crit and hit with the talents’: Fire’s Critical Mass +6% crit, Elemental Precision’s +5% Fire and Frost hit, Arcane Focus’s +3% Arcane hit', () => {
    const { sheet } = buildPlan(defaultConfig('mage-fire'))
    const spell = sheet.spell!
    const c = spell.caster!
    expect(c.schoolCrit.fire - spell.critPct).toBeCloseTo(6, 9)
    for (const k of ['arcane', 'frost', 'holy', 'nature', 'shadow'] as const) expect(c.schoolCrit[k]).toBe(spell.critPct)
    expect([c.schoolHit.fire, c.schoolHit.frost, c.schoolHit.arcane, c.schoolHit.shadow].map((h) => h - spell.hitPct)).toEqual([5, 5, 3, 0])
  })

  it('names no melee value it doesn’t use: no base attack power left out, no base melee crit placeholder', () => {
    for (const spec of ['mage-fire', 'mage-frost', 'mage-arcane'] as const) {
      const { sheet, assumptions } = buildPlan(defaultConfig(spec))
      expect(sheet.unknown).toEqual([])
      expect(sheet.placeholders).toEqual(['base attributes', 'base health', 'base spell crit'])
      const note = assumptions.find((a) => a.id === 'baseStatPlaceholders')!.text
      expect(note).toContain('base spell crit')
      expect(note).not.toContain('melee')
      expect(note).not.toContain('attack power')
    }
  })
})

describe('Evocation (docs/classes/mage.md#mana)', () => {
  it('channels 8 s on the GCD, its ×16 regeneration aura up only while it channels, all of it while casting; 8 min cooldown', () => {
    const plan = examplePlan({ spec: 'arcane', rotation: { [A.evocation]: true, [A.evocationMana]: 100 }, manaTenths: 'plan' })
    plan.mana!.regenTickTenths = 100
    expect(plan.mana!.inFsrShare).toBe(0.5)
    const sim = new Sim(plan)
    const uses: [string, number][] = []
    const ticks: [number, number][] = []
    sim.castTrace = (a, t) => uses.push([plan.abilities[a].id, t])
    sim.manaTrace = (t, tenths) => ticks.push([t, tenths])
    sim.runFight(0)
    expect(uses.slice(0, 2)).toEqual([
      ['evocation', 0],
      ['arcaneMissiles', 8000],
    ])
    expect(uses.filter((u) => u[0] === 'evocation').length).toBe(1)
    expect(auraState(sim).auraUpMs[auraOf(plan, 'evocation')]).toBe(8000)
    const during = ticks.filter(([t]) => t > 0 && t < 8000)
    expect(during.length).toBeGreaterThanOrEqual(3)
    for (const [, tenths] of during) expect(tenths).toBe(1600)
    // After it, Arcane Missiles' mana keeps you inside the five-second rule: Mage Armor's 50%.
    for (const [, tenths] of ticks.filter(([t]) => t > 8000 && t < 12000)) expect(tenths).toBe(50)
  })
})

describe('mana gems (docs/classes/mage.md#mana)', () => {
  it('a Mana Ruby restores 1,000–1,200 and a Mana Citrine 775–925, each once a fight, their 2 min category apart', () => {
    const plan = examplePlan({ rotation: { [F.gems]: true }, manaTenths: 'plan', durationMs: 300000 })
    const ruby = row(plan, 'manaRuby')
    const citrine = row(plan, 'manaCitrine')
    const sim = new Sim(plan)
    const at: Record<string, number[]> = { manaRuby: [], manaCitrine: [] }
    sim.castTrace = (a, t) => at[plan.abilities[a].id]?.push(t)
    const gains: Record<string, number[]> = { manaRuby: [], manaCitrine: [] }
    let before = [0, 0]
    for (let i = 0; i < 60; i++) {
      at.manaRuby = []
      at.manaCitrine = []
      sim.runFight(i)
      expect([at.manaRuby.length, at.manaCitrine.length]).toEqual([1, 1])
      expect(Math.abs(at.manaCitrine[0] - at.manaRuby[0])).toBeGreaterThanOrEqual(120000)
      gains.manaRuby.push(sim.manaBySource[ruby] - before[0])
      gains.manaCitrine.push(sim.manaBySource[citrine] - before[1])
      before = [sim.manaBySource[ruby], sim.manaBySource[citrine]]
    }
    expect(Math.min(...gains.manaRuby)).toBeGreaterThanOrEqual(10000)
    expect(Math.max(...gains.manaRuby)).toBeLessThanOrEqual(12000)
    expect(Math.min(...gains.manaCitrine)).toBeGreaterThanOrEqual(7750)
    expect(Math.max(...gains.manaCitrine)).toBeLessThanOrEqual(9250)
    expect(new Set(gains.manaRuby).size).toBeGreaterThan(10)
  })

  it('go whichever fits first, the Ruby on a tie: the default Fire mage’s Citrine first nearly always, the Arcane mage’s either about as often (mage.md "Mana gems")', () => {
    const firsts = (spec: MageSpec) => {
      const plan = buildPlan(defaultConfig(SPEC_ID[spec])).plan
      const sim = new Sim(plan)
      const tally = { manaRuby: 0, manaCitrine: 0 }
      for (let i = 0; i < 100; i++) {
        let first: string | undefined
        sim.castTrace = (a) => {
          const id = plan.abilities[a].id
          if (!first && (id === 'manaRuby' || id === 'manaCitrine')) first = id
        }
        sim.runFight(i)
        if (first) tally[first as keyof typeof tally]++
      }
      return tally
    }
    const fire = firsts('fire')
    expect(fire.manaCitrine).toBeGreaterThan(90)
    const arcane = firsts('arcane')
    expect(Math.min(arcane.manaRuby, arcane.manaCitrine)).toBeGreaterThan(25)
  })

  it('share their cooldown with the Demonic Rune (category 1153): a Rune at the pull holds the Ruby for 2 min', () => {
    const plan = examplePlan({ rotation: { [F.gems]: true, [F.rune]: true, [F.runeMissing]: 0 }, buffs: ['demonicRune'], manaTenths: 'plan', durationMs: 200000 })
    const cats = ['manaRuby', 'manaCitrine', 'demonicRune'].map((id) => plan.abilities[abilityOf(plan, id)].category)
    expect(cats).toEqual(['manaGem', 'manaGem', 'manaGem'])
    // The Rune only at the pull.
    plan.rotation.find((r) => plan.abilities[r.ability].id === 'demonicRune')!.conditions = at(plan, 0)
    const { uses } = events(plan)
    expect(uses('demonicRune').map((u) => u.t)).toEqual([0])
    const ruby = uses('manaRuby').map((u) => u.t)
    expect(ruby.length).toBe(1)
    expect(ruby[0]).toBeGreaterThanOrEqual(120000)
    expect(ruby[0]).toBeLessThan(123500)
    // And the Ruby, used once and never again, still holds the Citrine and the Rune for its 2 min.
    const gemFirst = examplePlan({ rotation: { [F.gems]: true, [F.rune]: true, [F.runeMissing]: 0 }, buffs: ['demonicRune'], manaTenths: 'plan', durationMs: 300000 })
    const g = events(gemFirst)
    const r = g.uses('manaRuby').map((u) => u.t)
    const rune = g.uses('demonicRune').map((u) => u.t)
    // The Rune at the pull (it needs no missing mana), then the Ruby once it can, then nothing of the category for 2 min.
    expect(rune[0]).toBe(0)
    expect(r.length).toBe(1)
    const after = [...rune, ...g.uses('manaCitrine').map((u) => u.t)].filter((t) => t > r[0]).sort((x, y) => x - y)
    expect(after[0]).toBeGreaterThanOrEqual(r[0] + 120000)
  })
})

describe('the mage never swings its weapon (docs/classes/mage.md#what-the-sim-needs)', () => {
  it('has a weapon equipped but no weapons in the plan, and no white damage', () => {
    for (const spec of ['fire', 'frost', 'arcane'] as MageSpec[]) {
      const config = defaultConfig(SPEC_ID[spec])
      expect(config.gear.mainHand, spec).toBeDefined()
      const plan = buildPlan(config).plan
      expect(plan.weapons).toEqual([null, null])
      const sim = run(plan, 3)
      for (const r of [0, 1]) for (const f of [FIELD.damage, FIELD.casts, FIELD.hits]) expect(sim.counters[r * FIELD_COUNT + f], `${spec} ${r} ${f}`).toBe(0)
    }
  })
})

describe('the priority lists (docs/classes/mage.md "Fire priority", "Frost priority", "Arcane priority")', () => {
  /** Every switch on, over each spec's default setup. */
  const allOn = (spec: MageSpec) => Object.fromEntries(MAGE_OPTIONS[spec].flatMap((o) => (o.kind === 'toggle' ? [[o.id, true]] : [])))
  const MAGE_ROWS = new Set(['combustion', 'arcanePower', 'presenceOfMind', 'berserking', 'manaRuby', 'manaCitrine', 'evocation', 'scorch', 'pyroblast', 'fireBlast', 'fireball', 'iceBarrier', 'frostbolt', 'arcaneMissiles'])
  const order = (spec: MageSpec, rotation: Record<string, unknown> = {}) => {
    const d = defaultConfig(SPEC_ID[spec])
    const plan = buildPlan({ ...d, rotation: { ...allOn(spec), ...rotation } as typeof d.rotation }).plan
    return { plan, ids: plan.rotation.map((r) => plan.abilities[r.ability].id).filter((id) => MAGE_ROWS.has(id)) }
  }

  it('Fire: Combustion, the racial, the gems, Evocation (at x% mana, or when Fireball can’t be paid), Scorch ×4, Pyroblast on Hot Streak, Fire Blast, Fireball', () => {
    const { plan, ids } = order('fire', { [F.pyroblastStacks]: 2, [F.scorchRefresh]: 7 })
    expect(ids).toEqual(['combustion', 'berserking', 'manaRuby', 'manaCitrine', 'evocation', 'evocation', 'scorch', 'scorch', 'scorch', 'scorch', 'pyroblast', 'fireBlast', 'fireball'])
    const line = (id: string, k = 0) => plan.rotation.filter((r) => plan.abilities[r.ability].id === id)[k]
    const fv = auraOf(plan, 'fireVulnerability')
    const hotStreak = { code: COND.auraStacksAtLeast, a: auraOf(plan, 'hotStreak'), b: 2 }
    expect(line('scorch', 0).conditions).toEqual([{ code: COND.auraStacksBelow, a: fv, b: 5 }])
    expect(line('scorch', 1).conditions).toEqual([{ code: COND.auraEndsWithin, a: fv, b: 7000 }])
    // Before a Pyroblast, or a Fireball, that would let the stacks run out before a Scorch after it lands.
    expect(line('scorch', 2).conditions).toEqual([hotStreak, { code: COND.auraEndsBeforeCasts, a: fv, b: abilityOf(plan, 'pyroblast') }])
    expect(line('scorch', 3).conditions).toEqual([{ code: COND.auraEndsBeforeCasts, a: fv, b: abilityOf(plan, 'fireball') }])
    expect(line('pyroblast').conditions).toEqual([hotStreak, { code: COND.dotTickWait, a: abilityOf(plan, 'pyroblast'), b: FIRE_WAIT_MS }])
    expect(line('fireball').conditions).toEqual([{ code: COND.cooldownAtLeast, a: abilityOf(plan, 'fireBlast'), b: FIRE_WAIT_MS }])
    expect(FIRE_WAIT_MS).toBe(300)
  })

  it('Frost: Presence of Mind, the racial, the gems, Evocation, Frostbolt (Ice Barrier only when talented)', () => {
    expect(order('frost').ids).toEqual(['presenceOfMind', 'berserking', 'manaRuby', 'manaCitrine', 'evocation', 'evocation', 'frostbolt'])
  })

  it('Arcane: Arcane Power, Presence of Mind, the racial, the gems, Evocation, Pyroblast while Presence of Mind is up, Arcane Missiles', () => {
    const { plan, ids } = order('arcane')
    expect(ids).toEqual(['arcanePower', 'presenceOfMind', 'berserking', 'manaRuby', 'manaCitrine', 'evocation', 'evocation', 'pyroblast', 'arcaneMissiles'])
    const pyro = plan.rotation.find((r) => plan.abilities[r.ability].id === 'pyroblast')!
    expect(pyro.conditions).toEqual([{ code: COND.abilityAuraUp, a: abilityOf(plan, 'presenceOfMind'), b: 0 }])
  })

  it('switches off drop their lines; a talent the build lacks drops its switch’s line too', () => {
    expect(order('fire', { [F.combustion]: false, [F.scorch]: false, [F.pyroblast]: false, [F.fireBlast]: false, [F.racial]: false, [F.gems]: false, [F.evocation]: false }).ids).toEqual(['fireball'])
    const d = defaultConfig('mage-fire')
    const bare = buildPlan({ ...d, talents: '', rotation: allOn('fire') }).plan
    expect(bare.rotation.map((r) => bare.abilities[r.ability].id).filter((id) => MAGE_ROWS.has(id))).toEqual(['berserking', 'manaRuby', 'manaCitrine', 'evocation', 'evocation', 'fireBlast', 'fireball'])
  })
})

describe('the Fire priority at any casting speed (docs/classes/mage.md "Fire priority", rows 9, 10 and 12)', () => {
  /** The default Fire mage, its casting speed × `speed`; with unlimited mana unless `mana`. */
  const firePlan = (speed: number, mana = false) => {
    const bundle = buildPlan(defaultConfig('mage-fire'))
    const plan = bundle.plan
    plan.stats.castHaste *= speed
    if (!mana) plan.mana = { ...plan.mana!, maxTenths: 1e9 }
    return { bundle, plan }
  }

  it('Fireball waits up to 0.3 s for Fire Blast (COND 1), and no longer', () => {
    // No talents: Fire Blast's cooldown is 8 s, Fireball's cast 3.5 s ÷ the casting speed.
    const fireBlast = (castMs: number) => {
      const plan = examplePlan({ rotation: { [F.fireBlast]: true } })
      plan.stats.castHaste = 3500 / castMs
      return events(plan)
    }
    // Two 3,150 ms Fireballs after Fire Blast's GCD land at 7.8 s: Fire Blast is 200 ms away, so the mage waits.
    const wait = fireBlast(3150)
    expect(wait.uses('fireball').slice(0, 2).map((u) => u.t)).toEqual([1500, 4650])
    expect(wait.uses('fireBlast').slice(0, 3).map((u) => u.t)).toEqual([0, 8000, 16000])
    // At 3,050 ms they land at 7.6 s, 400 ms early: a third Fireball goes first.
    const go = fireBlast(3050)
    expect(go.uses('fireball').slice(0, 3).map((u) => u.t)).toEqual([1500, 4550, 7600])
    expect(go.uses('fireBlast').slice(0, 2).map((u) => u.t)).toEqual([0, 10650])
  })

  it('Pyroblast waits up to 0.3 s to land with its own DoT’s tick rather than cut it off (COND 45)', () => {
    // Every spell crits, so each Fireball gives a Hot Streak stack and a 1-stack Pyroblast follows it.
    // At a casting speed of 1/1.1, Fireball takes 3,850 ms and that Pyroblast 4,950: the first lands at
    // 8.8 s, its DoT ticking at 11.8, 14.8 and 17.8 s; the second would land at 17.6 s, 200 ms before
    // the third tick, so it waits 200 ms and lands with it (a tick due that moment lands first).
    const plan = examplePlan({ talents: { 'Hot Streak': 1, Pyroblast: 1 }, rotation: { [F.pyroblast]: true }, spellCrit: 200, sp: 100 })
    plan.stats.castHaste = 1 / 1.1
    const { uses, damage } = events(plan)
    expect(uses('pyroblast').slice(0, 2).map((u) => u.t)).toEqual([3850, 12850])
    expect(damage('pyroblast').slice(0, 2).map((d) => d.t)).toEqual([8800, 17800])
    expect(damage('pyroblastDot').slice(0, 4).map((d) => d.t)).toEqual([11800, 14800, 17800, 20800])
  })

  it('Scorch keeps Fire Vulnerability up after the opener at ×1.00, ×1.002 and ×1.01 casting speed (COND 43, 44)', () => {
    for (const speed of [1, 1.002, 1.01]) {
      const { plan } = firePlan(speed)
      // Scorches that never miss: two missed refreshes in a row let the stacks run out, rightly.
      plan.stats.spellHit = 100
      let drops = 0
      for (let fight = 0; fight < 200; fight++) {
        const { uses } = events(plan, ['fireVulnerability'], fight)
        const stacks = uses('scorch').map((u) => u.stacks.fireVulnerability)
        // A Scorch after the stacks first reached 5 that finds fewer: they ran out, and a Scorch landing as
        // they did started them again.
        const full = stacks.indexOf(5)
        if (full >= 0) drops += stacks.slice(full).filter((n) => n < 5).length
      }
      expect(drops, `×${speed}`).toBe(0)
    }
  })

  it('+1% and +2% casting speed are never a loss: the default Fire mage’s DPS at ×1.01 and ×1.02 is at least ×1.00’s, within its 95% CI', () => {
    const dps = (speed: number) => {
      const { bundle, plan } = firePlan(speed, true)
      return toResult(bundle, runFights(plan, 3000), 0).dps
    }
    const base = dps(1)
    for (const speed of [1.01, 1.02]) expect(dps(speed).mean, `×${speed}`).toBeGreaterThanOrEqual(base.mean - base.ci95)
  })
})
