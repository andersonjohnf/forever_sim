// The Elemental shaman's worked examples through the engine (docs/classes/shaman.md#elemental-worked-examples),
// its priority list, mana, casting from range, buffs and the Enhancement shaman's move onto the caster
// core. The examples' inputs are synthetic (test-helpers.ts `elementalPlan`): no gear or buffs, spell
// damage set exactly, spells that land and never crit.
import { describe, expect, it } from 'vitest'
import { defaultConfig } from '../../defaults'
import { BUFFS_BY_ID } from '../../effects/buffs'
import { buffUnusedReason, forSpecClass, presetBuffIds } from '../../effects/presets'
import { FIELD, FIELD_COUNT, Sim } from '../../engine/sim'
import { expectMean } from '../../engine/test-helpers'
import { buildPlan } from '../../plan/build'
import { COND, type Plan } from '../../plan/types'
import { toResult, emptyAggregate, mergeChunk } from '../../run/aggregate'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { FULL_RAID } from '../../defaults'
import { LIGHTNING_BOLT, RAGE_OF_THE_FARSEER } from './abilities'
import { ELEMENTAL_IDS as ID, MANA_TIDE_MANA } from './elemental'
import { withTalents } from './talents'
import { abilityOf, auraOf, damagesOf, ELE, elementalPlan, events, procOf, row } from './test-helpers'

/** The level-63 boss's average partial resist for a level-60 caster: 0.75 × 24 / 300 (combat-tables §9). */
const RESIST = 0.94
/** The worked examples' spell damage. */
const SP = 400
/** No Elemental Focus or Lightning Overload: exact damage and mana. */
const NO_PROCS = ['elementalFocus', 'lightningOverload', 'lightningOverloadChain', 'lightningOverloadRank4']
const spellOf = (plan: Plan, id: string) => {
  const s = plan.spells!.find((x) => plan.sources[x.source].id === id)
  expect(s, id).toBeDefined()
  return s!
}
const counter = (sim: Sim, plan: Plan, id: string, field: number) => sim.counters[row(plan, id) * FIELD_COUNT + field]
const ability = (plan: Plan, id: string) => plan.abilities[abilityOf(plan, id)]
/** Every use of an ability in one fight, by time. */
const uses = (plan: Plan, id: string, fight = 0) =>
  events(plan, fight)
    .list.filter((e) => e.kind === 'use' && e.id === id)
    .map((e) => e.t)

describe('worked example 1: Lightning Bolt rank 10', () => {
  it('deals (189.38–210.62 + 0.714 × SP) × 1.05 × 0.94: 468.81–489.77, 479.29 at SP 400; costs 198 and casts in 2.0 s', () => {
    const plan = elementalPlan({ dropProcs: NO_PROCS })
    expect(ability(plan, 'lightningBolt')).toMatchObject({ costTenths: 1980, castMs: 2000, castHasted: true, clearcastable: true })
    const lb = damagesOf(plan, 'lightningBolt', 20)
    expect(Math.min(...lb)).toBeGreaterThanOrEqual((189.3814893 + 0.714 * SP) * 1.05 * RESIST - 1e-6)
    expect(Math.max(...lb)).toBeLessThanOrEqual((210.6185107 + 0.714 * SP) * 1.05 * RESIST + 1e-6)
    expectMean(lb, 479.2872)
    // Back to back: nothing else in the list, and the cast holds the GCD.
    const t = uses(plan, 'lightningBolt')
    for (let i = 1; i < t.length; i++) expect(t[i] - t[i - 1]).toBe(2000)
  })

  it('crits for ×2.0 with Elemental Fury 5/5: 958.57', () => {
    const plan = elementalPlan({ dropProcs: NO_PROCS })
    plan.stats.spellCrit = 100
    Object.assign(spellOf(plan, 'lightningBolt'), { min: 200, max: 200 })
    for (const d of damagesOf(plan, 'lightningBolt')) expect(d).toBeCloseTo(958.5744, 9)
  })

  it('casts in 1,818 ms with a Troll’s Berserking (+10% casting speed), and back to 2,000 ms after its 10 s', () => {
    const plan = elementalPlan({ dropProcs: NO_PROCS, race: 'horde-troll', rotation: { [ID.racial]: true } })
    expect(plan.auras[auraOf(plan, 'berserking')]).toMatchObject({ castHaste: 10, haste: 10 })
    const t = uses(plan, 'lightningBolt')
    expect(t.slice(0, 3)).toEqual([0, 1818, 3636])
    const late = t.filter((x) => x > 12000)
    expect(late[1] - late[0]).toBe(2000)
  })

  it('adds Totem of the Storm’s 33 spell damage × 0.714 = 23.56 to the base (502.54 on average)', () => {
    const base = spellOf(elementalPlan(), 'lightningBolt')
    const d = defaultConfig(ELE)
    const withRelic = buildPlan({ ...d, gear: { ranged: { itemId: 23199 } } }).plan
    const bare = buildPlan({ ...d, gear: {} }).plan
    expect(spellOf(withRelic, 'lightningBolt').min - spellOf(bare, 'lightningBolt').min).toBeCloseTo(23.562, 9)
    expect(spellOf(withRelic, 'chainLightning').max - spellOf(bare, 'chainLightning').max).toBeCloseTo(18.843, 9)
    expect(base.min).toBeCloseTo(189.3814893, 6)
    expect(buildPlan({ ...d, gear: { ranged: { itemId: 23199 } } }).assumptions.map((a) => a.id)).toContain('totemOfTheStorm')
  })
})

