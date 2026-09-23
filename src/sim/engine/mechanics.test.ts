// Generic engine mechanics against their owning docs, through the real code paths: extra-attack
// chains and internal cooldowns (damage-and-timing §5.4), the weapon-bleed refresh tie-break (§4),
// magic-proc crits (combat-tables §9), white and off-hand damage and haste (damage-and-timing WE-2,
// WE-4, WE-5), the negative-armor floor (§1.1), boss parry haste (§3.4), the fight-length draw and
// execute start (encounter WE-1, WE-2), rage from damage taken in every model, Classic Era's
// dodge and parry rage, the block's procs after the damage-taken rage (rage.md), R13, R14, rage's
// fractions of a tenth (rage.md#rounding, R27-R33), and energize threat (threat.md T15, T16).
import { describe, expect, it } from 'vitest'
import { BERSERKER_RAGE, BLOODRAGE, EXECUTE, HAMSTRING, HEROIC_STRIKE, MORTAL_STRIKE } from '../classes/warrior/abilities'
import { armorReduction, damageTakenRage, rageConversion } from '../core/formulas'
import { defaultConfig } from '../defaults'
import { buildPlan } from '../plan/build'
import { ACTION, type Plan, STANCE, TRIGGER, TRIGGER_COUNT } from '../plan/types'
import { FOREVER } from '../rules/profiles'
import type { DamageTakenRageModel, RuleProfileId, SimConfig, SpecId } from '../types'
import { FIELD, SOURCE_MAIN_HAND, SOURCE_OFF_HAND, Sim } from './sim'
import { addAbility, addAura, addProc, alwaysLandNoCrit, armsPlan, at, counter, damages, expectMean, line, rageAtPull, setAttackPower, timeline } from './test-helpers'

/** A breakdown row for a test proc. */
function row(plan: Plan, id: string): number {
  plan.sources.push({ id, name: id, icon: 'x' })
  return plan.sources.length - 1
}

/** An extra-attack proc on every landed main-hand attack, white or special. */
function extraAttackProc(plan: Plan, id: string, chainBit: number, icdMs = 0) {
  return addProc(plan, { id, trigger: TRIGGER.meleeLanded, chance: [1, 1], hands: 1, action: ACTION.extraAttacks, amount: 1, b: 0, chainBit, icdMs, source: row(plan, id) })
}

/**
 * A bare plan of `spec` in `profile`: no talents, buffs, abilities or procs, a fight of exactly
 * `durationMs`, and multipliers of 1 (the stance's own effects aside).
 */
function barePlan(spec: SpecId, profile: RuleProfileId, gear: SimConfig['gear'], durationMs = 60000): Plan {
  const d = defaultConfig(spec)
  const plan = buildPlan({
    ...d,
    race: 'alliance-human',
    talents: '',
    gear,
    rules: { ...d.rules, profile },
    buffs: { raid: d.buffs.raid, enabled: [] },
    fight: { ...d.fight, durationVariationPct: 0 },
  }).plan
  plan.abilities = []
  plan.rotation = []
  plan.prepull = { casts: [], chargeTenths: 0, keepTenths: -1 }
  plan.procs = []
  plan.triggers = Array.from({ length: TRIGGER_COUNT }, () => [])
  plan.periodicRage = []
  plan.fight.durationMs = durationMs
  plan.damageMult = 1
  plan.physicalMult = 1
  return plan
}

