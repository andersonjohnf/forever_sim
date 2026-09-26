// The Arms abilities in the engine, from hand-built rotations (docs/classes/warrior.md §3.1, §7):
// worked examples W2, W4, W6, W12 (Deep Wounds) and W13; Slam's cast and the swing timers with
// and without Improved Slam (damage-and-timing §3.3); Spearing Strike by creature type and only
// with a two-hander;
// Rend's bleed: its ticks, refresh (WE-9), Improved Rend, armor, snapshot, tick crits
// (damage-and-timing §4) and the "Rend missing or under x s" condition; refunds on avoidance
// (rage.md#rage-refunds-on-avoided-abilities); stances; determinism.
import { describe, expect, it } from 'vitest'
import { BLOODRAGE, BLOODTHIRST, DEATH_WISH, HEROIC_STRIKE, MORTAL_STRIKE, RECKLESSNESS, REND, rend, SLAM, SPEARING_STRIKE } from '../classes/warrior/abilities'
import { TALENT_EFFECTS } from '../classes/warrior/talents'
import { type AbilityDef, ACTION, COND, type Plan, type RotationCondition, STANCE, STANCE_ANY, TRIGGER, TRIGGER_COUNT, type WeaponPlan } from '../plan/types'
import { CLASSIC_ERA, FOREVER } from '../rules/profiles'
import type { CreatureType } from '../types'
import { FIELD, FIELD_COUNT, SOURCE_MAIN_HAND, Sim } from './sim'
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
  O,
  rageAtPull,
  refresh,
  setAttackPower,
  T,
  timeline,
  W,
} from './test-helpers'

const AP_NORMALIZED = (1800 / 14) * 3.3 // 424.29
const AP_REAL = (1800 / 14) * 3.8 // 488.57

describe('Arms worked examples in the engine (1800 AP, pre-armor, two-hander T)', () => {
  it('W2: Mortal Strike is normalized weapon damage + 160: 689.29–741.29, average 715.29; 736.74 with ×1.03; ×2.2 crits with Impale 2/2', () => {
    const plan = armsPlan(180000)
    const ms = addAbility(plan, MORTAL_STRIKE, new Map([['Impale', 2]]))
    line(plan, ms)
    alwaysLandNoCrit(plan)
    setAttackPower(plan, 1800)
    const hits = damages(plan, plan.abilities[ms].source, 20)
    expect(hits.length).toBeGreaterThan(200)
    expect(Math.min(...hits)).toBeGreaterThanOrEqual(105 + AP_NORMALIZED + 160 - 1e-9)
    expect(Math.max(...hits)).toBeLessThanOrEqual(157 + AP_NORMALIZED + 160 + 1e-9)
    expectMean(hits, 715.2857142857143)
    plan.weapons[0] = { ...plan.weapons[0]!, min: W, max: W }
    for (const d of damages(plan, plan.abilities[ms].source, 2)) expect(d).toBeCloseTo(715.2857142857143, 9)
    // Two-Handed Weapon Specialization 3/3.
    plan.physicalMult = 1.03
    for (const d of damages(plan, plan.abilities[ms].source, 2)) expect(d).toBeCloseTo(715.2857142857143 * 1.03, 9) // 736.74
    plan.physicalMult = 1
    plan.stats.crit = 200
    for (const d of damages(plan, plan.abilities[ms].source, 2)) expect(d).toBeCloseTo(715.2857142857143 * 2.2, 9)
  })

  it('W4: Slam is real-speed weapon damage + 87: average 706.57, 727.77 with ×1.03', () => {
    const plan = armsPlan(180000)
    const slam = addAbility(plan, SLAM)
    line(plan, slam)
    alwaysLandNoCrit(plan)
    setAttackPower(plan, 1800)
    const hits = damages(plan, plan.abilities[slam].source, 40)
    expect(hits.length).toBeGreaterThan(300)
    expect(Math.min(...hits)).toBeGreaterThanOrEqual(105 + AP_REAL + 87 - 1e-9)
    expect(Math.max(...hits)).toBeLessThanOrEqual(157 + AP_REAL + 87 + 1e-9)
    expectMean(hits, 706.5714285714286)
    plan.weapons[0] = { ...plan.weapons[0]!, min: W, max: W }
    plan.physicalMult = 1.03
    for (const d of damages(plan, plan.abilities[slam].source, 2)) expect(d).toBeCloseTo(706.5714285714286 * 1.03, 9) // 727.77
  })

  it('W6: Spearing Strike deals 0.40 × 555.29 = 222.11 (228.78 with ×1.03), and 1.20 × = 666.34 (686.33) against Dragonkin and Giants', () => {
    const strike = (creature: CreatureType, mult: number) => {
      const plan = armsPlan(60000)
      const ss = addAbility(plan, SPEARING_STRIKE, new Map(), creature)
      line(plan, ss)
      alwaysLandNoCrit(plan)
      setAttackPower(plan, 1800)
      plan.weapons[0] = { ...plan.weapons[0]!, min: W, max: W }
      plan.physicalMult = mult
      const hits = damages(plan, plan.abilities[ss].source, 2)
      expect(hits.length).toBe(6) // at 0, 20 and 40 s in each fight
      return hits
    }
    const whirlwind = W + AP_NORMALIZED // W3's 555.29
    for (const d of strike('none', 1)) expect(d).toBeCloseTo(0.4 * whirlwind, 9)
    for (const d of strike('none', 1.03)) expect(d).toBeCloseTo(0.4 * whirlwind * 1.03, 9)
    for (const d of strike('beast', 1)) expect(d).toBeCloseTo(0.4 * whirlwind, 9)
    for (const d of strike('dragonkin', 1)) expect(d).toBeCloseTo(1.2 * whirlwind, 9)
    for (const d of strike('dragonkin', 1.03)) expect(d).toBeCloseTo(1.2 * whirlwind * 1.03, 9) // 686.33
    for (const d of strike('giant', 1)) expect(d).toBeCloseTo(1.2 * whirlwind, 9) // 666.34
  })

  it('Spearing Strike is never used with one-handers, alone or dual wielding', () => {
    const uses = (weapons: [Partial<WeaponPlan>, Partial<WeaponPlan> | null]) => {
      const plan = armsPlan(60000)
      const ss = addAbility(plan, SPEARING_STRIKE)
      line(plan, ss)
      rageAtPull(plan, 100)
      plan.weapons = [{ ...plan.weapons[0]!, ...weapons[0] }, weapons[1] ? { ...plan.weapons[0]!, ...weapons[1] } : null]
      return timeline(plan).uses[ss]
    }
    expect(uses([T, null])).toEqual([0, 20000, 40000])
    expect(uses([O, null])).toEqual([])
    expect(uses([O, O])).toEqual([])
  })
})

