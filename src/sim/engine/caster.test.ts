// The caster core (docs/mechanics/spells.md), with hand-built plans: a warrior plan from
// test-helpers with no weapon, mana, and spells added one by one, its stats set directly. Every
// number here is a test input, not a base stat or a class's spell. Each describe names the doc
// section it checks; the worked examples are in spells-examples.test.ts.
import { describe, expect, it } from 'vitest'
import { averageResist, levelResistance } from '../core/attack-table'
import { spellCritMultiplier } from '../core/formulas'
import { type AbilityPlan, ACTION, CASTER_ROW, COND, DEFENSE, MAGIC_SCHOOLS, type Plan, SCHOOL, SCHOOL_COUNT, type SchoolPlan, schoolMask, type SpellPlan, TRIGGER } from '../plan/types'
import { CLASSIC_ERA } from '../rules/profiles'
import { FIELD, Sim } from './sim'
import { addAura, addProc, armsPlan, at, counter, damages, from, line, timeline } from './test-helpers'

/** A level-63 boss's average partial resist at level 60: 0.75 × 24 / 300 = 6% (combat-tables §9). */
const RESIST = averageResist(levelResistance(63, 60), 60)

/**
 * A caster with no weapon (no white swings), 100,000 mana and no regeneration, whose spells never
 * miss and never crit unless a test says so, and no spell damage.
 */
function casterPlan(durationMs = 60000): Plan {
  const plan = armsPlan(durationMs)
  plan.weapons = [null, null]
  plan.mana = { maxTenths: 10 * 100000, regenTickTenths: 0, fiveSecondRuleMs: 5000 }
  plan.spells = []
  plan.rage.maxTenths = 0
  const s = plan.stats
  s.hitRating = 0
  s.critRating = 0
  s.spellHit = 100
  s.spellCrit = -100
  s.spellDamage = 0
  return plan
}

/** A Fire spell of `patch` (magic class, no damage), with its own breakdown row. */
function addSpell(plan: Plan, patch: Partial<SpellPlan> = {}): number {
  const i = plan.spells!.length
  plan.sources.push({ id: `spell${i}`, name: `Spell ${i}`, icon: 'x' })
  plan.spells!.push({
    id: `spell${i}`,
    school: SCHOOL.fire,
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
    critMultiplier: 1.5,
    bonusCrit: 0,
    damageMult: 1,
    threatMult: 1,
    threatBonus: 0,
    source: plan.sources.length - 1,
    ...patch,
  })
  return i
}

/** A caster's ability (`kind` spell by default) that casts `spell` on its row: CASTER_ROW's fields, 1.5 s GCD, mana. */
function addCaster(plan: Plan, spell: number, patch: Partial<AbilityPlan> = {}): number {
  const source = spell >= 0 ? plan.spells![spell].source : plan.sources.push({ id: `cast${plan.abilities.length}`, name: 'Cast', icon: 'x' }) - 1
  plan.abilities.push({
    ...CASTER_ROW,
    window: -1,
    offHandSource: -1,
    id: `ability${plan.abilities.length}`,
    name: 'Ability',
    icon: 'x',
    source,
    kind: 'spell',
    resource: 'mana',
    costTenths: 0,
    cooldownMs: 0,
    gcdMs: 1500,
    castMs: 0,
    aura: -1,
    spell,
    ...patch,
  })
  return plan.abilities.length - 1
}

/** An off-GCD `cast` that puts `aura` up (a trinket or Power Infusion). */
const addBuffCast = (plan: Plan, aura: number, cooldownMs = 600000) => addCaster(plan, -1, { kind: 'cast', gcdMs: 0, cooldownMs, aura })

/** A plain school plan: every school ×1, ×1, +0, and the boss's level-based resistance. */
function plainSchools(): SchoolPlan {
  const r = levelResistance(63, 60)
  return {
    damage: Array(SCHOOL_COUNT).fill(1),
    taken: Array(SCHOOL_COUNT).fill(1),
    crit: Array(SCHOOL_COUNT).fill(0),
    resistance: [r, r, r, r, r, 0, 0],
  }
}

function run(plan: Plan, fights: number) {
  const sim = new Sim(plan)
  for (let i = 0; i < fights; i++) sim.runFight(i)
  return sim
}

