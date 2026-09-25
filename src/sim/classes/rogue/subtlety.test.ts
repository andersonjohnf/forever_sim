// The Subtlety rogue (docs/classes/rogue.md §3.9–§3.10, §5.3, §6.3): its rows and talents against the
// Forever client data, the worked examples (§9 R11–R13), the four engine additions it brought
// (Hemorrhage's bleed debuff, Quietus, Thousand Cuts, Cutthroat's window), its priority list, a golden
// run and determinism.
import { describe, expect, it } from 'vitest'
import spellsJson from '@/data/client/spells.json'
import talentsJson from '@/data/client/talents.json'
import type { ClientSpells, ClientTalents } from '@/data/client/types'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { FIELD, Sim } from '../../engine/sim'
import { counter } from '../../engine/test-helpers'
import { buildPlan } from '../../plan/build'
import { COND, type Plan } from '../../plan/types'
import { type Aggregate, emptyAggregate, mergeChunk, toResult } from '../../run/aggregate'
import type { SimConfig } from '../../types'
import { talentRanksByName } from '../index'
import {
  AMBUSH,
  BACKSTAB,
  CUTTHROAT_WINDOW,
  GHOSTLY_STRIKE,
  GHOSTLY_STRIKE_DAGGER_PCT,
  HEMORRHAGE,
  HEMORRHAGE_DAGGER_PCT,
  PREMEDITATION,
  RUPTURE,
  THISTLE_TEA,
} from './abilities'
import { INITIATIVE, QUIETUS_BELOW_HEALTH_PCT, QUIETUS_PCT_PER_RANK, THOUSAND_CUTS_AURA, THOUSAND_CUTS_TENTHS_PER_STACK, withRogueTalents } from './modifiers'
import { CUTTHROAT_PCT_PER_RANK, SUBTLETY_OPTIONS, subtletyMaintainedBuffs, subtletyRotation, subtletyUnusedSettings } from './subtlety'

const spells = (spellsJson as unknown as ClientSpells).spells
const clientTalents = (talentsJson as unknown as ClientTalents).classes.rogue.talents
const spell = (id: number) => spells[String(id)]
const effect = (id: number, index: number) => spell(id).effects.find((e) => e.effectIndex === index)!
const energyCost = (id: number) => (spell(id).power ?? []).find((p) => p.powerType === 3)?.manaCost ?? 0
const curve = (name: string, index = 0) => clientTalents.find((t) => t.name === name)!.rankEffects.find((r) => r.effectIndex === index)!.values
const SUBTLETY = talentRanksByName(TALENT_DATA.rogue, defaultConfig('rogue-subtlety').talents)
const ranks = (entries: [string, number][]) => new Map(entries)
const row = (plan: Plan, id: string) => plan.sources.findIndex((s) => s.id === id)
const ability = (plan: Plan, id: string) => plan.abilities.findIndex((a) => a.id === id)
const aura = (plan: Plan, id: string) => plan.auras.findIndex((a) => a.id === id)

/** Spell class mask bit `bit` of flag word 0 is set in both rows: one talent's mask names the other's spell. */
const masks = (maskOf: number, spellId: number) => (effect(maskOf, 0).effectSpellClassMask![0] & spell(spellId).classOptions!.spellClassMask![0]) !== 0

