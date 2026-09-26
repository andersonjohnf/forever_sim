// The results model (docs/ux.md#results): "Cooldowns and buffs" (casts per fight and uptimes of
// what deals no damage), bleed rows (applications and ticks) and what each row counts, from merged
// chunk results.
import { describe, expect, it } from 'vitest'
import { BLOOD_FURY, BLOODRAGE, REND } from '../classes/warrior/abilities'
import { defaultConfig } from '../defaults'
import { CHUNK_SIZE, runChunk } from '../engine/chunk'
import { FIELD, FIELD_COUNT, Sim } from '../engine/sim'
import { addAbility, addAura, armsPlan } from '../engine/test-helpers'
import { buildPlan } from '../plan/build'
import type { Plan } from '../plan/types'
import { SPEC_IDS } from '../specs'
import type { SimConfig, SimResult, SpecId } from '../types'
import { type Aggregate, cooldownResults, emptyAggregate, mergeChunk, rowUnit, toResult } from './aggregate'

function run(config: SimConfig, fights = 1000): SimResult {
  const bundle = buildPlan({ ...config, run: { mode: 'fixed', iterations: fights, seed: 3 } })
  const sim = new Sim(bundle.plan)
  let agg = emptyAggregate(bundle.plan.sources.length, bundle.plan.auras.length)
  for (let k = 0; k * CHUNK_SIZE < fights; k++) agg = mergeChunk(agg, runChunk(bundle.plan, k, CHUNK_SIZE, sim))
  return toResult(bundle, agg, 0)
}

const row = (result: SimResult, id: string) => result.cooldowns.find((r) => r.id === id)

