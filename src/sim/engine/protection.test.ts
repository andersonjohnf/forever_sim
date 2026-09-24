// The Protection abilities in the engine (docs/classes/warrior.md §2.8, §3.1, §3.2, §5.4, §7):
// worked examples W14 and W15; the Revenge window; Shield Block's charges; Sunder Armor's stacks
// and the armor they remove; Thunder Clap's slow on the boss's swing timer (encounter WE-5) and
// Demoralizing Shout's attack power on its damage (WE-4); the spell table; threat against its
// closed form (threat.md#warrior); and determinism.
import { describe, expect, it } from 'vitest'
import { talentRanksByName } from '../classes'
import {
  DEMORALIZING_SHOUT,
  REVENGE,
  SHIELD_BLOCK,
  SHIELD_SLAM,
  SUNDER_ARMOR,
  sunderArmor,
  THUNDER_CLAP,
} from '../classes/warrior/abilities'
import { armorReduction } from '../core/formulas'
import { PROFILES } from '../rules/profiles'
import { defaultConfig, TALENT_DATA } from '../defaults'
import { buildPlan } from '../plan/build'
import { ACTION, type Plan, TRIGGER, TRIGGER_COUNT } from '../plan/types'
import { emptyAggregate, mergeChunk, toResult } from '../run/aggregate'
import type { SimConfig } from '../types'
import { CHUNK_SIZE, runChunk } from './chunk'
import { BOSS_OUTCOME, FIELD, FIELD_COUNT, Sim } from './sim'
import { addAbility, addProc, at, counter, damages, expectMean, from, line, rageAtPull, rotationOff } from './test-helpers'

/** The default Protection build's talents by name (8/5/38, warrior.md §6.1). */
const TALENTS = talentRanksByName(TALENT_DATA.warrior, defaultConfig('warrior-protection').talents)
/** Defensive, the duties first (D28): the default before Balanced. */
const DEFENSIVE: SimConfig['rotation'] = { 'warrior.protection.priority': 'duties' }

/**
 * The default Protection warrior (Defensive Stance, Krol Blade and Dreadguard's Protector) with no
 * rotation, buffs, procs or periodic rage, against 5,000-damage swings every 2.0 s that the boss's
 * parries never hasten, in a fight of exactly `durationMs`: each test adds its own abilities and lines.
 */
function protPlan(durationMs = 60000, patch: Partial<SimConfig> = {}): Plan {
  const d = defaultConfig('warrior-protection')
  const plan = buildPlan({
    ...d,
    rotation: rotationOff('warrior-protection'),
    buffs: { raid: d.buffs.raid, enabled: [] },
    fight: { ...d.fight, durationVariationPct: 0, boss: { ...d.fight.boss, damageMin: 5000, damageMax: 5000 } },
    ...patch,
  }).plan
  plan.abilities = []
  plan.rotation = []
  plan.prepull = { casts: [], chargeTenths: 0, keepTenths: -1 }
  plan.procs = []
  plan.triggers = Array.from({ length: TRIGGER_COUNT }, () => [])
  plan.periodicRage = []
  plan.fight.durationMs = durationMs
  plan.fight.bossCanParry = false
  return plan
}

/** The boss's table as [miss, dodge, parry, block, crit, crush] widths, from the engine's thresholds. */
function bossWidths(plan: Plan): number[] {
  const t = new Sim(plan).inspect().bossThresholds
  return t.map((x, i) => x - (i > 0 ? t[i - 1] : 0))
}

/** No miss, dodge or parry on the boss's swings, and `block`% blocks (combat-tables §8's table, set through the stats). */
function onlyBlocks(plan: Plan, block: number): void {
  plan.stats.defense = -125 // miss 0
  plan.stats.dodge = -1000
  plan.stats.parry = -1000
  plan.stats.block = 50
  plan.stats.block += block - bossWidths(plan)[3]
  const w = bossWidths(plan)
  expect(w.slice(0, 3)).toEqual([0, 0, 0])
  expect(w[3]).toBeCloseTo(block, 9)
}

/** The Revenge window's openers, as the rotation adds them: a dodge or parry, and a block, of the boss's swings (§2.8). */
function opensRevenge(plan: Plan, revenge: number): void {
  const aura = plan.abilities[revenge].window
  for (const trigger of [TRIGGER.dodgeParry, TRIGGER.block]) addProc(plan, { trigger, chance: [1, 1], hands: 0, action: ACTION.aura, amount: aura, b: 0 })
}

/** Every one of our attacks lands (special table: 100% hit, no dodge or parry), and never crits. */
function alwaysLandsNoCrit(plan: Plan): void {
  plan.stats.hit = 100
  plan.stats.spellHit = 100
  plan.stats.crit = -100
  plan.fight.bossCanDodge = false
  plan.fight.bossCanParry = false
  plan.fight.bossCanBlock = false
}

function runFights(plan: Plan, fights: number, sim = new Sim(plan)) {
  let agg = emptyAggregate(plan.sources.length, plan.auras.length)
  for (let k = 0; k * CHUNK_SIZE < fights; k++) agg = mergeChunk(agg, runChunk(plan, k, Math.min(CHUNK_SIZE, fights - k * CHUNK_SIZE), sim))
  return agg
}

