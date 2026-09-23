// The boss's swings on a tank end to end (docs/mechanics/combat-tables.md#8-boss--player-tanks,
// encounter.md §5, damage-and-timing §2.6, rage.md#forever-): outcome shares and damage taken per
// second against the closed form, full blocks, 0% and 100% avoidance, the crushing cap, no
// shield, facing, the class hooks (triggers, defensive auras, block charges, rage only for rage
// users), parry haste's setting, and determinism of the tank results.
import { describe, expect, it } from 'vitest'
import { probabilities } from '../core/attack-table'
import { armorReduction, bossHitHealthLost, damageTakenRage } from '../core/formulas'
import { defaultConfig } from '../defaults'
import { buildPlan } from '../plan/build'
import { ACTION, type Plan, type PlanBundle, TRIGGER } from '../plan/types'
import { FOREVER } from '../rules/profiles'
import { type Aggregate, emptyAggregate, mergeChunk, toResult } from '../run/aggregate'
import { type ChunkExecutor, drive } from '../run/driver'
import { localExecutor } from '../run/local'
import type { SimConfig } from '../types'
import { CHUNK_SIZE, type ChunkResult, runChunk } from './chunk'
import { BOSS_OUTCOME, FIELD, FIELD_COUNT, Sim } from './sim'
import { addAura, addProc } from './test-helpers'

/**
 * A Protection warrior with no talents, no buffs and a shield only (no swings of its own, so no
 * parries and nothing for the boss to parry), fighting exactly 180 s against swings of exactly
 * 5,000 every 2.0 s: 90 swings a fight.
 */
function tankConfig(patch: Partial<SimConfig> = {}): SimConfig {
  const d = defaultConfig('warrior-protection')
  return {
    ...d,
    talents: '',
    gear: { offHand: { itemId: 12602 } },
    buffs: { raid: d.buffs.raid, enabled: [] },
    fight: { ...d.fight, durationVariationPct: 0, boss: { ...d.fight.boss, damageMin: 5000, damageMax: 5000 } },
    run: { mode: 'fixed', iterations: 2000, seed: 3 },
    ...patch,
  }
}

const tankBundle = (patch: Partial<SimConfig> = {}): PlanBundle => buildPlan(tankConfig(patch))
/** One-hander Mirah's Song and Draconian Deflector: a tank that can parry and block. */
const SWORD_AND_BOARD: SimConfig['gear'] = { mainHand: { itemId: 15806 }, offHand: { itemId: 12602 } }
const SWINGS = 90

function runFights(plan: Plan, fights: number, sim = new Sim(plan)): Aggregate {
  let agg = emptyAggregate(plan.sources.length, plan.auras.length)
  for (let k = 0; k * CHUNK_SIZE < fights; k++) agg = mergeChunk(agg, runChunk(plan, k, Math.min(CHUNK_SIZE, fights - k * CHUNK_SIZE), sim))
  return agg
}

type Swing = [outcome: number, healthLost: number, pre: number]

/** Every boss swing of `fights` fights, in order, per fight: [outcome, health lost, size before mitigation]. */
function swingsByFight(plan: Plan, fights: number, sim = new Sim(plan)): Swing[][] {
  const out: Swing[][] = []
  sim.swingTakenTrace = (o, lost, pre) => out[out.length - 1].push([o, lost, pre])
  for (let i = 0; i < fights; i++) {
    out.push([])
    sim.runFight(i)
  }
  return out
}

/** Every boss swing of `fights` fights, in order. */
const swingsTaken = (plan: Plan, fights: number, sim = new Sim(plan)): Swing[] => swingsByFight(plan, fights, sim).flat()

/** The boss's table (miss, dodge, parry, block, crit, crush, hit) as fractions, from the engine's thresholds. */
const table = (plan: Plan) => probabilities(Float64Array.from(new Sim(plan).inspect().bossThresholds), 6).map((p) => p / 100)