describe('extra attacks (damage-and-timing §5.4)', () => {
  it('each source procs at most once from one root swing, even from another source’s extra attack', () => {
    const plan = armsPlan(20000)
    alwaysLandNoCrit(plan)
    const a = extraAttackProc(plan, 'a', 1)
    const b = extraAttackProc(plan, 'b', 2)
    const { sim, swings } = timeline(plan)
    // Every root swing lands and procs both, once each; neither extra attack procs anything.
    expect(swings[0]).toEqual([0, 0, 0, 3800, 3800, 3800, 7600, 7600, 7600, 11400, 11400, 11400, 15200, 15200, 15200, 19000, 19000, 19000])
    const roots = counter(sim, SOURCE_MAIN_HAND, FIELD.casts)
    expect(roots).toBe(6)
    expect(counter(sim, plan.procs[a].source, FIELD.casts)).toBe(roots)
    expect(counter(sim, plan.procs[b].source, FIELD.casts)).toBe(roots)
  })

  it('an instant attack is a root of its own: its extra attacks come on top of the swing’s', () => {
    const plan = armsPlan(1000)
    alwaysLandNoCrit(plan)
    extraAttackProc(plan, 'windfury', 1)
    rageAtPull(plan, 100)
    line(plan, addAbility(plan, MORTAL_STRIKE), at(plan, 50))
    // 0: the swing and its extra attack; 50: Mortal Strike's extra attack, which restarts the timer.
    expect(timeline(plan).swings[0]).toEqual([0, 0, 50])
  })

  it('an internal cooldown blocks a proc within it: Windfury’s 100 ms in `forever` (10612)', () => {
    const swingsWith = (icdMs: number) => {
      const plan = armsPlan(4000)
      alwaysLandNoCrit(plan)
      extraAttackProc(plan, 'windfury', 1, icdMs)
      rageAtPull(plan, 100)
      // Mortal Strike 50 ms after the swing that procced.
      line(plan, addAbility(plan, MORTAL_STRIKE), at(plan, 50))
      return timeline(plan).swings[0]
    }
    expect(FOREVER.values.windfuryIcdMs).toBe(100)
    expect(swingsWith(100)).toEqual([0, 0, 3800, 3800])
    expect(swingsWith(0)).toEqual([0, 0, 50, 3850, 3850])
    // At 100 ms or more after the proc, it’s ready again.
    const plan = armsPlan(4000)
    alwaysLandNoCrit(plan)
    extraAttackProc(plan, 'windfury', 1, 100)
    rageAtPull(plan, 100)
    line(plan, addAbility(plan, MORTAL_STRIKE), at(plan, 100))
    expect(timeline(plan).swings[0]).toEqual([0, 0, 100, 3900, 3900])
  })
})

describe('weapon bleeds (damage-and-timing §4 "Refresh", warrior.md §2.5)', () => {
  it('a tick due at the refresh’s very millisecond lands first, as Rend’s does', () => {
    // A 10 s main hand and a 6 s off hand (first swing at 3 s, the tick's moment): each landed
    // swing refreshes a 4-tick, 3 s bleed. The off hand's swings at 3 s and 9 s were queued before
    // the ticks due then.
    const plan = armsPlan(20000, 'warrior-fury')
    alwaysLandNoCrit(plan)
    const mh = plan.weapons[0]!
    plan.weapons = [
      { ...mh, speedSec: 10, twoHand: false },
      { ...mh, speedSec: 6, twoHand: false, handMult: 0.5 },
    ]
    addProc(plan, { id: 'deepWounds', trigger: TRIGGER.whiteLanded, chance: [1, 1], hands: 3, action: ACTION.weaponBleed, amount: 4, a: 0.2, b: 3000, chainBit: 0, source: row(plan, 'deepWounds') })
    const { ticks } = timeline(plan)
    expect(ticks).toEqual([3000, 6000, 9000, 13000, 18000])
  })
})

describe('magic procs (combat-tables §9)', () => {
  /** Every landed white swing procs a 100-damage Holy spell (no resist, nothing else to multiply). */
  function spellPlan(spellCrit: number) {
    const plan = armsPlan(60000)
    alwaysLandNoCrit(plan)
    plan.stats.spellHit = 100
    plan.stats.critRating = 0 // crit rating raises spell crit too (character-stats step 2)
    plan.stats.spellCrit = spellCrit
    const proc = addProc(plan, { id: 'holyProc', trigger: TRIGGER.whiteLanded, chance: [1, 1], hands: 1, action: ACTION.spellDamage, amount: 0, a: 100, b: 100, school: 5, chainBit: 0, source: row(plan, 'holyProc') })
    return { plan, source: plan.procs[proc].source }
  }

  it('roll 2: a landed spell crits at the sheet’s spell crit for 150%, with no suppression against +3', () => {
    const { plan, source } = spellPlan(30)
    const out = damages(plan, source, 200)
    expect(new Set(out.map((d) => Math.round(d * 1e6) / 1e6))).toEqual(new Set([100, 150]))
    const crits = out.filter((d) => d > 125).length
    expectMean(
      out.map((d) => (d > 125 ? 1 : 0)),
      0.3,
    )
    const sim = new Sim(plan)
    for (let i = 0; i < 200; i++) sim.runFight(i)
    expect(counter(sim, source, FIELD.crits)).toBe(crits)
    expect(counter(sim, source, FIELD.crits) + counter(sim, source, FIELD.hits)).toBe(counter(sim, source, FIELD.casts))
  })

  // RL5: an all-crit aura (290) raises spell crit as well as melee crit (character-stats step 4).
  it('crits at the spell crit an all-crit aura or the stance adds, and not after the aura ends', () => {
    // An aura of +100 spell crit from the first landed swing only (its internal cooldown outlasts the
    // fight), before the spell proc rolls, for 30 s.
    const { plan, source } = spellPlan(0)
    const aura = addAura(plan, { id: 'allCrit', name: 'All crit', durationMs: 30000, mods: { spellCrit: 100 } })
    plan.procs.unshift({ ...plan.procs[0], id: 'allCritProc', action: ACTION.aura, amount: aura, a: 0, b: 0, school: 0, icdMs: 120000, source: row(plan, 'allCritProc') })
    plan.triggers = Array.from({ length: TRIGGER_COUNT }, () => [])
    plan.procs.forEach((p, i) => plan.triggers[p.trigger].push(i))
    const { swings } = timeline(plan)
    const hits = damages(plan, source, 1)
    // Swings at 0, 3.8, … s: those in the first 30 s crit (150), the rest don't (100).
    expect(hits).toEqual(swings[0].map((t) => (t < 30000 ? 150 : 100)))
    // The base stance's spell crit (Berserker Stance's all-crit +3 in `forever`) the same way.
    const stanced = spellPlan(0)
    for (const s of stanced.plan.stances) s.spellCrit = s.stance === stanced.plan.stance ? 100 : 0
    expect(new Set(damages(stanced.plan, stanced.source, 3))).toEqual(new Set([150]))
  })

  it('never crits at 0% spell crit, always at 100%', () => {
    for (const [pct, damage] of [
      [0, 100],
      [100, 150],
    ]) {
      const { plan, source } = spellPlan(pct)
      expect(new Set(damages(plan, source, 5))).toEqual(new Set([damage]))
    }
  })
})