describe('worked example 2: Lightning Bolt rank 4', () => {
  it('deals (55.22–62.78 + 0.714 × SP) × 1.05 × 0.94 = 340.12 at SP 400 for 54 mana, in 2.0 s', () => {
    const plan = elementalPlan({ dropProcs: NO_PROCS, rotation: { [ID.boltDownrank]: true, [ID.boltMaxRank]: 100 } })
    // Rank 4 alone: the rank 10 lines out.
    plan.rotation = plan.rotation.filter((e) => plan.abilities[e.ability].id !== 'lightningBolt')
    expect(ability(plan, 'lightningBoltRank4')).toMatchObject({ costTenths: 540, castMs: 2000, castHasted: true })
    const r4 = damagesOf(plan, 'lightningBoltRank4', 20)
    expect(Math.min(...r4)).toBeGreaterThanOrEqual((55.2247191 + 0.714 * SP) * 1.05 * RESIST - 1e-6)
    expect(Math.max(...r4)).toBeLessThanOrEqual((62.7752809 + 0.714 * SP) * 1.05 * RESIST + 1e-6)
    expectMean(r4, 340.1202)
  })
})

describe('worked example 3: Chain Lightning', () => {
  it('deals (119.17–132.83 + 0.571 × SP) × 1.05 × 0.94 = 349.79 on one target for 436 mana, a 1.5 s cast and a 6 s cooldown', () => {
    const plan = elementalPlan({ dropProcs: NO_PROCS, rotation: { [ID.chainLightning]: 'cooldown' } })
    expect(ability(plan, 'chainLightning')).toMatchObject({ costTenths: 4360, castMs: 1500, cooldownMs: 6000, castHasted: true })
    const cl = damagesOf(plan, 'chainLightning', 40)
    expect(Math.min(...cl)).toBeGreaterThanOrEqual((119.166666735 + 0.571 * SP) * 1.05 * RESIST - 1e-6)
    expect(Math.max(...cl)).toBeLessThanOrEqual((132.833333265 + 0.571 * SP) * 1.05 * RESIST + 1e-6)
    expectMean(cl, 349.7928)
    // On its cooldown, between Lightning Bolts: 6 s from its cast's end.
    const t = uses(plan, 'chainLightning')
    expect(t[0]).toBe(0)
    expect(t[1]).toBeGreaterThanOrEqual(7500)
  })
})

