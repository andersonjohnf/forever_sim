// The Feral bear in the engine against docs/classes/druid.md §4 and §9: worked examples W14–W16
// and W19 as the engine deals them, Lacerate's stacks, hit and ticks, Faerie Fire's and
// Demoralizing Roar's debuffs, Berserk's Mangle, Enrage before the pull, Rend and Tear, each
// ability's threat against threat.md's closed form, rage from hits in bear, and determinism. The
// rows and settings are src/sim/classes/druid/bear.test.ts's; the plans here are hand-built from
// the default bear, one ability at a time, as the plan builder adds them.
import { describe, expect, it } from 'vitest'
import { BEAR_IDS, BEAR_PRIORITY, PREPULL_ENRAGE_MS } from '../classes/druid/bear'
import { demoralizingRoar, enrage, FAERIE_FIRE_BEAR, LACERATE, MANGLE, MAUL, SWIPE } from '../classes/druid/bear-abilities'
import { BERSERK } from '../classes/druid/cat-abilities'
import { type TalentRanks, withDruidTalents } from '../classes/druid/modifiers'
import { armorReduction } from '../core/formulas'
import { defaultConfig } from '../defaults'
import { buildPlan } from '../plan/build'
import { type AbilityDef, COND, NO_PREPULL, type Plan, type RotationCondition, TRIGGER_COUNT } from '../plan/types'
import { FOREVER } from '../rules/profiles'
import { DerivedStats, deriveStats, StatBlock } from '../stats/stat-block'
import type { SimConfig } from '../types'
import { emptyAggregate, mergeChunk, toResult } from '../run/aggregate'
import { runChunk } from './chunk'
import { BOSS_OUTCOME, FIELD, SOURCE_MAIN_HAND, Sim } from './sim'
import { addAura, at, counter, damages, expectMean, from, line, setAttackPower, timeline } from './test-helpers'

/** The bear's default build, by talent name. */
const TALENTS: TalentRanks = new Map([
  ['Ferocity', 5],
  ['Savage Fury', 2],
  ['Feral Instinct', 3],
  ['Predatory Instincts', 2],
  ['Genesis', 5],
  ['Rend and Tear', 5],
])

/**
 * The default bear in Dire Bear Form with no buffs, abilities, procs, pre-pull, boss armor or damage
 * multipliers, a fight of exactly `durationMs`, and (unless `boss`) no boss swings. Every attack
 * lands and never crits unless `crit` says otherwise (the target a level below: no glancing).
 */
function bearPlan(durationMs: number, options: { boss?: boolean; crit?: number; config?: Partial<SimConfig> } = {}): Plan {
  const d = defaultConfig('druid-feral-bear')
  const plan = buildPlan({ ...d, ...options.config, buffs: { raid: d.buffs.raid, enabled: [] }, fight: { ...d.fight, durationVariationPct: 0 } }).plan
  plan.abilities = []
  plan.rotation = []
  plan.prepull = NO_PREPULL
  plan.procs = []
  plan.triggers = Array.from({ length: TRIGGER_COUNT }, () => [])
  plan.fight.targetArmor = 0
  plan.fight.durationMs = durationMs
  plan.damageMult = 1
  plan.physicalMult = 1
  delete plan.fight.othersBleed
  if (!options.boss) plan.fight.bossSwing = null
  for (const form of plan.forms!) {
    form.stats.hit = 100
    form.stats.crit = options.crit ?? -100
    form.stats.spellHit = 100
  }
  plan.fight.bossCanDodge = false
  plan.fight.bossCanParry = false
  plan.fight.bossCanBlock = false
  plan.fight.targetLevel = 59
  return plan
}

/**
 * Adds a bear ability as the plan builder does: the druid's talents (Rend and Tear too), a breakdown
 * row, its bleed's own row for an attack that also bleeds, its aura, and the aura that suspends its
 * cooldown. `free` makes it cost nothing.
 */
function addBearAbility(plan: Plan, def: AbilityDef, options: { talents?: TalentRanks; free?: boolean } = {}): number {
  const talents = options.talents ?? TALENTS
  const resolved = withDruidTalents(def, talents)
  const { offHand: _, aura, vsCreature: __, window: ___, auraCrit: ____, noCooldownWhile, ...a } = resolved
  plan.sources.push({ id: a.id, name: a.name, icon: a.icon })
  const source = plan.sources.length - 1
  let dotSource: number | undefined
  if (a.kind !== 'bleed' && a.dotTicks > 0) dotSource = plan.sources.push({ id: `${a.id}Bleed`, name: `${a.name} (bleed)`, icon: a.icon }) - 1
  plan.abilities.push({
    ...a,
    ...(options.free ? { costTenths: 0 } : {}),
    source,
    offHandSource: -1,
    aura: aura ? addAura(plan, aura) : -1,
    window: -1,
    ...(dotSource !== undefined ? { dotSource } : {}),
  })
  if (noCooldownWhile) {
    const i = plan.auras.findIndex((x) => x.id === noCooldownWhile)
    if (i >= 0) plan.abilities[plan.abilities.length - 1].noCooldownAura = i
  }
  return plan.abilities.length - 1
}