const round = (x: number) => Math.round(x * 1e6) / 1e6

/** Every landed hit's damage (rounded) of one spell, cast on each GCD for 15 s in a plan of its own. */
function landed(patch: Partial<SpellPlan>, setup: (plan: Plan) => void = () => {}): Set<number> {
  const plan = casterPlan(15000)
  setup(plan)
  const s = addSpell(plan, patch)
  line(plan, addCaster(plan, s))
  return new Set(damages(plan, plan.spells![s].source, 2).map(round))
}
const near = (x: number, p: number, n: number) => expect(Math.abs(x - p)).toBeLessThanOrEqual(4 * Math.sqrt((p * (1 - p)) / n) + 1e-12)

describe('resists and school multipliers (docs/mechanics/spells.md §3, §9)', () => {
  it('partially resists a pure damage spell on average (6% at a +3 boss), never Holy, and never a binary spell once it lands', () => {
    expect(RESIST).toBeCloseTo(0.06, 12)
    expect(landed({ min: 1000, max: 1000 })).toEqual(new Set([round(1000 * (1 - RESIST))]))
    expect(landed({ min: 1000, max: 1000, school: SCHOOL.holy })).toEqual(new Set([1000]))
    expect(landed({ min: 1000, max: 1000, school: SCHOOL.frost, binary: true })).toEqual(new Set([1000]))
  })

  it('resists a binary spell whole in its hit roll: miss + (1 − miss) × resist, 21.98% at 17% miss; a plain one only misses', () => {
    const plan = casterPlan(60000)
    plan.stats.spellHit = 0
    const binary = addSpell(plan, { min: 100, max: 100, school: SCHOOL.frost, binary: true })
    line(plan, addCaster(plan, binary))
    const sim = run(plan, 300)
    const row = plan.spells![binary].source
    const n = counter(sim, row, FIELD.casts)
    near(counter(sim, row, FIELD.misses) / n, 0.17 + 0.83 * RESIST, n)
    const plainPlan = casterPlan(60000)
    plainPlan.stats.spellHit = 0
    const plain = addSpell(plainPlan, { min: 100, max: 100, school: SCHOOL.frost })
    line(plainPlan, addCaster(plainPlan, plain))
    const plainSim = run(plainPlan, 300)
    const plainRow = plainPlan.spells![plain].source
    near(counter(plainSim, plainRow, FIELD.misses) / counter(plainSim, plainRow, FIELD.casts), 0.17, counter(plainSim, plainRow, FIELD.casts))
  })

  it('multiplies by your school multiplier and the boss’s damage taken of the school, and reads each school’s resistance', () => {
    const schools = (plan: Plan) => {
      plan.schools = plainSchools()
      plan.schools.damage[SCHOOL.fire] = 1.2
      plan.schools.taken[SCHOOL.fire] = 1.1
      // A Shadow resistance of 0 (spell penetration's; spells.md §3).
      plan.schools.resistance[SCHOOL.shadow] = 0
    }
    expect(landed({ min: 1000, max: 1000 }, schools)).toEqual(new Set([round(1000 * 1.2 * 1.1 * (1 - RESIST))]))
    expect(landed({ min: 1000, max: 1000, school: SCHOOL.shadow }, schools)).toEqual(new Set([1000]))
  })

  it('applies the boss’s Holy damage taken after Judgement of the Crusader’s flat bonus, and your Holy multiplier before it', () => {
    const plan = casterPlan(15000)
    plan.schools = plainSchools()
    plan.schools.taken[SCHOOL.holy] = 1.1
    plan.schools.damage[SCHOOL.holy] = 1.5
    const jotc = addAura(plan, { id: 'jotc', name: 'JotC', durationMs: 600000, mods: {} })
    plan.auras[jotc].holyTaken = 100
    line(plan, addBuffCast(plan, jotc))
    const holy = addSpell(plan, { min: 1000, max: 1000, school: SCHOOL.holy, takenScale: 1 })
    line(plan, addCaster(plan, holy))
    expect(new Set(damages(plan, plan.spells![holy].source, 1).map(round))).toEqual(new Set([round((1000 * 1.5 + 100) * 1.1)]))
  })

  it('gives item procs their school’s multipliers, resist and crit too', () => {
    const plan = casterPlan(15000)
    plan.schools = plainSchools()
    plan.schools.taken[SCHOOL.nature] = 1.1
    const proc = addProc(plan, { trigger: TRIGGER.spellLanded, chance: [1, 1], hands: 0, action: ACTION.spellDamage, amount: 0, a: 100, b: 100, school: SCHOOL.nature })
    plan.sources.push({ id: 'proc', name: 'Proc', icon: 'x' })
    plan.procs[proc].source = plan.sources.length - 1
    line(plan, addCaster(plan, addSpell(plan, { min: 1, max: 1 })))
    expect(new Set(damages(plan, plan.procs[proc].source, 1).map(round))).toEqual(new Set([round(100 * (1 - RESIST) * 1.1)]))
  })
})