describe('worked example 4: Flame Shock', () => {
  const plan = () => elementalPlan({ dropProcs: NO_PROCS, rotation: { [ID.flameShock]: true } })

  it('deals 271.98 at once and 90.80 at 3, 6, 9 and 12 s (Call of Flame +15%), costs 369 and shares a 5.2 s cooldown', () => {
    const p = plan()
    expect(ability(p, 'flameShock')).toMatchObject({ costTenths: 3690, cooldownMs: 5200, category: 'shock', clearcastable: true })
    const { list } = events(p)
    const hits = list.filter((e) => e.kind === 'damage' && e.id === 'flameShock')
    const ticks = list.filter((e) => e.kind === 'damage' && e.id === 'flameShockDot')
    expect(hits[0]).toMatchObject({ t: 0 })
    expect(hits[0].value).toBeCloseTo((166 + 0.214 * SP) * 1.15 * RESIST, 9)
    expect(ticks.slice(0, 4).map((e) => e.t)).toEqual([3000, 6000, 9000, 12000])
    for (const e of ticks) expect(e.value).toBeCloseTo((44 + 0.1 * SP) * 1.15 * RESIST, 9)
    // Kept up: recast once its last tick at 12 s ends it, as soon as the Lightning Bolt cast from
    // 11.5 s lands (13.5 s), no sooner.
    expect(hits[1].t).toBe(13500)
  })

  it('its ticks crit ×2.0 at the snapshot’s spell crit (the periodic-crit flag): 181.61', () => {
    const p = plan()
    p.stats.spellCrit = 100
    const ticks = damagesOf(p, 'flameShockDot')
    expect(ticks.length).toBeGreaterThan(10)
    for (const d of ticks) expect(d).toBeCloseTo(90.804 * 2, 9)
  })
})

describe('worked example 5: Lava Burst', () => {
  it('deals (192.14–247.86 + 0.714 × SP) × 1.15 × 0.94 = 546.55 on average, 238 mana, 2.0 s, 10 s cooldown', () => {
    const plan = elementalPlan({ dropProcs: NO_PROCS, rotation: { [ID.lavaBurst]: true } })
    expect(ability(plan, 'lavaBurst')).toMatchObject({ costTenths: 2380, castMs: 2000, cooldownMs: 10000, castHasted: true })
    const lvb = damagesOf(plan, 'lavaBurst', 40)
    expect(Math.min(...lvb)).toBeGreaterThanOrEqual((192.1415265 + 0.714 * SP) * 1.15 * RESIST - 1e-6)
    expect(Math.max(...lvb)).toBeLessThanOrEqual((247.8584735 + 0.714 * SP) * 1.15 * RESIST + 1e-6)
    expectMean(lvb, 546.5536)
  })

  it('deals 20% more while your Flame Shock is on the boss, 655.86, and leaves it up', () => {
    const plan = elementalPlan({ dropProcs: NO_PROCS, rotation: { [ID.lavaBurst]: true, [ID.flameShock]: true } })
    Object.assign(spellOf(plan, 'lavaBurst'), { min: 220, max: 220 })
    const { list } = events(plan)
    // Flame Shock at 0 (instant), Lava Burst from 1.5 s, landing at 3.5 s: its DoT is up.
    expect(list.filter((e) => e.kind === 'use').slice(0, 3).map((e) => [e.id, e.t])).toEqual([
      ['flameShock', 0],
      ['lavaBurst', 1500],
      ['lightningBolt', 3500],
    ])
    const lvb = list.filter((e) => e.kind === 'damage' && e.id === 'lavaBurst')
    expect(lvb[0].value).toBeCloseTo(546.5536 * 1.2, 9)
    // The DoT keeps ticking after it.
    expect(list.some((e) => e.kind === 'damage' && e.id === 'flameShockDot' && e.t === 6000)).toBe(true)
    // Without Flame Shock on the boss (after it ran out and before its recast), no boost.
    const flat = elementalPlan({ dropProcs: NO_PROCS, rotation: { [ID.lavaBurst]: true } })
    Object.assign(spellOf(flat, 'lavaBurst'), { min: 220, max: 220 })
    for (const d of damagesOf(flat, 'lavaBurst')) expect(d).toBeCloseTo(546.5536, 9)
  })

  it('with “only with Flame Shock”, waits for it', () => {
    const plan = elementalPlan({ dropProcs: NO_PROCS, rotation: { [ID.lavaBurst]: true, [ID.lavaBurstFlameShock]: true, [ID.flameShock]: true } })
    const line = plan.rotation.find((e) => plan.abilities[e.ability].id === 'lavaBurst')!
    expect(line.conditions).toEqual([{ code: COND.abilityAuraUp, a: abilityOf(plan, 'flameShock'), b: 0 }])
  })
})

