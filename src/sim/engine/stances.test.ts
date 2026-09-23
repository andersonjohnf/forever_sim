// Stances, stance dancing and the Overpower window in the engine, from hand-built rotations
// (docs/classes/warrior.md §2.1, §2.8, §3.1, §5.1, §7): worked examples W5 and W18; the swap's
// cooldown and rage (rage.md#stance-changes-and-tactical-mastery); the stance's effects on hits
// while swapped; GCD-safe with stances; Overpower's table (combat-tables §3); the window a dodge
// or Bloodthrill opens and Overpower closes; the Fury rows 10 and 15 (§5.2); determinism.
import { describe, expect, it } from 'vitest'
import { BERSERKER_RAGE, HAMSTRING, HEROIC_STRIKE, OVERPOWER, OVERPOWER_WINDOW, REND, WHIRLWIND } from '../classes/warrior/abilities'
import { defaultConfig } from '../defaults'
import { buildPlan } from '../plan/build'
import { ACTION, COND, type Plan, STANCE, TRIGGER } from '../plan/types'
import { FIELD, SOURCE_MAIN_HAND, Sim } from './sim'
import {
  addAbility,
  addAura,
  addProc,
  alwaysLandNoCrit,
  armsPlan,
  at,
  counter,
  damages,
  expectMean,
  from,
  line,
  opensOnDodge,
  rageAtPull,
  refresh,
  setAttackPower,
  timeline,
  W,
} from './test-helpers'

const AP_NORMALIZED = (1800 / 14) * 3.3 // 424.29
const AP_REAL = (1800 / 14) * 3.8 // 488.57

/** Every white swing and dodgeable special is dodged; nothing misses or crits. */
function alwaysDodged(plan: Plan): void {
  plan.stats.hit = 100
  plan.stats.crit = -100
  plan.stats.expertise = -1000
  expect(new Sim(plan).inspect().specialThresholds[1]).toBe(100)
}

/** The plan's stance entry for a STANCE bit. */
const stanceOf = (plan: Plan, bit: number) => plan.stances.find((s) => s.stance === bit)!