describe('spell crit (docs/mechanics/spells.md §2)', () => {
  it('crits ×1.5, and ×2 with a talent that doubles the crit bonus', () => {
    expect(spellCritMultiplier()).toBe(1.5)
    expect(spellCritMultiplier(100)).toBe(2)
    expect(spellCritMultiplier(60)).toBeCloseTo(1.8, 12)
    const allCrit = (plan: Plan) => (plan.stats.spellCrit = 200)
    expect(landed({ min: 1000, max: 1000, school: SCHOOL.holy }, allCrit)).toEqual(new Set([1500]))
    expect(landed({ min: 1000, max: 1000, school: SCHOOL.holy, critMultiplier: spellCritMultiplier(100) }, allCrit)).toEqual(new Set([2000]))
  })

  it('adds a school’s crit: static (a talent’s) and an aura’s per stack (Winter’s Chill), for that school only', () => {
    const fireCrit = (plan: Plan) => {
      plan.schools = plainSchools()
      plan.schools.crit[SCHOOL.fire] = 300
    }
    expect(landed({ min: 100, max: 100, school: SCHOOL.fire }, fireCrit)).toEqual(new Set([round(150 * (1 - RESIST))]))
    expect(landed({ min: 100, max: 100, school: SCHOOL.frost }, fireCrit)).toEqual(new Set([round(100 * (1 - RESIST))]))

    const chill = casterPlan(15000)
    const aura = addAura(chill, { id: 'wintersChill', name: 'Winter’s Chill', durationMs: 15000, maxStacks: 5, mods: {} })
    Object.assign(chill.auras[aura], { schoolMask: schoolMask(['frost']), schoolCrit: 50 })
    const bolt = addSpell(chill, { min: 100, max: 100, school: SCHOOL.frost })
    // Each landed Frost spell adds a stack: from the third, +150% − 100% ≥ 50%… every one from the third crits.
    addProc(chill, { trigger: TRIGGER.spellLanded, chance: [1, 1], hands: 0, action: ACTION.aura, amount: aura, b: 0, schools: schoolMask(['frost']) })
    chill.stats.spellCrit = -100
    line(chill, addCaster(chill, bolt))
    const sim2 = new Sim(chill)
    const crits: boolean[] = []
    sim2.damageTrace = (_s, d) => crits.push(round(d) === round(150 * (1 - RESIST)))
    sim2.runFight(0)
    // Stacks before each cast: 0, 1, 2, 3, … → crit chance −100, −50, 0, 50, 100, 150…
    expect(crits.slice(0, 2)).toEqual([false, false])
    expect(crits.slice(4)).toEqual(crits.slice(4).map(() => true))
    expect(new Sim(chill).inspect().schoolCrit).toEqual([0, 0, 0, 0, 0, 0, 0])
  })
})

