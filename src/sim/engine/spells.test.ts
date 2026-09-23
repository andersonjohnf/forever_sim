// The engine's spells, mana, cooldown categories and exclusive auras (the paladin's, but generic):
// combat-tables §3 "Defense type" and §9, docs/classes/paladin.md#conventions-used-below and
// #mana-model, character-stats.md#spirit-and-mana-regeneration. Hand-built plans: a warrior plan
// from test-helpers with spells and mana added, its stats set directly. Every number here is a
// test input, not a base stat.
import { describe, expect, it } from 'vitest'
import { CRIT_MULTIPLIER } from '../core/formulas'
import { type AbilityPlan, COND, DEFENSE, type ManaPlan, type Plan, SCHOOL, type SpellPlan, STANCE_ANY } from '../plan/types'
import { FIELD, Sim } from './sim'
import { addAura, alwaysLandNoCrit, armsPlan, counter, damages, line, setAttackPower, timeline } from './test-helpers'

/** A plan with mana (maximum `maxMana`; no regeneration unless a test adds it), spell damage `sp`, and no abilities yet. */
function spellPlan(durationMs = 60000, maxMana = 5000, sp = 0): Plan {
  const plan = armsPlan(durationMs)
  const mana: ManaPlan = { maxTenths: 10 * maxMana, regenTickTenths: 0, fiveSecondRuleMs: 5000 }
  plan.mana = mana
  plan.spells = []
  plan.rage.maxTenths = 0
  const s = plan.stats
  // No gear ratings: each test sets hit and crit itself.
  s.hitRating = 0
  s.critRating = 0
  s.spellDamage = sp
  expect(new Sim(plan).inspect().maxMana).toBe(maxMana)
  return plan
}

/** A mana cost as an ability's fields (`resource: 'mana'`, in tenths). */
const mana = (cost: number): Partial<AbilityPlan> => ({ resource: 'mana', costTenths: 10 * cost })

/** A spell of `patch` on top of a plain Holy magic spell with no damage, with its own breakdown row. */
function addSpell(plan: Plan, patch: Partial<SpellPlan> = {}): number {
  plan.sources.push({ id: `spell${plan.spells!.length}`, name: 'Spell', icon: 'x' })
  plan.spells!.push({
    id: `spell${plan.spells!.length}`,
    school: SCHOOL.holy,
    defense: DEFENSE.magic,
    noActiveDefense: false,
    alwaysHit: false,
    triggersProcs: true,
    min: 0,
    max: 0,
    weaponPercent: 0,
    normalized: false,
    spCoefficient: 0,
    takenScale: 0,
    critMultiplier: CRIT_MULTIPLIER.spell,
    bonusCrit: 0,
    damageMult: 1,
    threatMult: 1,
    threatBonus: 0,
    source: plan.sources.length - 1,
    ...patch,
  })
  return plan.spells!.length - 1
}

/** An ability that casts spell `spell` (−1: none), on the spell's row, with `patch` (cooldown, mana, …). */
function addSpellAbility(plan: Plan, spell: number, patch: Partial<AbilityPlan> = {}): number {
  const source = spell >= 0 ? plan.spells![spell].source : plan.sources.push({ id: 'cast', name: 'Cast', icon: 'x' }) - 1
  plan.abilities.push({
    id: `ability${plan.abilities.length}`,
    name: 'Ability',
    icon: 'x',
    source,
    kind: 'spell',
    costTenths: 0,
    cooldownMs: 0,
    gcdMs: 1500,
    castMs: 0,
    castStopsSwings: false,
    twoHandOnly: false,
    unavoidable: false,
    window: -1,
    stances: STANCE_ANY,
    executePhaseOnly: false,
    weaponPercent: 0,
    normalized: false,
    flatDamage: 0,
    apCoefficient: 0,
    damagePerExtraRage: 0,
    bonusCrit: 0,
    critMultiplier: 2,
    refundShare: 0,
    threatMult: 0,
    threatBonus: 0,
    offHandSource: -1,
    aura: -1,
    dotTickDamage: 0,
    dotTicks: 0,
    dotTickMs: 0,
    periodicCanCrit: false,
    rageTenths: 0,
    rageSpreadTenths: 0,
    rageTickTenths: 0,
    rageTicks: 0,
    rageTickMs: 0,
    usesPerFight: 0,
    spell,
    ...patch,
  })
  return plan.abilities.length - 1
}