describe('Protection worked examples in the engine (warrior.md W14, W15)', () => {
  it('W14: Revenge with Improved Revenge 3/3, Bastion 5/5 and Defensive Stance averages 242.35, from 218.59 to 266.11', () => {
    const plan = protPlan()
    plan.fight.targetArmor = 0
    const rev = addAbility(plan, REVENGE, TALENTS)
    line(plan, rev)
    opensRevenge(plan, rev)
    onlyBlocks(plan, 100)
    alwaysLandsNoCrit(plan)
    rageAtPull(plan, 100)
    // 1.6 × 1.10 × 0.90 = 1.584 (the plan's Bastion and Defensive Stance).
    expect(plan.physicalMult * plan.damageMult).toBeCloseTo(0.99, 12)
    const hits = damages(plan, plan.abilities[rev].source, 40)
    expect(hits.length).toBeGreaterThan(400)
    expect(Math.min(...hits)).toBeGreaterThanOrEqual(138 * 1.584 - 1e-9)
    expect(Math.max(...hits)).toBeLessThanOrEqual(168 * 1.584 + 1e-9)
    expectMean(hits, 153 * 1.584) // 242.35
  })

  it('W15: Shield Slam with block value 150 is (655 + 150) × 0.99 = 796.95, from 782.10 to 811.80; a crit ×2', () => {
    const plan = protPlan()
    plan.fight.targetArmor = 0
    const slam = addAbility(plan, SHIELD_SLAM, TALENTS)
    line(plan, slam)
    alwaysLandsNoCrit(plan)
    rageAtPull(plan, 100)
    plan.stats.blockValue += 150 - new Sim(plan).inspect().blockValue
    expect(new Sim(plan).inspect().blockValue).toBe(150)
    const hits = damages(plan, plan.abilities[slam].source, 40)
    expect(Math.min(...hits)).toBeGreaterThanOrEqual(782.1 - 1e-9)
    expect(Math.max(...hits)).toBeLessThanOrEqual(811.8 + 1e-9)
    expectMean(hits, 796.95)
    plan.stats.crit = 300
    expectMean(damages(plan, plan.abilities[slam].source, 40), 2 * 796.95)
  })

  it('Shield Slam and Shield Block need a shield; without one they’re never used', () => {
    const plan = protPlan(30000, { gear: { mainHand: { itemId: 15806 } } })
    expect(plan.hasShield).toBe(false)
    const slam = addAbility(plan, SHIELD_SLAM, TALENTS)
    const block = addAbility(plan, SHIELD_BLOCK, TALENTS)
    line(plan, slam)
    line(plan, block)
    rageAtPull(plan, 100)
    const sim = new Sim(plan)
    runFights(plan, 20, sim)
    expect(counter(sim, plan.abilities[slam].source, FIELD.casts)).toBe(0)
    expect(counter(sim, plan.abilities[block].source, FIELD.casts)).toBe(0)
  })

  it('without a main-hand weapon, uses Shield Slam, Shield Block, Thunder Clap and Demoralizing Shout, which need none, and nothing that does (§7, PL7)', () => {
    // Defensive, which uses all four (Balanced, the default, drops the two spells, D28).
    const d = { ...defaultConfig('warrior-protection'), rotation: DEFENSIVE }
    const run = (gear: SimConfig['gear'], patch: Partial<SimConfig> = {}) => {
      const { plan, assumptions } = buildPlan({ ...d, gear, run: { ...d.run, seed: 7 }, ...patch })
      const sim = new Sim(plan)
      runFights(plan, 50, sim)
      const row = (id: string) => plan.abilities.find((a) => a.id === id)!.source
      const casts = (id: string) => counter(sim, row(id), FIELD.casts)
      return { plan, sim, assumptions, row, casts }
    }
    const shield = run({ ...d.gear, mainHand: undefined })
    expect(shield.plan.hasShield).toBe(true)
    for (const id of ['shieldSlam', 'shieldBlock', 'thunderClap', 'demoralizingShout']) expect(shield.casts(id), id).toBeGreaterThan(0)
    for (const id of ['sunderArmor', 'revenge', 'heroicStrike']) expect(shield.casts(id), id).toBe(0)
    // Shield Slam rolls the main hand's special table at the base skill: it lands, crits and deals its damage.
    const slam = shield.row('shieldSlam')
    expect(counter(shield.sim, slam, FIELD.hits)).toBeGreaterThan(0)
    expect(counter(shield.sim, slam, FIELD.crits)).toBeGreaterThan(0)
    // Its damage per landed hit is the armed warrior's, (655 + block value) × the modifiers × armor,
    // compared with no Sunder Armor on the boss, since there's none without a weapon.
    const armed = run(d.gear, {
      rotation: { ...DEFENSIVE, 'warrior.protection.sunder.enabled': false, 'warrior.protection.sunderFiller.enabled': false },
      buffs: { ...d.buffs, enabled: d.buffs.enabled.filter((b) => b !== 'sunderArmor') },
    })
    const perHit = (r: typeof armed) => {
      const s = r.row('shieldSlam')
      return counter(r.sim, s, FIELD.damage) / (counter(r.sim, s, FIELD.hits) + 2 * counter(r.sim, s, FIELD.crits))
    }
    expect(perHit(shield) / perHit(armed)).toBeGreaterThan(0.98)
    expect(perHit(shield) / perHit(armed)).toBeLessThan(1.02)
    expect(counter(shield.sim, shield.row('thunderClap'), FIELD.damage)).toBeGreaterThan(0)
    // The notes agree (PV7): the first names nothing, and only Shield Slam rolls the special-attack table.
    const text = (r: typeof shield, id: string) => r.assumptions.find((a) => a.id === id)?.text
    expect(text(shield, 'noWeapon')).toBeUndefined()
    expect(text(shield, 'noWeaponSomeUsed')).toBe('No main-hand weapon: unarmed attacks aren’t simulated, and neither is any ability that needs one.')
    expect(text(shield, 'weaponlessAttacks')).toBe(
      'Still used, since they need no weapon: Thunder Clap, Demoralizing Shout and Shield Slam. Shield Slam rolls on a special-attack table at your level’s base weapon skill.',
    )
    // With neither a weapon nor a shield: Thunder Clap and Demoralizing Shout only.
    const bare = run({ ...d.gear, mainHand: undefined, offHand: undefined })
    for (const id of ['thunderClap', 'demoralizingShout']) expect(bare.casts(id), id).toBeGreaterThan(0)
    for (const id of ['shieldSlam', 'shieldBlock', 'sunderArmor', 'revenge', 'heroicStrike']) expect(bare.casts(id), id).toBe(0)
    // Without a shield, nothing that needs one is named, and nothing rolls the special-attack table.
    expect(text(bare, 'weaponlessAttacks')).toBe('Still used, since they need no weapon: Thunder Clap and Demoralizing Shout.')
    // With neither, the first note says only cooldowns and buffs are used (a Fury warrior).
    const fury = buildPlan({ ...defaultConfig('warrior-fury'), gear: { ...defaultConfig('warrior-fury').gear, mainHand: undefined } }).assumptions
    expect(fury.find((a) => a.id === 'noWeapon')?.text).toBe('No main-hand weapon: unarmed attacks aren’t simulated, and neither is any ability that needs one; only cooldowns and buffs are used.')
    expect(fury.some((a) => a.id === 'noWeaponSomeUsed' || a.id === 'weaponlessAttacks')).toBe(false)
  })
})