describe('spell damage by school (docs/mechanics/spells.md §5)', () => {
  it('adds each school’s own line to the all-schools spell damage, and Holy reads the paladin’s', () => {
    const gear = (plan: Plan) => Object.assign(plan.stats, { spellDamage: 100, shadowSpellDamage: 50, fireSpellDamage: 20, holySpellDamage: 7 })
    const plan = casterPlan(15000)
    gear(plan)
    expect(new Sim(plan).inspect().schoolSpellDamage.slice(0, 6)).toEqual([120, 100, 150, 100, 100, 107])
    expect(landed({ spCoefficient: 1, school: SCHOOL.shadow }, gear)).toEqual(new Set([round(150 * (1 - RESIST))]))
    expect(landed({ spCoefficient: 0.5, school: SCHOOL.fire }, gear)).toEqual(new Set([round(60 * (1 - RESIST))]))
  })

  it('takes an aura’s spell damage while it’s up (a trinket’s)', () => {
    const plan = casterPlan(15000)
    const trinket = addAura(plan, { id: 'trinket', name: 'Trinket', durationMs: 4000, mods: {} })
    plan.auras[trinket].spellDamage = 175
    const holy = addSpell(plan, { spCoefficient: 1, school: SCHOOL.holy })
    line(plan, addBuffCast(plan, trinket))
    line(plan, addCaster(plan, holy))
    // Casts at 0, 1.5, 3, 4.5 s: the first three with the trinket.
    expect(damages(plan, plan.spells![holy].source, 1).slice(0, 4)).toEqual([175, 175, 175, 0])
  })
})

describe('cast times and casting speed (docs/mechanics/spells.md §4)', () => {
  it('holds the GCD and every other cast until the cast lands; casting speed divides a hasted cast, not the 1.5 s GCD', () => {
    const cases: [number, boolean, number, number[]][] = [
      [3000, false, 1.2, [0, 3000, 6000]],
      [3000, true, 1.2, [0, 2500, 5000]],
      [1500, true, 1.2, [0, 1500, 3000]],
      [2000, true, 1.25, [0, 1600, 3200]],
    ]
    for (const [castMs, castHasted, haste, uses] of cases) {
      const plan = casterPlan(10000)
      plan.stats.castHaste = haste
      line(plan, addCaster(plan, addSpell(plan, { min: 1, max: 1 }), { castMs, castHasted }))
      expect(timeline(plan).uses[0].slice(0, 3), `${castMs} ms, hasted ${castHasted}`).toEqual(uses)
    }
  })

  it('takes an aura’s casting speed while it’s up', () => {
    const plan = casterPlan(20000)
    const quicken = addAura(plan, { id: 'quicken', name: 'Quicken', durationMs: 5000, mods: {} })
    plan.auras[quicken].castHaste = 25
    line(plan, addBuffCast(plan, quicken))
    line(plan, addCaster(plan, addSpell(plan, { min: 1, max: 1 }), { castMs: 2500, castHasted: true }))
    // 2.5 s ÷ 1.25 = 2 s while it's up (0–5 s), then 2.5 s.
    expect(timeline(plan).uses[1].slice(0, 5)).toEqual([0, 2000, 4000, 6000, 8500])
  })

  it('lets off-GCD lines act during a cast, unless the cast holds them; pays its mana when it lands', () => {
    for (const holds of [false, true]) {
      const plan = casterPlan(10000)
      const long = addCaster(plan, addSpell(plan, { min: 1, max: 1 }), { castMs: 3000, costTenths: 1000, castHoldsOffGcd: holds, cooldownMs: 3000 })
      const aura = addAura(plan, { id: 'buff', name: 'Buff', durationMs: 1000, mods: {} })
      const offGcd = addBuffCast(plan, aura)
      line(plan, long)
      line(plan, offGcd, [from(plan, 1000)])
      const sim = new Sim(plan)
      const uses: number[] = []
      const mana: number[] = []
      sim.castTrace = (a, t, pool) => {
        if (a === offGcd) uses.push(t)
        if (a === long) mana.push(pool)
      }
      sim.runFight(0)
      expect(uses[0], `holds ${holds}`).toBe(holds ? 3000 : 1000)
      // The trace sees the pool as each cast starts: the first cast's 100 is paid as it lands at 3 s.
      expect(mana.slice(0, 2)).toEqual([1000000, 999000])
    }
  })
})