describe('the boss’s swings against the closed form (combat-tables §8, damage-and-timing §2.6)', () => {
  const bundle = tankBundle()
  const plan = bundle.plan
  const agg = runFights(plan, 2000)
  const result = toResult(bundle, agg, 0)
  const p = table(plan)

  it('fall on the table in the shares it gives, 90 swings a fight', () => {
    const tank = result.tank!
    expect(tank.bossSwingsPerFight).toBe(SWINGS)
    const n = SWINGS * agg.fights
    const o = tank.outcomes
    const shares = [o.miss, o.dodge, o.parry, o.block, o.crit, o.crush, o.hit]
    shares.forEach((share, k) => {
      const se = Math.sqrt((p[k] * (1 - p[k])) / n)
      expect(Math.abs(share / 100 - p[k]), `outcome ${k}: ${share}% vs ${100 * p[k]}%`).toBeLessThanOrEqual(4 * se + 1e-12)
    })
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 9)
    // No weapon: nothing to parry with (character-stats §other base values).
    expect(o.parry).toBe(0)
    // The sheet's table is the engine's.
    const s = bundle.sheet.bossTable!
    expect([s.miss, s.dodge, s.parry, s.block, s.crit, s.crush, s.hit].map((x) => x / 100)).toEqual(p.map((x) => expect.closeTo(x, 12)))
  })

  it('cost the health that armor, Defensive Stance, the outcome’s multiplier and the block value leave', () => {
    // damage-and-timing §1.1: armor against a level-63 attacker (K = 5,755); Defensive Stance −10%.
    const dr = armorReduction(plan.armor, 63, FOREVER)
    const bv = bundle.sheet.blockValue
    // Draconian Deflector's Classic Era block value 40 (a Classic fallback shield) + floor(120 Str / 20).
    expect(bv).toBe(46)
    const lost = (o: 'hit' | 'crit' | 'crush' | 'block') => bossHitHealthLost(5000, o, dr, 0.9, bv)
    const perSwing = p[3] * lost('block') + p[4] * lost('crit') + p[5] * lost('crush') + p[6] * lost('hit')
    const dtps = (SWINGS * perSwing) / 180
    const m = result.tank!.dtps
    const se = m.stdev / Math.sqrt(agg.fights)
    expect(Math.abs(m.mean - dtps), `DTPS ${m.mean} vs ${dtps} (SE ${se})`).toBeLessThanOrEqual(4 * se)
    expect(Math.abs(m.mean / dtps - 1)).toBeLessThan(0.005)
    expect(m.ci95).toBeGreaterThan(0)
  })

  it('cost each outcome exactly its closed-form health, and give rage from the swing before mitigation', () => {
    const dr = armorReduction(plan.armor, 63, FOREVER)
    const bv = bundle.sheet.blockValue
    const names = { [BOSS_OUTCOME.hit]: 'hit', [BOSS_OUTCOME.crit]: 'crit', [BOSS_OUTCOME.crush]: 'crush', [BOSS_OUTCOME.block]: 'block' } as const
    const seen = new Set<number>()
    for (const [o, lost, pre] of swingsTaken(plan, 50)) {
      const name = names[o as keyof typeof names]
      if (!name) {
        expect([lost, pre]).toEqual([0, 0])
        continue
      }
      seen.add(o)
      expect(lost).toBeCloseTo(bossHitHealthLost(5000, name, dr, 0.9, bv), 9)
      // rage.md#forever-: D_pre is the swing before armor, block and Defensive Stance; ×2 crit, ×1.5 crushing.
      expect(pre).toBe(o === BOSS_OUTCOME.crit ? 10000 : o === BOSS_OUTCOME.crush ? 7500 : 5000)
    }
    expect(seen.size).toBe(4)
  })
})

