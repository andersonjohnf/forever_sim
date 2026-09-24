// The consumables every rotation uses on cooldown (buffs doc "On-use items and cooldown
// categories", §3.5, §3.7; classes/shared-consumables.ts): Greater Stoneshield Potion's armor on a
// tank, through the boss's swings, and EZ-Thro Dark Bomb's Fire damage on the spell table, its
// 60 s explosive cooldown and its 1 s throw that stops your swings. The buffs doc's worked examples
// 11 and 12.
import { describe, expect, it } from 'vitest'
import { armorReduction, bossHitHealthLost } from '../core/formulas'
import { defaultConfig } from '../defaults'
import { EZ_THRO_DARK_BOMB, GREATER_STONESHIELD_POTION } from '../effects/buffs'
import { buildPlan } from '../plan/build'
import { SCHOOL, type Plan } from '../plan/types'
import { FOREVER } from '../rules/profiles'
import { emptyAggregate, mergeChunk, toResult } from '../run/aggregate'
import type { SimConfig, SpecId } from '../types'
import { CHUNK_SIZE, runChunk } from './chunk'
import { BOSS_OUTCOME, FIELD, FIELD_COUNT, Sim } from './sim'
import { rotationOff, timeline } from './test-helpers'

/** A spec's default setup with only these buffs, a fight of exactly 180 s. */
function config(spec: SpecId, enabled: string[], patch: Partial<SimConfig> = {}): SimConfig {
  const d = defaultConfig(spec)
  return { ...d, buffs: { raid: d.buffs.raid, enabled }, fight: { ...d.fight, durationVariationPct: 0 }, run: { mode: 'fixed', iterations: 1000, seed: 7 }, ...patch }
}

function aggregate(plan: Plan, fights: number) {
  const sim = new Sim(plan)
  let agg = emptyAggregate(plan.sources.length, plan.auras.length)
  for (let k = 0; k * CHUNK_SIZE < fights; k++) agg = mergeChunk(agg, runChunk(plan, k, Math.min(CHUNK_SIZE, fights - k * CHUNK_SIZE), sim))
  return agg
}

/** Each fight's landed plain hits from the boss: [health lost, size before mitigation]. */
function hitsTaken(plan: Plan, fights: number): [number, number][] {
  const sim = new Sim(plan)
  const out: [number, number][] = []
  sim.swingTakenTrace = (o, lost, pre) => {
    if (o === BOSS_OUTCOME.hit) out.push([lost, pre])
  }
  for (let i = 0; i < fights; i++) sim.runFight(i)
  return out
}

describe('Greater Stoneshield Potion (buffs doc §3.5)', () => {
  /** A Protection warrior tank with no rotation of its own, swings of exactly 5,000: only the potion is used. */
  const tank = (enabled: string[]) =>
    config('warrior-protection', enabled, {
      rotation: rotationOff('warrior-protection'),
      fight: { ...defaultConfig('warrior-protection').fight, durationVariationPct: 0, boss: { ...defaultConfig('warrior-protection').fight.boss, damageMin: 5000, damageMax: 5000 } },
    })

  it('is drunk at the pull and again as its 2 min cooldown ends, so its +2,000 armor is up all fight', () => {
    const { plan } = buildPlan(tank(['greaterStoneshieldPotion']))
    const a = plan.abilities.findIndex((x) => x.id === GREATER_STONESHIELD_POTION.id)
    expect(a).toBeGreaterThanOrEqual(0)
    const aura = plan.auras[plan.abilities[a].aura]
    expect([aura.durationMs, aura.armor]).toEqual([120000, 2000])
    expect(timeline(plan).uses[a]).toEqual([0, 120000])
    const agg = aggregate(plan, 50)
    expect(agg.auraUpMs[plan.abilities[a].aura]).toBe(50 * 180000)
  })

  it('lasts 120 s: with its cooldown stretched to 170 s, it’s down from 120 s to 170 s', () => {
    const { plan } = buildPlan(tank(['greaterStoneshieldPotion']))
    const a = plan.abilities.findIndex((x) => x.id === GREATER_STONESHIELD_POTION.id)
    plan.abilities[a].cooldownMs = 170000
    expect(timeline(plan).uses[a]).toEqual([0, 170000])
    expect(aggregate(plan, 10).auraUpMs[plan.abilities[a].aura]).toBe(10 * (120000 + 10000))
  })

  it('makes each of the boss’s hits cost what 2,000 more armor leaves, and lowers the tank’s damage taken (worked example 11)', () => {
    const without = buildPlan(tank([]))
    const withPotion = buildPlan(tank(['greaterStoneshieldPotion']))
    const armor = without.plan.armor
    expect(withPotion.plan.armor).toBe(armor)
    // Defensive Stance's −10% damage taken; no block value on a plain hit.
    const hit = (a: number) => bossHitHealthLost(5000, 'hit', armorReduction(a, 63, FOREVER), 0.9, 0)
    const hits = hitsTaken(withPotion.plan, 20)
    expect(hits.length).toBeGreaterThan(100)
    for (const [lost, pre] of hits) {
      expect(pre).toBe(5000)
      expect(lost).toBeCloseTo(hit(armor + 2000), 9)
    }
    for (const [lost] of hitsTaken(without.plan, 5)) expect(lost).toBeCloseTo(hit(armor), 9)
    const dtps = (bundle: typeof without) => toResult(bundle, aggregate(bundle.plan, 400), 0).tank!.dtps.mean
    expect(dtps(withPotion)).toBeLessThan(dtps(without) * 0.92)
    // Worked example 11: 6,000 armor against a level-63 boss's 5,000 hit, in Defensive Stance.
    expect(armorReduction(6000, 63, FOREVER)).toBeCloseTo(0.510421, 6)
    expect(hit(6000)).toBeCloseTo(2203.1, 1)
    expect(hit(8000)).toBeCloseTo(1882.8, 1)
  })

  it('is bonus armor, which Forever’s Dire Bear Form multiplies by 4.6 (docs/classes/druid.md §4.7) [?]', () => {
    const bear = (enabled: string[]) =>
      buildPlan(
        config('druid-feral-bear', enabled, {
          rotation: rotationOff('druid-feral-bear'),
          fight: { ...defaultConfig('druid-feral-bear').fight, durationVariationPct: 0, boss: { ...defaultConfig('druid-feral-bear').fight.boss, damageMin: 5000, damageMax: 5000 } },
        }),
      ).plan
    const plain = hitsTaken(bear([]), 3)
    const potion = hitsTaken(bear(['greaterStoneshieldPotion']), 3)
    const armor = bear([]).armor
    const ratio = (1 - armorReduction(armor + 2000 * 4.6, 63, FOREVER)) / (1 - armorReduction(armor, 63, FOREVER))
    expect(potion[0][0] / plain[0][0]).toBeCloseTo(ratio, 9)
  })
})