describe('damage-and-timing worked examples in the engine', () => {
  /** Main-hand damages from 300 fights of `plan`, each outcome sorted by its value. */
  function outcomes(plan: Plan, hit: number, glance: [number, number]) {
    const out = damages(plan, SOURCE_MAIN_HAND, 300)
    const near = (x: number, y: number) => Math.abs(x - y) < 1e-9 * y
    const hits = out.filter((d) => near(d, hit))
    const crits = out.filter((d) => near(d, 2 * hit))
    const glances = out.filter((d) => d >= glance[0] * hit - 1e-9 && d <= glance[1] * hit + 1e-9)
    expect(hits.length + crits.length + glances.length).toBe(out.length)
    expect(hits.length * crits.length * glances.length).toBeGreaterThan(0)
    return glances
  }

  it('WE-2: a white 2H swing (190 average, 3.60, 1500 AP, ×1.05): forever 556.816 at 471 armor, classicEra 569.697 at 336', () => {
    for (const [profile, armor, doc, glance, mean] of [
      ['forever', 471, [556.816, 1113.633], [0.65, 0.85], 417.612],
      ['classicEra', 336, [569.697, 1139.393], [0.55, 0.75], 370.303],
    ] as const) {
      const plan = barePlan('warrior-arms', profile, { mainHand: { itemId: 12784 } })
      plan.weapons[0] = { ...plan.weapons[0]!, min: 190, max: 190, speedSec: 3.6 }
      plan.fight.targetArmor = armor
      plan.physicalMult = 1.05
      plan.stats.crit = 10
      plan.stats.hit = 100
      setAttackPower(plan, 1500)
      const state = new Sim(plan).inspect()
      expect(state.physMult).toBeCloseTo(1.05, 12) // Battle Stance changes no damage
      // The engine's own hit: the doc's numbers to 3 decimals.
      const hit = (190 + (1500 / 14) * 3.6) * state.physMult * state.armorFactor[0]
      expect(hit).toBeCloseTo(doc[0], 3)
      expect(2 * hit).toBeCloseTo(doc[1], 2)
      const glances = outcomes(plan, hit, [glance[0], glance[1]])
      expectMean(glances, mean)
    }
  })

  it('WE-4: a one-handed off hand (100 average, 2.0 s, 1500 AP) deals 157.143 before talents', () => {
    const plan = barePlan('warrior-fury', 'forever', { mainHand: { itemId: 17016 }, offHand: { itemId: 18498 } })
    plan.weapons[1] = { ...plan.weapons[1]!, min: 100, max: 100, speedSec: 2.0 }
    plan.fight.targetArmor = 0
    plan.stats.crit = -100
    plan.stats.hit = 100
    setAttackPower(plan, 1500)
    expect(plan.weapons[1]!.handMult).toBe(0.5)
    const out = damages(plan, SOURCE_OFF_HAND, 20)
    const hits = out.filter((d) => Math.abs(d - 157.143) < 1e-3)
    expect(hits.length).toBeGreaterThan(out.length / 3)
    // The rest are glancing blows, 65–85% of it.
    for (const d of out) expect(Math.abs(d - 157.143) < 1e-3 || (d >= 0.65 * 157.143 - 1e-6 && d <= 0.85 * 157.143 + 1e-6)).toBe(true)
  })

  it('WE-5: 3.60 s with a 30% attack-speed buff and 50 haste rating swings every 2637 ms (2769 without rating haste)', () => {
    const swing = (profile: RuleProfileId, applyUnmeasured: boolean) => {
      const plan = barePlan('warrior-arms', profile, { mainHand: { itemId: 12784 } })
      plan.weapons[0] = { ...plan.weapons[0]!, speedSec: 3.6 }
      plan.stats.haste = 1.3
      plan.stats.hasteRating = 50
      plan.applyUnmeasured = applyUnmeasured
      return new Sim(plan).inspect().swingMs[0]
    }
    expect(swing('forever', true)).toBe(2637)
    expect(swing('forever', false)).toBe(2769)
    expect(swing('classicEra', true)).toBe(2769)
  })

  it('§1.1: armor below −K/2 counts as −2,750, which doubles physical damage', () => {
    const factor = (armor: number) => {
      const plan = barePlan('warrior-arms', 'forever', { mainHand: { itemId: 12784 } })
      plan.fight.targetArmor = armor
      return new Sim(plan).inspect().armorFactor[0]
    }
    expect(factor(-2750)).toBeCloseTo(2, 12)
    expect(factor(-4000)).toBeCloseTo(2, 12)
    expect(factor(-129)).toBeCloseTo(1.02402, 5) // WE-1
    expect(factor(-2749)).toBeLessThan(2)
  })
})