describe('channels (docs/mechanics/spells.md §6)', () => {
  /** An Arcane Missiles: 5 ticks, 1 s apart, of a 100-damage Arcane spell each, 1.5 s GCD, 100 mana at the start. */
  function missiles(channelTicks = 0, durationMs = 20000) {
    const plan = casterPlan(durationMs)
    const missile = addSpell(plan, { min: 100, max: 100, school: SCHOOL.arcane, triggersProcs: false })
    const channel = addCaster(plan, -1, { kind: 'channel', tickSpell: missile, rageTicks: 5, rageTickMs: 1000, costTenths: 1000, channelTicks })
    plan.abilities[channel].source = plan.spells![missile].source
    line(plan, channel)
    return { plan, channel, missile }
  }

  it('casts its tick spell every tick and holds the GCD until the last, then the next starts', () => {
    const { plan, channel } = missiles()
    const t = timeline(plan)
    expect(t.uses[channel].slice(0, 3)).toEqual([0, 5000, 10000])
    expect(t.ticks.slice(0, 6)).toEqual([1000, 2000, 3000, 4000, 5000, 6000])
  })

  it('is cut off after `channelTicks` ticks: the rest are lost, and the GCD still runs its 1.5 s', () => {
    const three = missiles(3)
    const t3 = timeline(three.plan)
    expect(t3.uses[three.channel].slice(0, 3)).toEqual([0, 3000, 6000])
    expect(t3.ticks.slice(0, 6)).toEqual([1000, 2000, 3000, 4000, 5000, 6000])
    const one = missiles(1)
    const t1 = timeline(one.plan)
    expect(t1.uses[one.channel].slice(0, 3)).toEqual([0, 1500, 3000])
    expect(t1.ticks.slice(0, 3)).toEqual([1000, 2500, 4000])
  })

  it('pays its mana as it starts, which starts the five-second rule then', () => {
    const { plan } = missiles(0, 5000)
    plan.mana!.regenTickTenths = 100
    const sim = new Sim(plan)
    const regen: [number, number][] = []
    sim.manaTrace = (t, tenths) => regen.push([t, tenths])
    sim.runFight(0)
    // Spent at 0 s: no Spirit regen on the ticks before 5 s.
    expect(regen.every(([t, tenths]) => (t < 5000 ? tenths === 0 : tenths === 100))).toBe(true)
    expect(sim.totalManaSpentTenths).toBe(1000)
  })

  it('with a DoT spell (Mind Flay), rolls its hit once as it starts: its ticks are the channel; a miss ends it at once', () => {
    for (const hit of [100, -100]) {
      const plan = casterPlan(10000)
      plan.stats.spellHit = hit
      const flay = addSpell(plan, { school: SCHOOL.shadow, binary: true, dotTicks: 3, dotTickMs: 1000, dotTickDamage: 100 })
      const channel = addCaster(plan, flay, { kind: 'channel' })
      line(plan, channel)
      const t = timeline(plan)
      const row = plan.spells![flay].source
      if (hit > 0) {
        expect(t.uses[channel].slice(0, 3)).toEqual([0, 3000, 6000])
        expect(t.ticks.slice(0, 4)).toEqual([1000, 2000, 3000, 4000])
        // A binary spell's ticks aren't partially resisted.
        expect(new Set(damages(plan, row, 1))).toEqual(new Set([100]))
      } else {
        expect(t.uses[channel].slice(0, 3)).toEqual([0, 1500, 3000])
        expect(t.ticks).toEqual([])
        expect(counter(t.sim, row, FIELD.misses)).toBe(counter(t.sim, row, FIELD.casts))
      }
    }
  })

  it('starts channeling when a cast before it lands', () => {
    const { plan, channel } = missiles()
    plan.abilities[channel].castMs = 1000
    const t = timeline(plan)
    expect(t.uses[channel].slice(0, 2)).toEqual([0, 6000])
    expect(t.ticks.slice(0, 5)).toEqual([2000, 3000, 4000, 5000, 6000])
  })

  it('cuts a DoT channel’s ticks off too, and its marker with them', () => {
    const plan = casterPlan(10000)
    const flay = addSpell(plan, { school: SCHOOL.shadow, dotTicks: 3, dotTickMs: 1000, dotTickDamage: 100 })
    const marker = addAura(plan, { id: 'flay', name: 'Flay', durationMs: 3000, mods: {} })
    plan.spells![flay].dotAura = marker
    const channel = addCaster(plan, flay, { kind: 'channel', channelTicks: 2, aura: marker })
    line(plan, channel)
    const t = timeline(plan)
    expect(t.uses[channel].slice(0, 3)).toEqual([0, 2000, 4000])
    expect(t.ticks.slice(0, 4)).toEqual([1000, 2000, 3000, 4000])
    // Up for the two ticks of each channel: 10 s of 10.
    expect(t.sim.auraUpMs[marker]).toBe(10000)
  })
})