describe('Overpower (warrior.md §3.1, W5; combat-tables §3)', () => {
  it('W5: normalized weapon damage + 35: average 590.29, 607.99 with ×1.03', () => {
    const plan = armsPlan(180000)
    const op = addAbility(plan, OVERPOWER)
    line(plan, op)
    opensOnDodge(plan, op)
    alwaysDodged(plan) // every white swing opens the window; Overpower itself can't be dodged
    rageAtPull(plan, 100)
    plan.periodicRage = [{ periodMs: 1000, tenths: 50, source: -1 }]
    setAttackPower(plan, 1800)
    const hits = damages(plan, plan.abilities[op].source, 20)
    expect(hits.length).toBeGreaterThan(500) // every 5 s
    expect(Math.min(...hits)).toBeGreaterThanOrEqual(105 + AP_NORMALIZED + 35 - 1e-9)
    expect(Math.max(...hits)).toBeLessThanOrEqual(157 + AP_NORMALIZED + 35 + 1e-9)
    expectMean(hits, 131 + AP_NORMALIZED + 35)
    plan.weapons[0] = { ...plan.weapons[0]!, min: W, max: W }
    plan.physicalMult = 1.03
    for (const d of damages(plan, plan.abilities[op].source, 2)) expect(d).toBeCloseTo((131 + AP_NORMALIZED + 35) * 1.03, 9) // 607.99
  })

  it('W5: its crit chance is the special crit + 25% per Improved Overpower rank; its crits deal ×2.2 with Impale 2/2', () => {
    for (const rank of [0, 1, 2]) {
      const plan = armsPlan(180000)
      const op = addAbility(plan, OVERPOWER, new Map([['Improved Overpower', rank], ['Impale', 2]]))
      line(plan, op)
      opensOnDodge(plan, op)
      rageAtPull(plan, 100)
      plan.periodicRage = [{ periodMs: 1000, tenths: 50, source: -1 }]
      plan.stats.hit = 100
      setAttackPower(plan, 1800)
      plan.weapons[0] = { ...plan.weapons[0]!, min: W, max: W }
      // The special table's crit slice, before every dodgeable attack becomes a dodge.
      const table = new Sim(plan).inspect().specialThresholds
      const specialCrit = table[5] - table[4]
      plan.stats.expertise = -1000
      const sim = new Sim(plan)
      const row = plan.abilities[op].source
      const sizes = new Set<number>()
      sim.damageTrace = (s, d) => {
        if (s === row) sizes.add(Math.round(d * 1000) / 1000)
      }
      for (let i = 0; i < 60; i++) sim.runFight(i)
      const casts = counter(sim, row, FIELD.casts)
      expect(casts).toBeGreaterThan(1500)
      expect(counter(sim, row, FIELD.hits) + counter(sim, row, FIELD.crits)).toBe(casts)
      const p = Math.min(1, (specialCrit + 25 * rank) / 100)
      const share = counter(sim, row, FIELD.crits) / casts
      expect(Math.abs(share - p), `rank ${rank}: ${share} vs ${p}`).toBeLessThanOrEqual(4 * Math.sqrt((p * (1 - p)) / casts))
      const hit = W + AP_NORMALIZED + 35
      expect([...sizes].sort((a, b) => a - b)).toEqual([Math.round(hit * 1000) / 1000, Math.round(hit * 2.2 * 1000) / 1000])
    }
  })

  it('can only miss: never dodged, parried or blocked, even from the front', () => {
    const plan = armsPlan(180000)
    const op = addAbility(plan, OVERPOWER)
    line(plan, op)
    opensOnDodge(plan, op)
    rageAtPull(plan, 100)
    plan.periodicRage = [{ periodMs: 1000, tenths: 50, source: -1 }]
    plan.fight.front = true
    plan.fight.bossCanDodge = true
    plan.fight.bossCanParry = true
    plan.fight.bossCanBlock = true
    plan.stats.hit = 0
    const sim = new Sim(plan)
    for (let i = 0; i < 100; i++) sim.runFight(i)
    const row = plan.abilities[op].source
    const f = (field: number) => counter(sim, row, field)
    expect(f(FIELD.casts)).toBeGreaterThan(300)
    expect([f(FIELD.dodges), f(FIELD.parries), f(FIELD.blocks)]).toEqual([0, 0, 0])
    expect(f(FIELD.misses)).toBeGreaterThan(0)
    expect(f(FIELD.misses) + f(FIELD.hits) + f(FIELD.crits)).toBe(f(FIELD.casts))
    // The white table did have all of them.
    const white = (field: number) => counter(sim, SOURCE_MAIN_HAND, field)
    for (const field of [FIELD.dodges, FIELD.parries, FIELD.blocks]) expect(white(field)).toBeGreaterThan(0)
    // Its miss share is the special table's.
    const miss = new Sim(plan).inspect().specialThresholds[0] / 100
    expect(Math.abs(f(FIELD.misses) / f(FIELD.casts) - miss)).toBeLessThanOrEqual(4 * Math.sqrt((miss * (1 - miss)) / f(FIELD.casts)))
  })
})