/** Casts per fight, hits, crits, misses, … of a row over `fights` fights. */
function run(plan: Plan, fights: number) {
  const sim = new Sim(plan)
  for (let i = 0; i < fights; i++) sim.runFight(i)
  return sim
}

describe('the spell table (combat-tables §9, WE-10)', () => {
  it('misses at 17% − hit against a +3 boss, floored at 0 in forever and 1 in classicEra, and crits ×1.5 at spell crit', () => {
    for (const [hit, profile, miss] of [
      [3, 'forever', 14],
      [17, 'forever', 0],
      [17, 'classicEra', 1],
    ] as const) {
      const plan = spellPlan()
      plan.profile = { ...plan.profile, combat: { ...plan.profile.combat, spellMissFloor: profile === 'forever' ? 0 : 1 } }
      plan.stats.spellHit = hit
      expect(new Sim(plan).inspect().spellMiss).toBe(miss)
    }
    const plan = spellPlan(60000)
    plan.stats.spellHit = 3
    plan.stats.spellCrit = 20
    const s = addSpell(plan, { min: 100, max: 100 })
    const a = addSpellAbility(plan, s)
    line(plan, a)
    const sim = run(plan, 300)
    const row = plan.spells![s].source
    const casts = counter(sim, row, FIELD.casts)
    const misses = counter(sim, row, FIELD.misses)
    const crits = counter(sim, row, FIELD.crits)
    const landed = casts - misses
    expect(casts).toBeGreaterThan(10000)
    expect(Math.abs(misses / casts - 0.14)).toBeLessThan(4 * Math.sqrt((0.14 * 0.86) / casts))
    expect(Math.abs(crits / landed - 0.2)).toBeLessThan(4 * Math.sqrt((0.2 * 0.8) / landed))
    // A Holy spell is never partially resisted; a crit deals ×1.5.
    expect(new Set(damages(plan, row, 20).map((d) => Math.round(d * 1000) / 1000))).toEqual(new Set([100, 150]))
  })

  it('always lands with Always Hit', () => {
    const plan = spellPlan()
    plan.stats.spellHit = -100
    const s = addSpell(plan, { alwaysHit: true, min: 10, max: 10 })
    line(plan, addSpellAbility(plan, s))
    expect(counter(run(plan, 20), plan.spells![s].source, FIELD.misses)).toBe(0)
  })
})

