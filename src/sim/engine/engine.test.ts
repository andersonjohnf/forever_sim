// The engine end to end: the M1 exit criterion (a white-swings-only warrior matches a hand
// calculation from the docs' formulas), timing worked examples, determinism across worker
// counts, a golden fixed-seed snapshot, and a single-core benchmark.
import { describe, expect, it } from 'vitest'
import { averageWeaponDamage, armorReduction } from '../core/formulas'
import { stdev } from '../core/welford'
import { defaultConfig } from '../defaults'
import { buildPlan } from '../plan/build'
import { ACTION, type Plan, type ProcPlan, TRIGGER, TRIGGER_COUNT } from '../plan/types'
import { FOREVER } from '../rules/profiles'
import { type Aggregate, emptyAggregate, mergeChunk, toResult } from '../run/aggregate'
import { type ChunkExecutor, drive } from '../run/driver'
import { localExecutor } from '../run/local'
import type { SimConfig } from '../types'
import { CHUNK_SIZE, type ChunkResult, runChunk } from './chunk'
import { Sim } from './sim'

/** Every Fury and Arms ability switched off (warrior.md §5.2, §5.3 settings): white swings only. */
const NO_ABILITIES: SimConfig['rotation'] = {
  'warrior.arms.prepull.bloodrage': false,
  'warrior.arms.battleShout.enabled': false,
  'warrior.arms.rend.enabled': false,
  'warrior.arms.deathWish.enabled': false,
  'warrior.arms.racial.enabled': false,
  'warrior.arms.recklessness.enabled': false,
  'warrior.arms.bloodrage.enabled': false,
  'warrior.arms.execute.enabled': false,
  'warrior.arms.mortalStrike.enabled': false,
  'warrior.arms.overpower.enabled': false,
  'warrior.arms.slam.enabled': false,
  'warrior.arms.spearingStrike.enabled': false,
  'warrior.arms.whirlwind.enabled': false,
  'warrior.arms.heroicStrike.enabled': false,
  'warrior.arms.hamstring.enabled': false,
  'warrior.fury.prepull.bloodrage': false,
  'warrior.fury.battleShout.enabled': false,
  'warrior.fury.deathWish.enabled': false,
  'warrior.fury.racial.enabled': false,
  'warrior.fury.recklessness.enabled': false,
  'warrior.fury.bloodrage.enabled': false,
  'warrior.fury.berserkerRage.enabled': false,
  'warrior.fury.bloodthirst.enabled': false,
  'warrior.fury.whirlwind.enabled': false,
  'warrior.fury.heroicStrike.enabled': false,
  'warrior.fury.hamstring.enabled': false,
  'warrior.fury.execute.enabled': false,
}

/** No talents, no buffs, no enchants, no abilities: the pure white-swing baseline. */
function whiteSwingConfig(spec: 'warrior-arms' | 'warrior-fury', gear: SimConfig['gear']): SimConfig {
  const d = defaultConfig(spec)
  return {
    ...d,
    race: 'alliance-human',
    talents: '',
    gear,
    buffs: { raid: d.buffs.raid, enabled: [] },
    rotation: NO_ABILITIES,
    fight: { ...d.fight, durationVariationPct: 0 },
    run: { mode: 'fixed', iterations: 10000, seed: 7 },
  }
}

function runFights(plan: Plan, fights: number): Aggregate {
  const sim = new Sim(plan)
  let agg = emptyAggregate(plan.sources.length, plan.auras.length)
  for (let k = 0; k * CHUNK_SIZE < fights; k++) agg = mergeChunk(agg, runChunk(plan, k, Math.min(CHUNK_SIZE, fights - k * CHUNK_SIZE), sim))
  return agg
}

/** |simulated − expected| within 4 standard errors, and within 0.3%. */
function expectMatches(agg: Aggregate, expected: number, metric: 'dps' | 'tps' = 'dps') {
  const m = agg[metric]
  const se = stdev(m) / Math.sqrt(m.n)
  expect(Math.abs(m.mean - expected), `mean ${m.mean} vs ${expected} (SE ${se})`).toBeLessThanOrEqual(4 * se)
  expect(Math.abs(m.mean / expected - 1)).toBeLessThan(0.003)
}