describe('the Revenge window (warrior.md §2.8, §7)', () => {
  function revengePlan(block: number) {
    const plan = protPlan(30000)
    const rev = addAbility(plan, REVENGE, TALENTS)
    opensRevenge(plan, rev)
    onlyBlocks(plan, block)
    rageAtPull(plan, 100)
    return { plan, rev }
  }
  const uses = (plan: Plan, rev: number) => {
    const out: number[] = []
    const sim = new Sim(plan)
    sim.castTrace = (a, t) => a === rev && out.push(t)
    sim.runFight(0)
    return out
  }

  it('opens on a block and closes when Revenge is used: every block, one Revenge per 5 s cooldown', () => {
    const { plan, rev } = revengePlan(100)
    line(plan, rev)
    // A block at 0, 2, 4, …: Revenge at 0, then when its 5 s cooldown ends, a block having reopened it.
    expect(uses(plan, rev)).toEqual([0, 5000, 10000, 15000, 20000, 25000])
  })

  it('never opens without a block, dodge or parry', () => {
    const { plan, rev } = revengePlan(0)
    line(plan, rev)
    expect(uses(plan, rev)).toEqual([])
  })

  it('lasts 5 s from the block', () => {
    // One block at 0 (a 60 s swing timer), and Revenge allowed only from t.
    const at_ = (t: number) => {
      const { plan, rev } = revengePlan(100)
      plan.fight.bossSwing!.speedSec = 60
      line(plan, rev, [from(plan, t)])
      return uses(plan, rev)
    }
    expect(at_(4999)).toEqual([4999])
    expect(at_(5001)).toEqual([])
  })

  it('a dodge or a parry opens it too', () => {
    const { plan, rev } = revengePlan(0)
    line(plan, rev)
    plan.stats.dodge = 1000 // every swing dodged
    expect(bossWidths(plan)[1]).toBe(100)
    expect(uses(plan, rev)).toEqual([0, 5000, 10000, 15000, 20000, 25000])
  })
})