describe('Deep Wounds 3/3 (warrior.md §2.5, W12)', () => {
  /** Deep Wounds 3/3 as the talent defines it: its share, 4 ticks, 3 s apart. */
  function talentShare(): number {
    const effect = TALENT_EFFECTS['Deep Wounds'](3)[0]
    const action = effect.kind === 'proc' && effect.proc.action.kind === 'weaponBleed' ? effect.proc.action : null
    expect(action).toMatchObject({ ticks: 4, periodMs: 3000 })
    expect(action!.share).toBeCloseTo(0.6, 12)
    return action!.share
  }
  /** A plan at 1800 AP whose attacks always land, with Deep Wounds 3/3 on crits with the hands in `hands`. */
  function bleedPlan(weapons: [Partial<WeaponPlan>, Partial<WeaponPlan> | null], hands: number, durationMs: number, rolls: boolean, physicalMult = 1) {
    const share = talentShare()
    const plan = armsPlan(durationMs)
    plan.profile = rolls ? FOREVER : CLASSIC_ERA
    plan.weapons = [{ ...plan.weapons[0]!, ...weapons[0] }, weapons[1] ? { ...plan.weapons[0]!, name: 'Off hand', handMult: 0.5, ...weapons[1] } : null]
    plan.stats.hit = 100
    plan.fight.bossCanDodge = false
    plan.physicalMult = physicalMult
    setAttackPower(plan, 1800)
    plan.sources.push({ id: 'deepWounds', name: 'Deep Wounds', icon: 'x' })
    const row = plan.sources.length - 1
    addProc(plan, { id: 'deepWounds', trigger: TRIGGER.meleeCrit, chance: [1, 1], hands, action: ACTION.weaponBleed, amount: 4, a: share, b: 3000, source: row })
    return { plan, row }
  }
  const round2 = (x: number) => Math.round(x * 100) / 100

  describe('`forever`: a rolling pool (D36) [?]', () => {
    const MH_O = 0.6 * (152 + (1800 / 14) * 2.6) // 291.77
    const OH_O = MH_O * 0.625 // 182.36 with Dual Wield Specialization 5/5

    /** An aura of +300 crit whose `charges` crits use it up, as a cast with no cost or GCD. */
    const critUp = (id: string, charges: number): AbilityDef => ({
      ...RECKLESSNESS,
      id,
      gcdMs: 0,
      stances: STANCE_ANY,
      aura: { id, name: id, durationMs: 60000, critCharges: charges, mods: { crit: 300 } },
    })

    /**
     * No crits but these, against a level-59 target (no glancing): the first `charges` attacks from
     * the pull crit, and `later` more from `laterAt` ms.
     */
    function scripted(weapons: [Partial<WeaponPlan>, Partial<WeaponPlan> | null], durationMs: number, charges: number, physicalMult = 1, later?: { at: number; charges: number }) {
      const { plan, row } = bleedPlan(weapons, 3, durationMs, true, physicalMult)
      plan.stats.crit = -100
      plan.fight.targetLevel = 59
      rageAtPull(plan, 100)
      // addAbility's aura leaves out the crit charges, so they're set on the plan's aura.
      const add = (id: string, n: number) => {
        const a = addAbility(plan, critUp(id, n))
        plan.auras[plan.abilities[a].aura].critCharges = n
        return a
      }
      plan.prepull.casts.push({ ability: add('critUp', charges), atMs: -1000 })
      if (later) line(plan, add('critLater', later.charges), at(plan, later.at))
      return { plan, row }
    }

    it('W12: a white crit at 0 s and a Bloodthirst crit at 1 s pool 2 × 291.77; the first tick stays at 3 s; an off-hand crit at 6.5 s adds 182.36 to the 291.77 left', () => {
      expect(round2(MH_O)).toBe(291.77)
      expect(round2(OH_O)).toBe(182.36)
      expect(round2((2 * MH_O) / 4)).toBe(145.89)
      expect(round2((MH_O + OH_O) / 4)).toBe(118.53)
      // Main hand at 0, 2.6, 5.2 s; off hand at 1.3, 3.9, 6.5 s; Bloodthirst at 1 s.
      const { plan, row } = scripted([O, { ...O, handMult: 0.625 }], 13000, 2, 1, { at: 6000, charges: 1 })
      line(plan, addAbility(plan, BLOODTHIRST), at(plan, 1000))
      const { sim, ticks, uses } = timeline(plan)
      expect(uses[plan.abilities.findIndex((a) => a.id === 'bloodthirst')]).toEqual([1000])
      expect(ticks).toEqual([3000, 6000, 9000, 12000])
      const d = damages(plan, row, 1)
      expect(d).toHaveLength(4)
      expect(d[0]).toBeCloseTo((2 * MH_O) / 4, 9)
      expect(d[1]).toBeCloseTo((2 * MH_O) / 4, 9)
      // After the ticks at 3 and 6 s, 291.77 is left; the off hand's crit brings it to 474.13 over 4 ticks.
      expect(d[2]).toBeCloseTo((MH_O + OH_O) / 4, 9)
      expect(d[3]).toBeCloseTo((MH_O + OH_O) / 4, 9)
      // Three applications (the crits), four ticks; no tick crits.
      expect([counter(sim, row, FIELD.casts), counter(sim, row, FIELD.hits), counter(sim, row, FIELD.crits)]).toEqual([3, 4, 0])
    })

    it('a lone crit: two-hander T’s 371.74 over 4 ticks of 92.94, snapshotted with ×1.03 as 95.72; the average, not a roll', () => {
      const lone = (weapon: Partial<WeaponPlan>, mult: number) => {
        const { plan, row } = scripted([weapon, null], 13000, 1, mult)
        return damages(plan, row, 1)
      }
      const tick = (0.6 * (W + AP_REAL)) / 4
      expect(round2(tick)).toBe(92.94)
      expect(round2(tick * 1.03)).toBe(95.72)
      for (const [weapon, mult, expected] of [
        [{ ...T, min: W, max: W }, 1, tick],
        [T, 1, tick],
        [T, 1.03, tick * 1.03],
      ] as const) {
        const d = lone(weapon, mult)
        expect(d).toHaveLength(4)
        for (const x of d) expect(x).toBeCloseTo(expected, 9)
      }
    })

    it('is the same with the same seed, and a fight’s ticks never pay out more than its crits put in', () => {
      const run = () => {
        const { plan, row } = bleedPlan([O, { ...O, handMult: 0.625 }], 3, 60000, true)
        plan.stats.crit = 30
        const sim = new Sim(plan)
        sim.runFight(7)
        return [counter(sim, row, FIELD.damage), counter(sim, row, FIELD.casts)]
      }
      const [damage, crits] = run()
      expect(crits).toBeGreaterThan(10)
      expect(damage).toBeGreaterThan(0)
      expect(damage).toBeLessThanOrEqual(crits * MH_O + 1e-6)
      expect(run()).toEqual([damage, crits])
    })
  })

  describe('`classicEra`: each crit restarts it, recomputed each tick from the main hand [C]', () => {
    function ticks(weapons: [Partial<WeaponPlan>, Partial<WeaponPlan> | null], hands: number, physicalMult = 1): number[] {
      const { plan, row } = bleedPlan(weapons, hands, 30000, false, physicalMult)
      const out = damages(plan, row, 10)
      expect(out.length).toBeGreaterThan(20)
      return out
    }

    it('two-hander T: 0.6 × (131 + 488.57) = 371.74 over 4 ticks of 92.94, or 95.72 with Two-Handed Weapon Specialization ×1.03', () => {
      const tick = (0.6 * (W + AP_REAL)) / 4
      expect(round2(tick)).toBe(92.94)
      expect(round2(tick * 1.03)).toBe(95.72)
      for (const d of ticks([{ ...T, min: W, max: W }, null], 1)) expect(d).toBeCloseTo(tick, 9)
      // The average swing, not a roll: the same with the weapon's real 105–157 range.
      for (const d of ticks([T, null], 1)) expect(d).toBeCloseTo(tick, 9)
      for (const d of ticks([T, null], 1, 1.03)) expect(d).toBeCloseTo(tick * 1.03, 9)
    })

    it('one-hander O in the main hand: 0.6 × 486.29 = 291.77 over 4 ticks of 72.94, the same when the off hand crits', () => {
      const tick = (0.6 * (152 + (1800 / 14) * 2.6)) / 4
      expect(round2(tick)).toBe(72.94)
      for (const d of ticks([O, null], 1)) expect(d).toBeCloseTo(tick, 9)
      // Only the off hand's crits apply it; the ticks still use the main hand's swing.
      for (const d of ticks([O, { ...O, min: 50, max: 60, speedSec: 1.5 }], 2)) expect(d).toBeCloseTo(tick, 9)
    })
  })
})