describe('M1 exit: a white-swings-only warrior matches the hand calculation', () => {
  const armorFactor = 1 - armorReduction(3731, 60, FOREVER) // damage-and-timing §1.1

  it('two-hander (Arms, Battle Stance): Arcanite Reaper, naked Human', () => {
    const plan = buildPlan(whiteSwingConfig('warrior-arms', { mainHand: { itemId: 12784 } })).plan
    // character-stats: AP = 160 + 2 × 120 Str + 62 (weapon) = 462; crit = 80 Agi × 0.05 = 4%.
    const ap = 160 + 2 * 120 + 62
    // combat-tables §2.2 (forever, behind, 300 skill, no aura crit): miss 8, dodge 6.5, glance 40, crit 4 − 0.6.
    const crit = 4 - 0.6
    const hit = 100 - 8 - 6.5 - 40 - crit
    const outcome = hit / 100 + (2 * crit) / 100 + (0.75 * 40) / 100 // glancing mean ×0.75 (§2.3)
    // damage-and-timing §2.1: (min + max)/2 + AP/14 × 3.8
    const perSwing = averageWeaponDamage(153, 256, 0, ap, 3.8) * outcome * armorFactor
    const swings = Math.ceil(180000 / 3800) // swings at 0, 3.8, … < 180 s
    const expected = (swings * perSwing) / 180
    const agg = runFights(plan, 10000)
    expectMatches(agg, expected)
    // Battle Stance: threat ×0.8, and no energize, so TPS = 0.8 × DPS exactly.
    expect(agg.tps.mean).toBeCloseTo(0.8 * agg.dps.mean, 9)
    // rage.md (forever): 4.5 × 3.8 = 17.1 rage per landed swing; landed = 1 − miss − dodge.
    const rage = (agg.rageGainedTenths + agg.rageWastedTenths) / 10 / agg.fights
    expect(rage / (swings * 0.855 * 17.1)).toBeCloseTo(1, 2)
  })

  it('dual wield (Fury, Berserker Stance): two axes, naked Human', () => {
    const plan = buildPlan(whiteSwingConfig('warrior-fury', { mainHand: { itemId: 17016 }, offHand: { itemId: 18498 } })).plan
    // Str 120 + 10 + 5 → AP = 160 + 270 = 430. Crit 4 + 3 (Berserker, aura) = 7; vs +3: 7 − 0.6 − 1.8.
    const ap = 160 + 2 * 135
    const crit = 7 - 0.6 - 1.8
    const miss = 27 // 8 + 19 dual-wield penalty (combat-tables §5)
    const hit = 100 - miss - 6.5 - 40 - crit
    const outcome = hit / 100 + (2 * crit) / 100 + 0.3
    const main = averageWeaponDamage(71, 134, 0, ap, 2.4)
    const off = averageWeaponDamage(60, 90, 0, ap, 1.9) * 0.5 // damage-and-timing §2.3
    const mainSwings = Math.ceil(180000 / 2400)
    // The off hand starts at half its speed [?] (damage-and-timing §3.1): 950, 2850, … < 180 s.
    const offSwings = Math.ceil((180000 - 950) / 1900)
    const expected = ((mainSwings * main + offSwings * off) * outcome * armorFactor) / 180
    expectMatches(runFights(plan, 10000), expected)
  })
})

/** A plan from a config, with the off hand, stats and procs overridden for a timing test. */
function timingPlan(mainSpeed: number, offSpeed: number | null, procs: ProcPlan[], durationMs = 60000): Plan {
  const gear: SimConfig['gear'] = offSpeed ? { mainHand: { itemId: 17016 }, offHand: { itemId: 18498 } } : { mainHand: { itemId: 17016 } }
  const plan = buildPlan(whiteSwingConfig('warrior-fury', gear)).plan
  plan.weapons[0]!.speedSec = mainSpeed
  if (plan.weapons[1] && offSpeed) plan.weapons[1].speedSec = offSpeed
  plan.stats.hit = 100 // no misses
  plan.fight.bossCanDodge = false // every swing lands
  plan.fight.durationMs = durationMs
  plan.fight.variation = 0
  plan.sources.push({ id: 'test', name: 'Test', icon: 'x' })
  plan.procs = procs.map((p) => ({ ...p, source: plan.sources.length - 1 }))
  plan.auras = []
  plan.triggers = Array.from({ length: TRIGGER_COUNT }, () => [])
  plan.procs.forEach((p, i) => plan.triggers[p.trigger].push(i))
  return plan
}