/** The plan builder's aura fields the test helper's `addAura` leaves out: debuffs, stacks and item armor. */
function withAuraMods(plan: Plan, a: number, def: AbilityDef): void {
  const aura = plan.auras[plan.abilities[a].aura]
  const m = def.aura!.mods
  aura.maxStacks = def.aura!.maxStacks ?? 1
  if (m.targetArmor) aura.targetArmor = m.targetArmor
  if (m.bossAp) aura.bossAp = m.bossAp
  if (m.itemArmorPct) aura.itemArmorPct = m.itemArmorPct
}

const stacksBelow = (a: number, n: number): RotationCondition => ({ code: COND.abilityAuraStacksBelow, a, b: n })
/** The average dire bear weapon damage at `ap`: the form's 137 plus AP ÷ 14 × 2.5 (W13). */
const wb = (ap: number) => (109.6 + 164.4) / 2 + (ap * 2.5) / 14
const row = (plan: Plan, a: number) => plan.abilities[a].source

describe('the bear’s attacks in the engine (druid.md §4.1–§4.4, W14–W16)', () => {
  it('W14: Maul at 1200 AP deals (351.286 + 128) × 1.10 = 527.214 on average, at 1.75 × the form’s threat, and its swing gives no rage', () => {
    const plan = bearPlan(120000)
    setAttackPower(plan, 1200)
    const maul = addBearAbility(plan, MAUL, { free: true })
    line(plan, maul)
    expectMean(damages(plan, row(plan, maul), 40), 527.214)
    const sim = new Sim(plan)
    sim.runFight(0)
    // Every swing was a Maul: no white swing, and no rage (rage.md#yellow-damage-and-on-next-swing-attacks).
    expect(counter(sim, SOURCE_MAIN_HAND, FIELD.casts)).toBe(0)
    expect(counter(sim, row(plan, maul), FIELD.casts)).toBe(48)
    expect(sim.totalRageGainedTenths).toBe(0)
    const ratio = counter(sim, row(plan, maul), FIELD.threat) / counter(sim, row(plan, maul), FIELD.damage)
    expect(ratio).toBeCloseTo(1.75 * plan.threatMult, 12)
    expect(plan.threatMult).toBeCloseTo(1.3 * 1.02, 12) // Dire Bear Form and the threat gloves
    // Without Maul the same swings are white, and each gives 8.65 rage (no cap here).
    const white = bearPlan(120000)
    white.rage.maxTenths = 1e9
    const whiteSim = new Sim(white)
    whiteSim.runFight(0)
    expect(whiteSim.totalRageGainedTenths).toBe(Math.floor(48 * 86.5))
  })

  it('a Maul that’s dodged or parried refunds 80% of its 10 rage; with too little rage the swing stays white', () => {
    const plan = bearPlan(2600)
    plan.fight.bossCanDodge = true
    for (const form of plan.forms!) form.stats.expertise = -1000 // every special is dodged
    plan.prepull = { casts: [], chargeTenths: 200, keepTenths: -1 }
    const maul = addBearAbility(plan, MAUL)
    line(plan, maul)
    const { sim } = timeline(plan)
    expect(counter(sim, row(plan, maul), FIELD.dodges)).toBe(2)
    // 20 rage, −10 +8 at 0 s, −10 +8 at 2.5 s: 16 left, and no white rage.
    expect(sim.resources().rage).toBe(160)
    const poor = bearPlan(2600)
    poor.prepull = { casts: [], chargeTenths: 90, keepTenths: -1 }
    const m = addBearAbility(poor, MAUL)
    line(poor, m)
    // 9 rage at the first swing: it stays white, and its 8.65 rage pays for the Maul at 2.5 s.
    const s = timeline(poor).sim
    expect(counter(s, SOURCE_MAIN_HAND, FIELD.casts)).toBe(1)
    expect(counter(s, row(poor, m), FIELD.casts)).toBe(1)
  })

  it('W15: Mangle at 1200 AP deals 351.286 + 77 = 428.286 on average (no Savage Fury), at the form’s threat, every 6 s', () => {
    const plan = bearPlan(60000)
    setAttackPower(plan, 1200)
    const mangle = addBearAbility(plan, MANGLE, { free: true })
    line(plan, mangle)
    expectMean(damages(plan, row(plan, mangle), 60), 428.286)
    const { sim, uses } = timeline(plan)
    expect(uses[mangle].slice(0, 4)).toEqual([0, 6000, 12000, 18000])
    expect(counter(sim, row(plan, mangle), FIELD.threat) / counter(sim, row(plan, mangle), FIELD.damage)).toBeCloseTo(plan.threatMult, 12)
  })

  it('W16: Swipe deals 83 × 1.10 × 1.30 = 118.69, at 1.75 × the form’s threat, whatever the attack power', () => {
    const plan = bearPlan(30000)
    setAttackPower(plan, 1200)
    const swipe = addBearAbility(plan, SWIPE, { free: true })
    line(plan, swipe)
    const hits = damages(plan, row(plan, swipe), 3)
    expect(new Set(hits.map((x) => x.toFixed(9)))).toEqual(new Set([(118.69).toFixed(9)]))
    const { sim, uses } = timeline(plan)
    expect(uses[swipe].slice(0, 3)).toEqual([0, 1500, 3000])
    expect(counter(sim, row(plan, swipe), FIELD.threat) / counter(sim, row(plan, swipe), FIELD.damage)).toBeCloseTo(1.75 * plan.threatMult, 12)
  })

  it('Rend and Tear: +10% on a bleeding target, from others’ bleeds or the bear’s own Lacerate', () => {
    const plan = bearPlan(60000)
    setAttackPower(plan, 1200)
    const swipe = addBearAbility(plan, SWIPE, { free: true })
    line(plan, swipe)
    expect(new Set(damages(plan, row(plan, swipe), 1).map((x) => x.toFixed(9)))).toEqual(new Set([(118.69).toFixed(9)]))
    plan.fight.othersBleed = true
    expect(new Set(damages(plan, row(plan, swipe), 1).map((x) => x.toFixed(9)))).toEqual(new Set([(118.69 * 1.1).toFixed(9)]))
    // No others' bleeds: only while the bear's own Lacerate ticks (from 1.5 s to 16.5 s here).
    delete plan.fight.othersBleed
    plan.rotation = []
    const lacerate = addBearAbility(plan, LACERATE, { free: true })
    line(plan, lacerate, at(plan, 1500))
    line(plan, swipe)
    const sim = new Sim(plan)
    const seen: [number, number][] = []
    sim.damageTrace = (s, damage) => {
      if (s === row(plan, swipe)) seen.push([sim['now' as keyof Sim] as unknown as number, damage])
    }
    sim.runFight(0)
    const damageAt = (t: number) => seen.find(([time]) => time === t)![1]
    expect(damageAt(0)).toBeCloseTo(118.69, 9)
    expect(damageAt(3000)).toBeCloseTo(118.69 * 1.1, 9)
    expect(damageAt(18000)).toBeCloseTo(118.69, 9)
  })
})