describe('encounter worked examples in the engine', () => {
  /** One fight with the fight-length draw's u fixed. */
  function fight(durationMs: number, variation: number, u: number) {
    const plan = armsPlan(durationMs)
    plan.fight.variation = variation
    plan.fight.executePct = 20
    const sim = new Sim(plan)
    ;(sim as unknown as { rngFight: { next: () => number } }).rngFight.next = () => u
    sim.runFight(0)
    return { length: sim.fightMs, executeAt: sim.executeAtMs }
  }

  it('WE-2: L = 180 s, v = 10%, u = 0.25 draws a 171.0 s fight; WE-1: its execute phase starts at 136.8 s', () => {
    expect(fight(180000, 0.1, 0.25)).toEqual({ length: 171000, executeAt: 136800 })
  })

  it('WE-1: with no variation, execute starts at 144.0 s', () => {
    expect(fight(180000, 0, 0.9)).toEqual({ length: 180000, executeAt: 144000 })
  })
})

describe('parry haste (damage-and-timing §3.4)', () => {
  it('the boss parrying the tank hastens the boss’s pending swing (WE-6)', () => {
    const bossSwings = (parryHaste: boolean) => {
      const d = defaultConfig('warrior-protection')
      const plan = buildPlan({ ...d, talents: '', gear: { mainHand: { itemId: 17016 } }, buffs: { raid: d.buffs.raid, enabled: [] }, fight: { ...d.fight, durationVariationPct: 0 } }).plan
      plan.fight.durationMs = 9000
      plan.weapons[0]!.speedSec = 2.6
      plan.fight.bossSwing = { ...plan.fight.bossSwing!, speedSec: 2.0, parryHaste }
      // Every swing of ours is parried (combat-tables §7: expertise far below 0), and the tank
      // never parries, so its own swings keep their timer.
      plan.stats.hit = 100
      plan.stats.expertise = -1000
      plan.fight.bossCanDodge = false
      plan.stats.canParry = false
      const sim = new Sim(plan)
      expect(sim.inspect().whiteThresholds[0][2]).toBe(100)
      const out: number[] = []
      sim.bossTrace = (t) => out.push(t)
      sim.runFight(0)
      return out
    }
    // Our swings at 0, 2.6, 5.2 and 7.8 s: at 2.6 s the boss has 1.4 s of its 2.0 s left (70%),
    // so 0.8 s comes off; at 7.8 s the same. At 0 and 5.2 s its swing is due now: nothing changes.
    expect(bossSwings(true)).toEqual([0, 2000, 3200, 5200, 7200, 8400])
    expect(bossSwings(false)).toEqual([0, 2000, 4000, 6000, 8000])
  })
})

