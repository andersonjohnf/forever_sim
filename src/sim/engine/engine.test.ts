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
import { rotationOff } from './test-helpers'

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
  'warrior.fury.overpower.enabled': false,
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
    plan.auras = [{ id: 'flurry', name: 'Flurry', icon: 'x', durationMs: 15000, maxStacks: 1, whiteSwingCharges: 3, str: 0, agi: 0, ap: 0, apPct: 0, crit: 0, spellCrit: 0, haste: 25, damage: 0, critCharges: 0 }]
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
      rotation: rotationOff('warrior-protection'),
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
  it('forever default, 10 × the hit before mitigation ÷ max health, fractions of a tenth carried; a block doesn’t lower it', () => {
    const d = defaultConfig('warrior-protection')
    const config: SimConfig = {
      ...d,
      talents: '',
      rotation: rotationOff('warrior-protection'),
      gear: { offHand: { itemId: 12602 } }, // shield only: no swings of our own, so only boss hits give rage
      buffs: { raid: d.buffs.raid, enabled: [] },
      fight: { ...d.fight, durationVariationPct: 0, boss: { ...d.fight.boss, damageMin: 5000, damageMax: 5000 } },
    }
    const plan = buildPlan(config).plan
    const state = new Sim(plan).inspect()
    const [miss, dodge, parry, block, crit, crush] = state.bossThresholds
    const p = [miss, dodge - miss, parry - dodge, block - parry, crit - block, crush - crit, 100 - crush].map((x) => x / 100)
    expect(plan.rage.damageTakenModel).toBe('forever')
    const health = plan.rage.maxHealth
    // rage.md#rounding: each hit's fraction of a tenth carries to the next, so none is lost on average.
    const tenths = (pre: number) => ((10 * pre) / health) * 10
    // Blocked, crit, crushing and plain hits; armor, the block and Defensive Stance's −10% don't enter.
    const perSwing = p[3] * tenths(5000) + p[4] * tenths(10000) + p[5] * tenths(7500) + p[6] * tenths(5000)
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
  // - RL1 (the second review pass): Ironfoe, the default Fury main hand, is Forever's equip aura
  //   1301046 in `forever`: 3% of landed white and yellow hits from either hand, with a 100 ms
  //   internal cooldown (damage-and-timing §5.2, OQ 15 [?]); it was Classic Era's 0.8 PPM on the main
  //   hand's hits. Fury 675.2 → 692.7 DPS (+2.6%), TPS 409.8 → 420.7: its extra-attack swings
  //   8,352 → 14,013, so more Windfury procs (21,537 → 22,243) and Deep Wounds ticks, and fewer
  //   timed main-hand swings (68,394 → 66,021; each extra attack resets the timer). Over 40,000
  //   fights the change is +2.4%: the off hand's hits
  //   +2.7%, 3% in place of the main hand's 3.2% (0.8 PPM at 2.4 s) −0.3%, the cooldown −0.1%. Arms
  //   and Protection don't wield it: unchanged. RL5 (all-crit auras add spell crit) and RL6
  //   (Weaponmaster's axe crit for every attack) move no golden: no default has a magic proc, and
  //   none has Weaponmaster with an axe or polearm.
  // - TL1 (the third review pass): Ironfoe procs from its own hits only in `forever` too, with
  //   Forever's 3% and 100 ms internal cooldown (damage-and-timing §5.2, OQ 15, C37 [?]): the client
  //   doesn't settle the hands, so they're Classic Era's. Fury 692.7 → 673.8 DPS (−2.7%), TPS 420.7
  //   → 409.0: its extra-attack swings 14,013 → 7,728, so fewer Windfury procs (22,243 → 21,543)
  //   and Heroic Strikes (20,067 → 18,441: less rage from extra swings), and more timed main-hand
  //   swings (66,021 → 68,475). Over 40,000 fights the change is −2.6% (673.2
  //   against 691.3 from either hand). Arms and Protection don't wield it: unchanged. TL2
  //   (Weaponmaster's axe and polearm crit on that weapon's attacks only, no spell crit) moves no
  //   golden: no default has Weaponmaster with an axe or polearm.
  // - M2.4h: rage from damage taken in `forever` is 10 × the hit before armor, block and absorbs ÷
  //   max health (rage.md#forever-, from about 2,000 logged beta hits); it was 1.5 × health lost ÷
  //   230.6. Only Protection takes damage. At its 4,340 max health (base health left out, stats
  //   OQ-2) the mean boss hit of 4,970.86 before armor now gives 11.4 rage where it gave 12.0
  //   after armor and Defensive Stance (−5%), and a blocked hit 11.4 where it gave 11.9. Nothing
  //   spends rage yet (no rotation), so the bar fills a little later and clips less of the early
  //   Shield Specialization and Master of Defense rage: their threat 7,232.5 → 7,486 and
  //   16,387.5 → 16,959.5 over 500 fights, TPS 216.97981 → 216.98889; DPS unchanged. Fury and
  //   Arms take no damage: unchanged.
  // - M2.4i fix slice B (LX4): in `forever` a white hit's or a hit taken's fraction of a tenth
  //   carries to the next such gain (rage.md#rounding: the beta logs keep it on average); each gain
  //   was floored to a tenth. Fury's 2.4 s main hand (8.4 rage) and 1.8 s off hand (6.3 with Dual
  //   Wield Specialization 5/5) have no fraction: unchanged. Arms' 3.5 s two-hander gives 15.75 a
  //   landed swing where it gave 15.7: 1.8 more rage a fight over 40,000 fights (1,269.9 →
  //   1,271.7, +0.14%) for +0.01% DPS. On this seed's 1,000 fights the extra rage shifts Overpower
  //   (8,552 → 8,716 casts), Execute and Slam: DPS 610.71 → 611.88, TPS 353.68 → 354.24.
  //   Protection's mean boss hit gives 11.4536 rage where it gave 11.4, so the bar fills a little
  //   sooner and clips more of Shield Specialization's and Master of Defense's rage: their threat
  //   7,486 → 7,467.5 and 16,959.5 → 16,927.5 over 500 fights, TPS 216.98889 → 216.98833; DPS
  //   unchanged.
  // - M2.4i fix slice B (LX4): a one-hander's white rage is 3.46 × speed, not 3.5 × (rage.md#rounding:
  //   777 logged swings fit 3.46 once their fractions count). Fury's 2.4 s main hand gives 8.304
  //   rage a landed swing where it gave 8.4, and its 1.8 s off hand 6.228 where it gave 6.3
  //   (−1.1% each): 12.2 less rage a fight over 40,000 fights (1,588.3 → 1,576.1), −0.34% DPS and
  //   −0.42% TPS. On this seed's 1,000 fights: fewer Heroic Strikes (18,441 → 17,815 casts), so
  //   more white main-hand swings (68,475 → 69,025), and Execute's damage 19.95M → 19.56M with less
  //   extra rage; DPS 673.83 → 668.63, TPS 409.02 → 405.50. Protection's 1.8 s sword gives 6.228
  //   where it gave 6.3, so the bar fills a little later and clips less of Shield Specialization's
  //   and Master of Defense's rage: their threat 7,467.5 → 7,503 and 16,927.5 → 17,045 over 500
  //   fights, TPS 216.98833 → 216.99002; DPS unchanged. Arms' two-hander is unchanged.
  // - M2.5a (decision D23): the default Arms rotation is the best one a paired search found
  //   (warrior.md §5.3 "Tuning the defaults", scripts/tune/rotation.mjs): Heroic Strike off,
  //   Hamstring on from 40 rage (60 before), Spearing Strike from 35 (50), a 5-rage Slam reserve
  //   (0), Rend refreshed at 3 s left (1.5), Battle Shout once it has run out (3 s left),
  //   Recklessness at 39 s left (15), Mortal Strike in the execute phase (off before) and the
  //   Mighty Rage Potion at 0 rage (55). Over 400,000 paired fights on a seed the search never used,
  //   +35.6 DPS (+5.8%, 610.1 → 645.8, 95% CI ± 0.16). On this seed's 1,000 fights: the Heroic Strike
  //   row is gone and its swings are white again (main hand 42,467 → 45,343), so more Windfury
  //   (18,736 → 22,865), Weaponmaster (5,578 → 6,745) and Hand of Justice (1,168 → 1,366) procs;
  //   Hamstring is a new row (9,291 casts); Mortal Strike 20,740 → 23,729 casts (in the execute phase
  //   too) and Spearing Strike 1,962 → 5,127. Recklessness's earlier swap to Berserker Stance ends
  //   Rend and Overpower sooner: Rend 9,283 → 8,751 casts, yet Overpower 8,716 → 9,826 with the extra
  //   rage. DPS 611.88 → 646.38, TPS 354.24 → 373.34. Fury and Protection are unchanged: their
  //   shared settings keep their defaults.
  // - M2.5a review (AL1, AL2): Recklessness and the Mighty Rage Potion follow the execute phase, not
  //   the clock (warrior.md §5.3 rows 4 and 17, "Tuning the defaults"). Recklessness now comes 1.5 s
  //   before the phase starts (or with 15 s left, if that comes first, which it never does in the
  //   default fight), where it came with 39 s left; the phase starts 32.4–39.6 s before the end. So
  //   Rend and Overpower run a little longer in Battle Stance (Rend 8,751 → 8,897 casts, Overpower
  //   9,826 → 9,942), and more of its crits land on Executes (6,599 → 6,831 crits, in 11,580 →
  //   11,524 casts; Execute's damage 13.36 M → 13.50 M). The potion's new last chance (the fight's
  //   last 4 s) and its timing without a phase never apply here. Over 400,000 paired fights on a
  //   seed the search never used, +1.44 DPS (+0.22%, 95% CI +1.37 to +1.51). On this seed's 1,000
  //   fights, DPS 646.38 → 647.48, TPS 373.34 → 373.96. Fury and Protection are unchanged.
  // - Tank core, T1 (decision D24): base health is a placeholder, 1,689 for warriors
  //   (character-stats OQ-2), no longer left out. Protection's max health 4,340 → 6,029, so rage
  //   from damage taken (10 × the hit before mitigation ÷ max health) drops 28%: the mean boss hit
  //   of 4,970.86 gives 8.24 rage where it gave 11.45. Nothing spends rage yet (no rotation), so the bar fills later
  //   and clips less of Shield Specialization's and Master of Defense's energizes: their threat
  //   7,503 → 9,116 and 17,045 → 20,083 over 500 fights, TPS 216.99002 → 217.04235 (+0.02%); DPS
  //   unchanged. Fury and Arms take no damage: unchanged.
  // - M2.5a follow-ups (V3): the Arms potion's limit outside the setting's is the build's rage cap
  //   minus 75, not a fixed 55; the default build's cap is 130, so no golden moves.
  // - M2.5b (decision D23): the default Fury rotation is the best one a paired search found
  //   (warrior.md §5.2 "Tuning the defaults", scripts/tune/rotation.mjs): the Overpower dance on, up
  //   to 40 rage; Hamstring off; Heroic Strike from 40 (42 before) with its cancel below 20, and kept
  //   in the execute phase; Whirlwind at 0.5 s of Bloodthirst's cooldown (1.5); the final Death Wish
  //   3 s before the execute phase and Recklessness 1.5 s before it (they came with 30 s and 15 s
  //   left); the Mighty Rage Potion at 0 rage in the phase (55), once an
  //   Execute has emptied the bar. Recklessness's clock (16 s, was 15), the potion's last chance and
  //   its wait for Recklessness without a phase don't act in the default fight, nor does the review's
  //   potion with a Recklessness that came by its clock (FL1). Over 400,000 paired
  //   fights on a seed the search never used, +42.88 DPS (+6.39%, 670.62 → 713.50, 95% CI ± 0.15).
  //   On this seed's 1,000 fights: Overpower is a new row (12,279 casts, 590 damage each on
  //   average) and Hamstring's is gone (578 casts); Heroic Strike 17,815 → 13,450 casts, so more
  //   white main-hand swings (69,025 → 70,768) and Windfury procs (21,560 → 24,825); Whirlwind
  //   11,688 → 12,901 casts and Bloodthirst 23,157 → 21,944 with the shorter wait; Execute's damage
  //   19.56 M → 20.42 M with Death Wish and Recklessness up from the phase's start. DPS 668.63 →
  //   716.09, TPS 405.50 → 424.70. Arms and Protection are unchanged: their shared rows keep their
  //   defaults, and their lines are the same.
  // - P1 (the Protection track, warrior.md §5.4): the default Protection warrior plays its rotation,
  //   where it swung its weapon only. Charge, Battle Shout and Bloodrage before the pull; then Shield
  //   Block on cooldown, Bloodrage, the Mighty Rage Potion early, Shield Slam, Revenge, Battle Shout,
  //   Sunder Armor to 5 stacks, Thunder Clap and Demoralizing Shout kept up, Sunder Armor in every
  //   free GCD, and Heroic Strike from 45 rage. Its own Battle Shout, Sunder Armor, Thunder Clap and
  //   Demoralizing Shout replace the Buffs tab's, so the boss starts at full armor, speed and attack
  //   power until they land. New rows: Bloodrage, the potion, Shield Slam, Revenge, Sunder Armor,
  //   Thunder Clap, Demoralizing Shout and Heroic Strike (the main hand's threat 16.60 M → 12.10 M
  //   as Heroic Strike takes swings). Shield Block's blocks raise Shield Specialization's threat
  //   9,116 → 712,963 and Revenge uses the windows they open; Master of Defense's 20,083 → 257,368,
  //   no longer clipped at the cap now that rage is spent. TPS 217.04 → 970.29, DPS 142.12 → 305.68.
  //   Fury and Arms are unchanged: the engine's additions (debuffs on the boss, the spell table,
  //   flat damage ranges and block value, shield-only abilities) change nothing they use.
  // - P1 tuning (decision D23, on TPS): the default Protection rotation is the best a paired search
  //   found that keeps the tank's toolkit (warrior.md §5.4 "Tuning the defaults"): Heroic Strike
  //   from 65 rage (45), and with any rage in the fight's last 7 s (a new setting); the Sunder Armor
  //   filler no longer waits for Shield Slam; Battle Shout once it has run out (3 s left); Bloodrage
  //   at the pull, not before it. Over 400,000 paired fights on a seed the search never used, +14.83
  //   TPS (+1.53%, 95% CI +14.72 to +14.94), DPS level. On this seed's 500 fights: Sunder Armor's
  //   threat 26.18 M → 27.66 M (more Sunders: 3,782 → 3,979 parried), Heroic Strike's 8.55 M →
  //   8.30 M, Bloodrage's 220,676 → 255,610 (its rage at the pull makes threat); TPS 970.29 →
  //   985.63, DPS 305.68 → 305.98.
  // - P1 rebased onto the final tank core (T1's review fixes): unchanged, re-run rather than
  //   re-snapshotted. A block charges only the auras up before its procs (TA1): Shield Block, the
  //   warrior's one aura that blocks end, is cast, never applied by a block's procs, so every block
  //   still uses a charge. Damage-taken factors are floored at 0 (TA7), and nothing here comes near
  //   −100%. Avoidance placeholders are listed for tanks only (TA8), which changes the assumptions,
  //   not the fights.
  // - P1 and P2 rebased onto main's druid foundation (B1): all three unchanged, re-run rather than
  //   re-snapshotted. A warrior's rows all pay plain rage (`abPlainRage`) and its plan has no forms
  //   or power tick, so the druid's paths (Energy, mana, combo points, Clearcasting, shapeshifts)
  //   never run. The default and Max TPS Protection rotations on two seeds, and Fury and Arms, give
  //   results identical to P2's branch over 2,000 fights each.
  // - P1 and P2 rebased onto main's paladin foundation (C1): all three unchanged, re-run rather than
  //   re-snapshotted. The paladin's `spell` kind is a different one from Thunder Clap's and
  //   Demoralizing Shout's, which became `spellTable` with its own engine code (architecture.md
  //   "Spells"); a warrior plan has no plan spells, mana, Holy multipliers, cooldown categories or
  //   aura groups, so those paths never run. Every spec's default, 60 s, no-execute and "Self only"
  //   setups, and Protection's Max TPS and Expose Armor ones, give whole results identical to main's
  //   (Fury, Arms' fights, the druids and the paladins) or the branch's (Protection).
  // - P1 and P2 rebased onto main's M2.5b (Fury's tuned rotation): all three unchanged, re-run.
  //   Protection's own potion line, Heroic Strike queue and pre-pull keep their conditions through
  //   the shared code's changes, and the same identity probe gives Protection's whole results as
  //   before the rebase, and Fury's and Arms' as main's once PU9 restored the Overpower assumption.
  // - P2's review (PU2): Protection's default build spends all 51 points, 8/5/38 where the popular
  //   5/5/36 left five unspent: Improved Heroic Strike 3/3 (Heroic Strike 12 → 9 rage), Improved
  //   Sunder Armor's third point (Sunder Armor 10 → 9) and Toughness 1/5 (+2% armor from items).
  //   The rotation's settings are unchanged here. On this seed's 500 fights there are more Heroic
  //   Strikes (1,881 → 2,412 parried), so their threat 8.30 M → 10.99 M and the main hand's 12.10 M
  //   → 11.07 M as they take its swings; TPS 985.63 → 1,004.67, DPS 305.98 → 313.29. Fury and Arms
  //   are unchanged.
  // - P2's review, the re-tune on the new build (D23, PL5): the Sunder Armor filler from 9 rage, its
  //   cost (10), and Heroic Strike with any rage in the fight's last 10 s (7); every other default
  //   still wins in the winner (warrior.md §5.4 "Tuning the defaults"). Over 400,000 paired fights on
  //   a seed the search never used, +0.89 TPS (+0.09%, 95% CI +0.86 to +0.92), DPS level. On this
  //   seed's 500 fights Heroic Strike's threat 10.99 M → 11.18 M (2,412 → 2,462 parried), Sunder
  //   Armor's 27.61 M → 27.68 M; TPS 1,004.67 → 1,005.29, DPS 313.29 → 312.89. Max TPS queues Heroic
  //   Strike from 45 (50), which the default run doesn't use. Fury and Arms are unchanged.
  // - P1 and P2 rebased onto main's Feral cat (B2) and its fix round: all four unchanged, re-run
  //   rather than re-snapshotted. The cat's debuff armor (Faerie Fire's `targetArmor`) and Sunder
  //   Armor's stacks share one aura field and one armor total, and a warrior row sets none of the
  //   cat's other fields (`flatDamageRange`, `auraCrit`, `bleedingTargetPct`, `dotSource`,
  //   `behindOnly`). The identity probe gives Fury's, Arms', the cat's, the bear's and the paladins'
  //   whole results as main's, and Protection's as the branch's.
  // - P2's verification (PV1, PV5, PV6; D26's amendment, D23): Thunder Clap and Demoralizing Shout
  //   go up first from the pull, before any threat ability (rows 5 and 6, above Shield Slam, Revenge
  //   and Sunder Armor's upkeep), and the re-tune on that order: Heroic Strike from 76 rage (65), and
  //   with any rage in the fight's last 12 s (10). Over 400,000 paired fights on a seed no search
  //   used, against the previous defaults: −19.19 TPS (−1.92%), −8.76 DPS (−2.81%) and 2.60% less
  //   damage taken; the re-tune alone is +0.17 TPS and +0.45 DPS (warrior.md §5.4). On this seed's
  //   500 fights, more Thunder Claps and Demoralizing Shouts (their threat 1.22 M → 1.41 M and
  //   0.13 M → 0.15 M) and Sunder Armors (27.68 M → 28.18 M), fewer Shield Slams (17.83 M → 17.14
  //   M), Revenges (14.92 M → 13.80 M) and Heroic Strikes (11.18 M → 10.06 M); TPS 1,005.29 →
  //   984.26, DPS 312.89 → 303.36. Max TPS's last-seconds dump, now 12 s too, isn't in the default
  //   run. Fury, Arms and the cat are unchanged.
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

  // - B2: the default Feral cat (druid.md §6.2, §7), added with its rotation at the doc's first
  //   priority: Berserk, the Manual Crowd Pummeler and Tiger's Fury off the GCD; its own Faerie Fire,
  //   a Clearcasting Shred, Rip at 5 combo points, a Shred first from 67 Energy, Ferocious Bite at 4,
  //   and Shred.
  // - B2 tuning (decision D23): the default cat rotation is the best one a paired search found
  //   (druid.md §6.2 "Tuning the defaults"): Ferocious Bite at 5 combo points (4 before), a Shred
  //   first whenever there's the Energy for one (from 35 Energy; 67), Rip with 8 s of the fight left
  //   (10) and Tiger's Fury once at most 20 of its Energy would be lost (0). Over 400,000 paired
  //   fights on a seed the search never used, +20.39 DPS (+3.73%, 547.05 → 567.44, 95% CI ± 0.08).
  //   On this seed's 1,000 fights: Rip 5,605 → 11,833 casts (it's now the only finisher most of the
  //   time), Ferocious Bite 9,690 → 1,044 (only at 35–41 Energy with Rip up), Shred 50,487 → 54,799;
  //   DPS 547.22 → 566.83, TPS 286.14 → 295.02. The warriors are unchanged.
  // - B2 review (CL7, D23): Ferocious Bite at any Energy in the last 4 s, ahead of the Shred first
  //   (druid.md §6.2 step 5): +0.82 DPS (+0.15%, 95% CI ± 0.02) over 400,000 paired fights on the
  //   fresh seed. On this seed's 1,000 fights: Ferocious Bite 1,044 → 1,353 casts, Shred 54,799 →
  //   54,388; DPS 566.83 → 567.60, TPS 295.02 → 295.41. The warriors are unchanged.
  it('keeps the default Feral cat’s result unchanged', () => {
    const bundle = buildPlan({ ...defaultConfig('druid-feral-cat'), run: { mode: 'fixed', iterations: 1000, seed: 12345 } })
    const agg = runFights(bundle.plan, 1000)
    const result = toResult(bundle, agg, 0)
    expect({
      dps: result.dps,
      tps: result.tps,
      durationSec: result.durationSec,
      abilities: result.abilities.map((a) => [a.id, a.damage, a.casts, a.hits, a.crits, a.misses, a.dodges, a.glances]),
      cooldowns: result.cooldowns.map((c) => [c.id, c.castsPerFight, c.uptimePct]),
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
      // 10,500 fights at CI's 1,000 a second take 10.5 s: past vitest's 5 s default, which would
      // fail a run the floor above passes.
    }, 30_000)
  }
})