describe('the Overpower window (warrior.md §2.8, §7)', () => {
  /** Overpower alone, with a 100 s weapon so the only white swing (dodged) is at 0. */
  function windowPlan(durationMs: number) {
    const plan = armsPlan(durationMs)
    plan.weapons[0] = { ...plan.weapons[0]!, speedSec: 100 }
    const op = addAbility(plan, OVERPOWER)
    opensOnDodge(plan, op)
    alwaysDodged(plan)
    rageAtPull(plan, 100)
    return { plan, op, window: plan.abilities[op].window }
  }

  it('a dodge opens it for 5 s', () => {
    const uses = (t: number) => {
      const { plan, op } = windowPlan(20000)
      line(plan, op, [from(plan, t)])
      return timeline(plan).uses[op]
    }
    expect(uses(4900)).toEqual([4900])
    expect(uses(5100)).toEqual([])
  })

  it('each new dodge refreshes it: a dodged Hamstring at 3 s keeps it open until 8 s', () => {
    const uses = (hamstring: boolean) => {
      const { plan, op } = windowPlan(20000)
      const ham = addAbility(plan, HAMSTRING)
      line(plan, op, [from(plan, 7900)])
      if (hamstring) line(plan, ham, at(plan, 3000))
      return timeline(plan).uses[op]
    }
    expect(uses(true)).toEqual([7900])
    expect(uses(false)).toEqual([])
  })

  it('using Overpower closes it, whether it lands or misses', () => {
    // A test proc opens the window on every incoming hit (every 10 s), so a miss can't reopen it;
    // with no cooldown, Overpower would be used again at the end of its GCD if the window stayed open.
    const uses = (hitPct: number) => {
      const plan = armsPlan(30000)
      const op = addAbility(plan, OVERPOWER)
      plan.abilities[op].cooldownMs = 0
      line(plan, op)
      plan.weapons[0] = { ...plan.weapons[0]!, speedSec: 100 }
      rageAtPull(plan, 100)
      plan.stats.hit = hitPct
      plan.fight.bossCanDodge = false
      plan.fight.damageTakenPerHit = 1
      plan.fight.damageTakenIntervalMs = 10000
      addProc(plan, { trigger: TRIGGER.damageTaken, chance: [1, 1], hands: 3, action: ACTION.aura, amount: plan.abilities[op].window, b: 0 })
      const { sim, uses } = timeline(plan)
      return { uses: uses[op], misses: counter(sim, plan.abilities[op].source, FIELD.misses) }
    }
    expect(uses(100)).toEqual({ uses: [10000, 20000], misses: 0 })
    expect(uses(-200)).toEqual({ uses: [10000, 20000], misses: 2 })
  })

  it('a line can read it: Hamstring while it’s closed', () => {
    const uses = (overpower: boolean) => {
      const { plan, op, window } = windowPlan(10000)
      const ham = addAbility(plan, HAMSTRING)
      if (overpower) line(plan, op, at(plan, 1000))
      line(plan, ham, [...at(plan, 2600), { code: COND.auraDown, a: window, b: 0 }])
      return timeline(plan).uses[ham]
    }
    expect(uses(true)).toEqual([2600])
    expect(uses(false)).toEqual([])
  })

  it('Bloodthrill opens it for 6 s from a landed white swing while your Rend is up; a later 5 s opener doesn’t shorten it', () => {
    const uses = (rend: boolean, t: number, dodgeAt = 0) => {
      const plan = armsPlan(20000)
      plan.weapons[0] = { ...plan.weapons[0]!, speedSec: 100 }
      alwaysLandNoCrit(plan)
      rageAtPull(plan, 100)
      const r = addAbility(plan, REND)
      const op = addAbility(plan, OVERPOWER)
      const window = plan.abilities[op].window
      if (rend) line(plan, r, at(plan, 0)) // before the swing at 0 (the rotation acts first)
      line(plan, op, [from(plan, t)])
      addProc(plan, { trigger: TRIGGER.whiteLanded, chance: [1, 1], hands: 3, action: ACTION.aura, amount: window, b: 6000, requiresAura: plan.abilities[r].aura })
      if (dodgeAt > 0) {
        // A 5 s opener once, at dodgeAt: it would end at dodgeAt + 5 s.
        plan.fight.damageTakenPerHit = 1
        plan.fight.damageTakenIntervalMs = dodgeAt
        addProc(plan, { trigger: TRIGGER.damageTaken, chance: [1, 1], hands: 3, icdMs: 100000, action: ACTION.aura, amount: window, b: 0 })
      }
      return timeline(plan).uses[op]
    }
    expect(uses(true, 5900)).toEqual([5900])
    expect(uses(true, 6100)).toEqual([])
    expect(uses(false, 1500)).toEqual([])
    expect(uses(true, 5700, 500)).toEqual([5700])
    // A later opener does extend it.
    expect(uses(true, 6900, 2000)).toEqual([6900])
  })

  it('Bloodthrill procs only from white swings: never while Heroic Strike replaces every swing, and not after Rend runs out', () => {
    const uses = (heroicStrike: boolean) => {
      const plan = armsPlan(40000)
      alwaysLandNoCrit(plan)
      rageAtPull(plan, 100)
      plan.periodicRage = [{ periodMs: 1000, tenths: 100, source: -1 }]
      const r = addAbility(plan, REND)
      const op = addAbility(plan, OVERPOWER)
      line(plan, r, at(plan, 0))
      line(plan, op)
      if (heroicStrike) line(plan, addAbility(plan, HEROIC_STRIKE))
      addProc(plan, { trigger: TRIGGER.whiteLanded, chance: [1, 1], hands: 3, action: ACTION.aura, amount: plan.abilities[op].window, b: 6000, requiresAura: plan.abilities[r].aura })
      return timeline(plan)
    }
    expect(uses(true).uses[1]).toEqual([])
    const { uses: u, swings } = uses(false)
    // Every white swing lands and opens it while Rend (21 s) is up; the last is the swing at 19 s.
    expect(swings[0].filter((t) => t < 21000)).toEqual([0, 3800, 7600, 11400, 15200, 19000])
    expect(u[1]).toEqual([1500, 6500, 11500, 16500, 21500])
  })

  it('the real Bloodthrill chance, 2% per rank: about 10% of landed white swings on a Rend target open it', () => {
    const plan = armsPlan(180000)
    alwaysLandNoCrit(plan)
    rageAtPull(plan, 100)
    plan.periodicRage = [{ periodMs: 1000, tenths: 50, source: -1 }]
    const r = addAbility(plan, REND)
    line(plan, r, [refresh(r, 0)])
    const window = addAura(plan, OVERPOWER_WINDOW)
    plan.sources.push({ id: 'bloodthrill', name: 'Bloodthrill', icon: 'x' })
    // Counted by a spell-damage proc that deals nothing, alongside the window.
    addProc(plan, { trigger: TRIGGER.whiteLanded, chance: [0.1, 0.1], hands: 3, action: ACTION.spellDamage, amount: 0, b: 0, source: plan.sources.length - 1, requiresAura: plan.abilities[r].aura })
    addProc(plan, { trigger: TRIGGER.whiteLanded, chance: [0.1, 0.1], hands: 3, action: ACTION.aura, amount: window, b: 6000, requiresAura: plan.abilities[r].aura })
    const sim = new Sim(plan)
    for (let i = 0; i < 100; i++) sim.runFight(i)
    const landed = counter(sim, SOURCE_MAIN_HAND, FIELD.hits) + counter(sim, SOURCE_MAIN_HAND, FIELD.glances)
    const procs = counter(sim, plan.sources.length - 1, FIELD.casts)
    expect(Math.abs(procs / landed - 0.1)).toBeLessThanOrEqual(4 * Math.sqrt((0.1 * 0.9) / landed))
  })
})