describe('Slam’s cast and the swing timers (warrior.md §3.1 "Slam", damage-and-timing §3.3)', () => {
  /** Slam alone with two-hander T; each landed swing gives 17.1 rage, so the first Slam follows the first swing. */
  function slamPlan(improvedSlam: number, durationMs: number) {
    const plan = armsPlan(durationMs)
    const slam = addAbility(plan, SLAM, new Map([['Improved Slam', improvedSlam]]))
    line(plan, slam)
    alwaysLandNoCrit(plan)
    return { plan, slam }
  }

  it('W4 without Improved Slam: a 1.5 s cast with no swings, then the timer restarts; the cooldown runs from the cast’s end', () => {
    const { plan, slam } = slamPlan(0, 25000)
    const { sim, swings, uses } = timeline(plan)
    // Slam at 0 s after the first swing lands at 1.5 s: the swing due at 3.8 s moves to 1.5 + 3.8.
    // Its 18 s cooldown ends at 19.5 s, so the swing due at 20.5 s moves to 21.0 + 3.8.
    expect(uses[slam]).toEqual([0, 19500])
    expect(swings[0]).toEqual([0, 5300, 9100, 12900, 16700, 24800])
    expect(counter(sim, plan.abilities[slam].source, FIELD.casts)).toBe(2)
  })

  it('W4 with Improved Slam 2/2: a 1 s cast and GCD, and the swing timer untouched', () => {
    const { plan, slam } = slamPlan(2, 25000)
    const { sim, swings, uses } = timeline(plan)
    expect(uses[slam]).toEqual([0, 16000])
    expect(swings[0]).toEqual([0, 3800, 7600, 11400, 15200, 19000, 22800])
    expect(counter(sim, plan.abilities[slam].source, FIELD.casts)).toBe(2)
  })

  it('dual wielding, without Improved Slam both timers stop and restart from full; with it, neither moves', () => {
    const swingsAround = (improvedSlam: number) => {
      const plan = armsPlan(15000)
      const slam = addAbility(plan, SLAM, new Map([['Improved Slam', improvedSlam]]))
      line(plan, slam, [from(plan, 2000)])
      alwaysLandNoCrit(plan)
      rageAtPull(plan, 100)
      plan.weapons = [
        { ...plan.weapons[0]!, ...O },
        { ...plan.weapons[0]!, ...O, handMult: 0.5 },
      ]
      const { swings, uses } = timeline(plan)
      expect(uses[slam]).toEqual([2000])
      return swings
    }
    // The cast runs 2.0–3.5 s: the main hand due at 2.6 s and the off hand due at 3.9 s both wait
    // until 3.5 + 2.6.
    expect(swingsAround(0)).toEqual([
      [0, 6100, 8700, 11300, 13900],
      [1300, 6100, 8700, 11300, 13900],
    ])
    expect(swingsAround(1)).toEqual([
      [0, 2600, 5200, 7800, 10400, 13000],
      [1300, 3900, 6500, 9100, 11700, 14300],
    ])
  })

  it('no other GCD ability starts during the cast; off-GCD ones still do', () => {
    const firstUses = (improvedSlam: number) => {
      const plan = armsPlan(10000)
      const talents = new Map([['Improved Slam', improvedSlam]])
      const slam = addAbility(plan, SLAM, talents)
      const ms = addAbility(plan, MORTAL_STRIKE, talents)
      const br = addAbility(plan, BLOODRAGE, talents)
      line(plan, slam)
      line(plan, ms)
      line(plan, br, [from(plan, 500)])
      alwaysLandNoCrit(plan)
      rageAtPull(plan, 100)
      const { uses } = timeline(plan)
      return [uses[slam][0], uses[br][0], uses[ms][0]]
    }
    // Slam at 0; Bloodrage (off the GCD) at 0.5 s, during the cast; Mortal Strike when it ends.
    expect(firstUses(0)).toEqual([0, 500, 1500])
    expect(firstUses(2)).toEqual([0, 500, 1000])
  })

  it('without Improved Slam, a queued Heroic Strike waits for the first main-hand swing after the cast', () => {
    const plan = armsPlan(12000)
    const hs = addAbility(plan, HEROIC_STRIKE)
    const slam = addAbility(plan, SLAM)
    line(plan, hs)
    line(plan, slam, [from(plan, 2000)])
    alwaysLandNoCrit(plan)
    rageAtPull(plan, 100)
    const { swings, uses } = timeline(plan)
    expect(uses[slam]).toEqual([2000])
    // Every main-hand swing is a Heroic Strike: 0 s, then 3.5 + 3.8 s after the cast, then 11.1 s.
    expect(uses[hs]).toEqual([0, 7300, 11100])
    expect(swings[0]).toEqual([])
  })

  it('with Improved Slam, a Heroic Strike swing during the cast can leave too little rage: that Slam fails, costing nothing and starting no cooldown', () => {
    const plan = armsPlan(10000)
    const talents = new Map([['Improved Slam', 2]])
    const hs = addAbility(plan, HEROIC_STRIKE, talents)
    const slam = addAbility(plan, SLAM, talents)
    line(plan, hs)
    line(plan, slam, [from(plan, 3000)])
    alwaysLandNoCrit(plan)
    rageAtPull(plan, 40)
    const { sim, uses, rageAtUse } = timeline(plan)
    // 40 → Heroic Strike at 0 s (25) → Slam cast 3.0–4.0 s → Heroic Strike at 3.8 s (10) → at
    // 4.0 s Slam can't pay its 15: it fails. A white swing at 7.6 s (27.1) starts it again, and
    // that one lands at 8.6 s.
    expect(uses[hs]).toEqual([0, 3800])
    expect(uses[slam]).toEqual([3000, 7600])
    expect(rageAtUse[slam]).toEqual([250, 271])
    expect(counter(sim, plan.abilities[slam].source, FIELD.casts)).toBe(1)
    expect(counter(sim, plan.abilities[slam].source, FIELD.hits)).toBe(1)
  })

  it('an extra attack granted during a cast that stops swings waits for the cast to end', () => {
    const plan = armsPlan(8000)
    const slam = addAbility(plan, SLAM)
    line(plan, slam, [from(plan, 1000)])
    alwaysLandNoCrit(plan)
    rageAtPull(plan, 100)
    // One extra attack whenever damage is taken, every 2 s.
    plan.sources.push({ id: 'test', name: 'Test', icon: 'x' })
    plan.procs = [
      { id: 'test', name: 'Test', trigger: TRIGGER.damageTaken, chance: [1, 1], hands: 3, icdMs: 0, action: ACTION.extraAttacks, amount: 1, a: 0, b: 0, school: 0, source: plan.sources.length - 1, chainBit: 1 },
    ]
    plan.triggers = Array.from({ length: TRIGGER_COUNT }, (_, t) => (t === TRIGGER.damageTaken ? [0] : []))
    plan.fight.damageTakenPerHit = 1
    plan.fight.damageTakenIntervalMs = 2000
    // The cast runs 1.0–2.5 s: the extra attack granted at 2.0 s swings at 2.5 s.
    expect(timeline(plan).swings[0]).toEqual([0, 2500, 4000, 6000])
  })
})