describe('rage from damage taken (rage.md#rage-from-damage-taken)', () => {
  const models: DamageTakenRageModel[] = ['forever', 'foreverFlat', 'foreverHealthLost', 'classic']

  /** A Protection warrior with a shield and nothing else (only boss hits give rage), under 5,000-damage boss swings every 2.0 s. */
  function bossPlan(model: DamageTakenRageModel): Plan {
    const d = defaultConfig('warrior-protection')
    const plan = buildPlan({
      ...d,
      talents: '',
      gear: { offHand: { itemId: 12602 } },
      buffs: { raid: d.buffs.raid, enabled: [] },
      fight: { ...d.fight, durationVariationPct: 0, boss: { ...d.fight.boss, damageMin: 5000, damageMax: 5000 } },
    }).plan
    plan.rage.damageTakenModel = model
    plan.rage.maxTenths = 1e9
    return plan
  }

  /**
   * The inlined model in Sim.takeHit, from the reference `damageTakenRage` (core/formulas.ts), in
   * tenths with its fraction: `forever` carries each hit's fraction to the next (rage.md#rounding).
   */
  const tenths = (model: DamageTakenRageModel, lost: number, pre: number, health: number) => damageTakenRage(model, lost, pre, health) * 10

  describe('every model matches its closed form', () => {
    for (const model of models) {
      it(model, () => {
        const plan = bossPlan(model)
        const state = new Sim(plan).inspect()
        const [miss, dodge, parry, block, crit, crush] = state.bossThresholds
        const p = [miss, dodge - miss, parry - dodge, block - parry, crit - block, crush - crit, 100 - crush].map((x) => x / 100)
        const raw = 5000
        const mitigated = raw * (1 - armorReduction(plan.armor, 63, FOREVER)) * plan.damageTakenMult
        const health = plan.rage.maxHealth
        expect(health).toBeGreaterThan(0)
        expect(p[3]).toBeGreaterThan(0)
        // A blocked hit reads all of the hit before mitigation in `forever`, and only what it cost in the rest.
        const blocked = Math.max(0, mitigated - state.blockValue)
        const perSwing =
          p[3] * tenths(model, blocked, raw, health) +
          p[4] * tenths(model, mitigated * 2, raw * 2, health) +
          p[5] * tenths(model, mitigated * 1.5, raw * 1.5, health) +
          p[6] * tenths(model, mitigated, raw, health)
        const sim = new Sim(plan)
        const fights = 2000
        for (let i = 0; i < fights; i++) sim.runFight(i)
        const swings = 90 // every 2.0 s from 0 to < 180 s
        expect(sim.totalRageGainedTenths / fights / (swings * perSwing)).toBeCloseTo(1, 2)
      })
    }
  })

  it('R12b, R12c: a hit blocked down to nothing still gives its full rage in `forever`, and none in the health-lost models; it triggers no damage-taken procs', () => {
    for (const model of models) {
      const plan = bossPlan(model)
      // Every swing is blocked: no miss (low defense), dodge or parry, and a block chance past 100%.
      plan.stats.defense = -200
      plan.stats.dodge = -1000
      plan.stats.canParry = false
      plan.stats.block = 1000
      plan.stats.blockValue = 1e6 // and the block leaves nothing
      const procs = row(plan, 'hitProc')
      addProc(plan, { id: 'hitProc', trigger: TRIGGER.damageTaken, chance: [1, 1], hands: 3, action: ACTION.rage, amount: 1000, b: 0, source: procs })
      const sim = new Sim(plan)
      expect(sim.inspect().bossThresholds.slice(0, 4)).toEqual([0, 0, 0, 100])
      sim.runFight(0)
      const perBlock = tenths(model, 0, 5000, plan.rage.maxHealth)
      expect(perBlock > 0).toBe(model === 'forever')
      // Every 2.0 s from 0 to < 180 s; the fractions carry, so the whole tenths add up to their sum's floor.
      expect(sim.totalRageGainedTenths).toBe(Math.floor(90 * perBlock + 1e-9))
      expect(counter(sim, procs, FIELD.threat)).toBe(0)
    }
  })

  it('R12d: a boss swing you dodge, parry or that misses gives no rage in any model', () => {
    for (const model of models) {
      const plan = bossPlan(model)
      plan.stats.dodge = 1000 // every swing that doesn't miss is dodged
      const sim = new Sim(plan)
      expect(sim.inspect().bossThresholds[1]).toBe(100)
      for (let i = 0; i < 20; i++) sim.runFight(i)
      expect(sim.totalRageGainedTenths).toBe(0)
    }
  })

  it('the DPS stand-in: each hit gives rage for its full size, before any mitigation (encounter.md §4)', () => {
    const plan = barePlan('warrior-fury', 'forever', { offHand: { itemId: 12602 } }, 20000)
    plan.fight.damageTakenPerHit = 200
    plan.fight.damageTakenIntervalMs = 2000
    plan.rage.maxTenths = 1e9
    expect(plan.rage.damageTakenModel).toBe('forever')
    const health = plan.rage.maxHealth
    expect(health).toBeGreaterThan(0)
    const sim = new Sim(plan)
    sim.runFight(0)
    // Hits at 2, 4, …, 18 s: 9 of them, each 10 × 200 ÷ max health, their fractions carried.
    expect(sim.totalRageGainedTenths).toBe(Math.floor(9 * ((10 * 200) / health) * 10 + 1e-9))
  })
})