describe('stance swaps and dancing (warrior.md §2.1, §7)', () => {
  /**
   * A Fury warrior (Berserker Stance) whose white swings are all dodged, with an Overpower dance to
   * Battle Stance: the first swing at 0 opens the window, and the dance follows at once.
   */
  function furyDance(rage: number, keepTenths?: number) {
    const plan = armsPlan(3000, 'warrior-fury')
    expect(plan.stance).toBe(STANCE.berserker)
    expect(plan.stanceSwap).toEqual({ cooldownMs: 1000, keepTenths: 250 }) // Improved Tactical Mastery 5/5
    if (keepTenths !== undefined) plan.stanceSwap.keepTenths = keepTenths
    const op = addAbility(plan, OVERPOWER)
    line(plan, op, [], STANCE.battle)
    opensOnDodge(plan, op)
    alwaysDodged(plan)
    rageAtPull(plan, rage)
    return { plan, op }
  }

  it('W18: a swap at 60 rage keeps 25 with Improved Tactical Mastery 5/5, 10 at 0/5; at 18 it keeps 18; the swap back comes 1 s later', () => {
    const run = (rage: number, keep?: number) => {
      const { plan, op } = furyDance(rage, keep)
      const { sim, swaps, uses, rageAtUse } = timeline(plan)
      return { swaps, uses: uses[op], rageAtUse: rageAtUse[op], lost: sim.totalSwapRageLostTenths }
    }
    const b = STANCE.battle
    const z = STANCE.berserker
    expect(run(60)).toEqual({
      swaps: [
        { stance: b, time: 0, before: 600, after: 250 },
        { stance: z, time: 1000, before: 200, after: 200 },
      ],
      uses: [0],
      rageAtUse: [250],
      lost: 350,
    })
    expect(run(60, 100).swaps).toEqual([
      { stance: b, time: 0, before: 600, after: 100 },
      { stance: z, time: 1000, before: 50, after: 50 },
    ])
    expect(run(18).swaps).toEqual([
      { stance: b, time: 0, before: 180, after: 180 },
      { stance: z, time: 1000, before: 130, after: 130 },
    ])
  })

  it('the swap back loses the rage above the cap again, with no threat', () => {
    const { plan } = furyDance(60)
    plan.periodicRage = [{ periodMs: 400, tenths: 100, source: -1 }]
    const { sim, swaps } = timeline(plan)
    expect(swaps.slice(0, 2)).toEqual([
      { stance: STANCE.battle, time: 0, before: 600, after: 250 },
      // 20 after Overpower, +10 at 0.4 s and 0.8 s.
      { stance: STANCE.berserker, time: 1000, before: 400, after: 250 },
    ])
    expect(sim.totalSwapRageLostTenths).toBe(500)
    expect(sim.fightThreat).toBeCloseTo(counter(sim, plan.abilities[0].source, FIELD.threat), 9)
  })

  it('shares a 1 s cooldown: no dance while it runs, and each dance swaps back as soon as it ends', () => {
    // Arms (Battle Stance) dancing to Berserker Stance for Whirlwind, then for Berserker Rage when the GCD ends.
    const plan = armsPlan(5000)
    const ww = addAbility(plan, WHIRLWIND)
    const br = addAbility(plan, BERSERKER_RAGE)
    line(plan, ww, [], STANCE.berserker)
    line(plan, br, [], STANCE.berserker)
    alwaysLandNoCrit(plan)
    rageAtPull(plan, 100)
    const { swaps, uses } = timeline(plan)
    expect(swaps.map((s) => [s.stance, s.time])).toEqual([
      [STANCE.berserker, 0],
      [STANCE.battle, 1000],
      // The GCD ends at 1.5 s, but the swap cooldown runs until 2 s.
      [STANCE.berserker, 2000],
      [STANCE.battle, 3000],
    ])
    expect([uses[ww], uses[br]]).toEqual([[0], [2000]])
  })

  it('in the other stance, abilities it refuses wait; the ones it allows don’t', () => {
    const plan = armsPlan(8000)
    plan.stanceSwap = { cooldownMs: 3000, keepTenths: 1000 } // longer than the GCD, to see the wait; no rage lost
    const ww = addAbility(plan, WHIRLWIND)
    const rend = addAbility(plan, REND)
    const ham = addAbility(plan, HAMSTRING)
    line(plan, ww, at(plan, 0), STANCE.berserker)
    line(plan, rend, [refresh(rend, 0)])
    line(plan, ham, at(plan, 1500))
    alwaysLandNoCrit(plan)
    rageAtPull(plan, 100)
    const { swaps, uses } = timeline(plan)
    expect(swaps.map((s) => [s.stance, s.time])).toEqual([
      [STANCE.berserker, 0],
      [STANCE.battle, 3000],
    ])
    // Hamstring (Battle or Berserker) at 1.5 s in Berserker Stance; Rend (Battle or Defensive) once back.
    expect([uses[ww], uses[ham], uses[rend]]).toEqual([[0], [1500], [3000]])
  })

  it('dances only if the rage the swap keeps pays for the ability', () => {
    const uses = (keepTenths: number) => {
      const plan = armsPlan(5000)
      plan.stanceSwap.keepTenths = keepTenths
      const ww = addAbility(plan, WHIRLWIND)
      line(plan, ww, [], STANCE.berserker)
      alwaysLandNoCrit(plan)
      rageAtPull(plan, 100)
      const t = timeline(plan)
      return [t.uses[ww], t.swaps.length]
    }
    expect(uses(250)).toEqual([[0], 2])
    expect(uses(100)).toEqual([[], 0]) // Whirlwind costs 25
  })

  it('a line without a dance waits for a stance that allows its ability', () => {
    const plan = armsPlan(5000)
    const ww = addAbility(plan, WHIRLWIND)
    line(plan, ww)
    alwaysLandNoCrit(plan)
    rageAtPull(plan, 100)
    const { swaps, uses } = timeline(plan)
    expect([uses[ww], swaps]).toEqual([[], []])
  })

  it('GCD-safe skips an ability the stance refuses, unless a line dances for it (warrior.md §5.1)', () => {
    const firstUses = (dance: boolean) => {
      const plan = armsPlan(5000)
      const ham = addAbility(plan, HAMSTRING)
      const ww = addAbility(plan, WHIRLWIND)
      line(plan, ham, [{ code: COND.gcdSafe, a: 1 << ww, b: 1500 }])
      line(plan, ww, [], dance ? STANCE.berserker : 0)
      alwaysLandNoCrit(plan)
      rageAtPull(plan, 100)
      const { uses } = timeline(plan)
      return [uses[ham][0], uses[ww][0]]
    }
    // Whirlwind can't be used in Battle Stance, so Hamstring doesn't wait for it.
    expect(firstUses(false)).toEqual([0, undefined])
    // With the dance, Whirlwind is ready: it goes first, and Hamstring when it's on cooldown.
    expect(firstUses(true)).toEqual([1500, 0])
  })
})