describe('Shield Block (warrior.md §3.2)', () => {
  // 25% block, so +75% makes every swing a block while it lasts.
  function blockPlan(swingSec: number) {
    const plan = protPlan(30000)
    plan.fight.bossSwing!.speedSec = swingSec
    onlyBlocks(plan, 25)
    const sb = addAbility(plan, SHIELD_BLOCK, TALENTS)
    line(plan, sb, at(plan, 0))
    rageAtPull(plan, 50)
    return plan
  }
  /** The share of fights in which the boss's swing number k is blocked. */
  function blockedShare(plan: Plan, k: number, fights: number): number {
    const sim = new Sim(plan)
    let blocked = 0
    let n = 0
    sim.swingTakenTrace = (o) => {
      if (n++ === k && o === BOSS_OUTCOME.block) blocked++
    }
    for (let i = 0; i < fights; i++) {
      n = 0
      sim.runFight(i)
    }
    return blocked / fights
  }

  it('costs 10 rage and adds +75% block, off the GCD, from Defensive Stance', () => {
    const plan = blockPlan(2)
    const sb = plan.abilities.findIndex((a) => a.id === 'shieldBlock')
    expect(plan.abilities[sb].costTenths).toBe(100)
    expect(plan.abilities[sb].gcdMs).toBe(0)
    expect(plan.auras[plan.abilities[sb].aura]).toMatchObject({ durationMs: 7000, block: 75, blockCharges: 2 })
  })

  it('ends after 2 blocks: the first two swings are blocked, the third only at the base 25%', () => {
    const plan = blockPlan(2)
    expect(blockedShare(plan, 0, 200)).toBe(1)
    expect(blockedShare(plan, 1, 200)).toBe(1)
    expect(Math.abs(blockedShare(plan, 2, 4000) - 0.25)).toBeLessThan(0.03)
  })

  it('ends after 7 s: a swing 8 s later is blocked only at the base 25%', () => {
    const plan = blockPlan(8)
    expect(blockedShare(plan, 0, 200)).toBe(1)
    expect(Math.abs(blockedShare(plan, 1, 4000) - 0.25)).toBeLessThan(0.03)
  })
})

describe('Sunder Armor on the boss (warrior.md §3.2, §7)', () => {
  /** White swing damage at each swing time, with a fixed weapon roll and no crits or glances. */
  function whiteHits(plan: Plan): [number, number][] {
    const sim = new Sim(plan)
    const times: number[] = []
    const out: [number, number][] = []
    sim.trace = (s, hand, t) => s === 0 && hand === 0 && times.push(t)
    sim.damageTrace = (s, dmg) => s === 0 && out.push([times[times.length - 1], dmg])
    sim.runFight(0)
    return out
  }
  function sunderPlan() {
    const plan = protPlan(60000)
    alwaysLandsNoCrit(plan)
    plan.weapons[0] = { ...plan.weapons[0]!, min: 70, max: 70, glanceLow: 1, glanceHigh: 1 }
    plan.stats.hit = 1000 // no glancing either: the white table is all hits
    const sunder = addAbility(plan, SUNDER_ARMOR, TALENTS)
    rageAtPull(plan, 100)
    return { plan, sunder }
  }
  const factor = (plan: Plan, stacks: number) => 1 - armorReduction(plan.fight.targetArmor - 450 * stacks, 60, plan.profile)

  it('stacks to 5, each landed application removing 450 armor from the next hit on', () => {
    const { plan, sunder } = sunderPlan()
    line(plan, sunder)
    const hits = whiteHits(plan)
    const base = hits[0][1] / factor(plan, 1) // the swing at 0 comes after the first Sunder at 0
    // Sunders at 0, 1.5, 3, 4.5 and 6 s: the swing at t has floor(t / 1.5) + 1 stacks, up to 5.
    for (const [t, dmg] of hits.slice(0, 8)) expect(dmg, `swing at ${t}`).toBeCloseTo(base * factor(plan, Math.min(5, Math.floor(t / 1500) + 1)), 6)
    expect(plan.auras[plan.abilities[sunder].aura]).toMatchObject({ durationMs: 30000, maxStacks: 5, targetArmor: 450 })
  })

  it('lasts 30 s; its threat is (206 + 5% of attack power) × the stance’s multiplier per landed Sunder, and it never crits', () => {
    const { plan, sunder } = sunderPlan()
    line(plan, sunder, at(plan, 0))
    const hits = whiteHits(plan)
    const before = hits.filter(([t]) => t < 30000)
    const after = hits.filter(([t]) => t >= 30000)
    const base = before[0][1] / factor(plan, 1)
    for (const [, dmg] of before) expect(dmg).toBeCloseTo(base * factor(plan, 1), 6)
    for (const [, dmg] of after) expect(dmg).toBeCloseTo(base * factor(plan, 0), 6)
    plan.stats.crit = 300
    const sim = new Sim(plan)
    const ap = sim.inspect().attackPower
    expect(ap).toBeGreaterThan(500)
    sim.runFight(0)
    const row = plan.abilities[sunder].source
    expect(counter(sim, row, FIELD.hits)).toBe(1)
    expect(counter(sim, row, FIELD.crits)).toBe(0)
    expect(counter(sim, row, FIELD.damage)).toBe(0)
    expect(counter(sim, row, FIELD.threat)).toBeCloseTo((206 + 0.05 * ap) * plan.threatMult, 9)
  })

  it('its attack power share reads the attack power when it lands: more attack power, more threat', () => {
    const { plan, sunder } = sunderPlan()
    line(plan, sunder, at(plan, 0))
    const threatAt = (bonusAp: number) => {
      const p = structuredClone(plan)
      p.stats.ap += bonusAp
      const sim = new Sim(p)
      sim.runFight(0)
      return counter(sim, p.abilities[sunder].source, FIELD.threat)
    }
    expect(threatAt(200) - threatAt(0)).toBeCloseTo(0.05 * 200 * plan.threatMult, 9)
  })

  it('threat.md T1 and T2: 206 + 5% of attack power per landed Sunder in `forever` (412.62 at 1,400), 261 in `classicEra` (390.195)', () => {
    expect([sunderArmor(PROFILES.forever).threatBonus, sunderArmor(PROFILES.forever).threatApCoefficient]).toEqual([206, 0.05])
    expect([sunderArmor(PROFILES.classicEra).threatBonus, sunderArmor(PROFILES.classicEra).threatApCoefficient]).toEqual([261, 0])
    // The same Protection warrior (Defensive Stance, Defiance 3/3 with a shield) under each profile,
    // at the worked examples' ×1.495 and 1,400 attack power: the default's gloves enchant (×1.02) left out.
    for (const [profile, bonus, expected] of [
      ['forever', 206, 412.62],
      ['classicEra', 261, 390.195],
    ] as const) {
      const d = defaultConfig('warrior-protection')
      const plan = protPlan(60000, { rules: { ...d.rules, profile } })
      alwaysLandsNoCrit(plan)
      expect(plan.threatMult).toBeCloseTo(1.3 * 1.15 * 1.02, 12)
      plan.threatMult = 1.3 * 1.15
      const sunder = addAbility(plan, sunderArmor(PROFILES[profile]), TALENTS)
      expect(plan.abilities[sunder].threatBonus).toBe(bonus)
      rageAtPull(plan, 100)
      line(plan, sunder, at(plan, 0))
      // Attack power 1,400 when it lands (the plan's own plus what it takes).
      plan.stats.ap += 1400 - new Sim(plan).inspect().attackPower
      const sim = new Sim(plan)
      expect(sim.inspect().attackPower).toBeCloseTo(1400, 9)
      sim.runFight(0)
      const row = plan.abilities[sunder].source
      expect(counter(sim, row, FIELD.hits)).toBe(1)
      expect(counter(sim, row, FIELD.threat), profile).toBeCloseTo(expected, 9)
    }
  })

  it('a Sunder that misses adds no stack and makes no threat', () => {
    const { plan, sunder } = sunderPlan()
    line(plan, sunder, at(plan, 0))
    plan.stats.hit = -1000 // every special misses
    const sim = new Sim(plan)
    sim.runFight(0)
    expect(counter(sim, plan.abilities[sunder].source, FIELD.misses)).toBe(1)
    expect(sim.auraUpMs[plan.abilities[sunder].aura]).toBe(0)
    expect(counter(sim, plan.abilities[sunder].source, FIELD.threat)).toBe(0)
  })
})