describe('Subtlety rows against the Forever client (rogue.md §3.9, §3.10, §3.12)', () => {
  it('Hemorrhage: 35 Energy, 100% of normalized weapon damage, 145% with a dagger, and +15% to your Rupture for 15 s', () => {
    expect(HEMORRHAGE.costTenths).toBe(10 * energyCost(16511))
    expect(effect(16511, 0).effect).toBe(121) // NORMALIZED_WEAPON_DMG
    expect(HEMORRHAGE.flatDamage).toBe(effect(16511, 0).effectBasePointsF ?? 0)
    expect(HEMORRHAGE.weaponPercent).toBe(effect(16511, 3).effectBasePointsF! / 100)
    expect(HEMORRHAGE_DAGGER_PCT).toBe(effect(16511, 4).effectBasePointsF! / 100)
    // Aura 271 on Rupture's class mask: Rupture's damage taken from you.
    expect(effect(16511, 2).effectAura).toBe(271)
    expect(effect(16511, 2).effectSpellClassMask![0] & spell(11275).classOptions!.spellClassMask![0]).not.toBe(0)
    expect(HEMORRHAGE.aura!.mods.bleedDamage).toBe(effect(16511, 2).effectBasePointsF)
    expect(HEMORRHAGE.aura!.durationMs).toBe(spell(16511).duration!.duration)
    expect(HEMORRHAGE.comboPoints).toBe(effect(16511, 1).effectBasePointsF)
  })

  it('Ghostly Strike: 40 Energy, 20 s, 125% of weapon damage (not normalized), 180% with a main-hand dagger', () => {
    expect([GHOSTLY_STRIKE.costTenths, GHOSTLY_STRIKE.cooldownMs]).toEqual([10 * energyCost(14278), spell(14278).cooldowns!.recoveryTime])
    expect(spell(14278).effects.some((e) => e.effect === 121)).toBe(false)
    expect(GHOSTLY_STRIKE.normalized).toBe(false)
    expect(GHOSTLY_STRIKE.weaponPercent).toBe(effect(14278, 0).effectBasePointsF! / 100)
    expect(GHOSTLY_STRIKE_DAGGER_PCT).toBe(effect(14278, 3).effectBasePointsF! / 100)
  })

  it('Ambush rank 6: 60 Energy, 250% of (normalized weapon damage + 116), the tooltip’s “plus 290”, in Cutthroat’s window', () => {
    expect(AMBUSH.costTenths).toBe(10 * energyCost(11269))
    expect(effect(11269, 0).effect).toBe(121)
    expect(AMBUSH.flatDamage).toBe(effect(11269, 0).effectBasePointsF)
    expect(AMBUSH.weaponPercent).toBe(effect(11269, 1).effectBasePointsF! / 100)
    expect(AMBUSH.weaponPercent * AMBUSH.flatDamage).toBe(290)
    expect([AMBUSH.behindOnly, AMBUSH.window]).toEqual([true, CUTTHROAT_WINDOW])
  })

  it('Premeditation: 2 combo points, 2 min, off the GCD, no Stealth needed', () => {
    expect(PREMEDITATION.comboPoints).toBe(effect(14183, 0).effectBasePointsF)
    expect(PREMEDITATION.cooldownMs).toBe(spell(14183).cooldowns!.recoveryTime)
    expect(spell(14183).cooldowns!.startRecoveryTime ?? 0).toBe(PREMEDITATION.gcdMs)
    expect(spell(14183).shapeshift).toBeUndefined()
  })
})

describe('Subtlety talents against the client’s curves (rogue.md §5.3)', () => {
  it('Initiative, Quietus, Cutthroat, Thousand Cuts and Improved Ambush', () => {
    expect(INITIATIVE.slice(1).map((x) => Math.round(100 * x))).toEqual(curve('Initiative'))
    expect(withRogueTalents(AMBUSH, SUBTLETY).bonusComboPointChance).toBe(1)
    expect(withRogueTalents(AMBUSH, SUBTLETY).bonusCrit).toBe(curve('Improved Ambush')[2])
    expect(curve('Quietus').map((_, i) => QUIETUS_PCT_PER_RANK * (i + 1))).toEqual(curve('Quietus'))
    expect(QUIETUS_BELOW_HEALTH_PCT).toBe(effect(1310728, 1).effectBasePointsF)
    expect(curve('Cutthroat').map((_, i) => CUTTHROAT_PCT_PER_RANK * (i + 1))).toEqual(curve('Cutthroat'))
    // Thousand Cuts: 1310721 triggers 1310723, −3 Energy a stack on Backstab and Hemorrhage, 5 stacks, 10 s.
    expect(effect(1310721, 0).effectTriggerSpell).toBe(1310723)
    expect(-10 * effect(1310723, 0).effectBasePointsF!).toBe(THOUSAND_CUTS_TENTHS_PER_STACK)
    expect(10 * curve('Thousand Cuts')[0]).toBe(THOUSAND_CUTS_TENTHS_PER_STACK)
    expect(THOUSAND_CUTS_AURA.maxStacks).toBe(spell(1310723).auraOptions!.cumulativeAura)
    expect(THOUSAND_CUTS_AURA.durationMs).toBe(spell(1310723).duration!.duration)
    expect([masks(1310723, 25300), masks(1310723, 16511), masks(1310723, 11294)]).toEqual([true, true, false])
  })

  it('resolves them onto the rows: Quietus on Sinister Strike, Ghostly Strike and Hemorrhage, Thousand Cuts on Rupture, Backstab and Hemorrhage', () => {
    for (const def of [HEMORRHAGE, GHOSTLY_STRIKE]) expect(withRogueTalents(def, SUBTLETY)).toMatchObject({ lowHealthPct: 10, lowHealthBelowPct: 35 })
    expect(withRogueTalents(BACKSTAB, SUBTLETY).lowHealthPct).toBeUndefined()
    expect(withRogueTalents(RUPTURE, SUBTLETY).tickAuraSpec).toEqual(THOUSAND_CUTS_AURA)
    for (const def of [BACKSTAB, HEMORRHAGE]) expect(withRogueTalents(def, SUBTLETY).costStacks).toEqual({ aura: 'thousandCuts', tenthsPerStack: 30 })
    expect(withRogueTalents(RUPTURE, ranks([['Serrated Blades', 3]])).tickAuraSpec).toBeUndefined()
    // Lethality 3/5 on Hemorrhage and Ghostly Strike, not Ambush.
    expect(withRogueTalents(HEMORRHAGE, SUBTLETY).critMultiplier).toBeCloseTo(1 + 1.12, 12)
    expect(withRogueTalents(AMBUSH, SUBTLETY).critMultiplier).toBe(2)
  })
})