describe('Cooldowns and buffs', () => {
  /** Blood Fury (a cast with a buff), Bloodrage (a cast without one), a proc's buff and Rend's marker. */
  function handPlan(): { plan: Plan; agg: Aggregate } {
    const plan = armsPlan(100000)
    plan.auras = []
    const bf = addAbility(plan, BLOOD_FURY)
    const br = addAbility(plan, BLOODRAGE)
    addAbility(plan, REND)
    addAura(plan, { id: 'flurry', name: 'Flurry', durationMs: 15000, mods: {} })
    const agg = emptyAggregate(plan.sources.length, plan.auras.length)
    agg.fights = 4
    agg.durationMs = 400000
    agg.counters[plan.abilities[bf].source * FIELD_COUNT + FIELD.casts] = 4
    agg.counters[plan.abilities[br].source * FIELD_COUNT + FIELD.casts] = 6
    agg.auraUpMs[plan.abilities[bf].aura] = 60000
    agg.auraUpMs[plan.auras.findIndex((a) => a.id === 'flurry')] = 100000
    agg.auraUpMs[plan.auras.findIndex((a) => a.id === 'rend')] = 350000
    return { plan, agg }
  }

  it('lists the casts in the rotation’s order with casts per fight and their buff’s uptime, then the other buffs', () => {
    const { plan, agg } = handPlan()
    expect(cooldownResults(plan, agg)).toEqual([
      { id: 'bloodFury', name: 'Blood Fury', icon: BLOOD_FURY.icon, uptimePct: 15, castsPerFight: 1 },
      { id: 'bloodrage', name: 'Bloodrage', icon: BLOODRAGE.icon, uptimePct: null, castsPerFight: 1.5 },
      { id: 'flurry', name: 'Flurry', icon: 'x', uptimePct: 25, castsPerFight: null },
    ])
  })

  it('leaves out a bleed’s marker (it’s on the boss) and damaging abilities', () => {
    const { plan, agg } = handPlan()
    const ids = cooldownResults(plan, agg).map((r) => r.id)
    expect(ids).not.toContain('rend')
  })

  it('reports nothing up and no casts before any fight is merged', () => {
    const { plan } = handPlan()
    const rows = cooldownResults(plan, emptyAggregate(plan.sources.length, plan.auras.length))
    expect(rows.map((r) => [r.uptimePct, r.castsPerFight])).toEqual([
      [0, 0],
      [null, 0],
      [0, null],
    ])
  })

  it('shows the default Fury warrior’s cooldowns, Battle Shout, potion and procs, but no damage rows', () => {
    const result = run(defaultConfig('warrior-fury'))
    expect(result.cooldowns.map((r) => r.name)).toEqual([
      'Battle Shout',
      'Death Wish',
      'Recklessness',
      'Bloodrage',
      'Mighty Rage Potion',
      'Holy Strength (main hand)',
      'Holy Strength (off hand)',
      'Enrage',
      'Flurry',
      // The Overpower dance's window (on by default since M2.5b, warrior.md §5.2 row 10).
      'Overpower window',
    ])
    expect(row(result, 'overpowerWindow')!.uptimePct).toBeGreaterThan(0)
    // Death Wish (3 min) once or twice in a 162–198 s fight, 30 s each; Recklessness once for 15 s.
    expect(row(result, 'deathWish')!.castsPerFight).toBeGreaterThan(1)
    expect(row(result, 'deathWish')!.castsPerFight).toBeLessThan(2)
    expect(row(result, 'deathWish')!.uptimePct).toBeGreaterThan(15)
    expect(row(result, 'deathWish')!.uptimePct).toBeLessThan(2 * (100 * 30) / 162)
    expect(row(result, 'recklessness')!.castsPerFight).toBeCloseTo(1, 9)
    expect(row(result, 'recklessness')!.uptimePct).toBeGreaterThan(7.5)
    expect(row(result, 'recklessness')!.uptimePct).toBeLessThan(9)
    // Shouted before the pull and kept up: up the whole fight; the pre-pull shout counts as a cast.
    expect(row(result, 'battleShout')!.uptimePct).toBeGreaterThan(99.9)
    expect(row(result, 'battleShout')!.castsPerFight).toBeGreaterThanOrEqual(1)
    expect(row(result, 'bloodrage')!.uptimePct).toBeNull()
    expect(row(result, 'mightyRagePotion')!.castsPerFight).toBeCloseTo(1, 9)
    // No incoming damage by default, so Enrage never comes up.
    expect(row(result, 'enrage')!.uptimePct).toBe(0)
    expect(row(result, 'flurry')!.castsPerFight).toBeNull()
    expect(row(result, 'flurry')!.uptimePct).toBeGreaterThan(50)
    // The casts still stay out of the damage breakdown.
    expect(result.abilities.map((a) => a.id)).not.toContain('deathWish')
  })

  it('shows the Arms warrior’s Overpower window, named after it, with Overpower’s icon', () => {
    const result = run(defaultConfig('warrior-arms'))
    const window = row(result, 'overpowerWindow')!
    expect(window).toMatchObject({ name: 'Overpower window', icon: 'ability_meleedamage', castsPerFight: null })
    expect(window.uptimePct).toBeGreaterThan(0)
    // A two-hander's Crusader needs no hand in its name.
    expect(result.cooldowns.map((r) => r.name)).toContain('Holy Strength')
  })
})

describe('bleed rows', () => {
  it('Rend counts applications and ticks apart: tick crits in Forever, avoidable applications, and its uptime on the boss', () => {
    const result = run(defaultConfig('warrior-arms'))
    const rend = result.abilities.find((a) => a.id === 'rend')!
    expect(rend.bleed).toMatchObject({ ticksCanCrit: true, avoidable: true })
    expect(rend.bleed!.uptimePct).toBeGreaterThan(80)
    expect(rend.bleed!.uptimePct).toBeLessThanOrEqual(100)
    // Seven ticks per landed application at most, so ticks far outnumber applications.
    const landed = rend.casts - rend.misses - rend.dodges - rend.parries
    expect(rend.hits + rend.crits).toBeGreaterThan(landed)
    expect(rend.hits + rend.crits).toBeLessThanOrEqual(7 * landed)
    expect(rend.crits).toBeGreaterThan(0)
  })

  it('Rend’s ticks can’t crit in Classic Era', () => {
    const d = defaultConfig('warrior-arms')
    const result = run({ ...d, rules: { ...d.rules, profile: 'classicEra' } }, 250)
    const rend = result.abilities.find((a) => a.id === 'rend')!
    expect(rend.bleed).toMatchObject({ ticksCanCrit: false, avoidable: true })
    expect(rend.crits).toBe(0)
  })

  it('Deep Wounds’ ticks neither crit nor get avoided, and its uptime isn’t tracked', () => {
    const result = run(defaultConfig('warrior-fury'), 250)
    const dw = result.abilities.find((a) => a.id === 'deepWounds')!
    expect(dw.bleed).toEqual({ ticksCanCrit: false, avoidable: false, uptimePct: null })
    expect(dw.crits + dw.misses + dw.dodges + dw.parries).toBe(0)
  })

  it('leaves every other row without bleed information', () => {
    const result = run(defaultConfig('warrior-fury'), 250)
    // Fury's bleeds: Deep Wounds, and Rend, which it dances for since W4.
    expect(result.abilities.filter((a) => a.bleed).map((a) => a.id)).toEqual(['deepWounds', 'rend'])
  })
})