const proc = (patch: Partial<ProcPlan>): ProcPlan => ({
  id: 'test',
  name: 'Test',
  trigger: TRIGGER.whiteLanded,
  chance: [1, 1],
  hands: 3,
  icdMs: 0,
  action: ACTION.extraAttacks,
  amount: 1,
  a: 0,
  b: 0,
  school: 0,
  source: 0,
  chainBit: 1,
  ...patch,
})

function trace(plan: Plan, fight = 0) {
  const sim = new Sim(plan)
  const events: [number, number, number][] = []
  sim.trace = (source, hand, time) => events.push([source, hand, time])
  sim.runFight(fight)
  return events
}

describe('timing worked examples in the engine', () => {
  it('damage-and-timing WE-8: an extra attack swings the main hand now and restarts its timer', () => {
    // The off hand's first swing (t = 1.00 s) procs one extra attack, once.
    const plan = timingPlan(2.6, 2.0, [proc({ hands: 2, icdMs: 1e9 })], 8000)
    const main = trace(plan).filter(([, hand]) => hand === 0).map(([, , t]) => t)
    expect(main).toEqual([0, 1000, 3600, 6200])
  })

  it('warrior W17: Flurry 5/5 turns a 2.6 s swing into 2.080 s from the next swing', () => {
    const flurry = proc({ action: ACTION.aura, amount: 0, chainBit: 0, hands: 1 })
    const plan = timingPlan(2.6, null, [flurry], 7000)
    plan.auras = [{ id: 'flurry', name: 'Flurry', icon: 'x', durationMs: 15000, maxStacks: 1, whiteSwingCharges: 3, str: 0, agi: 0, ap: 0, apPct: 0, crit: 0, haste: 25, damage: 0, critCharges: 0 }]
    const times = trace(plan).map(([, , t]) => t)
    expect(times).toEqual([0, 2080, 4160, 6240])
  })

  it('damage-and-timing WE-9: reapplying a bleed restarts its ticks; the tick due at 12 s is lost', () => {
    const bleed = proc({ action: ACTION.weaponBleed, amount: 7, a: 0.2, b: 3000, chainBit: 0, hands: 1 })
    const plan = timingPlan(10, null, [bleed], 20000)
    const ticks = trace(plan).filter(([, hand]) => hand === -1).map(([, , t]) => t)
    expect(ticks).toEqual([3000, 6000, 9000, 13000, 16000, 19000])
  })

  it('damage-and-timing §3.4: a tank’s parry hastens its own next swing', () => {
    const d = defaultConfig('warrior-protection')
    const config: SimConfig = {
      ...d,
      talents: '',
      gear: { mainHand: { itemId: 17016 } },
      buffs: { raid: d.buffs.raid, enabled: [] },
      fight: { ...d.fight, durationVariationPct: 0 },
    }
    const plan = buildPlan(config).plan
    plan.weapons[0]!.speedSec = 2.6
    // Make every boss swing a parry: defense so low that miss is 0, no dodge, parry beyond 100%.
    plan.stats.defense = -125
    plan.stats.baseAgi = 0
    plan.stats.parry = 200
    const main = trace(plan).filter(([, hand]) => hand === 0).map(([, , t]) => t)
    // Swing at 0 (next due 2.6 s); the boss's swing at 0 is parried: 2.6 − 0.4 × 2.6 = 1.56 s.
    expect(main.slice(0, 2)).toEqual([0, 1560])
  })

  it('stops chains of extra attacks from triggering themselves', () => {
    // Every landed white swing procs an extra attack, but a source can't proc from its own chain.
    const plan = timingPlan(2.0, null, [proc({ hands: 1 })], 5000)
    const main = trace(plan).map(([, , t]) => t)
    expect(main).toEqual([0, 0, 2000, 2000, 4000, 4000])
  })
})