describe('worked example 6: Lightning Overload', () => {
  it('10% at 3/3 of landed bolts cast a half-damage copy (240.04 from rank 10) that costs nothing, makes no threat and triggers nothing', () => {
    const plan = elementalPlan({ dropProcs: ['elementalFocus'] })
    const proc = procOf(plan, 'lightningOverload')
    expect(proc.chance).toEqual([0.1, 0.1])
    proc.chance = [1, 1]
    const spell = spellOf(plan, 'lightningOverload')
    expect(spell).toMatchObject({ threatMult: 0, triggersProcs: false })
    const lo = damagesOf(plan, 'lightningOverload', 20)
    expectMean(lo, 240.0384)
    const sim = new Sim(plan)
    sim.runFight(0)
    expect(counter(sim, plan, 'lightningOverload', FIELD.casts)).toBe(counter(sim, plan, 'lightningBolt', FIELD.hits))
    expect(sim.counters[row(plan, 'lightningOverload') * FIELD_COUNT + FIELD.threat]).toBe(0)
    expect(sim.totalManaSpentTenths).toBe(1980 * counter(sim, plan, 'lightningBolt', FIELD.casts))
  })
})

describe('worked example 7: Clearcasting', () => {
  it('10% of landed Fire, Frost and Nature spells; the next spell costs nothing, so with a 100% chance only the first costs', () => {
    const plan = elementalPlan({ dropProcs: ['lightningOverload'] })
    const proc = procOf(plan, 'elementalFocus')
    expect(proc.chance).toEqual([0.1, 0.1])
    expect(plan.freeCastAura).toBe(auraOf(plan, 'elementalClearcasting'))
    proc.chance = [1, 1]
    const { sim } = events(plan)
    expect(counter(sim, plan, 'lightningBolt', FIELD.casts)).toBeGreaterThan(20)
    expect(sim.totalManaSpentTenths).toBe(1980)
  })

  it('Chain Lightning “with Clearcasting” waits for it', () => {
    const plan = elementalPlan({ dropProcs: ['lightningOverload'], rotation: { [ID.chainLightning]: 'clearcasting' } })
    const line = plan.rotation.find((e) => plan.abilities[e.ability].id === 'chainLightning')!
    expect(line.conditions).toEqual([{ code: COND.auraUp, a: auraOf(plan, 'elementalClearcasting'), b: 0 }])
    const { sim } = events(plan)
    const cl = counter(sim, plan, 'chainLightning', FIELD.casts)
    expect(cl).toBeGreaterThan(0)
    expect(cl).toBeLessThan(counter(sim, plan, 'lightningBolt', FIELD.casts) / 5)
  })
})

describe('worked example 8: mana', () => {
  const bundle = buildPlan(defaultConfig(ELE))

  it('the default setup: 4,975 mana, 52.6 Spirit regeneration a tick (Spirit 188), 50% of it while casting (Mindfulness 3/3), 24.4 mp5 a tick (Blessing of Wisdom r5’s 36 + Mana Spring’s 25)', () => {
    expect([bundle.sheet.mana, bundle.sheet.spirit]).toEqual([4975, 188])
    expect(bundle.plan.mana).toEqual({ maxTenths: 49750, regenTickTenths: 526, fiveSecondRuleMs: 5000, mp5TickTenths: 244, inFsrShare: 0.5 })
  })

  it('Mana Tide Totem restores 1,160 in 4 ticks of 290, 3 s apart, for 60 mana and a 1 s GCD', () => {
    expect(MANA_TIDE_MANA).toBe(1160)
    expect(ability(bundle.plan, 'manaTideTotem')).toMatchObject({ resource: 'mana', costTenths: 600, gcdMs: 1000, cooldownMs: 300000, rageTickTenths: 2900, rageTicks: 4, rageTickMs: 3000 })
    // Once a 3-minute fight (its 5 min cooldown), all 1,160 of it.
    const fights = 200
    const b = buildPlan({ ...defaultConfig(ELE), run: { mode: 'fixed', iterations: fights, seed: 5 } })
    const sim = new Sim(b.plan)
    const agg = mergeChunk(emptyAggregate(b.plan.sources.length, b.plan.auras.length), runChunk(b.plan, 0, fights, sim))
    expect(toResult(b, agg, 0).mana!.restored.find((r) => r.id === 'manaTideTotem')!.perFight).toBeCloseTo(1160, 9)
    expect(counter(sim, b.plan, 'manaTideTotem', FIELD.casts)).toBe(fights)
  })

  it('downranks with the defaults: rank 10 with Clearcasting or at 10% mana (497.5) or more, rank 4 below', () => {
    const p = bundle.plan
    const lines = p.rotation.filter((e) => p.abilities[e.ability].id.startsWith('lightningBolt')).map((e) => [p.abilities[e.ability].id, e.conditions])
    expect(lines).toEqual([
      ['lightningBolt', [{ code: COND.auraUp, a: auraOf(p, 'elementalClearcasting'), b: 0 }]],
      ['lightningBolt', [{ code: COND.minMana, a: 4975, b: 0 }]],
      ['lightningBoltRank4', []],
    ])
  })
})