describe('Lacerate (druid.md §4.3, W19)', () => {
  /** Lacerate for free on every GCD while under 5 stacks, at 1200 AP, in a 40 s fight. */
  function stacking(crit?: number) {
    const plan = bearPlan(40000, { crit })
    setAttackPower(plan, 1200)
    const lacerate = addBearAbility(plan, LACERATE, { free: true })
    withAuraMods(plan, lacerate, LACERATE)
    line(plan, lacerate, [stacksBelow(lacerate, 5)])
    return { plan, lacerate }
  }

  it('stacks to 5, restarting its bleed each time; at 5 it ticks 15 × 5 × 1.05 (Genesis 5/5) = 78.75 every 3 s', () => {
    const { plan, lacerate } = stacking()
    const { sim, uses, ticks } = timeline(plan)
    // Five applications one GCD apart, none while the bleed is at 5, and from 1 stack again when it ends.
    expect(uses[lacerate].slice(0, 7)).toEqual([0, 1500, 3000, 4500, 6000, 21000, 22500])
    // Each application restarts the ticks (the GCD is shorter than the tick), so the first comes 3 s
    // after the fifth; the fifth tick lands at 21 s, as the next stack starts.
    expect(ticks.slice(0, 5)).toEqual([9000, 12000, 15000, 18000, 21000])
    const bleed = plan.abilities[lacerate].dotSource!
    const tickDamage: number[] = []
    const s = new Sim(plan)
    s.damageTrace = (source, damage) => source === bleed && tickDamage.push(damage)
    s.runFight(0)
    expect(tickDamage.slice(0, 5).map((x) => x.toFixed(9))).toEqual(Array(5).fill((78.75).toFixed(9)))
    // It starts again from one stack at 21 s, so the next tick is 3 s after the fifth stack, at 30 s.
    expect(ticks[5]).toBe(30000)
    expect(tickDamage[5]).toBeCloseTo(78.75, 9)
    // Applications count on the bleed's row, ticks as its hits; its threat is one per damage.
    expect(counter(sim, bleed, FIELD.casts)).toBe(uses[lacerate].length)
    expect(counter(sim, bleed, FIELD.threat) / counter(sim, bleed, FIELD.damage)).toBeCloseTo(plan.threatMult, 12)
    // Its marker is up all 40 s, and its stacks × time are (1 + 2 + 3 + 4) × 1.5 s + 5 × 15 s, then
    // (1 + 2 + 3 + 4) × 1.5 s + 5 × 13 s to the fight's end: 90 + 80 = 170 stack-seconds, 4.25 on
    // average (BU5).
    const marker = plan.abilities[lacerate].aura
    expect(sim.auraUpMs[marker]).toBe(40000)
    expect(sim.auraStackMs[marker]).toBe(170000)
  })

  it('hits for 10% of the weapon damage per stack already on the boss: nothing for the first, which can’t crit', () => {
    const { plan, lacerate } = stacking(200)
    // Uses at 0–6 s and 21–27 s, one hit each: the n-th use of a run of five finds n − 1 stacks.
    const hitsByStacks: number[][] = [[], [], [], [], []]
    const sim = new Sim(plan)
    let n = 0
    sim.damageTrace = (source, damage) => {
      if (source === row(plan, lacerate) && n < 10) hitsByStacks[n++ % 5].push(damage)
    }
    for (let f = 0; f < 60; f++) {
      n = 0
      sim.runFight(f)
    }
    expect(hitsByStacks[0]).toEqual(Array(120).fill(0))
    // Each crits for 2.2× (Predatory Instincts 2/2), with Rend and Tear's 10% on the bleeding boss.
    for (let stacks = 1; stacks < 5; stacks++) expectMean(hitsByStacks[stacks], 0.1 * stacks * wb(1200) * 2.2 * 1.1)
    // Every application with stacks on the boss crits; the first of each run can't, so it's a hit.
    expect(counter(sim, row(plan, lacerate), FIELD.hits)).toBe(60 * 2)
  })

  it('its ticks can crit in Forever, at the crit chance when it landed, for 2.2×; never in Classic Era', () => {
    for (const profile of ['forever', 'classicEra'] as const) {
      const plan = bearPlan(20000, { crit: 200, config: { rules: { profile, unmeasuredRatings: 'apply' } } })
      const lacerate = addBearAbility(plan, LACERATE, { free: true })
      withAuraMods(plan, lacerate, LACERATE)
      line(plan, lacerate, [stacksBelow(lacerate, 5)])
      const sim = new Sim(plan)
      sim.runFight(0)
      const bleed = plan.abilities[lacerate].dotSource!
      const crits = counter(sim, bleed, FIELD.crits)
      if (profile === 'forever') {
        expect(crits).toBeGreaterThan(0)
        expect(counter(sim, bleed, FIELD.hits)).toBe(0)
        expect(counter(sim, bleed, FIELD.damage) / crits).toBeCloseTo(78.75 * 2.2, 9)
      } else expect(crits).toBe(0)
    }
  })

  it('at 5 stacks, a refresh from 3 s left keeps the 5 stacks and loses the tick under way', () => {
    const plan = bearPlan(40000)
    const lacerate = addBearAbility(plan, LACERATE, { free: true })
    withAuraMods(plan, lacerate, LACERATE)
    line(plan, lacerate, [stacksBelow(lacerate, 5)])
    line(plan, lacerate, [{ code: COND.abilityAuraRefresh, a: lacerate, b: 3000 }])
    const { uses, ticks } = timeline(plan)
    // The fifth at 6 s runs to 21 s; from 18 s it's refreshed, and again 12 s later.
    expect(uses[lacerate].slice(0, 7)).toEqual([0, 1500, 3000, 4500, 6000, 18000, 30000])
    expect(ticks.slice(0, 8)).toEqual([9000, 12000, 15000, 18000, 21000, 24000, 27000, 30000])
  })
})