describe('fractions of a tenth (rage.md#rounding)', () => {
  /** An Arms warrior whose every white swing lands, on a 3.5 s two-hander: 4.5 × 3.5 = 15.75 rage a swing. */
  function swingPlan(profile: RuleProfileId, durationMs: number, maxTenths: number): Plan {
    const plan = barePlan('warrior-arms', profile, { mainHand: { itemId: 12784 } }, durationMs)
    plan.weapons[0]!.speedSec = 3.5
    alwaysLandNoCrit(plan)
    plan.rage.maxTenths = maxTenths
    return plan
  }

  /** The pool as each main-hand swing lands, before its own rage, over one fight; `watch` adds traces. */
  function poolAtSwings(plan: Plan, watch: (sim: Sim) => void = () => {}): { pool: number[]; sim: Sim } {
    const sim = new Sim(plan)
    const pool: number[] = []
    sim.damageTrace = (source) => {
      if (source === SOURCE_MAIN_HAND) pool.push((sim as unknown as { rage: number }).rage)
    }
    watch(sim)
    sim.runFight(0)
    return { pool, sim }
  }

  it('R27: a white hit’s fraction carries in `forever`: two 15.75-rage swings give 31.5, not 31.4', () => {
    const plan = swingPlan('forever', 7000, 1e9) // swings at 0 and 3.5 s
    // The pool as each swing lands, before its own rage: whole tenths, 15.7 after the first.
    const { pool, sim } = poolAtSwings(plan)
    expect(pool).toEqual([0, 157])
    expect(sim.totalRageGainedTenths).toBe(315)
  })

  it('R28: small hits add up in `forever`: a 5-damage hit every second gives its rage, which flooring each hit would lose', () => {
    const plan = barePlan('warrior-fury', 'forever', { offHand: { itemId: 12602 } }, 60000) // a shield: no swings
    plan.fight.damageTakenPerHit = 5
    plan.fight.damageTakenIntervalMs = 1000
    plan.rage.maxTenths = 1e9
    plan.rage.maxHealth = 990 // 10 × 5 / 990 = 0.0505 rage a hit
    const sim = new Sim(plan)
    sim.runFight(0)
    // Hits at 1, 2, …, 59 s: 29.8 tenths.
    expect(sim.totalRageGainedTenths).toBe(29)
  })

  it('R29: a gain that reaches the cap loses its fraction: at the cap each 15.75-rage swing wastes 15.7, never 15.8', () => {
    const plan = swingPlan('forever', 35000, 1000) // swings at 0, 3.5, …, 31.5 s: 10 of them
    const sim = new Sim(plan)
    sim.runFight(0)
    // 15.7, 31.5, 47.2, 63, 78.7, 94.5, then the 7th reaches 100 (10.2 of its 15.7 lost, and its 0.05).
    expect(sim.totalRageGainedTenths).toBe(1000)
    expect(sim.totalRageWastedTenths).toBe(102 + 3 * 157)
  })

  it('R30: `classicEra` still floors each gain: 59 hits taken of 1.08 tenths give 5.9 rage', () => {
    const plan = barePlan('warrior-fury', 'classicEra', { offHand: { itemId: 12602 } }, 60000)
    expect(plan.rage.damageTakenModel).toBe('classic')
    plan.fight.damageTakenPerHit = 10
    plan.fight.damageTakenIntervalMs = 1000
    plan.rage.maxTenths = 1e9
    const perHit = ((2.5 * 10) / rageConversion(60)) * 10 // 1.084 tenths
    const sim = new Sim(plan)
    sim.runFight(0)
    expect(sim.totalRageGainedTenths).toBe(59 * Math.floor(perHit))
  })

  it('R31: a stance swap’s limit drops the fraction: the swing after it gives 15.7, not 15.8', () => {
    // Swings at 0, 3.5 and 7 s. At 1 s the rotation dances to Berserker Stance for Berserker Rage
    // (no cost, no rage), keeping 10 of the 15.7 rage; the 0.05 carried from the first swing goes too.
    const plan = swingPlan('forever', 7500, 1e9)
    plan.stanceSwap = { cooldownMs: 1000, keepTenths: 100 }
    line(plan, addAbility(plan, BERSERKER_RAGE), at(plan, 1000), STANCE.berserker)
    const swaps: { time: number; before: number; after: number }[] = []
    const { pool } = poolAtSwings(plan, (sim) => (sim.stanceTrace = (_stance, time, before, after) => swaps.push({ time, before, after })))
    expect(swaps).toEqual([
      { time: 1000, before: 157, after: 100 },
      { time: 2000, before: 100, after: 100 },
    ])
    // 10 + 15.75 = 25.75, shown as 25.7. Had the fraction stayed, 10 + 15.8 = 25.8.
    expect(pool).toEqual([0, 100, 257])
  })

  it('R32: Execute spending all the rage drops the fraction: the swing after it gives 15.7, not 15.8', () => {
    // Swings at 0, 3.5 and 7 s, the execute phase from the pull. Execute at 1 s spends 15 of the
    // 15.7 rage and, landing, the rest; the 0.05 carried from the first swing goes with it.
    const plan = swingPlan('forever', 7500, 1e9)
    plan.fight.executePct = 100
    const execute = addAbility(plan, EXECUTE)
    line(plan, execute, at(plan, 1000))
    const { pool, sim } = poolAtSwings(plan)
    expect(counter(sim, plan.abilities[execute].source, FIELD.hits)).toBe(1)
    expect(pool).toEqual([0, 0, 157])
  })

  it('R33: a refund that reaches the cap sets the pool to it and drops the fraction, as a gain does', () => {
    // A refund is 80% of the cost at most, so a real one can't reach the cap: the pool was below
    // it by the cost. This test ability refunds 3 × its 1-rage cost, and a second one spends the
    // capped pool. Every attack is dodged (no white rage in Forever); the rage is from hits taken of
    // 10 × 21 ÷ 200 = 1.05 rage, at 1 s and 2 s, so each carries 0.05.
    const plan = barePlan('warrior-arms', 'forever', { mainHand: { itemId: 12784 } }, 2500)
    plan.stats.hit = 100
    plan.stats.crit = -100
    plan.stats.expertise = -1000
    plan.fight.damageTakenPerHit = 21
    plan.fight.damageTakenIntervalMs = 1000
    plan.rage.maxHealth = 200
    plan.rage.maxTenths = 30
    const refunds = addAbility(plan, { ...HAMSTRING, id: 'refunds', costTenths: 10, refundShare: 3, gcdMs: 0 })
    const spends = addAbility(plan, { ...HAMSTRING, id: 'spends', costTenths: 30, refundShare: 0, gcdMs: 0 })
    line(plan, refunds, at(plan, 1500))
    line(plan, spends, at(plan, 1500))
    const { sim, uses, rageAtUse } = timeline(plan)
    expect(new Sim(plan).inspect().specialThresholds[1]).toBe(100)
    // 1.0 at 1 s; at 1.5 s 1.0 − 1 + 3 reaches the cap of 3, then all 3 is spent.
    expect([uses[refunds], rageAtUse[refunds], uses[spends], rageAtUse[spends]]).toEqual([[1500], [10], [1500], [30]])
    // The hit at 2 s gives 1.0 (its 1.05, with nothing carried). Had the fraction stayed, 1.1.
    expect(sim.totalRageGainedTenths).toBe(10 + 10)
  })
})