describe('edge cases (combat-tables §8)', () => {
  it('a full block costs no health, gives the swing’s full rage, and fires no damage-taken procs', () => {
    const plan = tankBundle().plan
    // Block beyond 100%, and more block value than any hit.
    plan.stats.block = 200
    plan.stats.blockValue = 100000
    const probe = probeRow(plan, TRIGGER.damageTaken)
    const [miss, dodge, parry, block, crit, crush, hit] = table(plan)
    expect(block).toBeCloseTo(1 - miss - dodge - parry, 12)
    expect([crit, crush, hit]).toEqual([0, 0, 0])
    const landed = swingsTaken(plan, 20).filter(([o]) => o !== BOSS_OUTCOME.miss && o !== BOSS_OUTCOME.dodge)
    expect(landed.length).toBeGreaterThan(0)
    for (const swing of landed) expect(swing).toEqual([BOSS_OUTCOME.block, 0, 5000])
    const agg = runFights(plan, 250)
    expect(agg.damageTaken.mean).toBe(0)
    expect(agg.counters[probe * FIELD_COUNT + FIELD.casts]).toBe(0)
    // Every landed swing gives 10 × 5,000 ÷ max health, fractions carried (rage.md#rounding).
    const rage = (agg.rageGainedTenths + agg.rageWastedTenths) / 10
    expect(rage / (agg.bossOutcomes[BOSS_OUTCOME.block] * damageTakenRage('forever', 0, 5000, plan.rage.maxHealth))).toBeCloseTo(1, 2)
  })

  it('100% avoidance: only misses and dodges, no damage and no rage', () => {
    const plan = tankBundle().plan
    plan.stats.dodge = 200
    const [miss, dodge, ...rest] = table(plan)
    expect(miss + dodge).toBeCloseTo(1, 12)
    expect(rest).toEqual([0, 0, 0, 0, 0])
    const agg = runFights(plan, 250)
    expect(agg.damageTaken.mean).toBe(0)
    expect(agg.rageGainedTenths + agg.rageWastedTenths).toBe(0)
    expect(agg.bossOutcomes[BOSS_OUTCOME.miss] + agg.bossOutcomes[BOSS_OUTCOME.dodge]).toBe(250 * SWINGS)
  })

  it('0% avoidance at 300 defense: miss 4.4, crit 5.6, crushing 15, the rest hits', () => {
    const plan = tankBundle({ gear: {} }).plan
    plan.stats.baseAgi = 0 // no dodge from Agility
    const [miss, dodge, parry, block, crit, crush, hit] = table(plan).map((x) => 100 * x)
    expect(miss).toBeCloseTo(4.4, 9)
    expect([dodge, parry, block]).toEqual([0, 0, 0])
    expect(crit).toBeCloseTo(5.6, 9)
    expect(crush).toBeCloseTo(15, 9)
    expect(hit).toBeCloseTo(75, 9)
  })

  it('caps crushing blows at what the table leaves: at 93.8% avoidance, crit 5.6 and crushing 0.6', () => {
    const plan = tankBundle({ gear: {} }).plan
    plan.stats.baseAgi = 0
    plan.stats.dodge = 90 // 89.4 against the boss
    const [miss, dodge, , , crit, crush, hit] = table(plan).map((x) => 100 * x)
    expect(miss + dodge).toBeCloseTo(93.8, 9)
    expect(crit).toBeCloseTo(5.6, 9)
    expect(crush).toBeCloseTo(0.6, 9)
    expect(hit).toBeCloseTo(0, 9)
    const agg = runFights(plan, 250)
    expect(agg.bossOutcomes[BOSS_OUTCOME.hit]).toBe(0)
    expect(agg.bossOutcomes[BOSS_OUTCOME.crush]).toBeGreaterThan(0)
  })

  it('no shield: never blocks, whatever the block chance', () => {
    const bundle = tankBundle({ gear: {} })
    bundle.plan.stats.block = 50
    expect([bundle.sheet.blockPct, bundle.sheet.blockValue, bundle.sheet.bossTable!.block]).toEqual([0, 0, 0])
    expect(table(bundle.plan)[3]).toBe(0)
    expect(runFights(bundle.plan, 250).bossOutcomes[BOSS_OUTCOME.block]).toBe(0)
  })

  it('facing away: no dodge, parry or block, only miss, crit, crushing and hits (combat-tables §8, "Direction")', () => {
    const plan = tankBundle({ gear: SWORD_AND_BOARD }).plan
    const front = table(plan)
    expect(front[1] * front[2] * front[3]).toBeGreaterThan(0)
    plan.fight.bossSwing!.front = false
    const [miss, dodge, parry, block, crit, crush] = table(plan)
    expect([dodge, parry, block]).toEqual([0, 0, 0])
    expect([miss, crit, crush]).toEqual([front[0], expect.closeTo(front[4], 12), expect.closeTo(front[5], 12)])
  })

  it('a boss of the player’s level never crushes', () => {
    expect(table(tankBundle({ fight: { ...tankConfig().fight, bossLevel: 60 } }).plan)[5]).toBe(0)
  })
})

/**
 * A counting proc on `trigger`: a 0-damage spell, whose casts its own breakdown row counts; with
 * `requiresAura`, rolled only while that aura is up (Holy Shield's damage).
 */