describe('melee-class spells (combat-tables §3 "Defense type"; paladin.md#conventions-used-below)', () => {
  /** A melee-class spell from the front (dodge, parry and block all possible), 5% hit, 20% crit. */
  function meleePlan(patch: Partial<SpellPlan>) {
    const plan = spellPlan(60000)
    plan.fight.front = true
    plan.fight.bossCanParry = true
    plan.fight.bossCanBlock = true
    plan.stats.hit = 5
    plan.stats.crit = 20
    const s = addSpell(plan, { defense: DEFENSE.melee, critMultiplier: CRIT_MULTIPLIER.melee, min: 100, max: 100, ...patch })
    line(plan, addSpellAbility(plan, s))
    const th = new Sim(plan).inspect().specialThresholds
    const sim = run(plan, 300)
    const row = plan.spells![s].source
    const n = counter(sim, row, FIELD.casts)
    const rate = (field: number) => counter(sim, row, field) / n
    return { th, rate, n, sim, row, plan }
  }
  const near = (x: number, p: number, n: number) => expect(Math.abs(x - p)).toBeLessThanOrEqual(4 * Math.sqrt((p * (1 - p)) / n) + 1e-12)

  it('roll the main hand’s special table once: miss, dodge, parry, block, then crit ×2', () => {
    const { th, rate, n } = meleePlan({})
    near(rate(FIELD.misses), th[0] / 100, n)
    near(rate(FIELD.dodges), (th[1] - th[0]) / 100, n)
    near(rate(FIELD.parries), (th[2] - th[1]) / 100, n)
    near(rate(FIELD.blocks), (th[4] - th[2]) / 100, n)
    near(rate(FIELD.crits), (th[5] - th[4]) / 100, n)
    expect(th[1] - th[0]).toBeGreaterThan(0)
  })

  it('with No Active Defense, can only miss, then crit (Judgement of Righteousness)', () => {
    const { th, rate, n } = meleePlan({ noActiveDefense: true })
    for (const field of [FIELD.dodges, FIELD.parries, FIELD.blocks]) expect(rate(field)).toBe(0)
    near(rate(FIELD.misses), th[0] / 100, n)
    // The crit slice follows the miss slice: the special crit chance, not truncated by avoidance.
    near(rate(FIELD.crits), (th[5] - th[4]) / 100, n)
  })

  it('with No Active Defense and Always Hit, always lands and crits at the special crit chance (Judgement of Command)', () => {
    const { th, rate, n, plan, row } = meleePlan({ noActiveDefense: true, alwaysHit: true })
    expect(rate(FIELD.misses)).toBe(0)
    near(rate(FIELD.crits), (th[5] - th[4]) / 100, n)
    expect(new Set(damages(plan, row, 20).map((d) => Math.round(d)))).toEqual(new Set([100, 200]))
  })

  it('with Always Hit alone, still can be dodged, parried and blocked', () => {
    const { th, rate, n } = meleePlan({ alwaysHit: true })
    expect(rate(FIELD.misses)).toBe(0)
    near(rate(FIELD.dodges), (th[1] - th[0]) / 100, n)
    near(rate(FIELD.parries), (th[2] - th[1]) / 100, n)
  })

  it('fire on-hit procs when they land, and melee crit procs when they crit', () => {
    const plan = spellPlan(60000)
    alwaysLandNoCrit(plan)
    plan.stats.crit = 100
    const aura = addAura(plan, { id: 'onCrit', name: 'On crit', durationMs: 1000, mods: {} })
    plan.procs.push({ id: 'p', name: 'P', trigger: 2, chance: [1, 1], hands: 1, icdMs: 0, action: 1, amount: aura, a: 0, b: 0, school: 0, source: -1, chainBit: 0 })
    plan.triggers[2].push(0)
    const s = addSpell(plan, { defense: DEFENSE.melee, noActiveDefense: true, alwaysHit: true, min: 1, max: 1 })
    line(plan, addSpellAbility(plan, s, { cooldownMs: 100000 }))
    // No white swings: the only crit is the spell's.
    plan.weapons[0] = { ...plan.weapons[0]!, speedSec: 1000 }
    const sim = run(plan, 1)
    expect(sim.auraUpMs[aura]).toBeGreaterThan(0)
  })
})

describe('spell damage (paladin.md#conventions-used-below)', () => {
  it('is weapon share × (roll + flat weapon damage + AP/14 × speed + its own range) + SP × coefficient, and Holy ignores armor', () => {
    // Worked example 2's inputs: 250 per swing, 3.5 speed, 1200 AP, SP 100, 70% weapon, 0.203 SP.
    const plan = spellPlan(60000, 5000, 100)
    alwaysLandNoCrit(plan)
    plan.weapons[0] = { ...plan.weapons[0]!, min: 250, max: 250, speedSec: 3.5, normalizedSpeed: 3.3 }
    setAttackPower(plan, 1200)
    plan.fight.targetArmor = 3731
    const s = addSpell(plan, { defense: DEFENSE.melee, weaponPercent: 0.7, spCoefficient: 0.203, noActiveDefense: true, alwaysHit: true })
    const n = addSpell(plan, { defense: DEFENSE.melee, weaponPercent: 0.4, normalized: true, min: 93, max: 93, spCoefficient: 0.429, noActiveDefense: true, alwaysHit: true })
    line(plan, addSpellAbility(plan, s, { cooldownMs: 1000000 }))
    line(plan, addSpellAbility(plan, n, { cooldownMs: 1000000 }))
    expect(damages(plan, plan.spells![s].source, 1)[0]).toBeCloseTo(0.7 * (250 + 300) + 20.3, 9)
    // Normalized (3.3 s) with its own flat part inside the share (Holy Strike, worked example 5).
    expect(damages(plan, plan.spells![n].source, 1)[0]).toBeCloseTo(0.4 * (250 + (1200 * 3.3) / 14 + 93) + 42.9, 9)
  })

  it('takes its own and the Holy multipliers, then the target’s flat Holy damage taken × its share, then the crit', () => {
    const plan = spellPlan(60000, 5000, 100)
    alwaysLandNoCrit(plan)
    plan.damageMult = 1.02
    plan.holyMult = 1.1
    const holy = addAura(plan, { id: 'holyUp', name: 'Holy', durationMs: 1e9, mods: {} })
    plan.auras[holy].holy = 5
    const taken = addAura(plan, { id: 'jotc', name: 'JotC', durationMs: 1e9, mods: {} })
    plan.auras[taken].holyTaken = 161
    const s = addSpell(plan, { alwaysHit: true, min: 200, max: 200, spCoefficient: 0.5, takenScale: 0.429, damageMult: 1.15 })
    const buff = addSpellAbility(plan, -1, { kind: 'cast', aura: holy, gcdMs: 0, cooldownMs: 1e9 })
    const debuff = addSpellAbility(plan, -1, { kind: 'cast', aura: taken, gcdMs: 0, cooldownMs: 1e9 })
    const cast = addSpellAbility(plan, s, { cooldownMs: 1e9, gcdMs: 0 })
    line(plan, buff)
    line(plan, debuff)
    line(plan, cast)
    const expected = (200 + 50) * 1.15 * 1.02 * 1.1 * 1.05 + 161 * 0.429
    expect(damages(plan, plan.spells![s].source, 1)[0]).toBeCloseTo(expected, 9)
    plan.stats.spellCrit = 100
    expect(damages(plan, plan.spells![s].source, 1)[0]).toBeCloseTo(expected * 1.5, 9)
  })
})