describe('tank rage from boss hits matches the closed form (rage.md tank model)', () => {
  it('forever default, 1.5 × health lost / 230.6, floored to tenths per hit', () => {
    const d = defaultConfig('warrior-protection')
    const config: SimConfig = {
      ...d,
      talents: '',
      gear: { offHand: { itemId: 12602 } }, // shield only: no swings of our own, so only boss hits give rage
      buffs: { raid: d.buffs.raid, enabled: [] },
      fight: { ...d.fight, durationVariationPct: 0, boss: { ...d.fight.boss, damageMin: 5000, damageMax: 5000 } },
    }
    const plan = buildPlan(config).plan
    const state = new Sim(plan).inspect()
    const [miss, dodge, parry, block, crit, crush] = state.bossThresholds
    const p = [miss, dodge - miss, parry - dodge, block - parry, crit - block, crush - crit, 100 - crush].map((x) => x / 100)
    const mitigated = 5000 * (1 - armorReduction(plan.armor, 63, FOREVER)) * plan.damageTakenMult
    const tenths = (lost: number) => Math.floor(((1.5 * lost) / 230.6) * 10 + 1e-9)
    const perSwing =
      p[3] * tenths(Math.max(0, mitigated - state.blockValue)) + p[4] * tenths(mitigated * 2) + p[5] * tenths(mitigated * 1.5) + p[6] * tenths(mitigated)
    const swings = 90 // every 2.0 s from 0 to < 180 s
    const agg = runFights(plan, 5000)
    const perFight = (agg.rageGainedTenths + agg.rageWastedTenths) / agg.fights
    expect(perFight / (swings * perSwing)).toBeCloseTo(1, 2)
  })
})

/** A fake pool: `lanes` chunks at once, finishing out of order. */
function racingExecutor(plan: Plan, lanes: number): ChunkExecutor {
  const sims = Array.from({ length: lanes }, () => new Sim(plan))
  let n = 0
  return {
    lanes,
    run: (chunk, fights) =>
      new Promise<ChunkResult>((resolve) => {
        const sim = sims[n++ % lanes]
        const result = runChunk(plan, chunk, fights, sim)
        // Later chunks tend to finish first.
        setTimeout(() => resolve(result), (chunk * 7919) % 13)
      }),
  }
}

describe('determinism (decision D15)', () => {
  const plan = buildPlan({ ...defaultConfig('warrior-fury'), run: { mode: 'adaptive', iterations: 3000, seed: 99 } }).plan

  it('gives bit-identical adaptive results with 1 and 3 workers', async () => {
    const one = await drive(plan, localExecutor(plan), { mode: 'adaptive', iterations: 0 })
    const three = await drive(plan, racingExecutor(plan, 3), { mode: 'adaptive', iterations: 0 })
    expect(three.fights).toBe(one.fights)
    expect(three.dps).toEqual(one.dps)
    expect(three.tps).toEqual(one.tps)
    expect(Array.from(three.counters)).toEqual(Array.from(one.counters))
    expect(Array.from(three.auraUpMs)).toEqual(Array.from(one.auraUpMs))
    expect(one.auraUpMs.some((ms) => ms > 0)).toBe(true)
    expect(three.durationMs).toBe(one.durationMs)
  })

  it('gives bit-identical aura uptimes for the default Arms warrior with 1 and 4 workers', async () => {
    const arms = buildPlan({ ...defaultConfig('warrior-arms'), run: { mode: 'fixed', iterations: 1500, seed: 5 } }).plan
    const one = await drive(arms, localExecutor(arms), { mode: 'fixed', iterations: 1500 })
    const four = await drive(arms, racingExecutor(arms, 4), { mode: 'fixed', iterations: 1500 })
    expect(Array.from(four.auraUpMs)).toEqual(Array.from(one.auraUpMs))
    expect(one.auraUpMs.length).toBe(arms.auras.length)
  })

  it('gives bit-identical fixed-count results with 1 and 3 workers, including a partial last chunk', async () => {
    const one = await drive(plan, localExecutor(plan), { mode: 'fixed', iterations: 1100 })
    const three = await drive(plan, racingExecutor(plan, 3), { mode: 'fixed', iterations: 1100 })
    expect(one.fights).toBe(1100)
    expect(three).toEqual(one)
  })

  it('stops adaptive runs at the documented precision', async () => {
    const agg = await drive(plan, localExecutor(plan), { mode: 'adaptive', iterations: 0 })
    expect(agg.fights).toBeGreaterThanOrEqual(1000)
    expect(agg.fights).toBeLessThanOrEqual(50000)
    expect(agg.fights % CHUNK_SIZE).toBe(0)
    const hw = (1.959963984540054 * stdev(agg.dps)) / Math.sqrt(agg.fights)
    expect(hw / agg.dps.mean).toBeLessThanOrEqual(0.0025)
  })

  it('gives the same result for the same config and seed, with the execute phase and every ability in play', () => {
    const config: SimConfig = { ...defaultConfig('warrior-fury'), run: { mode: 'fixed', iterations: 500, seed: 4242 } }
    const a = runFights(buildPlan(config).plan, 500)
    const b = runFights(buildPlan(structuredClone(config)).plan, 500)
    expect(b).toEqual(a)
    const other = runFights(buildPlan({ ...config, run: { ...config.run, seed: 4243 } }).plan, 500)
    expect(other.dps.mean).not.toBe(a.dps.mean)
  })

  it('depends only on the fight index: a chunk is the same wherever it runs', () => {
    const a = runChunk(plan, 3, 50)
    const sim = new Sim(plan)
    runChunk(plan, 0, 50, sim)
    const b = runChunk(plan, 3, 50, sim)
    expect(b).toEqual(a)
  })
})