describe('spell DoTs (docs/mechanics/spells.md §7)', () => {
  /** A Corruption: a pure Shadow DoT of 6 ticks, 3 s apart, 100 + 0.2 × spell damage each, marked on the boss. */
  function corruption(durationMs = 60000) {
    const plan = casterPlan(durationMs)
    const dot = addSpell(plan, { school: SCHOOL.shadow, dotTicks: 6, dotTickMs: 3000, dotTickDamage: 100, dotSpCoefficient: 0.2 })
    const marker = addAura(plan, { id: 'corruption', name: 'Corruption', durationMs: 18000, mods: {} })
    plan.spells![dot].dotAura = marker
    const ability = addCaster(plan, dot, { aura: marker })
    return { plan, dot, marker, ability, row: plan.spells![dot].source }
  }

  it('ticks from its landing, is recast when its marker drops (the last tick lands first), and counts applications and ticks', () => {
    const { plan, ability, row, marker } = corruption()
    line(plan, ability, [{ code: COND.abilityAuraDown, a: ability, b: 0 }])
    const t = timeline(plan)
    expect(t.uses[ability]).toEqual([0, 18000, 36000, 54000])
    expect(t.ticks.slice(0, 7)).toEqual([3000, 6000, 9000, 12000, 15000, 18000, 21000])
    // 6 + 6 + 6 + 1 (57 s; the tick at 60 s is past the end).
    expect([counter(t.sim, row, FIELD.casts), counter(t.sim, row, FIELD.hits)]).toEqual([4, 19])
    expect(t.sim.auraUpMs[marker]).toBe(60000)
    expect(new Set(damages(plan, row, 1).map(round))).toEqual(new Set([round(100 * (1 - RESIST))]))
  })

  it('snapshots your spell damage and multipliers as it lands, but reads the boss’s damage taken at each tick', () => {
    const { plan, ability, row } = corruption(40000)
    const power = addAura(plan, { id: 'power', name: 'Power', durationMs: 60000, mods: {} })
    Object.assign(plan.auras[power], { spellDamage: 500, schoolMask: schoolMask(['shadow']), schoolDamage: 50 })
    const vulnerable = addAura(plan, { id: 'vuln', name: 'Vulnerable', durationMs: 60000, mods: {} })
    Object.assign(plan.auras[vulnerable], { schoolMask: schoolMask(['shadow']), schoolTaken: 10 })
    line(plan, ability, [{ code: COND.abilityAuraDown, a: ability, b: 0 }])
    line(plan, addBuffCast(plan, power), [from(plan, 1000)])
    line(plan, addBuffCast(plan, vulnerable), [from(plan, 7000)])
    const ticks = damages(plan, row, 1).map(round)
    const f = 1 - RESIST
    // Ticks 1–2 (3, 6 s): the snapshot without Power, no Vulnerable; 3–6: Vulnerable ×1.1; from 18 s the new snapshot with Power.
    expect(ticks.slice(0, 7)).toEqual([100 * f, 100 * f, 110 * f, 110 * f, 110 * f, 110 * f, 200 * 1.5 * 1.1 * f].map(round))
  })

  it('restarts when reapplied: a tick due that moment lands first, the partial tick is lost', () => {
    const { plan, ability } = corruption(30000)
    line(plan, ability, [{ code: COND.abilityAuraDown, a: ability, b: 0 }])
    line(plan, ability, at(plan, 9000))
    line(plan, ability, at(plan, 10500))
    const t = timeline(plan)
    expect(t.uses[ability]).toEqual([0, 9000, 10500, 28500])
    // 3, 6, 9 s; then from 9 s: 12 s would be next, but the recast at 10.5 s restarts it: 13.5, 16.5, …
    expect(t.ticks.slice(0, 6)).toEqual([3000, 6000, 9000, 13500, 16500, 19500])
  })

  it('crits only with the spell’s periodic-crit flag, in a profile whose periodic effects can (forever), at the snapshot’s crit ×its multiplier', () => {
    for (const [profile, flag, crits] of [
      ['forever', true, true],
      ['forever', false, false],
      ['classicEra', true, false],
    ] as const) {
      const { plan, ability, row, dot } = corruption(20000)
      if (profile === 'classicEra') plan.profile = CLASSIC_ERA
      plan.spells![dot].dotCanCrit = flag
      plan.stats.spellCrit = 200
      line(plan, ability, [{ code: COND.abilityAuraDown, a: ability, b: 0 }])
      const sim = run(plan, 1)
      expect(counter(sim, row, FIELD.crits) > 0, `${profile} ${flag}`).toBe(crits)
      if (crits) expect(counter(sim, row, FIELD.hits)).toBe(0)
    }
  })

  it('gives a hybrid’s DoT its own row, which counts an application per landed hit (Fireball)', () => {
    const plan = casterPlan(10000)
    const dotRow = plan.sources.push({ id: 'fireballDot', name: 'Fireball (DoT)', icon: 'x' }) - 1
    const fireball = addSpell(plan, { min: 500, max: 500, spCoefficient: 1, dotTicks: 4, dotTickMs: 2000, dotTickDamage: 20, dotSource: dotRow })
    line(plan, addCaster(plan, fireball, { castMs: 3500 }))
    const sim = run(plan, 1)
    const row = plan.spells![fireball].source
    // Casts land at 3.5 and 7 s; ticks at 5.5 s, then the recast restarts them: 9 s.
    expect([counter(sim, row, FIELD.casts), counter(sim, row, FIELD.hits)]).toEqual([2, 2])
    expect([counter(sim, dotRow, FIELD.casts), counter(sim, dotRow, FIELD.hits)]).toEqual([2, 2])
  })
})