describe('worked examples (rogue.md §9)', () => {
  it('R11: Hemorrhage with a 60–110 dagger at 1,000 AP: 299.3; with Quietus 5/5 below 35%, 329.3', () => {
    const hemo = withRogueTalents({ ...HEMORRHAGE, weaponPercent: HEMORRHAGE_DAGGER_PCT }, SUBTLETY)
    const hit = hemo.weaponPercent * (85 + (1000 / 14) * 1.7)
    expect(hit).toBeCloseTo(299.3, 1)
    expect(hit * (1 + hemo.lowHealthPct! / 100)).toBeCloseTo(329.3, 1)
  })

  it('R12: Ambush with Opportunity 2/2, the same dagger: 886.7, and 2 combo points with Initiative 3/3', () => {
    const ambush = withRogueTalents(AMBUSH, SUBTLETY)
    expect(ambush.weaponPercent * (85 + (1000 / 14) * 1.7 + ambush.flatDamage)).toBeCloseTo(886.7, 1)
    expect(ambush.comboPoints! + ambush.bonusComboPointChance!).toBe(2)
  })

  it('R13: Thousand Cuts: at 3 stacks Backstab costs 51 Energy, at 5 Hemorrhage costs 20', () => {
    expect(BACKSTAB.costTenths - 3 * THOUSAND_CUTS_TENTHS_PER_STACK).toBe(510)
    expect(HEMORRHAGE.costTenths - 5 * THOUSAND_CUTS_TENTHS_PER_STACK).toBe(200)
  })
})

/** The default Subtlety rogue with these settings. */
function subtlety(rotation: Record<string, boolean | number | string> = {}, over: Partial<SimConfig> = {}): SimConfig {
  const base = defaultConfig('rogue-subtlety')
  return { ...base, ...over, rotation: { ...base.rotation, ...rotation } }
}

/** Private engine state a test reads: the cost it would pay now, and an aura's state. */
interface SimInternals {
  costNow(a: number): number
  auraActive: Uint8Array
  auraStacks: Int32Array
  now: number
  abLowAt: Float64Array
}
const internals = (sim: Sim) => sim as unknown as SimInternals