describe('Faerie Fire and Demoralizing Roar on the boss (druid.md §4.5, W18)', () => {
  it('Faerie Fire: −505 armor for 40 s, free, every 6 s at the most; 108 threat × the form’s', () => {
    const plan = bearPlan(20000)
    plan.fight.targetArmor = 3000
    const ff = addBearAbility(plan, FAERIE_FIRE_BEAR)
    withAuraMods(plan, ff, FAERIE_FIRE_BEAR)
    line(plan, ff, [from(plan, 10000)])
    line(plan, ff, at(plan, 16000))
    const { sim, uses } = timeline(plan)
    expect(uses[ff]).toEqual([10000, 16000])
    expect(counter(sim, row(plan, ff), FIELD.threat)).toBeCloseTo(2 * 108 * plan.threatMult, 9)
    // White swings meet 3,000 armor, then 2,495 once it's up: swing by swing, against the same fight
    // with Faerie Fire's armor taken out of its aura (the same rolls, since a cast rolls no damage),
    // each lands for factor(2,495) ÷ factor(3,000) as much from 10 s (a swing at 10 s comes after the
    // cast), and the same before (BL6).
    const factor = (armor: number) => 1 - armorReduction(armor, 60, FOREVER)
    const whites = (p: Plan) => {
      const white: [number, number][] = []
      const s = new Sim(p)
      s.trace = (_source, hand, time) => hand >= 0 && white.push([time, NaN])
      s.damageTrace = (source, damage) => {
        if (source === SOURCE_MAIN_HAND) white[white.length - 1][1] = damage
      }
      s.runFight(0)
      return white
    }
    const bare = structuredClone(plan)
    delete bare.auras[plan.abilities[ff].aura].targetArmor
    const withFf = whites(plan)
    const without = whites(bare)
    expect(withFf.map(([t]) => t)).toEqual(without.map(([t]) => t))
    expect(withFf.filter(([t]) => t >= 10000).length).toBeGreaterThanOrEqual(3)
    withFf.forEach(([t, d], i) => expect(d / without[i][1], String(t)).toBeCloseTo(t >= 10000 ? factor(2495) / factor(3000) : 1, 12))
    expect(factor(2495) / factor(3000)).toBeGreaterThan(1.05)
  })

  it('Faerie Fire, a binary Nature spell, is also resisted: miss + (1 − miss) × 6% against a +3 boss (combat-tables §9, BL5)', () => {
    const rate = (spellHit: number, def: AbilityDef) => {
      const plan = bearPlan(600000)
      plan.fight.targetLevel = 63
      for (const form of plan.forms!) form.stats.spellHit = spellHit
      const a = addBearAbility(plan, def, { free: true })
      line(plan, a)
      const sim = new Sim(plan)
      for (let i = 0; i < 40; i++) sim.runFight(i)
      return counter(sim, row(plan, a), FIELD.misses) / counter(sim, row(plan, a), FIELD.casts)
    }
    // Resistance 24 at +3 levels: 0.75 × 24 ÷ 300 = 6% (combat-tables §9).
    const resist = (0.75 * 24) / 300
    // 17% spell miss at +3, less the hit: at 100 none, so only the resist; at 6, 11% and the resist.
    for (const [hit, miss] of [
      [100, 0],
      [6, 0.11],
    ]) {
      const expected = miss + (1 - miss) * resist
      const n = 40 * (600000 / 6000)
      expect(Math.abs(rate(hit, FAERIE_FIRE_BEAR) - expected), `hit ${hit}`).toBeLessThan(4 * Math.sqrt((expected * (1 - expected)) / n))
    }
    // The roar is Physical: no resistance, so with the hit it never misses.
    expect(rate(100, demoralizingRoar(FOREVER))).toBe(0)
  })

  it('a Faerie Fire that misses applies nothing and makes no threat', () => {
    const plan = bearPlan(7000)
    for (const form of plan.forms!) form.stats.spellHit = -100
    const ff = addBearAbility(plan, FAERIE_FIRE_BEAR)
    withAuraMods(plan, ff, FAERIE_FIRE_BEAR)
    line(plan, ff)
    const { sim } = timeline(plan)
    expect(counter(sim, row(plan, ff), FIELD.misses)).toBe(2)
    expect(counter(sim, row(plan, ff), FIELD.threat)).toBe(0)
    expect(sim.auraUpMs[plan.abilities[ff].aura]).toBe(0)
  })

  it('Demoralizing Roar: the boss’s swings lose 204 ÷ 14 × its 2.0 s unslowed speed = 29.14 before your mitigation; 39 threat × the form’s', () => {
    const plan = bearPlan(20000, { boss: true })
    plan.fight.bossSwing = { ...plan.fight.bossSwing!, minDamage: 5000, maxDamage: 5000, speedSec: 2.4, unslowedSec: 2 }
    const roar = addBearAbility(plan, demoralizingRoar(FOREVER), { free: true })
    withAuraMods(plan, roar, demoralizingRoar(FOREVER))
    line(plan, roar, at(plan, 5000))
    const pres: [number, number, number][] = []
    const sim = new Sim(plan)
    sim.bossTrace = (t) => pres.push([t, -1, -1])
    sim.swingTakenTrace = (outcome, _lost, pre) => {
      const last = pres[pres.length - 1]
      last[1] = outcome
      last[2] = pre
    }
    sim.runFight(0)
    const hits = pres.filter(([, o]) => o === BOSS_OUTCOME.hit)
    expect(hits.filter(([t]) => t < 5000).every(([, , pre]) => pre === 5000)).toBe(true)
    const after = hits.filter(([t]) => t > 5000)
    expect(after.length).toBeGreaterThan(0)
    for (const [, , pre] of after) expect(pre).toBeCloseTo(5000 - (204 / 14) * 2, 9)
    expect(counter(sim, row(plan, roar), FIELD.threat)).toBeCloseTo(39 * plan.threatMult, 9)
  })

  it('a Demoralizing Roar that misses refunds 8 of its 10 rage, applies nothing and makes no threat', () => {
    const plan = bearPlan(1000)
    for (const form of plan.forms!) {
      form.stats.spellHit = -100
      form.mainHand = null // no white rage
    }
    plan.weapons = [null, null]
    plan.prepull = { casts: [], chargeTenths: 100, keepTenths: -1 }
    const roar = addBearAbility(plan, demoralizingRoar(FOREVER))
    withAuraMods(plan, roar, demoralizingRoar(FOREVER))
    line(plan, roar, at(plan, 0))
    const { sim } = timeline(plan)
    expect(counter(sim, row(plan, roar), FIELD.misses)).toBe(1)
    expect(counter(sim, row(plan, roar), FIELD.threat)).toBe(0)
    expect(sim.resources().rage).toBe(80)
  })
})

