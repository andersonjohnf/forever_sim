// Gift of Arthas on the boss: a flat +8 physical damage taken on each direct physical hit
// (docs/mechanics/buffs-debuffs-consumables.md#42-other-debuffs), added after the damage multipliers,
// before the outcome's (the hit's crit multiplier applies to it) and the boss's armor, and never to a
// bleed's tick [?]
// (docs/mechanics/damage-and-timing.md#24-damage-modifier-stacking; open-questions B70). The worked
// example is buffs doc worked example 13.
import { describe, expect, it } from 'vitest'
import { BLOODTHIRST, REND, SUNDER_ARMOR } from '../classes/warrior/abilities'
import { armorReduction } from '../core/formulas'
import { defaultConfig } from '../defaults'
import { buildPlan } from '../plan/build'
import type { Plan } from '../plan/types'
import { FOREVER } from '../rules/profiles'
import type { SimConfig, SpecId } from '../types'
import { runChunk } from './chunk'
import { FIELD, FIELD_COUNT, SOURCE_MAIN_HAND, Sim } from './sim'
import { addAbility, alwaysLandNoCrit, armsPlan, damages, line, refresh, setAttackPower } from './test-helpers'

/** The Forever Standard raid's boss armor after its debuffs (buffs doc worked example 1). */
const ARMOR = 471
/** What's left of a hit after that armor, for a level-60 attacker (damage-and-timing §1). */
const LEFT = 1 - armorReduction(ARMOR, 60, FOREVER)

/** Arms with a two-hander whose white hit is exactly 500 after your multipliers, no glancing blow's reduction, and the debuff at `taken`. */
function whitePlan(taken: number, crit: boolean, armor = 0): Plan {
  const plan = armsPlan(60000)
  alwaysLandNoCrit(plan)
  if (crit) plan.stats.crit = 100
  const ap = new Sim(plan).inspect().attackPower
  const roll = 500 - (ap / 14) * plan.weapons[0]!.speedSec
  plan.weapons = [{ ...plan.weapons[0]!, min: roll, max: roll, glanceLow: 1, glanceHigh: 1 }, null]
  plan.fight.targetArmor = armor
  if (taken) plan.physicalTaken = taken
  return plan
}

const distinct = (xs: number[]) => [...new Set(xs.map((x) => Math.round(x * 1e6) / 1e6))].sort((a, b) => a - b)

describe('Gift of Arthas: +8 on each direct physical hit (buffs doc worked example 13)', () => {
  it('a 500-damage white hit deals 508, and a crit 1,016: the crit doubles the +8', () => {
    expect(distinct(damages(whitePlan(0, false), SOURCE_MAIN_HAND, 2))).toEqual([500])
    expect(distinct(damages(whitePlan(8, false), SOURCE_MAIN_HAND, 2))).toEqual([508])
    // Crits and the table's other landed outcomes (a glancing blow here deals its full damage).
    expect(distinct(damages(whitePlan(0, true), SOURCE_MAIN_HAND, 4))).toEqual([500, 1000])
    expect(distinct(damages(whitePlan(8, true), SOURCE_MAIN_HAND, 4))).toEqual([508, 1016])
  })

  it('the boss’s armor takes its share of the +8: at 471 armor, 467.93 and a crit 935.86', () => {
    expect(LEFT).toBeCloseTo(5500 / 5971, 12)
    const [hit, crit] = distinct(damages(whitePlan(8, true, ARMOR), SOURCE_MAIN_HAND, 4))
    expect(hit).toBeCloseTo(508 * LEFT, 6)
    expect(crit).toBeCloseTo(1016 * LEFT, 6)
    expect(hit).toBeCloseTo(467.93, 2)
    expect(crit).toBeCloseTo(935.86, 2)
  })

  it('a special attack gets it once: Bloodthirst at 1800 AP deals 678 + 8 = 686', () => {
    const plan = armsPlan(60000)
    alwaysLandNoCrit(plan)
    setAttackPower(plan, 1800)
    const bt = addAbility(plan, BLOODTHIRST)
    line(plan, bt)
    const row = plan.abilities[bt].source
    for (const d of damages(plan, row, 2)) expect(d).toBeCloseTo(678, 9)
    plan.physicalTaken = 8
    const hits = damages(plan, row, 2)
    expect(hits.length).toBeGreaterThan(10)
    for (const d of hits) expect(d).toBeCloseTo(686, 9)
  })

  it('an attack that deals no damage deals none with it (Sunder Armor), and a bleed’s ticks are the same with it or without (Rend)', () => {
    const run = (taken: number) => {
      const plan = armsPlan(60000)
      plan.stats.hit = 100
      plan.fight.bossCanDodge = false
      const rend = addAbility(plan, REND)
      const sunder = addAbility(plan, SUNDER_ARMOR)
      line(plan, rend, [refresh(rend, 0)])
      line(plan, sunder)
      if (taken) plan.physicalTaken = taken
      const sim = new Sim(plan)
      const ticks: number[] = []
      const rendRow = plan.abilities[rend].source
      sim.damageTrace = (s, damage) => {
        if (s === rendRow) ticks.push(damage)
      }
      for (let i = 0; i < 3; i++) sim.runFight(i)
      const sunderRow = plan.abilities[sunder].source
      return { ticks, sunderDamage: sim.counters[sunderRow * FIELD_COUNT + FIELD.damage], sunderCasts: sim.counters[sunderRow * FIELD_COUNT + FIELD.casts] }
    }
    const without = run(0)
    const withIt = run(8)
    expect(withIt.ticks.length).toBeGreaterThan(10)
    expect(withIt.ticks).toEqual(without.ticks)
    expect(withIt.sunderCasts).toBeGreaterThan(0)
    expect(withIt.sunderDamage).toBe(0)
  })
})