describe('Rend (warrior.md §3.1, damage-and-timing §4)', () => {
  /** Rend in Battle Stance with Improved Rend 3/3 and Impale 2/2, and 100 rage at the pull; every attack lands. */
  function rendPlan(durationMs: number, talents: [string, number][] = [['Improved Rend', 3], ['Impale', 2]]) {
    const plan = armsPlan(durationMs)
    const rend = addAbility(plan, REND, new Map(talents))
    alwaysLandNoCrit(plan)
    rageAtPull(plan, 100)
    return { plan, rend, row: plan.abilities[rend].source }
  }

  it('W13: 7 ticks of 28.35 every 3 s, through armor; "missing" reapplies it as the last tick lands, which isn’t lost', () => {
    const { plan, rend, row } = rendPlan(30000)
    line(plan, rend, [refresh(rend, 0)])
    plan.fight.targetArmor = 3731 // bleeds ignore armor (damage-and-timing §1.3)
    const { sim, ticks, uses } = timeline(plan)
    expect(uses[rend]).toEqual([0, 21000])
    expect(ticks).toEqual([3000, 6000, 9000, 12000, 15000, 18000, 21000, 24000, 27000])
    const d = damages(plan, row, 1)
    expect(d.length).toBe(9)
    for (const x of d) expect(x).toBeCloseTo(28.35, 9)
    expect([counter(sim, row, FIELD.casts), counter(sim, row, FIELD.hits), counter(sim, row, FIELD.crits)]).toEqual([2, 9, 0])
  })

  it('W13 in `forever`: each tick adds 0.02 × AP read as it lands, × 1.35: 76.95 at 1800 AP, 82.35 once +200 AP is up', () => {
    const plan = armsPlan(30000)
    const r = addAbility(plan, rend(FOREVER), new Map([['Improved Rend', 3]]))
    alwaysLandNoCrit(plan)
    rageAtPull(plan, 100)
    setAttackPower(plan, 1800)
    line(plan, r, at(plan, 100))
    // +200 AP from the first landed swing after Rend is up (3.8 s), for the rest of the fight: the
    // tick at 3.1 s reads 1800, those from 6.1 s 2000; the multipliers stay the application's.
    const up = addAura(plan, { id: 'apUp', name: 'AP up', durationMs: 60000, mods: { ap: 200 } })
    addProc(plan, { trigger: TRIGGER.whiteLanded, chance: [1, 1], hands: 1, action: ACTION.aura, amount: up, b: 0, icdMs: 60000, requiresAura: plan.abilities[r].aura })
    const d = damages(plan, plan.abilities[r].source, 1)
    expect(d.length).toBe(7)
    expect(d[0]).toBeCloseTo(76.95, 9)
    for (const x of d.slice(1)) expect(x).toBeCloseTo(82.35, 9)
  })

  it('W13 in `classicEra`: no attack-power term, so 28.35 a tick even once +200 AP is up mid-fight', () => {
    const plan = armsPlan(30000)
    const r = addAbility(plan, rend(CLASSIC_ERA), new Map([['Improved Rend', 3]]))
    alwaysLandNoCrit(plan)
    rageAtPull(plan, 100)
    setAttackPower(plan, 1800)
    line(plan, r, at(plan, 100))
    // The same +200 AP as the `forever` case above: it's up from 3.8 s, and the ticks don't move.
    const up = addAura(plan, { id: 'apUp', name: 'AP up', durationMs: 60000, mods: { ap: 200 } })
    addProc(plan, { trigger: TRIGGER.whiteLanded, chance: [1, 1], hands: 1, action: ACTION.aura, amount: up, b: 0, icdMs: 60000, requiresAura: plan.abilities[r].aura })
    expect(plan.abilities[r].dotTickApCoefficient).toBeUndefined()
    const d = damages(plan, plan.abilities[r].source, 1)
    expect(d.length).toBe(7)
    for (const x of d) expect(x).toBeCloseTo(28.35, 9)
  })

  it('"under 3 s" reapplies it with 3 s left: the tick due then lands first, the next is lost (WE-9)', () => {
    const { plan, rend } = rendPlan(30000)
    line(plan, rend, [refresh(rend, 3000)])
    const { ticks, uses } = timeline(plan)
    expect(uses[rend]).toEqual([0, 18000])
    expect(ticks).toEqual([3000, 6000, 9000, 12000, 15000, 18000, 21000, 24000, 27000])
  })

  it('WE-9: reapplied at 10 s, it ticks at 13, 16, … 31 s; the tick due at 12 s is lost', () => {
    const { plan, rend } = rendPlan(32000)
    line(plan, rend, [refresh(rend, 0)])
    line(plan, rend, at(plan, 10000))
    const { ticks, uses } = timeline(plan)
    expect(uses[rend]).toEqual([0, 10000, 31000])
    expect(ticks).toEqual([3000, 6000, 9000, 13000, 16000, 19000, 22000, 25000, 28000, 31000])
  })

  it('Improved Rend 0–3: ticks of 21, 23.52, 25.83 and 28.35, times physical damage modifiers (×1.03)', () => {
    const tick = (rank: number, mult: number) => {
      const { plan, rend, row } = rendPlan(10000, [['Improved Rend', rank]])
      line(plan, rend, [refresh(rend, 0)])
      plan.physicalMult = mult
      const d = damages(plan, row, 1)
      expect(d.length).toBe(3)
      return d[0]
    }
    const expected = [21, 23.52, 25.83, 28.35]
    for (let r = 0; r <= 3; r++) {
      expect(tick(r, 1)).toBeCloseTo(expected[r], 9)
      expect(tick(r, 1.03)).toBeCloseTo(expected[r] * 1.03, 9)
    }
  })

  it('snapshots damage modifiers at the application: Death Wish at 5 s changes only the next Rend’s ticks', () => {
    const { plan, rend, row } = rendPlan(30000)
    const dw = addAbility(plan, DEATH_WISH)
    line(plan, rend, [refresh(rend, 0)])
    line(plan, dw, at(plan, 5000))
    const d = damages(plan, row, 1)
    expect(d.length).toBe(9)
    for (const x of d.slice(0, 7)) expect(x).toBeCloseTo(28.35, 9)
    for (const x of d.slice(7)) expect(x).toBeCloseTo(28.35 * 1.2, 9)
  })

  it('in `forever` its ticks can crit, ×2.2 with Impale 2/2 (×2.0 without) [?]; in `classicEra` never', () => {
    const ticks = (talents: [string, number][], classic: boolean) => {
      const { plan, rend, row } = rendPlan(24000, talents)
      line(plan, rend, [refresh(rend, 0)])
      plan.stats.crit = 200
      if (classic) plan.profile = CLASSIC_ERA
      const d = damages(plan, row, 1)
      expect(d.length).toBe(7)
      return d
    }
    for (const x of ticks([['Improved Rend', 3], ['Impale', 2]], false)) expect(x).toBeCloseTo(28.35 * 2.2, 9)
    for (const x of ticks([['Improved Rend', 3]], false)) expect(x).toBeCloseTo(28.35 * 2, 9)
    for (const x of ticks([['Improved Rend', 3], ['Impale', 2]], true)) expect(x).toBeCloseTo(28.35, 9)
  })

  it('a tick crit fires no crit procs; the landed application fires on-hit procs, and can’t crit', () => {
    const { plan, rend, row } = rendPlan(40000)
    line(plan, rend, [refresh(rend, 0)])
    plan.stats.crit = 50
    // A crit proc and an on-hit proc, counted by their casts.
    plan.sources.push({ id: 'onCrit', name: 'On crit', icon: 'x' }, { id: 'onHit', name: 'On hit', icon: 'x' })
    const n = plan.sources.length
    const proc = (id: string, trigger: number, source: number) => ({ id, name: id, trigger, chance: [1, 1] as [number, number], hands: 3, icdMs: 0, action: ACTION.spellDamage, amount: 0, a: 1, b: 1, school: 0, source, chainBit: 0 })
    plan.procs = [proc('onCrit', TRIGGER.meleeCrit, n - 2), proc('onHit', TRIGGER.meleeLanded, n - 1)]
    plan.triggers = Array.from({ length: TRIGGER_COUNT }, (_, t) => (t === TRIGGER.meleeCrit ? [0] : t === TRIGGER.meleeLanded ? [1] : []))
    const sim = new Sim(plan)
    for (let i = 0; i < 20; i++) sim.runFight(i)
    const white = (f: number) => counter(sim, SOURCE_MAIN_HAND, f)
    expect(counter(sim, row, FIELD.crits)).toBeGreaterThan(50)
    expect(counter(sim, n - 2, FIELD.casts)).toBe(white(FIELD.crits))
    const landedWhite = white(FIELD.hits) + white(FIELD.crits) + white(FIELD.glances) + white(FIELD.blocks)
    expect(counter(sim, n - 1, FIELD.casts)).toBe(landedWhite + counter(sim, row, FIELD.casts))
  })

  it('needs Battle or Defensive Stance', () => {
    const used = (stance: number) => {
      const { plan, rend } = rendPlan(10000)
      line(plan, rend, [refresh(rend, 0)])
      plan.stance = stance
      return timeline(plan).uses[rend].length > 0
    }
    expect([STANCE.battle, STANCE.defensive, STANCE.berserker].map(used)).toEqual([true, true, false])
  })

  it('its marker can gate other lines: Mortal Strike only while Rend is on the target', () => {
    const { plan, rend } = rendPlan(40000)
    const ms = addAbility(plan, MORTAL_STRIKE)
    line(plan, rend, at(plan, 0))
    line(plan, ms, [{ code: COND.abilityAuraUp, a: rend, b: 0 }])
    const { uses } = timeline(plan)
    expect(uses[rend]).toEqual([0])
    expect(uses[ms]).toEqual([1500, 7500, 13500, 19500])
  })
})