describe('stance effects while swapped (warrior.md §2.1, §7)', () => {
  it('damage and threat: from Defensive Stance, a dance to Battle deals Overpower at full damage and its threat', () => {
    const plan = armsPlan(12000)
    plan.stance = STANCE.defensive // the build's numbers are Battle Stance's; Defensive's factors apply from the pull
    expect(stanceOf(plan, STANCE.defensive)).toMatchObject({ damage: 0.9 })
    const op = addAbility(plan, OVERPOWER)
    line(plan, op, [], STANCE.battle)
    alwaysLandNoCrit(plan)
    setAttackPower(plan, 1800)
    rageAtPull(plan, 20)
    plan.weapons[0] = { ...plan.weapons[0]!, min: W, max: W }
    // Every landed white swing opens the window.
    addProc(plan, { trigger: TRIGGER.whiteLanded, chance: [1, 1], hands: 3, action: ACTION.aura, amount: plan.abilities[op].window, b: 0 })
    const sim = new Sim(plan)
    const got: [number, number][] = []
    sim.damageTrace = (s, d) => got.push([s, d])
    const swaps: number[] = []
    sim.stanceTrace = (stance, time) => swaps.push(stance, time)
    sim.runFight(0)
    // White swings at 0, 3.8, 7.6 and 11.4 s, all in Defensive Stance; Overpower at 0, 5 and 10 s in Battle.
    expect(swaps).toEqual([STANCE.battle, 0, STANCE.defensive, 1000, STANCE.battle, 5000, STANCE.defensive, 6000, STANCE.battle, 10000, STANCE.defensive, 11000])
    const row = plan.abilities[op].source
    const white = got.filter(([s]) => s === SOURCE_MAIN_HAND).map(([, d]) => d)
    const ops = got.filter(([s]) => s === row).map(([, d]) => d)
    expect(white.length).toBe(4)
    for (const d of white) expect(d).toBeCloseTo((W + AP_REAL) * 0.9, 9)
    expect(ops.length).toBe(3)
    for (const d of ops) expect(d).toBeCloseTo(W + AP_NORMALIZED + 35, 9)
    // Threat: Defensive ×1.3 on white swings; Battle ×0.8 on Overpower's 0.75 × damage (threat.md).
    const threat = (r: number) => counter(sim, r, FIELD.threat) / counter(sim, r, FIELD.damage)
    expect(plan.threatMult).toBeCloseTo(0.8, 12)
    expect(threat(SOURCE_MAIN_HAND)).toBeCloseTo(1.3, 12)
    expect(threat(row)).toBeCloseTo(0.75 * 0.8, 12)
  })

  it('crit: Berserker Stance’s +3% is in the build’s numbers, and Battle Stance takes it off', () => {
    const plan = armsPlan(1000, 'warrior-fury')
    addAbility(plan, OVERPOWER) // the special tables are built only with abilities
    const table = (stance: number) => {
      plan.stance = stance
      const t = new Sim(plan).inspect().specialThresholds
      return t[5] - t[4]
    }
    expect(table(STANCE.berserker) - table(STANCE.battle)).toBeCloseTo(3, 9)
  })

  it('crit while swapped: an Overpower in Battle Stance takes that stance’s crit, and the white swings around it their own', () => {
    const run = (battleCrit: number | null) => {
      const plan = armsPlan(60000, 'warrior-fury')
      if (battleCrit !== null) stanceOf(plan, STANCE.battle).crit = battleCrit
      const op = addAbility(plan, OVERPOWER)
      line(plan, op, [], STANCE.battle)
      rageAtPull(plan, 20)
      plan.periodicRage = [{ periodMs: 1000, tenths: 50, source: -1 }]
      plan.stats.hit = 100
      plan.stats.crit = 200
      plan.fight.bossCanDodge = false
      addProc(plan, { trigger: TRIGGER.whiteLanded, chance: [1, 1], hands: 3, action: ACTION.aura, amount: plan.abilities[op].window, b: 0 })
      const sim = new Sim(plan)
      let stance = plan.stance
      let battleSwings = 0
      sim.stanceTrace = (to) => (stance = to)
      sim.trace = (source) => {
        if (source === SOURCE_MAIN_HAND && stance === STANCE.battle) battleSwings++
      }
      for (let i = 0; i < 5; i++) sim.runFight(i)
      const row = plan.abilities[op].source
      return { op: [counter(sim, row, FIELD.hits), counter(sim, row, FIELD.crits)], whiteCrits: counter(sim, SOURCE_MAIN_HAND, FIELD.crits), battleSwings }
    }
    const normal = run(null)
    expect(normal.op).toEqual([0, 60]) // at 200% crit every Overpower crits, one every 5 s
    const noCritInBattle = run(-1000)
    expect(noCritInBattle.op).toEqual([60, 0])
    // A white swing can fall in the second in Battle Stance; those don't crit either.
    expect(noCritInBattle.battleSwings).toBeGreaterThan(0)
    expect(noCritInBattle.whiteCrits).toBeGreaterThan(0)
    expect(noCritInBattle.whiteCrits).toBeLessThan(normal.whiteCrits)
  })
})