function probeRow(plan: Plan, trigger: number, requiresAura = -1): number {
  plan.sources.push({ id: `probe${trigger}`, name: 'Probe', icon: 'x' })
  const row = plan.sources.length - 1
  addProc(plan, { trigger, chance: [1, 1], hands: 0, action: ACTION.spellDamage, amount: 0, b: 0, source: row, requiresAura })
  return row
}

describe('class hooks (combat-tables §8)', () => {
  it('fire dodge, parry, dodge-or-parry, melee taken, crit taken, block and damage taken once per matching swing', () => {
    const plan = tankBundle({ gear: SWORD_AND_BOARD }).plan
    const triggers = ['dodge', 'parry', 'dodgeParry', 'meleeTaken', 'critTaken', 'block', 'damageTaken'] as const
    const rows = Object.fromEntries(triggers.map((t) => [t, probeRow(plan, TRIGGER[t])])) as Record<(typeof triggers)[number], number>
    const agg = runFights(plan, 250)
    const casts = (t: (typeof triggers)[number]) => agg.counters[rows[t] * FIELD_COUNT + FIELD.casts]
    const o = agg.bossOutcomes
    const landed = o[BOSS_OUTCOME.block] + o[BOSS_OUTCOME.crit] + o[BOSS_OUTCOME.crush] + o[BOSS_OUTCOME.hit]
    expect(casts('dodge')).toBe(o[BOSS_OUTCOME.dodge])
    expect(casts('parry')).toBe(o[BOSS_OUTCOME.parry])
    expect(casts('dodgeParry')).toBe(o[BOSS_OUTCOME.dodge] + o[BOSS_OUTCOME.parry])
    expect(casts('meleeTaken')).toBe(landed)
    expect(casts('critTaken')).toBe(o[BOSS_OUTCOME.crit])
    expect(casts('block')).toBe(o[BOSS_OUTCOME.block])
    // Every landed swing costs health here: the block value is far below a hit.
    expect(casts('damageTaken')).toBe(landed)
    for (const k of [BOSS_OUTCOME.dodge, BOSS_OUTCOME.parry, BOSS_OUTCOME.crit, BOSS_OUTCOME.block]) expect(o[k]).toBeGreaterThan(0)
  })

  it('fire in order: dodge or parry then dodge or parry; damage taken, melee taken, then block or crit taken', () => {
    const plan = tankBundle({ gear: SWORD_AND_BOARD }).plan
    const sim = new Sim(plan)
    const hooks = new Set<number>([TRIGGER.dodgeParry, TRIGGER.dodge, TRIGGER.parry, TRIGGER.damageTaken, TRIGGER.meleeTaken, TRIGGER.block, TRIGGER.critTaken])
    // The triggers each boss swing fires, in order (a spy on the engine's private fireProcs).
    const swings: [outcome: number, lost: number, fired: number[]][] = []
    const spy = sim as unknown as { fireProcs: (trigger: number, hand: number) => void }
    const fire = spy.fireProcs.bind(sim)
    spy.fireProcs = (trigger, hand) => {
      if (hooks.has(trigger)) swings[swings.length - 1][2].push(trigger)
      fire(trigger, hand)
    }
    sim.swingTakenTrace = (o, lost) => swings.push([o, lost, []])
    for (let i = 0; i < 20; i++) sim.runFight(i)
    const T = TRIGGER
    const seen = new Set<number>()
    for (const [o, lost, fired] of swings) {
      seen.add(o)
      const expected =
        o === BOSS_OUTCOME.miss ? []
        : o === BOSS_OUTCOME.dodge ? [T.dodgeParry, T.dodge]
        : o === BOSS_OUTCOME.parry ? [T.dodgeParry, T.parry]
        : [...(lost > 0 ? [T.damageTaken] : []), T.meleeTaken, ...(o === BOSS_OUTCOME.block ? [T.block] : o === BOSS_OUTCOME.crit ? [T.critTaken] : [])]
      expect(fired, `outcome ${o}`).toEqual(expected)
    }
    expect(seen.size).toBe(7)
  })

  it('a block aura with block charges: each block uses one, and the aura drops after the last, whose damage still fires (Holy Shield)', () => {
    const plan = tankBundle().plan
    // No block without the aura; with it, every swing that isn't missed or dodged is blocked.
    plan.stats.baseBlock = -1000
    // Longer than a fight, so only its 4 charges end it.
    const aura = addAura(plan, { id: 'wall', name: 'Wall', durationMs: 600000, mods: {} })
    Object.assign(plan.auras[aura], { block: 2000, blockCharges: 4 })
    addProc(plan, { trigger: TRIGGER.dodge, chance: [1, 1], hands: 0, action: ACTION.aura, amount: aura, b: 0 })
    // Holy Shield's damage: a block proc that needs the aura, rolled before the block uses a charge.
    const damage = probeRow(plan, TRIGGER.block, aura)
    const sim = new Sim(plan)
    let blocks = 0
    let unblocked = 0
    let lastCharge = 0
    for (const fight of swingsByFight(plan, 20, sim)) {
      // Each fight starts without the aura; a dodge puts it up with 4 charges (or refreshes them).
      let charges = 0
      for (const [o] of fight) {
        if (o === BOSS_OUTCOME.dodge) charges = 4
        else if (o === BOSS_OUTCOME.block) {
          if (charges === 1) lastCharge++
          expect(charges).toBeGreaterThan(0)
          charges--
          blocks++
        } else if (o !== BOSS_OUTCOME.miss) {
          // A landed swing the aura doesn't block: only once its charges are gone.
          expect(charges).toBe(0)
          unblocked++
        }
      }
    }
    expect(blocks).toBeGreaterThan(20)
    expect(unblocked).toBeGreaterThan(20)
    expect(lastCharge).toBeGreaterThan(5)
    // Every block, the last charge's included, fired the damage.
    expect(sim.counters[damage * FIELD_COUNT + FIELD.casts]).toBe(blocks)
    expect(sim.auraUpMs[aura]).toBeGreaterThan(0)
  })

  it('a blocked swing’s own procs don’t use a charge of the aura they apply (Redoubt: 5 blocks)', () => {
    const plan = tankBundle().plan
    plan.stats.baseBlock = 40
    // Redoubt: up by the first landed swing (once a fight), 5 blocks, longer than a fight.
    const aura = addAura(plan, { id: 'redoubt', name: 'Redoubt', durationMs: 600000, mods: {} })
    Object.assign(plan.auras[aura], { block: 30, blockCharges: 5 })
    addProc(plan, { trigger: TRIGGER.meleeTaken, chance: [1, 1], hands: 0, icdMs: 1e9, action: ACTION.aura, amount: aura, b: 0 })
    // Counts the blocks while it's up, the one on the swing that applied it included.
    const probe = probeRow(plan, TRIGGER.block, aura)
    const sim = new Sim(plan)
    let expected = 0
    let appliedByABlock = 0
    for (const fight of swingsByFight(plan, 200, sim)) {
      const landed = fight.filter(([o]) => o !== BOSS_OUTCOME.miss && o !== BOSS_OUTCOME.dodge && o !== BOSS_OUTCOME.parry)
      if (landed.length === 0) continue
      const [first, ...rest] = landed
      const firstBlocked = first[0] === BOSS_OUTCOME.block
      if (firstBlocked) appliedByABlock++
      // The swing that applied it blocks with its 5 charges intact; the next 5 blocks use them.
      expected += (firstBlocked ? 1 : 0) + Math.min(5, rest.filter(([o]) => o === BOSS_OUTCOME.block).length)
    }
    expect(appliedByABlock).toBeGreaterThan(40)
    expect(sim.counters[probe * FIELD_COUNT + FIELD.casts]).toBe(expected)
  })

  it('a block that applies or refreshes a one-block aura leaves it up: the aura drops only on a later block', () => {
    const plan = tankBundle().plan
    plan.stats.baseBlock = 40
    // Every block puts it up again with 1 charge; if that block used the charge, it would never be up.
    const aura = addAura(plan, { id: 'once', name: 'Once', durationMs: 600000, mods: {} })
    Object.assign(plan.auras[aura], { blockCharges: 1 })
    addProc(plan, { trigger: TRIGGER.block, chance: [1, 1], hands: 0, action: ACTION.aura, amount: aura, b: 0 })
    const probe = probeRow(plan, TRIGGER.block, aura)
    const sim = new Sim(plan)
    const blocks = swingsTaken(plan, 50, sim).filter(([o]) => o === BOSS_OUTCOME.block).length
    // Each block's own procs apply or refresh it, so it's up for every block's damage.
    expect(sim.counters[probe * FIELD_COUNT + FIELD.casts]).toBe(blocks)
    expect(blocks).toBeGreaterThan(500)
    expect(sim.auraUpMs[aura]).toBeGreaterThan(0)
  })

  it('a damage-taken aura multiplies the health a swing costs, not its rage (Iron Creed, Shield Wall)', () => {
    const plan = tankBundle({ gear: {} }).plan
    plan.stats.baseAgi = 0
    plan.stats.dodge = 20
    const aura = addAura(plan, { id: 'guard', name: 'Guard', durationMs: 600000, mods: {} })
    Object.assign(plan.auras[aura], { damageTaken: -50 })
    addProc(plan, { trigger: TRIGGER.dodge, chance: [1, 1], hands: 0, action: ACTION.aura, amount: aura, b: 0 })
    // The engine re-derives armor from the stats: 0 Agility, no gear, no armor.
    const full = 5000 * 0.9 * new Sim(plan).inspect().bossArmorFactor
    expect(full).toBe(4500)
    let dodged = false
    let before = 0
    let after = 0
    for (const [o, lost, pre] of swingsTaken(plan, 1)) {
      if (o === BOSS_OUTCOME.dodge) dodged = true
      if (o !== BOSS_OUTCOME.hit) continue
      expect(pre).toBe(5000)
      expect(lost).toBeCloseTo(dodged ? full / 2 : full, 9)
      if (dodged) after++
      else before++
    }
    expect(before * after).toBeGreaterThan(0)
  })

  it('armor, dodge and block value auras re-derive the table, the armor factor and the block value', () => {
    const plan = tankBundle().plan
    const aura = addAura(plan, { id: 'hide', name: 'Hide', durationMs: 600000, mods: {} })
    Object.assign(plan.auras[aura], { armor: 1000, dodge: 30, blockValue: 20 })
    addProc(plan, { trigger: TRIGGER.meleeTaken, chance: [1, 1], hands: 0, action: ACTION.aura, amount: aura, b: 0 })
    const bv = 46
    const hit = (armor: number) => bossHitHealthLost(5000, 'hit', armorReduction(armor, 63, FOREVER), 0.9, bv)
    const block = (armor: number, value: number) => bossHitHealthLost(5000, 'block', armorReduction(armor, 63, FOREVER), 0.9, value)
    const dodges = [0, 0]
    const counts = [0, 0]
    for (const fight of swingsByFight(plan, 30)) {
      // Each fight starts without the aura; it comes up with the first landed swing and outlasts the fight.
      let up = false
      for (const [o, lost] of fight) {
        counts[up ? 1 : 0]++
        if (o === BOSS_OUTCOME.dodge) dodges[up ? 1 : 0]++
        if (o === BOSS_OUTCOME.hit) expect(lost).toBeCloseTo(hit(up ? plan.armor + 1000 : plan.armor), 9)
        if (o === BOSS_OUTCOME.block) expect(lost).toBeCloseTo(up ? block(plan.armor + 1000, bv + 20) : block(plan.armor, bv), 9)
        if (o !== BOSS_OUTCOME.miss && o !== BOSS_OUTCOME.dodge) up = true
      }
    }
    // +30% dodge (29.4 against the boss) while it's up.
    expect(dodges[1] / counts[1]).toBeGreaterThan(dodges[0] / counts[0] + 0.2)
  })

  it('give no rage from hits taken to a class without rage, but still fire its damage-taken procs', () => {
    const plan = tankBundle().plan
    plan.rage.fromDamageTaken = false
    const row = probeRow(plan, TRIGGER.damageTaken)
    const agg = runFights(plan, 250)
    expect(agg.rageGainedTenths + agg.rageWastedTenths).toBe(0)
    expect(agg.counters[row * FIELD_COUNT + FIELD.casts]).toBeGreaterThan(0)
    expect(agg.damageTaken.mean).toBeGreaterThan(0)
  })

  it('the plan gives rage from hits taken to warriors and bears only (rage.md#bear-druid-rage)', () => {
    for (const spec of ['warrior-protection', 'warrior-fury', 'warrior-arms', 'druid-feral-bear'] as const) {
      expect(buildPlan(defaultConfig(spec)).plan.rage.fromDamageTaken).toBe(true)
    }
    for (const spec of ['paladin-protection', 'paladin-retribution', 'druid-feral-cat'] as const) {
      expect(buildPlan(defaultConfig(spec)).plan.rage.fromDamageTaken).toBe(false)
    }
  })
})