describe('Thunder Clap and Demoralizing Shout on the boss (encounter WE-4, WE-5; warrior.md §7)', () => {
  function debuffPlan(def: typeof THUNDER_CLAP, when: 'pull' | 'cooldown' = 'pull') {
    const plan = protPlan(60000)
    alwaysLandsNoCrit(plan)
    const a = addAbility(plan, def, TALENTS)
    line(plan, a, when === 'pull' ? at(plan, 0) : [])
    rageAtPull(plan, 100)
    return { plan, a }
  }
  const bossSwings = (plan: Plan) => {
    const out: number[] = []
    const sim = new Sim(plan)
    sim.bossTrace = (t) => out.push(t)
    sim.runFight(0)
    return out
  }

  it('WE-5: Thunder Clap’s 20% slow makes the boss swing every 2.4 s, from its next swing, until it runs out', () => {
    const { plan } = debuffPlan(THUNDER_CLAP)
    const swings = bossSwings(plan)
    // Thunder Clap at 0, before the boss's first swing; it lasts 30 s. The swing at 28.8 s was
    // scheduled with the slow up, so 31.2 s; then 2.0 s again.
    const expected = [...Array.from({ length: 14 }, (_, k) => 2400 * k), 33200, 35200]
    expect(swings.slice(0, 16)).toEqual(expected)
  })

  it('the stronger of the Buffs tab’s slow and the rotation’s counts', () => {
    const { plan } = debuffPlan(THUNDER_CLAP)
    // The Buffs tab's Classic Era Thunder Clap, 10%: the rotation's 20% counts while it's up.
    plan.fight.bossSwing = { ...plan.fight.bossSwing!, slow: 0.1, speedSec: 2.2 }
    expect(bossSwings(plan).slice(0, 3)).toEqual([0, 2400, 4800])
    // A 30% slow from the Buffs tab beats the rotation's 20%.
    plan.fight.bossSwing = { ...plan.fight.bossSwing!, slow: 0.3, speedSec: 2.6 }
    expect(bossSwings(plan).slice(0, 3)).toEqual([0, 2600, 5200])
  })

  it('WE-4: Demoralizing Shout takes 204 × 2.0 / 14 = 29.14 off each swing before mitigation, for 45 s', () => {
    const { plan } = debuffPlan(DEMORALIZING_SHOUT)
    const pre: [number, number][] = []
    const sim = new Sim(plan)
    let now = 0
    sim.bossTrace = (t) => (now = t)
    sim.swingTakenTrace = (o, _lost, p) => o === BOSS_OUTCOME.hit && pre.push([now, p])
    sim.runFight(0)
    for (const [t, p] of pre) expect(p, `swing at ${t}`).toBeCloseTo(t < 45000 ? 5000 - (204 * 2) / 14 : 5000, 9)
    expect(pre.some(([t]) => t >= 45000)).toBe(true)
  })

  it('both roll the spell table: 17% misses against a level-63 boss before spell hit, never a dodge, parry or block; a miss refunds 80%', () => {
    const { plan, a } = debuffPlan(THUNDER_CLAP, 'cooldown')
    plan.stats.spellHit = 0
    plan.stats.hitRating = 0 // the gear's hit rating is spell hit too
    plan.fight.bossCanDodge = true
    plan.fight.bossCanParry = true
    plan.fight.bossCanBlock = true
    // No rage but the pull's: one white swing at 0, and boss swings of 0 damage.
    plan.weapons[0] = { ...plan.weapons[0]!, speedSec: 1000 }
    plan.fight.bossSwing = { ...plan.fight.bossSwing!, minDamage: 0, maxDamage: 0 }
    plan.rage.maxTenths = 100000
    rageAtPull(plan, 10000)
    const sim = new Sim(plan)
    const rage: number[] = []
    sim.castTrace = (x, _t, r) => x === a && rage.push(r)
    const cost = plan.abilities[a].costTenths
    expect(cost).toBe(170) // 20 − 3 (Focused Rage 3/3)
    let refunds = 0
    for (let i = 0; i < 200; i++) {
      rage.length = 0
      sim.runFight(i)
      // From the second cast on, each costs 17, or 17 − 13.6 after a miss (80% refunded, floored to a tenth).
      for (let k = 2; k < rage.length; k++) {
        const spent = rage[k - 1] - rage[k]
        expect([cost, cost - Math.floor(0.8 * cost)]).toContain(spent)
        if (spent !== cost) refunds++
      }
    }
    const row = plan.abilities[a].source
    const casts = counter(sim, row, FIELD.casts)
    const misses = counter(sim, row, FIELD.misses)
    expect(casts).toBeGreaterThan(1500)
    expect(refunds).toBeGreaterThan(0)
    const p = misses / casts
    expect(Math.abs(p - 0.17)).toBeLessThan(4 * Math.sqrt((0.17 * 0.83) / casts))
    for (const f of [FIELD.dodges, FIELD.parries, FIELD.blocks]) expect(counter(sim, row, f)).toBe(0)
    // Its threat is 2.5 × its damage (threat.md#warrior).
    expect(counter(sim, row, FIELD.threat)).toBeCloseTo(2.5 * counter(sim, row, FIELD.damage) * plan.threatMult, 6)
  })
})