describe('the engine with a Subtlety rogue (rogue.md §8)', () => {
  it('Hemorrhage’s debuff raises each Rupture tick by 15% while it’s on the boss, read at the tick', () => {
    const plan = buildPlan(subtlety()).plan
    const hemo = aura(plan, 'hemorrhage')
    expect(plan.auras[hemo].bleedDamage).toBe(15)
    const ticks = (p: Plan) => {
      const sim = new Sim(p)
      const out: number[] = []
      const up: boolean[] = []
      sim.damageTrace = (s, d) => {
        if (s === row(p, 'rupture')) {
          out.push(d)
          up.push(internals(sim).auraActive[hemo] === 1)
        }
      }
      for (let i = 0; i < 40; i++) sim.runFight(i)
      return { out, up }
    }
    const withIt = ticks(plan)
    // The same fights without the debuff's bonus: the same events, since it draws nothing.
    const without = ticks({ ...plan, auras: plan.auras.map((a, i) => (i === hemo ? { ...a, bleedDamage: 0 } : a)) })
    expect(withIt.out.length).toBe(without.out.length)
    expect(withIt.out.length).toBeGreaterThan(200)
    let raised = 0
    withIt.out.forEach((d, i) => {
      expect(d / without.out[i]).toBeCloseTo(withIt.up[i] ? 1.15 : 1, 9)
      if (withIt.up[i]) raised++
    })
    expect(raised / withIt.out.length).toBeGreaterThan(0.9)
  })

  it('Quietus raises Hemorrhage by 10% from the moment the boss is at 35% health, t = floor(L × 0.65)', () => {
    const plan = buildPlan(subtlety()).plan
    const a = ability(plan, 'hemorrhage')
    expect(plan.abilities[a]).toMatchObject({ lowHealthPct: 10, lowHealthBelowPct: 35 })
    const hits = (p: Plan) => {
      const sim = new Sim(p)
      const out: { d: number; late: boolean }[] = []
      sim.damageTrace = (s, d) => {
        if (s === row(p, 'hemorrhage')) out.push({ d, late: internals(sim).now >= internals(sim).abLowAt[a] })
      }
      const at: number[] = []
      for (let i = 0; i < 20; i++) {
        sim.runFight(i)
        at.push(internals(sim).abLowAt[a] / sim.fightMs)
      }
      return { out, at }
    }
    const on = hits(plan)
    const off = hits({ ...plan, abilities: plan.abilities.map((x, i) => (i === a ? { ...x, lowHealthPct: 0 } : x)) })
    for (const f of on.at) expect(f).toBeCloseTo(0.65, 3)
    expect(on.out.length).toBe(off.out.length)
    expect(on.out.some((x) => x.late) && on.out.some((x) => !x.late)).toBe(true)
    on.out.forEach((x, i) => expect(x.d / off.out[i].d).toBeCloseTo(x.late ? 1.1 : 1, 9))
  })

  it('Thousand Cuts: each Rupture tick adds a stack (5 at most), and Hemorrhage costs 3 Energy less per stack and uses them up', () => {
    const plan = buildPlan(subtlety()).plan
    const tc = aura(plan, 'thousandCuts')
    const hemo = ability(plan, 'hemorrhage')
    expect(plan.auras[tc]).toMatchObject({ maxStacks: 5, durationMs: 10000 })
    expect(plan.abilities[ability(plan, 'rupture')].tickAura).toBe(tc)
    expect(plan.abilities[hemo]).toMatchObject({ costAura: tc, costPerStackTenths: 30 })
    const sim = new Sim(plan)
    const x = internals(sim)
    let cheaper = 0
    let most = 0
    sim.castTrace = (a) => {
      if (a !== hemo) return
      const stacks = x.auraActive[tc] ? x.auraStacks[tc] : 0
      most = Math.max(most, stacks)
      if (stacks > 0) cheaper++
      expect(x.costNow(a)).toBe(350 - 30 * stacks)
    }
    sim.damageTrace = (s) => {
      // A landed Hemorrhage has used the stacks up.
      if (s === row(plan, 'hemorrhage')) expect(x.auraActive[tc]).toBe(0)
    }
    // Counters and aura applications add up over the fights.
    for (let i = 0; i < 30; i++) sim.runFight(i)
    const ticks = counter(sim, row(plan, 'rupture'), FIELD.hits) + counter(sim, row(plan, 'rupture'), FIELD.crits)
    expect(cheaper).toBeGreaterThan(100)
    expect(most).toBeLessThanOrEqual(5)
    // One application (a stack, or a refresh at 5) per Rupture tick.
    expect(sim.auraApplications[tc]).toBe(ticks)
  })

  it('Cutthroat: with Backstab building, 15% of landed Backstabs open the Ambush window, and Ambush is used only in it', () => {
    const plan = buildPlan(subtlety({ 'rogue.subtlety.builder': 'backstab' })).plan
    const window = aura(plan, 'cutthroat')
    const bs = ability(plan, 'backstab')
    expect(plan.abilities[bs]).toMatchObject({ opensAura: window, opensAuraChance: 0.15 })
    expect(plan.abilities[ability(plan, 'ambush')].window).toBe(window)
    const sim = new Sim(plan)
    // Counters and aura applications add up over the fights.
    for (let i = 0; i < 400; i++) sim.runFight(i)
    const b = row(plan, 'backstab')
    const landed = counter(sim, b, FIELD.hits) + counter(sim, b, FIELD.crits) + counter(sim, b, FIELD.blocks)
    const ambushes = counter(sim, row(plan, 'ambush'), FIELD.casts)
    const opened = sim.auraApplications[window]
    // Binomial: 15% of about 10,000 Backstabs, within 4 standard errors.
    expect(Math.abs(opened / landed - 0.15)).toBeLessThan(4 * Math.sqrt((0.15 * 0.85) / landed))
    // Each window gives at most one Ambush; the finishers before it in the list let about a third of
    // them run out while Energy builds to its 60.
    expect(ambushes).toBeLessThanOrEqual(opened)
    expect(ambushes / opened).toBeGreaterThan(0.55)
  })

  it('gives the same result for the same config and seed (decision D15)', () => {
    const plan = buildPlan(subtlety({ 'rogue.subtlety.builder': 'backstab', 'rogue.subtlety.ghostlyStrike.enabled': true })).plan
    const run = () => {
      const sim = new Sim(plan)
      for (let i = 0; i < 30; i++) sim.runFight(i)
      return [Array.from(sim.counters), Array.from(sim.auraUpMs), sim.totalEnergyGainedTenths]
    }
    expect(run()).toEqual(run())
  })
})