describe('parry haste follows the encounter’s setting both ways (encounter.md §5)', () => {
  function firstSwings(parryHaste: boolean): number[] {
    const d = defaultConfig('warrior-protection')
    const plan = buildPlan({
      ...d,
      talents: '',
      gear: { mainHand: { itemId: 17016 } },
      buffs: { raid: d.buffs.raid, enabled: [] },
      fight: { ...d.fight, durationVariationPct: 0, boss: { ...d.fight.boss, parryHaste } },
    }).plan
    plan.weapons[0]!.speedSec = 2.6
    // Every boss swing is parried: no miss, no dodge, parry beyond 100%.
    plan.stats.defense = -125
    plan.stats.baseAgi = 0
    plan.stats.parry = 200
    const sim = new Sim(plan)
    const main: number[] = []
    sim.trace = (_s, hand, t) => hand === 0 && main.push(t)
    sim.runFight(0)
    return main.slice(0, 2)
  }
  it('on: the tank’s parry hastens its own next swing (2.6 − 0.4 × 2.6 = 1.56 s)', () => expect(firstSwings(true)).toEqual([0, 1560]))
  it('off: it doesn’t', () => expect(firstSwings(false)).toEqual([0, 2600]))
})

/** A fake pool: `lanes` chunks at once, finishing out of order. */
function racingExecutor(plan: Plan, lanes: number): ChunkExecutor {
  const sims = Array.from({ length: lanes }, () => new Sim(plan))
  let n = 0
  return {
    lanes,
    run: (chunk, fights) =>
      new Promise<ChunkResult>((resolve) => {
        const result = runChunk(plan, chunk, fights, sims[n++ % lanes])
        setTimeout(() => resolve(result), (chunk * 7919) % 13)
      }),
  }
}