describe('the Defensive Protection warrior (warrior.md §5.4)', () => {
  const bundle = buildPlan({ ...defaultConfig('warrior-protection'), rotation: DEFENSIVE, run: { mode: 'fixed', iterations: 1000, seed: 21 } })
  const plan = bundle.plan
  const sim = new Sim(plan)
  const agg = runFights(plan, 1000, sim)

  it('makes each ability’s threat by its closed form: (damage × multiplier + bonus × landed) × the stance’s multiplier', () => {
    // Defensive Stance 1.3 × Defiance 3/3 1.15 × the gloves' Threat enchant 1.02 (threat.md T20), all fight.
    expect(plan.threatMult).toBeCloseTo(1.3 * 1.15 * 1.02, 12)
    const rows = {
      shieldSlam: [1, 475],
      revenge: [2.25, 270],
      thunderClap: [2.5, 0],
      demoralizingShout: [0, 43.2],
      heroicStrike: [1, 173],
    } as const
    const landedOf = (row: number) => counter(sim, row, FIELD.hits) + counter(sim, row, FIELD.crits) + counter(sim, row, FIELD.blocks)
    for (const [id, [mult, bonus]] of Object.entries(rows)) {
      const row = plan.abilities.find((a) => a.id === id)!.source
      const landed = landedOf(row)
      expect(landed, id).toBeGreaterThan(0)
      const expected = (mult * counter(sim, row, FIELD.damage) + bonus * landed) * plan.threatMult
      expect(counter(sim, row, FIELD.threat) / expected, id).toBeCloseTo(1, 9)
    }
    // Sunder Armor: 206 + 5% of the attack power as it lands, so what's left after the 206s is 5% of
    // the attack power it landed at on average: the fight start's, or more under Battle Shout and the potion.
    const sunder = plan.abilities.find((a) => a.id === 'sunderArmor')!.source
    const landed = landedOf(sunder)
    const apAtLanding = (counter(sim, sunder, FIELD.threat) / plan.threatMult - 206 * landed) / (0.05 * landed)
    const startAp = new Sim(plan).inspect().attackPower
    expect(apAtLanding).toBeGreaterThanOrEqual(startAp)
    expect(apAtLanding).toBeLessThan(startAp + 400)
    // White swings: damage × 1 (and Windfury's and Hand of Justice's extra attacks).
    expect(counter(sim, 0, FIELD.threat) / (counter(sim, 0, FIELD.damage) * plan.threatMult)).toBeCloseTo(1, 9)
  })

  it('keeps Sunder Armor, Thunder Clap and Demoralizing Shout on the boss most of the fight', () => {
    const result = toResult(bundle, agg, 0)
    // The debuffs on the boss are auras of the plan, so the results list them with their uptimes.
    const uptime = (id: string) => result.cooldowns.find((a) => a.id === id)!.uptimePct!
    // Sunder Armor from its first landed application; the other two come after it and Shield Slam and
    // Revenge, and miss 14% of the time (spell hit 3%).
    expect(uptime('sunderArmor')).toBeGreaterThan(95)
    expect(uptime('thunderClap')).toBeGreaterThan(75)
    expect(uptime('demoralizingShout')).toBeGreaterThan(75)
    // Each shows the casts per fight of the attack that puts it there (PU6): Sunder Armor's filler
    // and upkeep together, one row.
    const row = (id: string) => plan.abilities.find((a) => a.id === id)!.source
    for (const id of ['sunderArmor', 'thunderClap', 'demoralizingShout']) {
      expect(result.cooldowns.find((a) => a.id === id)!.castsPerFight, id).toBeCloseTo(agg.counters[row(id) * FIELD_COUNT + FIELD.casts] / 1000, 9)
    }
    expect(result.cooldowns.find((a) => a.id === 'sunderArmor')!.castsPerFight).toBeGreaterThan(40)
    // A buff nothing casts has none.
    expect(result.cooldowns.find((a) => a.id === 'revengeWindow')!.castsPerFight).toBeNull()
  })

  it('blocks about 66% of the boss’s swings with Shield Block on cooldown, pushing crushing blows and crits off its table (§5.4 notes, PL10)', () => {
    const outcomes = toResult(bundle, agg, 0).tank!.outcomes
    // Shield Block's +75% for two blocks: the sheet's 11% block becomes about 66% of the swings,
    // and crushing blows (15% of the table without it) and crits fall to about 1.2% and 0.3%.
    expect(outcomes.block).toBeGreaterThan(60)
    expect(outcomes.block).toBeLessThan(70)
    expect(outcomes.crush).toBeLessThan(2.5)
    expect(outcomes.crit).toBeLessThan(1)
    // Without it, the table's own shares: about 11% blocked, 15% crushing blows, 3.7% crits.
    const d = defaultConfig('warrior-protection')
    const off = buildPlan({ ...d, rotation: { ...DEFENSIVE, 'warrior.protection.shieldBlock.enabled': false }, run: { mode: 'fixed', iterations: 1000, seed: 21 } })
    const without = toResult(off, runFights(off.plan, 1000), 0).tank!.outcomes
    expect(without.block).toBeGreaterThan(9)
    expect(without.block).toBeLessThan(13)
    expect(without.crush).toBeGreaterThan(13)
    expect(without.crush).toBeLessThan(17)
    expect(without.crit).toBeGreaterThan(2.5)
    // Shield Block moves swings from crushing blows, crits and hits to blocks; the avoidance is the same.
    for (const k of ['miss', 'dodge', 'parry'] as const) expect(Math.abs(outcomes[k] - without[k]), k).toBeLessThan(1)
  })

  it('is deterministic: the same config and seed give the same result', () => {
    const a = runFights(buildPlan({ ...defaultConfig('warrior-protection'), run: { mode: 'fixed', iterations: 300, seed: 5 } }).plan, 300)
    const b = runFights(buildPlan({ ...defaultConfig('warrior-protection'), run: { mode: 'fixed', iterations: 300, seed: 5 } }).plan, 300)
    expect(b).toEqual(a)
  })
})

