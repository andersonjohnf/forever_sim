// Generic engine mechanics against their owning docs, through the real code paths: extra-attack
// chains and internal cooldowns (damage-and-timing §5.4), the weapon-bleed refresh tie-break (§4),
// magic-proc crits (combat-tables §9), white and off-hand damage and haste (damage-and-timing WE-2,
// WE-4, WE-5), the negative-armor floor (§1.1), boss parry haste (§3.4), the fight-length draw and
// execute start (encounter WE-1, WE-2), rage from damage taken in every model, Classic Era's
// dodge and parry rage, the block's procs after the damage-taken rage (rage.md), R13, R14, and
// energize threat (threat.md T15, T16).
import { describe, expect, it } from 'vitest'
import { BLOODRAGE, HAMSTRING, HEROIC_STRIKE, MORTAL_STRIKE } from '../classes/warrior/abilities'
import { armorReduction, rageConversion } from '../core/formulas'
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

describe('rage from damage taken (rage.md#rage-from-damage-taken): every model matches its closed form', () => {
  const models: DamageTakenRageModel[] = ['forever', 'classic', 'foreverHp', 'foreverHpPreArmor']
  for (const model of models) {
    it(model, () => {
      const d = defaultConfig('warrior-protection')
      const plan = buildPlan({
        ...d,
        talents: '',
        gear: { offHand: { itemId: 12602 } }, // shield only: only boss hits give rage
        buffs: { raid: d.buffs.raid, enabled: [] },
        fight: { ...d.fight, durationVariationPct: 0, boss: { ...d.fight.boss, damageMin: 5000, damageMax: 5000 } },
      }).plan
      plan.rage.damageTakenModel = model
      plan.rage.maxTenths = 1e9
      const state = new Sim(plan).inspect()
      const [miss, dodge, parry, block, crit, crush] = state.bossThresholds
      const p = [miss, dodge - miss, parry - dodge, block - parry, crit - block, crush - crit, 100 - crush].map((x) => x / 100)
      const raw = 5000
      const mitigated = raw * (1 - armorReduction(plan.armor, 63, FOREVER)) * plan.damageTakenMult
      const c = rageConversion(60)
      const health = plan.rage.maxHealth
      expect(health).toBeGreaterThan(0)
      const rage = (lost: number, preArmor: number) =>
        model === 'forever' ? (1.5 * lost) / c : model === 'classic' ? (2.5 * lost) / c : model === 'foreverHp' ? (10 * lost) / health : (10 * preArmor) / health
      const tenths = (lost: number, preArmor: number) => (lost > 0 ? Math.floor(rage(lost, preArmor) * 10 + 1e-9) : 0)
      const blocked = Math.max(0, mitigated - state.blockValue)
      const perSwing =
        p[3] * tenths(blocked, (raw * blocked) / mitigated) + p[4] * tenths(mitigated * 2, raw * 2) + p[5] * tenths(mitigated * 1.5, raw * 1.5) + p[6] * tenths(mitigated, raw)
      const sim = new Sim(plan)
      const fights = 2000
      for (let i = 0; i < fights; i++) sim.runFight(i)
      const swings = 90 // every 2.0 s from 0 to < 180 s
      expect(sim.totalRageGainedTenths / fights / (swings * perSwing)).toBeCloseTo(1, 2)
    })
  }
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