describe('tank results (D18, encounter.md §5)', () => {
  it('the default Protection warrior: damage taken per second, and outcomes near the sheet’s table', () => {
    const bundle = buildPlan({ ...defaultConfig('warrior-protection'), run: { mode: 'fixed', iterations: 1000, seed: 11 } })
    const tank = toResult(bundle, runFights(bundle.plan, 1000), 0).tank!
    const sheet = bundle.sheet.bossTable!
    // Parry haste from the boss's own parries adds swings to 180 s ÷ 2.4 s (Thunder Clap's slow).
    expect(tank.bossSwingsPerFight).toBeGreaterThan(75)
    for (const k of ['miss', 'dodge', 'parry', 'block', 'crit', 'crush', 'hit'] as const) expect(Math.abs(tank.outcomes[k] - sheet[k]), k).toBeLessThan(0.5)
    expect(tank.dtps.mean).toBeGreaterThan(0)
    expect(tank.dtps.ci95).toBeGreaterThan(0)
  })

  it('DPS specs have none', () => {
    const bundle = buildPlan({ ...defaultConfig('warrior-fury'), run: { mode: 'fixed', iterations: 250, seed: 1 } })
    expect(toResult(bundle, runFights(bundle.plan, 250), 0).tank).toBeUndefined()
    expect(bundle.sheet.bossTable).toBeNull()
  })

  it('are deterministic: the same config and seed give the same tank results, on any number of workers (D15)', async () => {
    const config: SimConfig = { ...defaultConfig('warrior-protection'), run: { mode: 'fixed', iterations: 750, seed: 77 } }
    const a = buildPlan(config)
    const b = buildPlan(structuredClone(config))
    const one = await drive(a.plan, localExecutor(a.plan), { mode: 'fixed', iterations: 750 })
    const three = await drive(b.plan, racingExecutor(b.plan, 3), { mode: 'fixed', iterations: 750 })
    expect(three.damageTaken).toEqual(one.damageTaken)
    expect(Array.from(three.bossOutcomes)).toEqual(Array.from(one.bossOutcomes))
    expect(toResult(b, three, 0).tank).toEqual(toResult(a, one, 0).tank)
  })

  it('a fight’s damage taken is the sum of the health its swings cost', () => {
    const plan = tankBundle().plan
    const sim = new Sim(plan)
    const lost = swingsTaken(plan, 1, sim).reduce((sum, [, x]) => sum + x, 0)
    expect(sim.fightDamageTaken).toBeCloseTo(lost, 6)
    expect(sim.fightDamageTaken).toBeGreaterThan(0)
  })
})