describe('the Elemental priority list (shaman.md "Elemental priority")', () => {
  it('builds the defaults in order: racial, Mana Tide at 3,000 missing, the potion, Flame Shock, Lava Burst, Chain Lightning with Clearcasting, Lightning Bolt', () => {
    const p = buildPlan(defaultConfig(ELE)).plan
    expect(p.rotation.map((e) => p.abilities[e.ability].id)).toEqual([
      'bloodFury',
      'manaTideTotem',
      'majorManaPotion',
      'flameShock',
      'lavaBurst',
      'chainLightning',
      'lightningBolt',
      'lightningBolt',
      'lightningBoltRank4',
    ])
    const tide = p.rotation.find((e) => p.abilities[e.ability].id === 'manaTideTotem')!
    expect(tide.conditions).toEqual([{ code: COND.maxMana, a: 49750 - 30000, b: 0 }])
    const fs = p.rotation.find((e) => p.abilities[e.ability].id === 'flameShock')!
    expect(fs.conditions).toEqual([{ code: COND.abilityAuraDown, a: abilityOf(p, 'flameShock'), b: 0 }])
  })

  it('gives an Orc the caster’s Blood Fury, +10% spell damage while it’s up, and a Troll the caster’s Berserking', () => {
    const orc = buildPlan(defaultConfig(ELE))
    expect(orc.plan.auras[auraOf(orc.plan, 'bloodFury')]).toMatchObject({ apPct: 10, spellDamagePct: 10 })
    expect(orc.plan.auras[auraOf(orc.plan, 'bloodFury')].spellDamage ?? 0).toBe(0)
    expect(orc.assumptions.map((a) => a.id)).toContain('bloodFurySpellPower')
    const troll = buildPlan(defaultConfig(ELE, 'horde-troll')).plan
    expect(troll.auras[auraOf(troll, 'berserking')]).toMatchObject({ castHaste: 10 })
  })

  it('never swings: the plan has no weapon, though the weapon’s stats count', () => {
    const d = defaultConfig(ELE)
    const bundle = buildPlan(d)
    expect(bundle.plan.weapons).toEqual([null, null])
    const { list } = events(bundle.plan)
    expect(list.some((e) => e.kind === 'swing')).toBe(false)
    const unarmed = buildPlan({ ...d, gear: { ...d.gear, mainHand: undefined } })
    // Mindfang's 94 spell power, and the Brilliant Wizard Oil on it (36; buffs doc §3.6).
    expect(bundle.sheet.spell!.caster!.schoolDamage.nature - unarmed.sheet.spell!.caster!.schoolDamage.nature).toBe(94 + 36)
    const ids = bundle.assumptions.map((a) => a.id)
    for (const id of ['foreverHitTable', 'foreverGlancing', 'critSuppression', 'hasteNextSwing', 'noWeaponShaman', 'lightningBoltCast', 'manaRegenShaman', 'shamanTotems']) expect(ids).not.toContain(id)
    for (const id of ['elementalSpells', 'manaRegenElemental', 'elementalFocus', 'lightningOverload', 'manaTideTotem', 'lightningBoltDownrank', 'elementalTotems', 'reactionTimeMana']) expect(ids).toContain(id)
  })

  it('counts Nature-only spell damage on gear for Nature spells only (Sash of the Windreaver’s 29)', () => {
    // The sash is event-only (GV-6), so off the default; a player can still wear it.
    const d = defaultConfig(ELE)
    const sheet = buildPlan({ ...d, gear: { ...d.gear, waist: { itemId: 18676 } } }).sheet.spell!.caster!.schoolDamage
    expect(sheet.nature - sheet.fire).toBe(29)
    expect(sheet.frost).toBe(sheet.fire)
  })

  it('is deterministic: the same config and seed give the same result', () => {
    const run = () => {
      const bundle = buildPlan({ ...defaultConfig(ELE), run: { mode: 'fixed', iterations: 500, seed: 99 } })
      const sim = new Sim(bundle.plan)
      let agg = emptyAggregate(bundle.plan.sources.length, bundle.plan.auras.length)
      agg = mergeChunk(agg, runChunk(bundle.plan, 0, Math.min(CHUNK_SIZE, 500), sim))
      return toResult(bundle, agg, 0)
    }
    const a = run()
    expect(run()).toEqual(a)
    expect(a.mana!.restored.map((r) => r.id)).toContain('manaTideTotem')
  })
})