describe('golden run (fixed config and seed)', () => {
  // Snapshot history (update only deliberately, and say why here):
  // - M2.1: the default Fury warrior now uses Bloodthirst, Whirlwind, Heroic Strike and Hamstring
  //   (new breakdown rows; Heroic Strike replaces main-hand swings), so its numbers moved.
  // - M2.2a: Execute and the execute phase (new row; Bloodthirst, Whirlwind, Heroic Strike and
  //   Hamstring stop there), Impale 2/2 (ability crits ×2.2), Improved Heroic Strike 3/3 (12 rage),
  //   Unbridled Wrath on Heroic Strike swings, and Raging Blows' off-hand Whirlwind (new row).
  // - M2.2b: the cooldowns. Death Wish (+20% physical, its one use in a ~180 s fight held to the
  //   last 30 s), Recklessness in the last 15 s (+100% crit: Execute's crits nearly double) and
  //   Bloodrage's 20 rage a minute (more Heroic Strikes and Hamstrings): DPS 623.9 → 676.7. The
  //   casts deal no damage, so no new breakdown rows; the Human default has no racial cooldown.
  // - M2.2c: the pre-pull, Battle Shout's upkeep and the Mighty Rage Potion (the Standard raid
  //   preset selects it): DPS 676.7 → 684.2. The potion's 45–75 rage and +60 Strength at the start
  //   of the execute phase lift Execute most (19.25M → 20.06M damage). Bloodrage at −1 s puts 10
  //   rage at the pull and moves its cooldown 1 s earlier. The warrior's own Battle Shout replaces
  //   the Buffs switch's static +139: the same AP from the pull (shouted at −3 s), but it runs out
  //   at 177 s, so fights longer than that refresh it at 174 s for a GCD and 10 rage. No new
  //   breakdown rows (the casts deal no damage); the random potion rage shifts the proc stream,
  //   so every row's counts move a little.
  // - F1b (review L3): Sword Specialization is +2% crit on every attack while the off hand's sword
  //   is equipped, no longer on the sword's swings only (warrior.md §2.9, Q15): DPS 684.2 → 692.4
  //   (+1.2%). The main hand's white table is now crit-capped (its 1,074 plain hits became crits;
  //   the rest of the +2% is lost to the cap), its specials crit more (Bloodthirst 7,348 → 7,847
  //   crits), and more crits refresh Deep Wounds more often, so it loses more ticks (18,062 →
  //   17,393). Arms (a two-handed sword) and Protection (a sword) already had it.
  // - F1a (the first-release review's engine fixes, docs/reviews/2026-09-23-first-release.md): all
  //   three goldens moved. Hand of Justice procs 1% with a 2 s internal cooldown in `forever`
  //   (L1; it was 2% with none), Windfury has the client's 100 ms internal cooldown (L2), each
  //   extra-attack source procs at most once per root swing (L16), a Deep Wounds tick due at a
  //   refresh's millisecond lands first (L12), and Shield Specialization's rage comes after the
  //   hit's own (L15). Fury 684.2 → 674.7 DPS, Arms 630.7 → 615.1, Protection 219.1 → 217.0 TPS
  //   (143.5 → 142.1 DPS). Each fix's share, from 40,000 fights per step: Hand of Justice −1.0%
  //   (Fury), −1.3% (Arms), −0.9% (Protection); Windfury's cooldown −0.5% and −1.3% (Protection
  //   −0.02%); the chain rule −0.02% (Fury only); Deep Wounds +0.2% (Arms), +0.01% (Fury); the
  //   block order −0.01 TPS. The rest is the fixed seed's noise. Magic-proc crits (L13) and the
  //   allocation-free re-derive (L19) change nothing here: no default has a magic proc, and the
  //   re-derive's numbers are identical.
  // - F1b and F1a together on main: Fury 684.2 → 683.6 DPS (F1b +1.2%, then F1a −1.3%), Arms
  //   630.7 → 615.1, Protection 219.1 → 217.0 TPS (143.5 → 142.1 DPS).
  // - F2 (review L5): items on Classic Era stats take Forever's item effects where the client has
  //   them. Blackhand's Breadth (default trinket 2) is +1% crit in Forever, not +2%: alone, Fury
  //   684.2 → 676.3 and Arms 630.7 → 626.0, Protection unchanged. With F1a and F1b on main: Fury
  //   675.2, Arms 610.7, Protection 217.0 TPS (142.1 DPS).
  // - Cleanup (review L9): Demoralizing Shout is its level-60 tooltip value, −204 boss AP (−196
  //   before), so each boss swing loses 29.14 pre-armor damage instead of 28.00 (encounter.md WE-4).
  //   Only Protection has it: the tank takes a little less damage, so a little less rage from damage
  //   taken, and fewer of Shield Specialization's and Master of Defense's rage gains are clipped at the
  //   rage cap (threat 7,231 → 7,232.5 and 16,385.5 → 16,387.5 over 500 fights). TPS 216.97977 →
  //   216.97981; DPS unchanged. Fury and Arms are unchanged.
  it('keeps the default Fury warrior’s result unchanged', () => {
    const bundle = buildPlan({ ...defaultConfig('warrior-fury'), run: { mode: 'fixed', iterations: 1000, seed: 12345 } })
    const agg = runFights(bundle.plan, 1000)
    const result = toResult(bundle, agg, 0)
    expect({
      dps: result.dps,
      tps: result.tps,
      durationSec: result.durationSec,
      abilities: result.abilities.map((a) => [a.id, a.damage, a.casts, a.hits, a.crits, a.misses, a.dodges, a.glances]),
    }).toMatchSnapshot()
  })

  // - M2.3c: the default Arms warrior (warrior.md §5.3), added with its rotation.
  it('keeps the default Arms warrior’s result unchanged', () => {
    const bundle = buildPlan({ ...defaultConfig('warrior-arms'), run: { mode: 'fixed', iterations: 1000, seed: 12345 } })
    const agg = runFights(bundle.plan, 1000)
    const result = toResult(bundle, agg, 0)
    expect({
      dps: result.dps,
      tps: result.tps,
      durationSec: result.durationSec,
      abilities: result.abilities.map((a) => [a.id, a.damage, a.casts, a.hits, a.crits, a.misses, a.dodges, a.glances]),
    }).toMatchSnapshot()
  })

  it('keeps the default Protection warrior’s result unchanged', () => {
    const bundle = buildPlan({ ...defaultConfig('warrior-protection'), run: { mode: 'fixed', iterations: 500, seed: 12345 } })
    const agg = runFights(bundle.plan, 500)
    const result = toResult(bundle, agg, 0)
    expect({ dps: result.dps, tps: result.tps, abilities: result.abilities.map((a) => [a.id, a.damage, a.threat, a.parries, a.blocks]) }).toMatchSnapshot()
  })
})

describe('benchmark', () => {
  for (const spec of ['warrior-fury', 'warrior-arms'] as const) {
    const name = spec === 'warrior-fury' ? 'Fury' : 'Arms'
    it(`runs at least 5,000 default ${name} warrior fights per second on one core`, () => {
      const plan = buildPlan(defaultConfig(spec)).plan
      const sim = new Sim(plan)
      runChunk(plan, 0, 500, sim) // warm up the JIT
      const fights = 10000
      const start = performance.now()
      for (let k = 0; k < fights / CHUNK_SIZE; k++) runChunk(plan, k, CHUNK_SIZE, sim)
      const perSecond = fights / ((performance.now() - start) / 1000)
      console.log(`benchmark: ${Math.round(perSecond)} fights/s (default ${name} warrior, one core)`)
      // Shared CI runners are noisy; the real bar is checked locally.
      const ci = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.CI
      expect(perSecond).toBeGreaterThanOrEqual(ci ? 1000 : 5000)
    })
  }
})