/** A spec's default setup (the Standard raid), with Gift of Arthas on or off. */
function config(spec: SpecId, on: boolean): SimConfig {
  const d = defaultConfig(spec)
  const enabled = d.buffs.enabled.filter((id) => id !== 'giftOfArthas')
  return { ...d, buffs: { ...d.buffs, enabled: on ? [...enabled, 'giftOfArthas'] : enabled } }
}

/** Each breakdown row's damage over a chunk of fights. */
function rows(plan: Plan, fights: number): Map<string, number> {
  const r = runChunk(plan, 0, fights)
  return new Map(plan.sources.map((s, i) => [s.id, r.counters[i * FIELD_COUNT + FIELD.damage]]))
}

describe('Gift of Arthas in a setup', () => {
  it('reaches the plan only when it’s on, with its assumption', () => {
    const on = buildPlan(config('warrior-fury', true))
    expect(on.plan.physicalTaken).toBe(8)
    expect(on.assumptions.map((a) => a.id)).toContain('giftOfArthas')
    const off = buildPlan(config('warrior-fury', false))
    expect(off.plan.physicalTaken).toBeUndefined()
    expect(off.assumptions.map((a) => a.id)).not.toContain('giftOfArthas')
  })

  it('raises a physical spec’s damage: Retribution’s swings, not its Holy damage, and a hunter’s shots and its pet’s attacks', () => {
    // The same fights roll the same with the +8 and without, so a row it doesn't reach deals the same damage.
    const compare = (spec: SpecId) => {
      const off = rows(buildPlan(config(spec, false)).plan, 40)
      const on = rows(buildPlan(config(spec, true)).plan, 40)
      const up = [...on.keys()].filter((id) => on.get(id)! > off.get(id)!)
      const same = [...on.keys()].filter((id) => on.get(id)! > 0 && on.get(id) === off.get(id))
      expect(up.length + same.length, spec).toBe([...on.values()].filter((d) => d > 0).length)
      return { up, same }
    }
    // Retribution: its swings, Hand of Justice's and Windfury's extra ones; not Seal of Command, the
    // judgements, Holy Strike or Consecration, which are Holy.
    expect(compare('paladin-retribution')).toEqual({
      up: ['mainHand', 'handOfJustice', 'windfury'],
      same: ['judgementOfCommand', 'hammerOfWrath', 'holyStrike', 'consecration', 'consecrationRank1', 'sealOfCommandProc'],
    })
    // A hunter: Auto Shot and Multi-Shot, and its cat's swings, Bite and Claw; not Arcane Shot (Arcane) or Serpent Sting (Nature).
    expect(compare('hunter-beast-mastery')).toEqual({
      up: ['multiShot', 'autoShot', 'cat.melee', 'cat.bite', 'cat.claw'],
      same: ['arcaneShot', 'serpentSting'],
    })
  })

  it('drops out of the plan with its assumption where the Buffs tab says it isn’t used: a Demonology warlock with the Imp or no demon out (G5L-1)', () => {
    const demo = (demon?: string) => {
      const c = config('warlock-demonology', true)
      return buildPlan(demon === undefined ? c : { ...c, rotation: { ...c.rotation, 'warlock.demonology.demon.summoned': demon } })
    }
    // The default demon is the Imp.
    for (const demon of [undefined, 'imp', 'none']) {
      const bundle = demo(demon)
      expect(bundle.plan.physicalTaken, String(demon)).toBeUndefined()
      expect(bundle.assumptions.map((a) => a.id), String(demon)).not.toContain('giftOfArthas')
    }
    for (const demon of ['succubus', 'felhunter']) {
      const bundle = demo(demon)
      expect(bundle.plan.physicalTaken, demon).toBe(8)
      expect(bundle.assumptions.map((a) => a.id), demon).toContain('giftOfArthas')
    }
  })

  it('leaves a caster’s spells alone: a Fire mage’s plan with the +8 forced on deals the same damage', () => {
    const plan = buildPlan(defaultConfig('mage-fire')).plan
    const before = runChunk(plan, 0, 20)
    const after = runChunk({ ...plan, physicalTaken: 8 }, 0, 20)
    expect(after.dps.mean).toBe(before.dps.mean)
    expect([...after.counters]).toEqual([...before.counters])
  })

  it('is deterministic: the same setup and seed give the same result', () => {
    const plan = () => buildPlan(config('rogue-combat', true)).plan
    const a = runChunk(plan(), 0, 30)
    const b = runChunk(plan(), 0, 30)
    expect(a.dps.mean).toBe(b.dps.mean)
    expect([...a.counters]).toEqual([...b.counters])
    expect(a.dps.mean).toBeGreaterThan(runChunk(buildPlan(config('rogue-combat', false)).plan, 0, 30).dps.mean)
  })
})