describe('Max TPS in the engine (warrior.md §5.4 "Max TPS", D26)', () => {
  const MAX: SimConfig['rotation'] = { 'warrior.protection.priority': 'maxTps' }
  const config = (rotation: SimConfig['rotation']): SimConfig => ({ ...defaultConfig('warrior-protection'), rotation, run: { mode: 'fixed', iterations: 2000, seed: 33 } })

  it('leaves the Buffs tab’s Thunder Clap and Demoralizing Shout off, as the tank’s own, until you turn them on there for another player (D26)', () => {
    const duties = buildPlan(config(DEFENSIVE)).plan
    const max = buildPlan(config(MAX)).plan
    // Nobody else's in the Standard raid preset: the boss starts unslowed, at full attack power.
    for (const plan of [duties, max]) expect([plan.fight.bossSwing!.slow, plan.fight.bossSwing!.minDamage]).toEqual([0, 4500])
    // Turned on in Buffs, another warrior's count with Max TPS: its Thunder Clap slows the boss 20%,
    // and its Demoralizing Shout takes 204 × 2.0 / 14 off each swing, from the pull (WE-4, WE-5).
    // Under Defensive your own replace them, so they change nothing.
    const others = (rotation: SimConfig['rotation']) => {
      const c = config(rotation)
      return buildPlan({ ...c, buffs: { ...c.buffs, enabled: [...c.buffs.enabled, 'thunderClap', 'demoralizingShout'] } }).plan
    }
    expect(others(MAX).fight.bossSwing!.slow).toBeCloseTo(0.2, 12)
    expect(others(MAX).fight.bossSwing!.minDamage).toBeCloseTo(4500 - (204 * 2) / 14, 9)
    expect([others(DEFENSIVE).fight.bossSwing!.slow, others(DEFENSIVE).fight.bossSwing!.minDamage]).toEqual([0, 4500])
    // Its rows: no Thunder Clap or Demoralizing Shout; Shield Block and Shield Slam stay (D26: each
    // makes more threat than it costs).
    const used = new Set(max.rotation.map((e) => max.abilities[e.ability].id))
    for (const id of ['thunderClap', 'demoralizingShout']) expect(used.has(id), id).toBe(false)
    for (const id of ['shieldBlock', 'shieldSlam']) expect(used.has(id), id).toBe(true)
  })

  it('makes more threat and more damage than Defensive, on the same fights', () => {
    const duties = runFights(buildPlan(config(DEFENSIVE)).plan, 2000)
    const max = runFights(buildPlan(config(MAX)).plan, 2000)
    // §5.4 "Max TPS": about +8.3% TPS and +6.9% DPS in the default setup, with nobody's Thunder Clap or
    // Demoralizing Shout on the boss: the faster, harder boss gives more rage, and Shield Slam stays.
    expect(max.tps.mean / duties.tps.mean).toBeGreaterThan(1.065)
    expect(max.tps.mean / duties.tps.mean).toBeLessThan(1.1)
    expect(max.dps.mean / duties.dps.mean).toBeGreaterThan(1.05)
    expect(max.dps.mean / duties.dps.mean).toBeLessThan(1.09)
  })
})