describe('threat (threat.md#paladin-righteous-fury)', () => {
  it('multiplies Holy spells’ threat by the Holy threat multiplier, and not white hits', () => {
    const plan = spellPlan(60000)
    alwaysLandNoCrit(plan)
    plan.holyThreatMult = 1.9
    plan.threatMult = 0.8
    const s = addSpell(plan, { alwaysHit: true, min: 100, max: 100, threatMult: 1.25 })
    line(plan, addSpellAbility(plan, s, { cooldownMs: 1e9 }))
    const sim = run(plan, 1)
    const row = plan.spells![s].source
    expect(counter(sim, row, FIELD.threat)).toBeCloseTo(100 * 1.25 * 1.9 * 0.8, 9)
    expect(counter(sim, 0, FIELD.threat)).toBeCloseTo(counter(sim, 0, FIELD.damage) * 0.8, 6)
  })
})

describe('mana (paladin.md#mana-model; character-stats.md#spirit-and-mana-regeneration)', () => {
  it('starts full, pays each cost, and doesn’t use an ability it can’t afford', () => {
    const plan = spellPlan(60000, 1000)
    const s = addSpell(plan, { alwaysHit: true, min: 1, max: 1 })
    const a = addSpellAbility(plan, s, { ...mana(300), gcdMs: 1500 })
    line(plan, a)
    const { uses, sim } = timeline(plan)
    // 1000 mana pays three 300s, at 0, 1.5 and 3 s; then nothing regenerates.
    expect(uses[a]).toEqual([0, 1500, 3000])
    expect(sim.totalManaSpentTenths).toBe(9000)
  })

  it('ticks every 2 s from a random phase: Spirit regen outside the five-second rule, mp5 always, Reverence’s share inside', () => {
    // 50 mana of Spirit regen and 10 of mp5 a tick; one 3000-mana cast at 0 starts the rule.
    for (const inFsr of [0, 0.3]) {
      const plan = spellPlan(12500, 10000)
      plan.mana = { ...plan.mana!, regenTickTenths: 500, mp5TickTenths: 100, inFsrShare: inFsr }
      const s = addSpell(plan, { alwaysHit: true, min: 1, max: 1 })
      line(plan, addSpellAbility(plan, s, { ...mana(3000), cooldownMs: 1e9 }))
      const phases = new Set<number>()
      for (let fight = 0; fight < 10; fight++) {
        const sim = new Sim(plan)
        const ticks: [number, number][] = []
        sim.manaTrace = (t, tenths) => ticks.push([t, tenths])
        sim.runFight(fight)
        expect(ticks[0][0]).toBeLessThan(2000)
        phases.add(ticks[0][0])
        for (const [k, [t, tenths]] of ticks.entries()) {
          if (k > 0) expect(t - ticks[k - 1][0]).toBe(2000)
          expect(tenths).toBeCloseTo(100 + (t >= 5000 ? 500 : 500 * inFsr), 9)
        }
        expect(sim.totalManaGainedTenths).toBeCloseTo(ticks.reduce((n, [, x]) => n + x, 0), 9)
      }
      expect(phases.size).toBeGreaterThan(1)
    }
  })

  it('caps at the maximum, and makes 0.5 threat per mana a spell effect returns', () => {
    const plan = spellPlan(10000, 1000)
    const s = addSpell(plan, { alwaysHit: true, min: 0, max: 0 })
    const a = addSpellAbility(plan, s, { ...mana(100), manaReturnTenths: 600, manaReturnChance: 1, cooldownMs: 1e9 })
    line(plan, a)
    const sim = run(plan, 1)
    expect(sim.totalManaGainedTenths).toBe(600)
    expect(counter(sim, plan.spells![s].source, FIELD.threat)).toBeCloseTo(30, 9)
    const full = spellPlan(10000, 1000)
    const t = addSpell(full, { alwaysHit: true })
    line(full, addSpellAbility(full, t, { ...mana(0), manaReturnTenths: 600, manaReturnChance: 1, cooldownMs: 1e9 }))
    expect(run(full, 1).totalManaGainedTenths).toBe(0)
  })

  it('waits for mana when a line needs at least some (COND.minMana)', () => {
    const plan = spellPlan(30000, 1000)
    plan.mana!.regenTickTenths = 1000
    const s = addSpell(plan, { alwaysHit: true })
    const a = addSpellAbility(plan, s, { ...mana(500), gcdMs: 0 })
    line(plan, a, [{ code: COND.minMana, a: 9000, b: 0 }])
    const sim = new Sim(plan)
    const uses: number[] = []
    const ticks: number[] = []
    sim.castTrace = (_, t) => uses.push(t)
    sim.manaTrace = (t) => ticks.push(t)
    sim.runFight(0)
    // 1000 → cast (500) → 100 a tick outside the rule, from 5 s on: at 900, on the fourth such tick.
    const outside = ticks.filter((t) => t >= 5000)
    expect(uses.slice(0, 2)).toEqual([0, outside[3]])
  })
})