describe('Berserk’s Mangle (druid.md §4.6)', () => {
  it('while Berserk is up, Mangle starts no cooldown; one already running keeps running', () => {
    const plan = bearPlan(40000)
    const berserk = addBearAbility(plan, BERSERK)
    const mangle = addBearAbility(plan, MANGLE, { free: true })
    expect(plan.abilities[mangle].noCooldownAura).toBe(plan.abilities[berserk].aura)
    line(plan, berserk, [from(plan, 1000)])
    line(plan, mangle)
    const { uses } = timeline(plan)
    // Mangle at 0 (cooldown to 6 s); Berserk at 1 s doesn't cut it short; then every GCD while
    // Berserk is up, to 16 s; the first Mangle after it, at 16.5 s, starts its 6 s cooldown again.
    expect(uses[berserk]).toEqual([1000])
    expect(uses[mangle].slice(0, 10)).toEqual([0, 6000, 7500, 9000, 10500, 12000, 13500, 15000, 16500, 22500])
  })
})

describe('Enrage (druid.md §4.5)', () => {
  it('before the pull: 12 rage at the pull, 2 a second until 8.5 s, 5 threat a rage only after the pull; armor from items −16% until then', () => {
    const plan = bearPlan(20000, { boss: true })
    for (const form of plan.forms!) {
      form.stats.hit = -100 // no white rage
      form.mainHand = null
    }
    plan.weapons = [null, null]
    plan.rage.fromDamageTaken = false
    const def = enrage(false)
    const a = addBearAbility(plan, def)
    withAuraMods(plan, a, def)
    plan.prepull = { casts: [{ ability: a, atMs: PREPULL_ENRAGE_MS }], chargeTenths: 0, keepTenths: -1 }
    const sim = new Sim(plan)
    const lost: [number, number, number][] = []
    sim.bossTrace = (t) => lost.push([t, -1, 0])
    sim.swingTakenTrace = (outcome, l, pre) => {
      lost[lost.length - 1][1] = outcome
      lost[lost.length - 1][2] = pre > 0 ? l / pre : 0
    }
    sim.runFight(0)
    expect(sim.totalRageGainedTenths).toBe(300)
    // Nine ticks after the pull, 2 rage each: 90 threat on Enrage's row; the 12 before make none.
    expect(counter(sim, row(plan, a), FIELD.threat)).toBe(90)
    // A hit's share of damage after mitigation: the armor with Enrage's −16% until 8.5 s, then without.
    const stats = new StatBlock().copyFrom(plan.stats)
    const armorWith = (pct: number) => {
      stats.itemArmorPct = plan.stats.itemArmorPct + pct
      return deriveStats(stats, { profile: FOREVER, applyUnmeasured: true, level: 60 }, new DerivedStats()).armor
    }
    const share = (armor: number) => plan.damageTakenMult * (1 - armorReduction(armor, plan.fight.targetLevel, FOREVER))
    const enraged = armorWith(-0.16)
    expect(enraged).toBeLessThan(armorWith(0))
    for (const [t, o, s] of lost) if (o === BOSS_OUTCOME.hit) expect(s, String(t)).toBeCloseTo(share(t < 8500 ? enraged : armorWith(0)), 9)
  })
})