describe('EZ-Thro Dark Bomb (buffs doc §3.7)', () => {
  const fury = (enabled: string[]) => buildPlan(config('warrior-fury', enabled)).plan

  it('is thrown on its 60 s cooldown from the pull, a 1 s cast during which neither hand swings', () => {
    const plan = fury(['ezThroDarkBomb'])
    const a = plan.abilities.findIndex((x) => x.id === EZ_THRO_DARK_BOMB.id)
    expect(plan.abilities[a]).toMatchObject({ kind: 'spell', castMs: 1000, gcdMs: 1000, castStopsSwings: true, cooldownMs: 60000 })
    for (let fight = 0; fight < 5; fight++) {
      const { uses, swings } = timeline(plan, fight)
      const throws = uses[a]
      expect(throws.length).toBe(3)
      expect(throws[0]).toBe(0)
      for (let i = 1; i < throws.length; i++) {
        // The explosive category's 60 s from the cast's end, and the GCD it may wait for.
        expect(throws[i] - throws[i - 1]).toBeGreaterThanOrEqual(61000)
        expect(throws[i] - throws[i - 1]).toBeLessThanOrEqual(61000 + 1500)
      }
      for (const t of throws) for (const hand of swings) expect(hand.filter((s) => s > t && s < t + 1000)).toEqual([])
    }
  })

  it('rolls spell hit with the boss’s average Fire resistance whole, then spell crit at ×1.5, for 225–675 (worked example 12)', () => {
    const plan = fury(['ezThroDarkBomb'])
    const row = plan.sources.findIndex((s) => s.id === EZ_THRO_DARK_BOMB.id)
    const sim = new Sim(plan)
    const start = sim.inspect()
    const damages: number[] = []
    sim.damageTrace = (s, damage) => {
      if (s === row) damages.push(damage)
    }
    const fights = 3000
    for (let i = 0; i < fights; i++) sim.runFight(i)
    const count = (field: number) => sim.counters[row * FIELD_COUNT + field]
    const casts = count(FIELD.casts)
    expect(casts).toBe(3 * fights)
    const resist = 1 - start.resistFactor[SCHOOL.fire]
    expect(resist).toBeCloseTo((0.75 * 24) / 300, 9)
    const failPct = start.spellMiss + (100 - start.spellMiss) * resist
    const share = (n: number, of: number, pct: number) => {
      const p = pct / 100
      expect(Math.abs(n / of - p), `${n}/${of} vs ${p}`).toBeLessThanOrEqual(4 * Math.sqrt((p * (1 - p)) / of))
    }
    share(count(FIELD.misses), casts, failPct)
    const landed = casts - count(FIELD.misses)
    share(count(FIELD.crits), landed, start.spellCrit)
    // A landed bomb takes no partial resist: its damage is its roll × the Fire multipliers, ×1.5 on a crit.
    const mult = start.schoolDamage[SCHOOL.fire] * start.schoolTaken[SCHOOL.fire]
    for (const d of damages) {
      const roll = d / mult
      const plain = roll >= 225 - 1e-9 && roll <= 675 + 1e-9
      const crit = roll >= 337.5 - 1e-9 && roll <= 1012.5 + 1e-9
      expect(plain || crit, `${d}`).toBe(true)
    }
    // Worked example 12: no spell hit, 5% spell crit.
    const fail = 17 + (100 - 17) * 0.06
    expect(fail).toBeCloseTo(21.98, 9)
    expect(((100 - fail) / 100) * 450 * (1 + 0.5 * 0.05)).toBeCloseTo(359.87, 2)
  })

  it('is used by every spec’s rotation, and its row counts in the results', () => {
    for (const spec of ['mage-fire', 'rogue-combat', 'druid-feral-bear', 'paladin-protection', 'hunter-marksmanship'] as const) {
      const bundle = buildPlan(config(spec, ['ezThroDarkBomb']))
      expect(bundle.assumptions.find((x) => x.id === 'onUseConsumables')?.text ?? '', spec).not.toContain('EZ-Thro')
      // Its [?] rules are listed (buffs doc §3.7).
      expect(bundle.assumptions.map((x) => x.id), spec).toContain('explosiveThrow')
      const result = toResult(bundle, aggregate(bundle.plan, 20), 0)
      const row = result.abilities.find((x) => x.id === EZ_THRO_DARK_BOMB.id)
      expect(row?.casts, spec).toBe(60)
      expect(row!.damage, spec).toBeGreaterThan(0)
    }
  })
})