describe('Classic Era white rage from dodges and parries (rage.md R4)', () => {
  it('a dodged or parried white swing gives 75% of the rage its would-be damage would have', () => {
    for (const profile of ['classicEra', 'forever'] as const) {
      const plan = barePlan('warrior-arms', profile, { mainHand: { itemId: 12784 } })
      plan.weapons[0] = { ...plan.weapons[0]!, min: 150, max: 150 }
      plan.fight.front = true // the boss dodges and parries
      plan.rage.maxTenths = 1e9
      const sim = new Sim(plan)
      const state = sim.inspect()
      const c = rageConversion(60)
      const toTenths = (damage: number) => Math.floor(((7.5 * damage) / c) * 10 + 1e-9)
      let landed = 0
      sim.damageTrace = (source, damage) => {
        if (source === SOURCE_MAIN_HAND) landed += profile === 'forever' ? Math.floor(4.5 * 3.8 * 10 + 1e-9) : toTenths(damage)
      }
      for (let i = 0; i < 50; i++) sim.runFight(i)
      const avoided = counter(sim, SOURCE_MAIN_HAND, FIELD.dodges) + counter(sim, SOURCE_MAIN_HAND, FIELD.parries)
      expect(counter(sim, SOURCE_MAIN_HAND, FIELD.parries)).toBeGreaterThan(0)
      // The would-be damage: the fixed roll plus AP, before the outcome multiplier.
      const wouldBe = (150 + (state.attackPower / 14) * 3.8) * state.physMult * state.armorFactor[0]
      const perAvoided = profile === 'classicEra' ? toTenths(0.75 * wouldBe) : 0
      expect(perAvoided > 0).toBe(profile === 'classicEra')
      expect(sim.totalRageGainedTenths).toBe(landed + avoided * perAvoided)
    }
  })
})