describe('rage refunds on avoidance (rage.md#rage-refunds-on-avoided-abilities)', () => {
  /** Rage at each use when the boss dodges everything and 30 rage arrives every 10 s. */
  function rageAtUses(def: AbilityDef, conditions: (a: number) => RotationCondition[] = () => []): number[] {
    const plan = armsPlan(60000)
    const a = addAbility(plan, def)
    line(plan, a, conditions(a))
    plan.stats.hit = 100
    plan.stats.expertise = -1000 // every attack is dodged
    plan.periodicRage = [{ periodMs: 10000, tenths: 300, source: -1 }]
    const { sim, rageAtUse } = timeline(plan)
    expect(sim.inspect().specialThresholds[1]).toBe(100)
    return rageAtUse[a].slice(0, 4)
  }

  it('each dodged cast nets 20% of its cost: Mortal Strike −6, Slam −3, Spearing Strike −3, Rend −2', () => {
    // Mortal Strike at 10 s (30 → 24), 20 s (54 → 48), 26 s (48 → 42), 30 s (72).
    expect(rageAtUses(MORTAL_STRIKE)).toEqual([300, 540, 480, 720])
    // Slam pays and refunds when its cast ends (11.5 s: 30 → 27); its cooldown ends at 26.5 s.
    expect(rageAtUses(SLAM).slice(0, 2)).toEqual([300, 570])
    // Spearing Strike's 20 s cooldown: 10 s (30 → 27), 30 s (27 + 30).
    expect(rageAtUses(SPEARING_STRIKE).slice(0, 2)).toEqual([300, 570])
    // A dodged Rend never lands, so "Rend missing" stays true: every GCD while there's rage.
    expect(rageAtUses(REND, (a) => [refresh(a, 0)])).toEqual([300, 280, 260, 240])
  })
})