describe('the Elemental shaman’s buffs (buffs doc §6.2, §6.3)', () => {
  it('gets the casters’ and mana entries in the Standard raid, and no Windfury Totem', () => {
    const raid = presetBuffIds('raid', ELE, FULL_RAID)
    for (const id of ['curseOfTheElements', 'greaterArcaneElixir', 'majorManaPotion', 'manaSpringTotem', 'arcaneBrilliance', 'blessingOfWisdom']) expect(raid).toContain(id)
    for (const id of ['windfuryTotem', 'elixirOfTheMongoose', 'jujuPower', 'powerInfusion']) expect(raid).not.toContain(id)
    const max = presetBuffIds('max', ELE, FULL_RAID)
    for (const id of ['flaskOfSupremePower', 'demonicRune']) expect(max).toContain(id)
    expect(presetBuffIds('dungeon', ELE, FULL_RAID)).toContain('manaSpringTotem')
  })

  it('leaves the melee entries out (stones, Windfury Totem): it never swings; the Enhancement shaman’s stones stay locked by its imbue', () => {
    for (const id of ['denseSharpeningStone', 'elementalSharpeningStone', 'windfuryTotem']) expect(forSpecClass(BUFFS_BY_ID.get(id)!, ELE), id).toBe(false)
    expect(buffUnusedReason(BUFFS_BY_ID.get('denseSharpeningStone')!, 'shaman-enhancement')).toBe('Not used: your weapon imbue is your main hand’s temporary enchant')
  })

  it('presses Power Infusion on cooldown when it’s selected in Buffs', () => {
    const d = defaultConfig(ELE)
    const p = buildPlan({ ...d, buffs: { ...d.buffs, enabled: [...d.buffs.enabled, 'powerInfusion'] } }).plan
    expect(p.rotation.map((e) => p.abilities[e.ability].id)).toContain('powerInfusion')
  })
})

describe('the Enhancement shaman on the caster core (shaman.md "Enhancement on the core")', () => {
  it('hastes its Lightning Bolt; Rage of the Farseer is attack speed only since 1.60.1.70009', () => {
    expect(withTalents(LIGHTNING_BOLT, new Map()).castHasted).toBe(true)
    expect(RAGE_OF_THE_FARSEER.aura!.mods).toEqual({ haste: 30 })
  })

  it('counts a Nature-only line on gear: the Sash of the Windreaver’s 29 for its Nature spells', () => {
    const d = defaultConfig('shaman-enhancement')
    const plan = buildPlan({ ...d, gear: { ...d.gear, waist: { itemId: 18676 } } }).plan
    const base = buildPlan(d).plan
    const sp = (p: Plan) => new Sim(p).inspect().schoolSpellDamage
    expect(sp(plan)[3] - sp(plan)[1]).toBe(29)
    expect(sp(base)[3]).toBe(sp(base)[1])
  })
})