describe('cooldown categories and exclusive auras (paladin.md#implementation-notes)', () => {
  it('starts a category’s cooldown on all its abilities, at the length of the one used', () => {
    const plan = spellPlan(30000)
    const s = addSpell(plan, { alwaysHit: true })
    const a = addSpellAbility(plan, s, { cooldownMs: 12000, gcdMs: 0, category: 'strike' })
    const b = addSpellAbility(plan, s, { cooldownMs: 6000, gcdMs: 0, category: 'strike' })
    line(plan, a)
    line(plan, b)
    const { uses } = timeline(plan)
    expect(uses[a]).toEqual([0, 12000, 24000])
    expect(uses[b]).toEqual([])
  })

  it('ends the other auras of a group when one goes up', () => {
    const plan = spellPlan(10000)
    const first = addAura(plan, { id: 'first', name: 'First', durationMs: 30000, mods: {} })
    const second = addAura(plan, { id: 'second', name: 'Second', durationMs: 30000, mods: {} })
    plan.auras[first].group = 'seal'
    plan.auras[second].group = 'seal'
    const a = addSpellAbility(plan, -1, { kind: 'cast', aura: first, gcdMs: 0, cooldownMs: 1e9 })
    const b = addSpellAbility(plan, -1, { kind: 'cast', aura: second, gcdMs: 0, cooldownMs: 1e9 })
    line(plan, a)
    line(plan, b, [{ code: COND.timeLeftAtMost, a: 6000, b: 0 }])
    const sim = run(plan, 1)
    expect(sim.auraUpMs[first]).toBe(4000)
    expect(sim.auraUpMs[second]).toBe(6000)
  })
})

describe('warrior plans', () => {
  it('have no mana and no spells', () => {
    const plan = armsPlan(10000)
    expect(plan.mana).toBeUndefined()
    expect(plan.spells).toBeUndefined()
    expect(new Sim(plan).inspect().maxMana).toBe(0)
  })
})