describe('school auras and spell procs (docs/mechanics/spells.md §9, §10, §11)', () => {
  it('multiplies your damage with an aura’s schools while it’s up (Power Infusion), and the boss’s damage taken per stack (Fire Vulnerability)', () => {
    const plan = casterPlan(20000)
    const pi = addAura(plan, { id: 'pi', name: 'Power Infusion', durationMs: 3000, mods: {} })
    Object.assign(plan.auras[pi], { schoolMask: schoolMask(MAGIC_SCHOOLS), schoolDamage: 20 })
    const vuln = addAura(plan, { id: 'fireVuln', name: 'Fire Vulnerability', durationMs: 30000, maxStacks: 5, mods: {} })
    Object.assign(plan.auras[vuln], { schoolMask: schoolMask(['fire']), schoolTaken: 3 })
    const scorch = addSpell(plan, { min: 1000, max: 1000 })
    // Improved Scorch: each landed Scorch adds a stack after its own damage.
    addProc(plan, { trigger: TRIGGER.spellLanded, chance: [1, 1], hands: 0, action: ACTION.aura, amount: vuln, b: 0, fromSource: plan.spells![scorch].source })
    line(plan, addBuffCast(plan, pi))
    line(plan, addCaster(plan, scorch))
    const f = 1 - RESIST
    const hits = damages(plan, plan.spells![scorch].source, 1).map(round)
    // Casts at 0 and 1.5 s under PI (up 0–3 s); then 3, 4.5, 6, 7.5, … at 1.03 per stack, up to 5.
    expect(hits.slice(0, 8)).toEqual([1000 * 1.2 * f, 1000 * 1.2 * 1.03 * f, 1000 * 1.06 * f, 1000 * 1.09 * f, 1000 * 1.12 * f, 1000 * 1.15 * f, 1000 * 1.15 * f, 1000 * 1.15 * f].map(round))
  })

  it('fires a spell proc only for its schools or its one spell, and spellTick on each DoT tick', () => {
    const plan = casterPlan(16000)
    const weaving = addAura(plan, { id: 'weaving', name: 'Shadow Weaving', durationMs: 15000, maxStacks: 5, mods: {} })
    const trance = addAura(plan, { id: 'trance', name: 'Shadow Trance', durationMs: 10000, mods: {} })
    addProc(plan, { trigger: TRIGGER.spellLanded, chance: [1, 1], hands: 0, action: ACTION.aura, amount: weaving, b: 0, schools: schoolMask(['shadow']) })
    const fire = addSpell(plan, { min: 1, max: 1 })
    const dot = addSpell(plan, { school: SCHOOL.shadow, dotTicks: 5, dotTickMs: 3000, dotTickDamage: 1 })
    addProc(plan, { trigger: TRIGGER.spellTick, chance: [1, 1], hands: 0, action: ACTION.aura, amount: trance, b: 0, fromSource: plan.spells![dot].source })
    line(plan, addCaster(plan, dot), at(plan, 0))
    line(plan, addCaster(plan, fire))
    const sim = run(plan, 1)
    // One Shadow spell landed (the DoT's application): one stack; the Fire spells gave none.
    expect(sim.auraApplications[weaving]).toBe(1)
    expect(sim.auraApplications[trance]).toBe(5)
  })

  it('auraUp (38): a line waits for an aura to be up', () => {
    const plan = casterPlan(10000)
    const clearcasting = addAura(plan, { id: 'cc', name: 'Clearcasting', durationMs: 1000, mods: {} })
    const nuke = addCaster(plan, addSpell(plan, { min: 1, max: 1 }))
    line(plan, addBuffCast(plan, clearcasting, 4000), [from(plan, 2000)])
    line(plan, nuke, [{ code: COND.auraUp, a: clearcasting, b: 0 }])
    expect(timeline(plan).uses[nuke]).toEqual([2000, 6000])
  })
})