describe('the default bear (druid.md §6.3)', () => {
  const config = (): SimConfig => ({ ...defaultConfig('druid-feral-bear'), run: { mode: 'fixed', iterations: 200, seed: 99 } })
  /** With Defensive, which keeps the roar too (D28). */
  const defensive = (): SimConfig => ({ ...config(), rotation: { [BEAR_IDS.priority]: BEAR_PRIORITY.duties } })

  it('makes each ability’s threat per threat.md: damage × its multiplier × the form’s, and its flat threat per landed cast', () => {
    const { plan } = buildPlan(defensive())
    const sim = new Sim(plan)
    for (let i = 0; i < 30; i++) sim.runFight(i)
    const t = plan.threatMult
    const ratio = (id: string) => {
      const r = plan.sources.findIndex((s) => s.id === id)
      return counter(sim, r, FIELD.threat) / counter(sim, r, FIELD.damage)
    }
    // A cast that lands is one that didn't miss: its row counts casts and misses (Sim.cast).
    const flat = (id: string) => {
      const r = plan.sources.findIndex((s) => s.id === id)
      return counter(sim, r, FIELD.threat) / (counter(sim, r, FIELD.casts) - counter(sim, r, FIELD.misses))
    }
    expect(ratio('maul')).toBeCloseTo(1.75 * t, 12)
    expect(ratio('mangle')).toBeCloseTo(t, 12)
    expect(ratio('mainHand')).toBeCloseTo(t, 12)
    expect(flat('faerieFire')).toBeCloseTo(108 * t, 9)
    expect(flat('demoralizingRoar')).toBeCloseTo(39 * t, 9)
    // Lacerate: 1 per damage plus 261 per landed application (threat.md's wording table, D29), the
    // first one of a run too, which deals nothing; its bleed's ticks 1 per damage.
    const lac = plan.sources.findIndex((s) => s.id === 'lacerate')
    const landed = counter(sim, lac, FIELD.hits) + counter(sim, lac, FIELD.crits) + counter(sim, lac, FIELD.blocks)
    expect(landed).toBeGreaterThan(0)
    expect(counter(sim, lac, FIELD.casts) - counter(sim, lac, FIELD.misses) - counter(sim, lac, FIELD.dodges) - counter(sim, lac, FIELD.parries)).toBe(landed)
    expect((counter(sim, lac, FIELD.threat) - counter(sim, lac, FIELD.damage) * t) / landed).toBeCloseTo(261 * t, 9)
    expect(ratio('lacerateBleed')).toBeCloseTo(t, 12)
    // Energizes: 5 threat a rage, whatever the form (Primal Fury, Natural Reaction), for the rage
    // gained in whole tenths: 0.5 a tenth, less than 5 when the cap takes some of it.
    for (const id of ['primalFury', 'naturalReaction']) {
      const r = plan.sources.findIndex((s) => s.id === id)
      expect(counter(sim, r, FIELD.threat), id).toBeGreaterThan(0)
      expect((counter(sim, r, FIELD.threat) * 2) % 1, id).toBe(0)
    }
  })

  it('Thorns (Buffs, BR5): 22 + 0.08 × a raid druid’s 389 spell damage (53) on each boss swing that lands, less the boss’s 6% average resist, at 1 threat per damage × the form’s', () => {
    const { plan } = buildPlan(config())
    const sim = new Sim(plan)
    for (let i = 0; i < 30; i++) sim.runFight(i)
    const r = plan.sources.findIndex((s) => s.id === 'thorns')
    expect(r).toBeGreaterThanOrEqual(0)
    const o = sim.bossOutcomes
    const landed = o[BOSS_OUTCOME.hit] + o[BOSS_OUTCOME.crit] + o[BOSS_OUTCOME.crush] + o[BOSS_OUTCOME.block]
    expect(counter(sim, r, FIELD.casts)).toBe(landed)
    expect(counter(sim, r, FIELD.crits)).toBe(0)
    // buffs doc §1.2: (22 + 0.08 × 389, dealt as 53) × (1 − 0.75 × 24 / 300), Nature's average resist
    // against a level-63 boss; the spell damage is its caster's, a raid druid's (1.60.1.70009).
    expect(counter(sim, r, FIELD.damage) / landed).toBeCloseTo(53 * 0.94, 9)
    expect(counter(sim, r, FIELD.threat) / counter(sim, r, FIELD.damage)).toBeCloseTo(plan.threatMult, 12)
    // Without it in Buffs, no row.
    const d = config()
    const off = buildPlan({ ...d, buffs: { ...d.buffs, enabled: d.buffs.enabled.filter((id) => id !== 'thorns') } }).plan
    expect(off.sources.some((s) => s.id === 'thorns')).toBe(false)
    // The results say how it's modelled, only while it's on.
    expect(buildPlan(config()).assumptions.map((a) => a.id)).toContain('thorns')
    expect(buildPlan({ ...d, buffs: { ...d.buffs, enabled: d.buffs.enabled.filter((id) => id !== 'thorns') } }).assumptions.map((a) => a.id)).not.toContain('thorns')
    // Another tank has it from a druid in the raid (its Standard raid preset, T3R-2), at its own
    // multipliers: a warrior's ×1.495 × 1.02.
    const w = defaultConfig('warrior-protection')
    expect(w.buffs.enabled).toContain('thorns')
    const warrior = buildPlan({ ...w, run: { mode: 'fixed', iterations: 200, seed: 99 } }).plan
    const ws = new Sim(warrior)
    for (let i = 0; i < 10; i++) ws.runFight(i)
    const wr = warrior.sources.findIndex((s) => s.id === 'thorns')
    expect(counter(ws, wr, FIELD.threat) / counter(ws, wr, FIELD.damage)).toBeCloseTo(warrior.threatMult, 12)
    expect(warrior.threatMult).toBeCloseTo(1.3 * 1.15 * 1.02, 12)
  })

  it('gains rage from the boss’s hits in bear (rage.md#forever-): none without them', () => {
    const { plan } = buildPlan(config())
    expect(plan.rage.fromDamageTaken).toBe(true)
    const withHits = new Sim(plan)
    withHits.runFight(0)
    const without = new Sim({ ...plan, rage: { ...plan.rage, fromDamageTaken: false } })
    without.runFight(0)
    expect(withHits.totalRageGainedTenths).toBeGreaterThan(without.totalRageGainedTenths)
  })

  it('is deterministic: the same config and seed give the same fights, chunk by chunk', () => {
    const { plan } = buildPlan(config())
    const a = runChunk(plan, 3, 50, new Sim(plan))
    const b = runChunk(plan, 3, 50, new Sim(buildPlan(config()).plan))
    expect(b).toEqual(a)
    const reused = new Sim(plan)
    runChunk(plan, 0, 50, reused)
    expect(runChunk(plan, 3, 50, reused)).toEqual(a)
  })

  it('shows Lacerate’s uptime and average stacks on its bleed’s row, not in Cooldowns and buffs; its spells as spells (BU5, BU8)', () => {
    const bundle = buildPlan(defensive())
    const agg = mergeChunk(emptyAggregate(bundle.plan.sources.length, bundle.plan.auras.length), runChunk(bundle.plan, 0, 100))
    const result = toResult(bundle, agg, 0)
    const row = (id: string) => result.abilities.find((a) => a.id === id)!
    expect(row('lacerateBleed').bleed).toMatchObject({ ticksCanCrit: true, avoidable: false })
    expect(row('lacerateBleed').bleed!.uptimePct).toBeGreaterThan(80)
    expect(row('lacerateBleed').bleed!.averageStacks).toBeGreaterThan(4)
    expect(row('lacerateBleed').bleed!.averageStacks).toBeLessThanOrEqual(5)
    expect(result.cooldowns.map((c) => c.id)).not.toContain('lacerate')
    // Faerie Fire and the roar can't crit: spell rows, whose only failure is a miss or a resist.
    for (const id of ['faerieFire', 'demoralizingRoar']) {
      expect(row(id).spell, id).toBe(true)
      expect(row(id).crits, id).toBe(0)
      expect(row(id).misses, id).toBeGreaterThan(0)
    }
    expect(row('maul').spell).toBeUndefined()
    expect(row('lacerate').bleed).toBeUndefined()
  })

  it('gives Clearcasting’s procs per fight only while an ability can spend it (CV1)', () => {
    const clearcasting = (rotation: SimConfig['rotation']) => {
      const bundle = buildPlan({ ...config(), rotation })
      const agg = mergeChunk(emptyAggregate(bundle.plan.sources.length, bundle.plan.auras.length), runChunk(bundle.plan, 0, 50))
      return toResult(bundle, agg, 0).cooldowns.find((c) => c.id === 'clearcasting')!
    }
    // Maul, Mangle and Lacerate spend it (and the roar, with Defensive): a few procs a fight, each spent soon after.
    const spent = clearcasting({})
    expect(spent.procsPerFight).toBeGreaterThan(5)
    expect(spent.uptimePct).toBeLessThan(15)
    // With only Faerie Fire, which it doesn't pay for, it's up until it runs out: no procs per fight.
    const off = { [BEAR_IDS.maulEnabled]: false, [BEAR_IDS.mangleEnabled]: false, [BEAR_IDS.lacerateEnabled]: false, [BEAR_IDS.roarEnabled]: false }
    const idle = clearcasting(off)
    expect(idle.procsPerFight).toBeUndefined()
    expect(idle.uptimePct).toBeGreaterThan(spent.uptimePct!)
  })

  it('keeps its own Faerie Fire and Demoralizing Roar up all fight with Defensive, but for their first casts and misses (D26: the duties by its rule)', () => {
    const { plan } = buildPlan(defensive())
    const sim = new Sim(plan)
    let ms = 0
    for (let i = 0; i < 100; i++) {
      sim.runFight(i)
      ms += sim.fightMs
    }
    const uptime = (id: string) => sim.auraUpMs[plan.auras.findIndex((a) => a.id === id)] / ms
    // The roar goes up with the first GCD, and by the duty rule is refreshed from 1.5 s left, so a
    // miss is recast as it falls off: 99.68% over 40,000 fights (druid.md §6.3). Faerie Fire follows
    // at 1.5 s, and from 6 s left a resisted one is recast once its cooldown ends: 98.40%.
    expect(uptime('demoralizingRoar')).toBeGreaterThanOrEqual(0.995)
    expect(uptime('faerieFire')).toBeGreaterThanOrEqual(0.98)
    // Its settings name every duty.
    expect(Object.values(BEAR_IDS)).toEqual(expect.arrayContaining(['druid.bear.demoRoar.enabled', 'druid.bear.faerieFire.enabled', 'druid.bear.enrage.inCombat']))
  })
})