describe('a line timed from the execute phase (COND.executeWithin; warrior.md §5.3 row 4, §7)', () => {
  // A 20 s fight with no variation and a 20% execute phase: the phase starts at 16 s. White swings
  // land at 0, 3.8, 7.6, 11.4 and 15.2 s, so a use at any other time is the condition's own wake-up.
  const withPhase = (executePct: number, lines: (plan: Plan, br: number) => void) => {
    const plan = armsPlan(20000)
    plan.fight.executePct = executePct
    const br = addAbility(plan, BLOODRAGE)
    lines(plan, br)
    alwaysLandNoCrit(plan)
    const { sim, uses } = timeline(plan)
    return { executeAt: sim.executeAtMs, uses: uses[br] }
  }
  const within = (ms: number): RotationCondition => ({ code: COND.executeWithin, a: ms, b: 0 })

  it('holds from that long before the phase starts, and the rotation wakes then', () => {
    expect(withPhase(20, (plan, br) => line(plan, br, [within(1500)]))).toEqual({ executeAt: 16000, uses: [14500] })
    // A lead longer than the time to the phase holds from the pull.
    expect(withPhase(20, (plan, br) => line(plan, br, [within(30000)])).uses).toEqual([0])
    // A lead of 0: the phase's start.
    expect(withPhase(20, (plan, br) => line(plan, br, [within(0)])).uses).toEqual([16000])
  })

  it('never holds in a fight without an execute phase', () => {
    expect(withPhase(0, (plan, br) => line(plan, br, [within(1500)]))).toEqual({ executeAt: 20000, uses: [] })
  })

  it('with a time-left line for the same ability, the first to hold uses it (Arms Recklessness)', () => {
    // 1.5 s before the phase (14.5 s) or with 8 s left (12 s): 12 s comes first; with 3 s left (17 s), 14.5 s.
    const both = (leftMs: number, executePct = 20) =>
      withPhase(executePct, (plan, br) => {
        line(plan, br, [within(1500)])
        line(plan, br, [{ code: COND.timeLeftAtMost, a: leftMs, b: 0 }])
      }).uses
    expect(both(8000)).toEqual([12000])
    expect(both(3000)).toEqual([14500])
    // Without the phase, only the clock.
    expect(both(3000, 0)).toEqual([17000])
    // Conditions on one line all hold: the later of the two.
    expect(withPhase(20, (plan, br) => line(plan, br, [within(1500), { code: COND.timeLeftAtMost, a: 8000, b: 0 }])).uses).toEqual([14500])
  })

  it('its opposite, "the phase starts in more than x" (COND.executeNotWithin), holds until then, and always without the phase (Fury’s potion, §5.2 row 16)', () => {
    const notWithin = (ms: number): RotationCondition => ({ code: COND.executeNotWithin, a: ms, b: 0 })
    // With 8 s left (12 s), if the phase (16 s) is more than x away then: until 16 − x, in whole ms.
    const withClock = (ms: number, executePct = 20) =>
      withPhase(executePct, (plan, br) => line(plan, br, [notWithin(ms), { code: COND.timeLeftAtMost, a: 8000, b: 0 }])).uses
    expect(withClock(1500)).toEqual([12000])
    expect(withClock(3999)).toEqual([12000])
    expect(withClock(4000)).toEqual([])
    expect(withClock(5000)).toEqual([])
    // Without the phase it always holds.
    expect(withClock(5000, 0)).toEqual([12000])
    // Alone, from the pull.
    expect(withPhase(20, (plan, br) => line(plan, br, [notWithin(1500)])).uses).toEqual([0])
    // Never once the phase has come within it: from 14.5 s on, a lead of 1.5 s.
    expect(withPhase(20, (plan, br) => line(plan, br, [notWithin(1500), { code: COND.timeLeftAtMost, a: 5500, b: 0 }])).uses).toEqual([])
  })
})