describe('the block’s procs come after the damage-taken rage (rage.md implementation notes, item 4)', () => {
  it('near the rage cap, the hit’s own rage fills it first, so Shield Specialization gains nothing', () => {
    const threatFromShieldSpec = (startRage: number, maxTenths: number) => {
      const d = defaultConfig('warrior-protection')
      const plan = buildPlan({
        ...d,
        gear: { offHand: { itemId: 12602 } },
        buffs: { raid: d.buffs.raid, enabled: [] },
        fight: { ...d.fight, durationVariationPct: 0, boss: { ...d.fight.boss, damageMin: 5000, damageMax: 5000 } },
      }).plan
      // Every boss swing is blocked: no miss, dodge or parry, and block past 100%.
      plan.stats.defense = -125
      plan.stats.baseAgi = 0
      plan.stats.block = 200
      plan.prepull = { casts: [], chargeTenths: startRage * 10, keepTenths: -1 }
      plan.rage.maxTenths = maxTenths
      const ss = plan.procs.find((p) => p.id === 'shieldSpecialization')!
      expect(ss.chance[0]).toBe(1) // 5/5 in Forever: every block (warrior.md §2.3, rage.md R19)
      const sim = new Sim(plan)
      expect(sim.inspect().bossThresholds[3]).toBe(100)
      sim.runFight(0)
      return counter(sim, ss.source, FIELD.threat)
    }
    // At 98/100 the first blocked hit's own rage fills the bar, then the proc's 5 is all lost.
    expect(threatFromShieldSpec(98, 1000)).toBe(0)
    // With room, every block gives its 5 rage, 25 threat (threat.md T16's rule), 90 blocks.
    expect(threatFromShieldSpec(0, 1e9)).toBe(90 * 25)
  })
})

describe('rage.md worked examples in the engine', () => {
  it('R13: Heroic Strike queued at 14 rage when its 15 is due: dequeued, and the white swing gives its normal rage', () => {
    const plan = armsPlan(1)
    alwaysLandNoCrit(plan)
    rageAtPull(plan, 24)
    const hs = addAbility(plan, HEROIC_STRIKE)
    line(plan, hs)
    line(plan, addAbility(plan, HAMSTRING)) // 24 − 10 = 14 before the swing at 0
    const { sim, swings, uses } = timeline(plan)
    expect(uses[hs]).toEqual([])
    expect(swings[0]).toEqual([0])
    expect(counter(sim, SOURCE_MAIN_HAND, FIELD.hits)).toBe(1)
    // 24 at the pull, then 4.5 × 3.8 = 17.1 from the white hit (rage.md R7).
    expect(sim.totalRageGainedTenths).toBe(240 + 171)
  })

  it('R14: a dodged Heroic Strike (cost 12) leaves rage − 12 + 9.6, and no white rage', () => {
    const plan = armsPlan(3801)
    plan.stats.hit = 100
    plan.stats.expertise = -1000 // every attack is dodged
    rageAtPull(plan, 50)
    const hs = addAbility(plan, HEROIC_STRIKE, new Map([['Improved Heroic Strike', 3]]))
    expect(plan.abilities[hs].costTenths).toBe(120)
    line(plan, hs)
    const { sim, rageAtUse } = timeline(plan)
    expect(counter(sim, plan.abilities[hs].source, FIELD.dodges)).toBe(2)
    expect(rageAtUse[hs]).toEqual([500, 476])
  })
})

describe('threat.md worked examples in the engine (energize threat)', () => {
  /** Bloodrage alone at the pull in Defensive Stance, from `startRage`: its row's threat. */
  function bloodrageThreat(startRage: number) {
    const plan = armsPlan(1, 'warrior-protection')
    expect(plan.stance).toBe(STANCE.defensive)
    plan.fight.bossSwing = null
    if (startRage > 0) rageAtPull(plan, startRage)
    const a = addAbility(plan, BLOODRAGE)
    line(plan, a)
    const { sim, uses } = timeline(plan)
    expect(uses[a]).toEqual([0])
    return { threat: counter(sim, plan.abilities[a].source, FIELD.threat), stanceThreat: plan.threatMult }
  }

  it('T15: 10 rage from Bloodrage is 50 threat, with no stance or talent multiplier (one enemy: no split)', () => {
    const { threat, stanceThreat } = bloodrageThreat(0)
    expect(stanceThreat).toBeGreaterThan(1.29)
    expect(threat).toBe(50)
  })

  it('T16: at 98/100 rage only the 2 gained count: 10 threat', () => {
    expect(bloodrageThreat(98).threat).toBe(10)
  })
})