describe('Balanced in the engine (warrior.md §5.4 "Balanced", D28)', () => {
  const config = (rotation: SimConfig['rotation']): SimConfig => ({ ...defaultConfig('warrior-protection'), rotation, run: { mode: 'fixed', iterations: 2000, seed: 34 } })
  const bundle = buildPlan(config({}))
  const sim = new Sim(bundle.plan)
  const balanced = runFights(bundle.plan, 2000, sim)
  const result = toResult(bundle, balanced, 0)

  it('keeps Shield Block and Sunder Armor’s 5 stacks up, casts no Thunder Clap or Demoralizing Shout, and Sunders as a filler only from 60 rage', () => {
    const casts = (id: string) => {
      const a = bundle.plan.abilities.find((x) => x.id === id)
      return a === undefined ? 0 : counter(sim, a.source, FIELD.casts)
    }
    expect(casts('thunderClap')).toBe(0)
    expect(casts('demoralizingShout')).toBe(0)
    expect(casts('shieldBlock')).toBeGreaterThan(0)
    // Its blocks as Defensive's: about 66% of the swings.
    expect(result.tank!.outcomes.block).toBeGreaterThan(60)
    // The stacks are up nearly all fight. The filler waits for 60 rage, so it Sunders far less than
    // Defensive's filler from 9 does.
    expect(result.cooldowns.find((a) => a.id === 'sunderArmor')!.uptimePct!).toBeGreaterThan(95)
    const defensive = buildPlan(config(DEFENSIVE))
    const dSim = new Sim(defensive.plan)
    runFights(defensive.plan, 200, dSim)
    const dSunders = counter(dSim, defensive.plan.abilities.find((a) => a.id === 'sunderArmor')!.source, FIELD.casts) / 200
    expect(casts('sunderArmor') / 2000).toBeLessThan(dSunders / 2)
    expect(casts('sunderArmor') / 2000).toBeGreaterThan(5)
    // The boss unslowed and at full attack power: nobody's Thunder Clap or Demoralizing Shout.
    expect([bundle.plan.fight.bossSwing!.slow, bundle.plan.fight.bossSwing!.minDamage]).toEqual([0, 4500])
  })

  it('makes more threat and more damage than Defensive, and takes more (§5.4 "Balanced")', () => {
    const dBundle = buildPlan(config(DEFENSIVE))
    const duties = runFights(dBundle.plan, 2000)
    // About +7.2% TPS and +6.4% DPS in the default setup, with about 21% more damage taken.
    expect(balanced.tps.mean / duties.tps.mean).toBeGreaterThan(1.055)
    expect(balanced.tps.mean / duties.tps.mean).toBeLessThan(1.09)
    expect(balanced.dps.mean / duties.dps.mean).toBeGreaterThan(1.04)
    expect(balanced.dps.mean / duties.dps.mean).toBeLessThan(1.09)
    const taken = result.tank!.dtps.mean / toResult(dBundle, duties, 0).tank!.dtps.mean
    expect(taken).toBeGreaterThan(1.17)
    expect(taken).toBeLessThan(1.25)
  })
})