describe('the Subtlety priority list (rogue.md §6.3)', () => {
  const context = { race: 'alliance-human', items: [], consumables: [THISTLE_TEA], weaponTypes: ['dagger', 'dagger'] as const }
  const ids = (rot: ReturnType<typeof subtletyRotation>) => rot.rotation.map((e) => rot.abilities[e.ability].id)

  it('by default: Thistle Tea, Premeditation, Slice and Dice, Rupture at 3, Eviscerate at 5, Hemorrhage for its debuff, then to build', () => {
    const rot = subtletyRotation({}, SUBTLETY, context)
    expect(ids(rot)).toEqual(['thistleTea', 'premeditation', 'sliceAndDice', 'rupture', 'eviscerate', 'hemorrhage', 'hemorrhage'])
    expect(rot.rotation[1].conditions).toEqual([{ code: COND.maxComboPoints, a: 3, b: 0 }])
    const rupture = rot.rotation[3].ability
    expect(rot.rotation[3].conditions).toEqual([
      { code: COND.minComboPoints, a: 3, b: 0 },
      { code: COND.abilityAuraRefresh, a: rupture, b: 0 },
      { code: COND.timeLeftAtLeast, a: 10000, b: 0 },
    ])
    expect(rot.rotation[4].conditions).toEqual([{ code: COND.minComboPoints, a: 5, b: 0 }])
    const hemo = rot.rotation[5].ability
    expect(rot.rotation[5].conditions).toEqual([
      { code: COND.abilityAuraUp, a: rupture, b: 0 },
      { code: COND.abilityAuraRefresh, a: hemo, b: 0 },
    ])
    // With a dagger in the main hand, 145%.
    expect(rot.abilities[hemo].weaponPercent).toBeCloseTo(HEMORRHAGE_DAGGER_PCT, 12)
    expect(subtletyMaintainedBuffs({})).toEqual([])
  })

  it('with Backstab building: Ambush in Cutthroat’s window, Ghostly Strike when on, Backstab from behind with a dagger', () => {
    const values = { 'rogue.subtlety.builder': 'backstab', 'rogue.subtlety.ghostlyStrike.enabled': true }
    const rot = subtletyRotation(values, SUBTLETY, context)
    expect(ids(rot)).toEqual(['thistleTea', 'premeditation', 'sliceAndDice', 'rupture', 'eviscerate', 'hemorrhage', 'ambush', 'ghostlyStrike', 'backstab'])
    expect(rot.abilities.find((a) => a.id === 'backstab')!.opensWindow).toEqual({ aura: CUTTHROAT_WINDOW, chance: 0.15 })
    expect(rot.abilities.find((a) => a.id === 'ghostlyStrike')!.weaponPercent).toBeCloseTo(GHOSTLY_STRIKE_DAGGER_PCT, 12)
    // From the front, or without a main-hand dagger, Hemorrhage builds, and there's no Ambush.
    expect(ids(subtletyRotation(values, SUBTLETY, { ...context, front: true })).slice(-2)).toEqual(['ghostlyStrike', 'hemorrhage'])
    const sword = subtletyRotation(values, SUBTLETY, { ...context, weaponTypes: ['sword', 'dagger'] })
    expect(ids(sword).slice(-2)).toEqual(['ghostlyStrike', 'hemorrhage'])
    expect(sword.abilities.find((a) => a.id === 'ghostlyStrike')!.weaponPercent).toBe(GHOSTLY_STRIKE.weaponPercent)
    expect(sword.abilities.find((a) => a.id === 'hemorrhage')!.weaponPercent).toBe(HEMORRHAGE.weaponPercent)
  })

  it('leaves out what its talents don’t give: Sinister Strike builds without Hemorrhage', () => {
    expect(ids(subtletyRotation({ 'rogue.subtlety.ghostlyStrike.enabled': true }, ranks([['Malice', 5]]), context))).toEqual(['thistleTea', 'sliceAndDice', 'rupture', 'eviscerate', 'backstab'])
    expect(ids(subtletyRotation({}, ranks([['Malice', 5]]), { ...context, front: true })).at(-1)).toBe('sinisterStrike')
    expect(subtletyMaintainedBuffs({ 'rogue.subtlety.exposeArmor.enabled': true })).toEqual(['exposeArmor'])
    expect(SUBTLETY_OPTIONS.find((o) => o.id === 'rogue.subtlety.builder')).toMatchObject({ kind: 'choice', default: 'hemorrhage' })
    // With Hemorrhage building, Ambush and the debuff line say they're unused.
    expect(Object.keys(subtletyUnusedSettings({}))).toEqual(['rogue.subtlety.ambush.enabled', 'rogue.subtlety.hemorrhage.enabled'])
    expect(subtletyUnusedSettings({ 'rogue.subtlety.builder': 'backstab' })).toEqual({})
  })
})