describe('Balanced and Max TPS in the engine (druid.md §6.3 "Balanced", "Max TPS"; D26, D28)', () => {
  const MAX: SimConfig['rotation'] = { [BEAR_IDS.priority]: BEAR_PRIORITY.maxTps }
  const DEFENSIVE: SimConfig['rotation'] = { [BEAR_IDS.priority]: BEAR_PRIORITY.duties }
  const config = (rotation: SimConfig['rotation'], buffs: string[] = []): SimConfig => {
    const d = defaultConfig('druid-feral-bear')
    return { ...d, rotation, buffs: { ...d.buffs, enabled: [...d.buffs.enabled, ...buffs] }, run: { mode: 'fixed', iterations: 2000, seed: 33 } }
  }
  const run = (c: SimConfig) => {
    const bundle = buildPlan(c)
    let agg = emptyAggregate(bundle.plan.sources.length, bundle.plan.auras.length)
    const sim = new Sim(bundle.plan)
    for (let k = 0; k < 4; k++) agg = mergeChunk(agg, runChunk(bundle.plan, k, 500, sim))
    return toResult(bundle, agg, 0)
  }

  it('leaves the Buffs tab’s roar off, as the bear’s own, until you turn it on there for another druid’s; Faerie Fire stays its own', () => {
    const duties = buildPlan(config(DEFENSIVE)).plan
    const max = buildPlan(config(MAX)).plan
    // Nobody else's roar in the Standard raid: the boss starts at full attack power either way.
    expect(max.fight.bossSwing!.minDamage).toBe(duties.fight.bossSwing!.minDamage)
    const used = new Set(max.rotation.map((e) => max.abilities[e.ability].id))
    expect(used.has('demoralizingRoar')).toBe(false)
    expect(used.has('faerieFire')).toBe(true)
    // Turned on in Buffs, another druid's roar counts with Max TPS: 204 × 2.0 / 14 off each swing,
    // from the pull, and with Balanced, the default. Under Defensive your own replaces it, so it
    // changes nothing.
    const other = buildPlan(config(MAX, ['demoralizingRoar'])).plan
    expect(other.fight.bossSwing!.minDamage).toBeCloseTo(max.fight.bossSwing!.minDamage - (204 * 2) / 14, 0)
    expect(buildPlan(config({}, ['demoralizingRoar'])).plan.fight.bossSwing!.minDamage).toBe(other.fight.bossSwing!.minDamage)
    expect(buildPlan(config(DEFENSIVE, ['demoralizingRoar'])).plan.fight.bossSwing!.minDamage).toBe(duties.fight.bossSwing!.minDamage)
  })

  it('make more threat and more damage than Defensive, for a little more damage taken, on the same fights', () => {
    const duties = run(config(DEFENSIVE))
    const balanced = run(config({}))
    const max = run(config(MAX))
    // §6.3 "Balanced": +3.1% TPS, +2.8% DPS and +0.7% damage taken in the default setup (200,000 fights).
    expect(balanced.tps!.mean / duties.tps!.mean).toBeGreaterThan(1.02)
    expect(balanced.tps!.mean / duties.tps!.mean).toBeLessThan(1.06)
    expect(balanced.dps.mean / duties.dps.mean).toBeGreaterThan(1.01)
    expect(balanced.dps.mean / duties.dps.mean).toBeLessThan(1.05)
    expect(balanced.tank!.dtps.mean / duties.tank!.dtps.mean).toBeGreaterThan(1)
    expect(balanced.abilities.find((a) => a.id === 'demoralizingRoar')).toBeUndefined()
    // Max TPS drops the roar as Balanced does, and Mauls from 14 rather than 20, tuned on TPS alone
    // (§6.3 "Max TPS", T5): about 0.2% more TPS for 0.2% less DPS.
    expect(max.tps!.mean / balanced.tps!.mean).toBeGreaterThan(1)
    expect(max.tps!.mean / balanced.tps!.mean).toBeLessThan(1.006)
    expect(max.dps.mean / balanced.dps.mean).toBeLessThan(1)
    expect(max.dps.mean / balanced.dps.mean).toBeGreaterThan(0.994)
  })
})