describe('determinism with the Arms abilities in play (decision D15)', () => {
  function arms(seed: number): Plan {
    const plan = armsPlan(120000)
    plan.seed = seed
    const talents = new Map([
      ['Impale', 2],
      ['Improved Rend', 3],
    ])
    const rend = addAbility(plan, REND, talents)
    line(plan, rend, [refresh(rend, 0)])
    line(plan, addAbility(plan, MORTAL_STRIKE, talents))
    line(plan, addAbility(plan, SPEARING_STRIKE, talents))
    line(plan, addAbility(plan, SLAM, talents))
    line(plan, addAbility(plan, HEROIC_STRIKE, talents), [{ code: COND.minRage, a: 600, b: 0 }])
    plan.fight.targetArmor = 3000
    // 5 rage a second on top of the white rage, so Heroic Strike's 60-rage line is reached too.
    plan.periodicRage = [{ periodMs: 1000, tenths: 50, source: -1 }]
    return plan
  }
  const run = (plan: Plan) => {
    const sim = new Sim(plan)
    for (let i = 0; i < 200; i++) sim.runFight(i)
    return Array.from(sim.counters)
  }

  it('gives the same result for the same seed, and a fight depends only on its index', () => {
    const a = run(arms(7))
    expect(run(arms(7))).toEqual(a)
    expect(run(arms(8))).not.toEqual(a)
    const fresh = new Sim(arms(7))
    fresh.runFight(5)
    const used = new Sim(arms(7))
    for (let i = 0; i < 5; i++) used.runFight(i)
    used.runFight(5)
    expect([used.fightDamage, used.fightThreat]).toEqual([fresh.fightDamage, fresh.fightThreat])
    // Every ability did something.
    const plan = arms(7)
    for (const ab of plan.abilities) expect(a[ab.source * FIELD_COUNT + FIELD.damage], ab.id).toBeGreaterThan(0)
  })
})