function runFights(plan: Plan, fights: number): Aggregate {
  const sim = new Sim(plan)
  let agg = emptyAggregate(plan.sources.length, plan.auras.length)
  for (let k = 0; k * CHUNK_SIZE < fights; k++) agg = mergeChunk(agg, runChunk(plan, k, Math.min(CHUNK_SIZE, fights - k * CHUNK_SIZE), sim))
  return agg
}

describe('golden run (fixed config and seed)', () => {
  // Snapshot history (update only deliberately, and say why here):
  // - R1: the default Subtlety rogue (rogue.md §6.3, §7): daggers, Deadly Poison V on the main hand and
  //   Instant Poison VI on the off hand, Hemorrhage building, Premeditation, Slice and Dice at 2 points,
  //   Rupture at 3, Eviscerate at 5, Ghostly Strike off; 504.7 DPS over 20,000 fights on seed 2703.
  // - Guild test (2026-09-25): Eviscerate gains 4% of attack power per point, not 3% (rogue.md §3.4);
  //   Rupture's 1/2/3% a tick unchanged. 504.7 → 505.2 DPS (+0.1%) over 20,000 fights on seed 2703.
  // - Guild test (2026-09-25): the poisons gain attack power, Instant Poison 0.5% a hit and Deadly
  //   Poison 0.1125% a stack each tick [F], read at the tick and scaled by Vile Poisons [?] (rogue.md
  //   §4.1, §4.2). 505.2 → 508.1 DPS (+0.6%) over 20,000 fights on seed 2703 (505.3 → 508.1 on 2701).
  it('keeps the default Subtlety rogue’s result unchanged', () => {
    const bundle = buildPlan({ ...defaultConfig('rogue-subtlety'), run: { mode: 'fixed', iterations: 1000, seed: 12345 } })
    const result = toResult(bundle, runFights(bundle.plan, 1000), 0)
    expect({
      dps: result.dps,
      durationSec: result.durationSec,
      abilities: result.abilities.map((a) => [a.id, a.damage, a.casts, a.hits, a.crits, a.misses, a.dodges, a.glances]),
    }).toMatchSnapshot()
  })
})