describe('mana hooks (docs/mechanics/spells.md §8)', () => {
  it('multiplies Spirit regeneration by an aura’s (Innervate), and lets its share go on inside the five-second rule', () => {
    const plan = casterPlan(12000)
    plan.mana!.regenTickTenths = 100
    plan.mana!.inFsrShare = 0.3
    const innervate = addAura(plan, { id: 'innervate', name: 'Innervate', durationMs: 60000, mods: {} })
    Object.assign(plan.auras[innervate], { spiritRegen: 400, castingRegen: 100 })
    line(plan, addCaster(plan, addSpell(plan, { min: 1, max: 1 }), { costTenths: 10 }), at(plan, 0))
    line(plan, addBuffCast(plan, innervate), [from(plan, 6000)])
    const sim = new Sim(plan)
    const regen: [number, number][] = []
    sim.manaTrace = (t, tenths) => regen.push([t, tenths])
    sim.runFight(0)
    // Inside the rule before 5 s: 30%; after, 100%; with Innervate from 6 s, ×5 and all of it.
    for (const [t, tenths] of regen) expect(tenths, `${t}`).toBe(t < 5000 ? 30 : t < 6000 ? 100 : 500)
  })
})

describe('determinism (docs/doctrine.md §4)', () => {
  it('gives the same fights for the same plan and seed, fight by fight', () => {
    const build = () => {
      const plan = casterPlan(30000)
      plan.stats.spellHit = 0
      plan.stats.spellCrit = 20
      const dot = addSpell(plan, { school: SCHOOL.shadow, dotTicks: 6, dotTickMs: 3000, dotTickDamage: 100, dotCanCrit: true })
      const marker = addAura(plan, { id: 'dot', name: 'DoT', durationMs: 18000, mods: {} })
      plan.spells![dot].dotAura = marker
      const bolt = addSpell(plan, { school: SCHOOL.frost, min: 400, max: 500, binary: true })
      const missile = addSpell(plan, { school: SCHOOL.arcane, min: 90, max: 110 })
      line(plan, addCaster(plan, dot, { aura: marker }), [{ code: COND.abilityAuraRefresh, a: 0, b: 1500 }])
      const channel = addCaster(plan, -1, { kind: 'channel', tickSpell: missile, rageTicks: 5, rageTickMs: 1000, cooldownMs: 10000 })
      line(plan, channel)
      line(plan, addCaster(plan, bolt, { castMs: 2500, castHasted: true }))
      return plan
    }
    // A fight's randomness depends only on the seed and its index, whatever ran before it.
    const forward = new Sim(build())
    const backward = new Sim(build())
    const a: number[] = []
    const b: number[] = []
    for (let i = 0; i < 40; i++) {
      forward.runFight(i)
      a[i] = forward.fightDamage
    }
    for (let i = 39; i >= 0; i--) {
      backward.runFight(i)
      b[i] = backward.fightDamage
    }
    expect(b).toEqual(a)
    expect(new Set(a).size).toBeGreaterThan(30)
  })
})