describe('what each breakdown row counts (AbilityResult.unit, docs/ux.md#results "Breakdown")', () => {
  /** Each default spec's result over 100 fights, run once for every test here. */
  const cache = new Map<SpecId, SimResult>()
  const resultOf = (spec: SpecId) => {
    let result = cache.get(spec)
    if (!result) cache.set(spec, (result = run(defaultConfig(spec), 100)))
    return result
  }
  const units = (spec: SpecId) => Object.fromEntries(resultOf(spec).abilities.map((a) => [a.id, a.unit ?? null]))
  const ability = (spec: SpecId, id: string) => resultOf(spec).abilities.find((a) => a.id === id)!

  it.each<[SpecId, Record<string, string | null>]>([
    // White swings, the extra attacks' and Deep Wounds' procs, and the rotation's casts.
    ['warrior-fury', { mainHand: 'swings', offHand: 'swings', handOfJustice: 'procs', ironfoe: 'procs', windfury: 'procs', deepWounds: 'procs', bloodthirst: 'casts', whirlwind: 'casts', whirlwindOffHand: 'casts', overpower: 'casts', heroicStrike: 'casts', execute: 'casts' }],
    // Rend, a bleed the rotation casts, counts its applications.
    ['warrior-arms', { mainHand: 'swings', rend: 'applications', mortalStrike: 'casts', slam: 'casts', deepWounds: 'procs', weaponmaster: 'procs' }],
    // Bloodrage is cast and the potion used; the talents' rage rows count nothing.
    ['warrior-protection', { mainHand: 'swings', shieldSlam: 'casts', revenge: 'casts', sunderArmor: 'casts', bloodrage: 'casts', mightyRagePotion: 'uses', thorns: 'procs', shieldSpecialization: null, masterOfDefense: null }],
    ['druid-feral-cat', { mainHand: 'swings', shred: 'casts', rip: 'applications', ferociousBite: 'casts', windfury: 'procs' }],
    // A form's Auto attack swings; Lacerate's bleed counts the applications its hits make; Faerie
    // Fire and Enrage are cast, the potion used.
    ['druid-feral-bear', { mainHand: 'swings', maul: 'casts', lacerate: 'casts', lacerateBleed: 'applications', faerieFire: 'casts', enrage: 'casts', mightyRagePotion: 'uses', primalFury: null, naturalReaction: null }],
    ['druid-balance', { starfire: 'casts', wrath: 'casts', moonfire: 'casts', moonfireDot: 'applications', insectSwarm: 'applications' }],
    // Consecration's ticks share its row, which counts its casts; Seal of Command's hits are procs.
    ['paladin-retribution', { mainHand: 'swings', sealOfCommandProc: 'procs', consecration: 'casts', consecrationRank1: 'casts', judgementOfCommand: 'casts', holyStrike: 'casts', hammerOfWrath: 'casts' }],
    // Holy Shield and Reckoning show their own counts; the talents' mana rows count nothing, and the potion is used.
    ['paladin-protection', { mainHand: 'swings', sealOfFuryProc: 'procs', flurryAxe: 'procs', thorns: 'procs', holyShieldProc: null, reckoning: null, shieldSpecialization: null, improvedSealOfFury: null, consecration: 'casts', majorManaPotion: 'uses' }],
    ['shaman-enhancement', { mainHand: 'swings', windfuryWeapon: 'procs', stormstrike: 'casts', earthShock: 'casts', lightningBolt: 'casts' }],
    ['shaman-elemental', { flameShock: 'casts', flameShockDot: 'applications', lavaBurst: 'casts', lightningBolt: 'casts', chainLightning: 'casts', lightningOverload: 'procs' }],
    ['rogue-combat', { mainHand: 'swings', offHand: 'swings', sinisterStrike: 'casts', eviscerate: 'casts', instantPoison: 'procs', deadlyPoison: 'procs', hackAndSlash: 'procs' }],
    ['rogue-assassination', { mainHand: 'swings', offHand: 'swings', mutilate: 'casts', mutilateOffHand: 'casts', eviscerate: 'casts', deadlyPoison: 'procs', instantPoison: 'procs' }],
    ['rogue-subtlety', { mainHand: 'swings', hemorrhage: 'casts', rupture: 'applications', eviscerate: 'casts', deadlyPoison: 'procs' }],
    // A hybrid's DoT row counts the applications its hits put on the boss; Ignite counts the crits that feed it.
    ['mage-fire', { fireball: 'casts', fireballDot: 'applications', pyroblast: 'casts', pyroblastDot: 'applications', ignite: 'procs', scorch: 'casts', fireBlast: 'casts' }],
    ['mage-frost', { frostbolt: 'casts' }],
    // Arcane Missiles' channel is cast, its missiles landing on its row.
    ['mage-arcane', { arcaneMissiles: 'casts', pyroblast: 'casts', pyroblastDot: 'applications' }],
    ['warlock-destruction', { incinerate: 'casts', immolate: 'casts', immolateDot: 'applications', conflagrate: 'casts', shadowburn: 'casts', corruption: 'applications', baneOfAgony: 'applications' }],
    ['warlock-affliction', { corruption: 'applications', siphonLife: 'applications', baneOfAgony: 'applications', shadowBolt: 'casts' }],
    ['warlock-demonology', { 'succubus.melee': 'swings', 'succubus.lashOfPain': 'casts', shadowBolt: 'casts', corruption: 'applications' }],
    // Mind Flay is a channel you cast, though its ticks are a DoT's (review finding PC-3); the DoTs
    // you put up count applications.
    ['priest-shadow', { mindFlay: 'casts', mindBlast: 'casts', shadowWordPain: 'applications', devouringPlague: 'applications' }],
    // Auto Shot fires shots; the pet's melee swings, and its abilities are casts.
    ['hunter-marksmanship', { autoShot: 'shots', aimedShot: 'casts', serpentSting: 'applications' }],
    ['hunter-beast-mastery', { autoShot: 'shots', 'cat.melee': 'swings', 'cat.bite': 'casts', 'cat.claw': 'casts', serpentSting: 'applications', arcaneShot: 'casts', multiShot: 'casts' }],
    ['hunter-survival', { autoShot: 'shots', 'cat.melee': 'swings', aimedShot: 'casts', serpentSting: 'applications' }],
  ])('%s', (spec, expected) => {
    expect(units(spec)).toMatchObject(expected)
  })

  it('pins every default spec above', () => {
    expect(SPEC_IDS).toHaveLength(23)
  })

  it.each(SPEC_IDS)('gives every %s row that deals damage a count: its unit or its own', (spec) => {
    for (const a of resultOf(spec).abilities) if (a.damage > 0) expect(a.unit ?? a.counts, `${spec} ${a.id}`).toBeDefined()
  })

  it.each(SPEC_IDS)('counts each %s damaging swing’s or cast’s attempts, misses included, unless the cast lands more than once', (spec) => {
    for (const a of resultOf(spec).abilities.filter((r) => (r.unit === 'swings' || r.unit === 'casts') && !r.bleed && r.damage > 0)) {
      const attempts = a.hits + a.crits + a.glances + a.blocks + a.misses + a.dodges + a.parries
      if (a.landing) expect(attempts, `${spec} ${a.id}`).toBeGreaterThan(a.casts)
      else expect(attempts, `${spec} ${a.id}`).toBe(a.casts)
    }
  })

  it('counts the ticks of a row that lands with no cast counted, and nothing on a row that neither lands nor is cast', () => {
    const plan = armsPlan(100000)
    plan.sources.push({ id: 'tick', name: 'Tick', icon: 'x' })
    const i = plan.sources.length - 1
    expect(rowUnit(plan, i, 0, 12)).toBe('ticks')
    expect(rowUnit(plan, i, 0, 0)).toBeUndefined()
    expect(rowUnit(plan, 0, 30, 30)).toBe('swings')
  })

  /**
   * The times the procs on row `id` fire over `fights` default fights of `spec`, counted apart from
   * the engine's counters by wrapping the call that acts on a proc, and the row's result.
   */
  function fires(spec: SpecId, id: string, fights: number) {
    const bundle = buildPlan({ ...defaultConfig(spec), run: { mode: 'fixed', iterations: fights, seed: 3 } })
    const { plan } = bundle
    const sim = new Sim(plan)
    const procs = plan.procs.flatMap((p, i) => (plan.sources[p.source]?.id === id ? [i] : []))
    const hook = sim as unknown as { doAction: (p: number) => void }
    const act = hook.doAction.bind(sim)
    let fired = 0
    hook.doAction = (p) => {
      if (procs.includes(p)) fired++
      act(p)
    }
    let agg = emptyAggregate(plan.sources.length, plan.auras.length)
    for (let k = 0; k * CHUNK_SIZE < fights; k++) agg = mergeChunk(agg, runChunk(plan, k, CHUNK_SIZE, sim))
    return { fired, row: toResult(bundle, agg, 0).abilities.find((a) => a.id === id)! }
  }

  // Review finding PC-1: a proc that gives two extra attacks is one proc, not two.
  it.each<[SpecId, string, number]>([
    ['shaman-enhancement', 'windfuryWeapon', 2],
    ['warrior-fury', 'ironfoe', 2],
    ['warrior-fury', 'handOfJustice', 1],
    ['warrior-fury', 'windfury', 1],
  ])('counts %s’s %s by the times it fires, up to %i extra swings each', (spec, id, swings) => {
    const { fired, row } = fires(spec, id, 200)
    expect(fired).toBeGreaterThan(0)
    expect(row.unit).toBe('procs')
    expect(row.procs).toBe(fired)
    // Its casts are the extra swings, whose attempts its shares are over: all of them for a shaman,
    // fewer for a warrior, whose queued Heroic Strike takes an extra swing's place on its own row
    // (damage-and-timing §3.3, §5.4).
    if (spec === 'shaman-enhancement') expect(row.casts).toBe(swings * fired)
    else {
      expect(row.casts).toBeLessThan(swings * fired)
      expect(row.casts).toBeGreaterThan(0.9 * swings * fired)
    }
    expect(row.hits + row.crits + row.glances + row.blocks + row.misses + row.dodges + row.parries).toBe(row.casts)
  })

  it('keeps the fires to extra-attacks procs’ rows: not Reckoning’s own count, not another proc’s', () => {
    for (const spec of SPEC_IDS) {
      for (const a of resultOf(spec).abilities) if (a.procs !== undefined) expect(a.unit, `${spec} ${a.id}`).toBe('procs')
    }
    expect(ability('paladin-protection', 'reckoning')).not.toHaveProperty('procs')
    expect(ability('warrior-fury', 'deepWounds')).not.toHaveProperty('procs')
    expect(ability('paladin-retribution', 'sealOfCommandProc')).not.toHaveProperty('procs')
  })

  // Review finding PC-2: a cast whose ticks or missiles land on its row averages per landing.
  it('names what a cast that lands more than once lands: Consecration’s ticks, Arcane Missiles’ missiles', () => {
    for (const spec of ['paladin-retribution', 'paladin-protection'] as const) {
      const consecration = ability(spec, 'consecration')
      expect(consecration).toMatchObject({ unit: 'casts', landing: 'tick' })
      expect(consecration.hits + consecration.crits + consecration.misses).toBeGreaterThan(4 * consecration.casts)
    }
    const missiles = ability('mage-arcane', 'arcaneMissiles')
    expect(missiles).toMatchObject({ unit: 'casts', landing: 'missile' })
    expect(missiles.hits + missiles.crits + missiles.misses).toBeGreaterThan(3 * missiles.casts)
    // No other row lands more than once a cast.
    for (const spec of SPEC_IDS) {
      for (const a of resultOf(spec).abilities) if (a.landing) expect(['consecration', 'consecrationRank1', 'arcaneMissiles'], `${spec} ${a.id}`).toContain(a.id)
    }
  })

  // Review finding PC-8: Serpent Sting's application rolls ranged hit, so its row shows the share avoided.
  it('shows the share of a ranged DoT’s applications avoided (Serpent Sting)', () => {
    expect(ability('hunter-marksmanship', 'serpentSting').bleed?.avoidable).toBe(true)
  })
})