describe('the Fury rows 10 and 15 in the engine (warrior.md §5.2)', () => {
  const furyRun = (rotation: Record<string, boolean>, seed = 12345, fights = 200) => {
    const d = defaultConfig('warrior-fury')
    const { plan } = buildPlan({ ...d, rotation, run: { ...d.run, seed } })
    const sim = new Sim(plan)
    const toBattle: { before: number; after: number }[] = []
    const opTimes: number[] = []
    const op = plan.abilities.findIndex((a) => a.id === 'overpower')
    let stance = plan.stance
    let inBattleUses = 0
    sim.stanceTrace = (to, _t, before, after) => {
      stance = to
      if (to === STANCE.battle) toBattle.push({ before, after })
    }
    sim.castTrace = (a, t) => {
      if (a === op) {
        opTimes.push(t)
        if (stance === STANCE.battle) inBattleUses++
      }
    }
    for (let i = 0; i < fights; i++) sim.runFight(i)
    return { plan, sim, toBattle, opTimes, inBattleUses }
  }

  it('row 10: every Overpower is a dance to Battle Stance at rage ≤ 25, so the swap in loses nothing', () => {
    const { plan, sim, toBattle, opTimes, inBattleUses } = furyRun({ 'warrior.fury.overpower.enabled': true })
    const row = plan.abilities.find((a) => a.id === 'overpower')!.source
    expect(counter(sim, row, FIELD.casts)).toBeGreaterThan(200)
    expect(counter(sim, row, FIELD.damage)).toBeGreaterThan(0)
    expect(inBattleUses).toBe(opTimes.length)
    expect(toBattle.length).toBe(opTimes.length)
    for (const s of toBattle) {
      expect(s.before).toBeLessThanOrEqual(250)
      expect(s.after).toBe(s.before)
    }
  })

  it('row 15: Slam is used, and its casts stop and reset the dual-wield swings', () => {
    const { plan, sim } = furyRun({ 'warrior.fury.slam.enabled': true })
    const slam = plan.abilities.find((a) => a.id === 'slam')!
    expect(slam.castStopsSwings).toBe(true)
    expect(counter(sim, slam.source, FIELD.casts)).toBeGreaterThan(50)
  })

  it('is deterministic with the dance: the same seed gives the same result, and a fight depends only on its index', () => {
    const on = { 'warrior.fury.overpower.enabled': true }
    const a = Array.from(furyRun(on, 7, 100).sim.counters)
    expect(Array.from(furyRun(on, 7, 100).sim.counters)).toEqual(a)
    expect(Array.from(furyRun(on, 8, 100).sim.counters)).not.toEqual(a)
    const { plan } = furyRun(on, 7, 1)
    const fresh = new Sim(plan)
    fresh.runFight(5)
    const used = new Sim(plan)
    for (let i = 0; i < 5; i++) used.runFight(i)
    used.runFight(5)
    expect([used.fightDamage, used.fightThreat]).toEqual([fresh.fightDamage, fresh.fightThreat])
  })
})
