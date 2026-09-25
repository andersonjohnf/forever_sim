// Touch of the Grave, the Undead proc (docs/mechanics/character-stats.md#touch-of-the-grave): its
// client values, which classes and races get it, and how the engine runs it. The engine tests use
// hand-built plans (a warrior plan from test-helpers with no weapon and spells added), as the caster
// core's do (engine/caster.test.ts); their numbers are test inputs. What procs it is tested on the
// real abilities, in each class's default plan with only those rotation lines and no other proc.
import racesJson from '@/data/races/races.json'
import spellsJson from '@/data/client/spells.json'
import { describe, expect, it } from 'vitest'
import { averageResist, levelResistance } from '../core/attack-table'
import { healingThreat, THREAT_PER_HEAL } from '../core/formulas'
import { defaultConfig } from '../defaults'
import { CHUNK_SIZE, runChunk } from '../engine/chunk'
import { FIELD, Sim } from '../engine/sim'
import { addAbility, addProc, alwaysLandNoCrit, armsPlan, at, counter, damages, line, rageAtPull } from '../engine/test-helpers'
import { demoralizingShout, MORTAL_STRIKE, REND, sunderArmor, thunderClap } from '../classes/warrior/abilities'
import { EZ_THRO_DARK_BOMB } from './buffs'
import { buildPlan } from '../plan/build'
import { PROFILES } from '../rules/profiles'
import { ACTION, type AbilityPlan, CASTER_ROW, DEFENSE, type Plan, SCHOOL, SCHOOL_COUNT, type SpellPlan, TRIGGER, TRIGGER_COUNT } from '../plan/types'
import { emptyAggregate, mergeChunk, toResult } from '../run/aggregate'
import type { ClassId, SimConfig, SpecId } from '../types'
import { TOUCH_OF_THE_GRAVE, touchOfTheGrave } from './racials'

const UNDEAD = 'horde-undead'
type ClientSpell = { auraOptions?: { procChance?: number; procCategoryRecovery?: number; procTypeMask?: number[] }; effects?: { effectAura?: number; effectBasePointsF?: number }[] }
const SPELLS = (spellsJson as unknown as { spells: Record<string, ClientSpell> }).spells
type Racial = { id: string; spells: { classMask: number; spellId: number }[] }
const RACIALS = (spellsJson as unknown as { racials: Record<string, Racial[] | { racials?: Racial[] }> }).racials

/** Every client racial row, whatever the file's grouping (race → list). */
function racialRows(): Racial[] {
  const out: Racial[] = []
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(walk)
    else if (x && typeof x === 'object') {
      const r = x as Partial<Racial>
      if (typeof r.id === 'string' && Array.isArray(r.spells)) out.push(r as Racial)
      else Object.values(x).forEach(walk)
    }
  }
  walk(RACIALS)
  return out
}

/** The classes of a class mask (ChrClasses ids: warrior 1, paladin 2, rogue 4, priest 5, mage 8, warlock 9). */
const CLASS_BITS: Record<number, ClassId> = { 1: 'warrior', 2: 'paladin', 4: 'rogue', 5: 'priest', 8: 'mage', 9: 'warlock' }
const classesOfMask = (mask: number) => Object.entries(CLASS_BITS).flatMap(([id, c]) => (mask & (1 << (Number(id) - 1)) ? [c] : []))

/** One spec per class Undead can be in Forever. */
const UNDEAD_SPECS: [ClassId, SpecId][] = [
  ['warrior', 'warrior-protection'],
  ['paladin', 'paladin-protection'],
  ['rogue', 'rogue-combat'],
  ['priest', 'priest-shadow'],
  ['mage', 'mage-frost'],
  ['warlock', 'warlock-destruction'],
]

const grave = (plan: Plan) => plan.procs.findIndex((p) => p.id === 'touchOfTheGrave')

describe('Touch of the Grave’s client values (character-stats.md#touch-of-the-grave)', () => {
  it('the melee classes’ spell (1260189) procs 5%, the casters’ (1260201) 10%, both on a 1 s internal cooldown with no periodic bit; the dummy’s 5 is the drain’s 5%', () => {
    const melee = SPELLS['1260189']
    const caster = SPELLS['1260201']
    expect(melee.auraOptions?.procChance).toBe(TOUCH_OF_THE_GRAVE.meleeChancePct)
    expect(caster.auraOptions?.procChance).toBe(TOUCH_OF_THE_GRAVE.casterChancePct)
    for (const s of [melee, caster]) {
      expect(s.auraOptions?.procCategoryRecovery).toBe(TOUCH_OF_THE_GRAVE.icdMs)
      // 0x11154: melee and ranged swings and abilities, and harmful spells; no periodic (0x40000) bit.
      expect(s.auraOptions?.procTypeMask?.[0]).toBe(0x11154)
      expect((s.auraOptions!.procTypeMask![0] & 0x40000) === 0).toBe(true)
      expect(s.effects?.[0]?.effectBasePointsF).toBe(TOUCH_OF_THE_GRAVE.healthPct)
    }
  })

  it('the client gives each version to its classes: every class Undead can be in Forever has one', () => {
    const row = racialRows().find((r) => r.id === 'racial-undead-touch-of-the-grave')!
    const bySpell = new Map(row.spells.map((s) => [s.spellId, classesOfMask(s.classMask)]))
    expect(bySpell.get(1260189)).toEqual(['warrior', 'paladin', 'rogue'])
    expect(bySpell.get(1260201)).toEqual(['priest', 'mage', 'warlock'])
    const races = (racesJson as unknown as { races: { id: string; classes: { forever: ClassId[] } }[] }).races
    const undead = races.find((r) => r.id === UNDEAD)!
    for (const c of undead.classes.forever) {
      const proc = touchOfTheGrave(c)
      expect(proc, c).not.toBeNull()
      const melee = bySpell.get(1260189)!.includes(c)
      expect(proc!.chance, c).toEqual({ pct: melee ? 5 : 10 })
    }
    expect(touchOfTheGrave('druid')).toBeNull()
    expect(touchOfTheGrave('hunter')).toBeNull()
  })
})

describe('Touch of the Grave in the plan: Undead only', () => {
  it.each(UNDEAD_SPECS)('%s: an Undead has it (its chance, 1 s cooldown, 5%% of the sheet’s maximum health), its row and its assumption; another race has none', (classId, spec) => {
    const bundle = buildPlan(defaultConfig(spec, UNDEAD))
    const p = grave(bundle.plan)
    expect(p).toBeGreaterThanOrEqual(0)
    const proc = bundle.plan.procs[p]
    const pct = ['warrior', 'paladin', 'rogue'].includes(classId) ? 0.05 : 0.1
    expect(proc.trigger).toBe(TRIGGER.damageLanded)
    expect(proc.chance[0]).toBeCloseTo(pct, 12)
    expect(proc.icdMs).toBe(1000)
    expect(proc.action).toBe(ACTION.healthDrain)
    expect(proc.school).toBe(SCHOOL.shadow)
    expect(proc.a).toBeCloseTo(0.05 * bundle.sheet.health, 9)
    expect(bundle.plan.triggers[TRIGGER.damageLanded]).toEqual([p])
    const row = bundle.plan.sources[proc.source]
    expect([row.id, row.name, row.certain]).toEqual(['touchOfTheGrave', 'Touch of the Grave', true])
    const note = bundle.assumptions.find((a) => a.id === 'touchOfTheGrave')
    expect(note?.text).toContain(`${Math.round(pct * 100)}% chance, at most once a second, to drain ${Math.round(proc.a).toLocaleString('en-US')} health`)
    // Not Undead: no proc, no row, no note, and nothing on the trigger.
    const other = buildPlan(defaultConfig(spec, classId === 'warrior' || classId === 'paladin' || classId === 'rogue' ? 'alliance-human' : 'horde-troll'))
    expect(grave(other.plan)).toBe(-1)
    expect(other.plan.sources.some((s) => s.id === 'touchOfTheGrave')).toBe(false)
    expect(other.assumptions.some((a) => a.id === 'touchOfTheGrave')).toBe(false)
    expect(other.plan.triggers[TRIGGER.damageLanded]).toEqual([])
  })
})

// --- The engine -------------------------------------------------------------------------------

/** A level-63 boss's average partial resist at level 60 (combat-tables §9): 6%. */
const RESIST = averageResist(levelResistance(63, 60), 60)

/** A caster with no weapon, plain schools, and spells that never miss or crit unless a test says so. */
function casterPlan(durationMs = 60000): Plan {
  const plan = armsPlan(durationMs)
  plan.weapons = [null, null]
  plan.mana = { maxTenths: 10 * 100000, regenTickTenths: 0, fiveSecondRuleMs: 5000 }
  plan.spells = []
  plan.rage.maxTenths = 0
  const s = plan.stats
  s.hitRating = 0
  s.critRating = 0
  s.spellHit = 100
  s.spellCrit = -100
  s.spellDamage = 0
  const r = levelResistance(63, 60)
  plan.schools = { damage: Array(SCHOOL_COUNT).fill(1), taken: Array(SCHOOL_COUNT).fill(1), crit: Array(SCHOOL_COUNT).fill(0), resistance: [r, r, r, r, r, 0, 0] }
  return plan
}

function addSpell(plan: Plan, patch: Partial<SpellPlan> = {}): number {
  const i = plan.spells!.length
  plan.sources.push({ id: `spell${i}`, name: `Spell ${i}`, icon: 'x' })
  plan.spells!.push({
    id: `spell${i}`,
    school: SCHOOL.fire,
    defense: DEFENSE.magic,
    noActiveDefense: false,
    alwaysHit: false,
    triggersProcs: true,
    min: 0,
    max: 0,
    weaponPercent: 0,
    normalized: false,
    spCoefficient: 0,
    takenScale: 0,
    critMultiplier: 1.5,
    bonusCrit: 0,
    damageMult: 1,
    threatMult: 1,
    threatBonus: 0,
    source: plan.sources.length - 1,
    ...patch,
  })
  return i
}

function addCaster(plan: Plan, spell: number, patch: Partial<AbilityPlan> = {}): number {
  plan.abilities.push({
    ...CASTER_ROW,
    window: -1,
    offHandSource: -1,
    id: `ability${plan.abilities.length}`,
    name: 'Ability',
    icon: 'x',
    source: plan.spells![spell].source,
    kind: 'spell',
    resource: 'mana',
    costTenths: 0,
    cooldownMs: 0,
    gcdMs: 1500,
    castMs: 0,
    aura: -1,
    spell,
    ...patch,
  })
  return plan.abilities.length - 1
}

/** Touch of the Grave on its own row: `drain` a proc, at `chance` (a fraction) and `icdMs`. Returns its row. */
function addGrave(plan: Plan, drain: number, chance = 1, icdMs = 0): number {
  plan.sources.push({ id: 'touchOfTheGrave', name: 'Touch of the Grave', icon: 'x', certain: true })
  const source = plan.sources.length - 1
  addProc(plan, { id: 'touchOfTheGrave', trigger: TRIGGER.damageLanded, chance: [chance, chance], hands: 0, action: ACTION.healthDrain, amount: 0, a: drain, b: 0, school: SCHOOL.shadow, icdMs, source })
  return source
}

function run(plan: Plan, fights: number) {
  const sim = new Sim(plan)
  for (let i = 0; i < fights; i++) sim.runFight(i)
  return sim
}

describe('Touch of the Grave in the engine (character-stats.md#touch-of-the-grave)', () => {
  it('drains its amount as Shadow damage on every landed direct spell: no miss or crit roll, the average partial resist, damage and healing threat × the global multiplier only', () => {
    const plan = casterPlan(30000)
    // A caster who always misses and always crits with its own spells would show either on the drain.
    plan.stats.spellHit = 100
    plan.stats.spellCrit = 200
    plan.threatMult = 1.3
    plan.holyThreatMult = 1.6
    const bolt = addSpell(plan, { min: 100, max: 100, alwaysHit: true })
    line(plan, addCaster(plan, bolt))
    const row = addGrave(plan, 250)
    const sim = run(plan, 3)
    const casts = counter(sim, plan.spells![bolt].source, FIELD.casts)
    expect(casts).toBe(3 * 20)
    expect([counter(sim, row, FIELD.casts), counter(sim, row, FIELD.hits), counter(sim, row, FIELD.crits), counter(sim, row, FIELD.misses)]).toEqual([casts, casts, 0, 0])
    const each = 250 * (1 - RESIST)
    expect(new Set(damages(plan, row, 1).map((d) => Math.round(d * 1e6) / 1e6))).toEqual(new Set([Math.round(each * 1e6) / 1e6]))
    // Damage threat (1 a point) plus the heal's (0.5 a point of the health drained), both × 1.3.
    expect(counter(sim, row, FIELD.threat) / counter(sim, row, FIELD.damage)).toBeCloseTo(1.3 * 1.5, 12)
  })

  // threat.md#threat-from-healing-power-gains-and-buffs: the drain heals you for the health it takes,
  // all of it effective [?], and a heal makes 0.5 threat a point × the global multiplier [C].
  it('its heal makes 0.5 threat a point of the drain × the global multiplier, and Righteous Fury doesn’t touch it', () => {
    const threatOf = (threatMult: number, holyThreatMult: number) => {
      const plan = casterPlan(15000)
      plan.threatMult = threatMult
      plan.holyThreatMult = holyThreatMult
      const bolt = addSpell(plan, { min: 100, max: 100, alwaysHit: true })
      line(plan, addCaster(plan, bolt))
      const row = addGrave(plan, 400)
      const sim = run(plan, 1)
      return { damage: counter(sim, row, FIELD.damage), threat: counter(sim, row, FIELD.threat) }
    }
    const plain = threatOf(1.3, 1)
    expect(plain.damage).toBeGreaterThan(0)
    const healing = plain.threat - plain.damage * 1.3
    expect(healing).toBeCloseTo(THREAT_PER_HEAL * plain.damage * 1.3, 9)
    expect(healing).toBeCloseTo(healingThreat(plain.damage, 1.3, 1), 9)
    // Righteous Fury (×1.6 on Holy) moves neither the drain's Shadow damage threat nor its heal's.
    const fury = threatOf(1.3, 1.6)
    expect(fury.damage).toBe(plain.damage)
    expect(fury.threat).toBe(plain.threat)
  })
})

describe('Healing threat (threat.md#threat-from-healing-power-gains-and-buffs)', () => {
  it('is 0.5 a point of effective healing × the global multipliers, split evenly across the enemies in combat', () => {
    expect(THREAT_PER_HEAL).toBe(0.5)
    // A 250-point drain in Defensive Stance with Defiance 5/5 (1.3 × 1.15 = 1.495) on one boss.
    expect(healingThreat(250, 1.495, 1)).toBeCloseTo(186.875, 9)
    // Three enemies in combat: each gets a third.
    expect(healingThreat(250, 1.495, 3)).toBeCloseTo(186.875 / 3, 9)
    expect(3 * healingThreat(300, 1.3, 3)).toBeCloseTo(healingThreat(300, 1.3, 1), 9)
    expect(healingThreat(0, 1.495, 2)).toBe(0)
  })

  it('takes the Shadow school’s multipliers, yours and the boss’s', () => {
    const plan = casterPlan(15000)
    plan.schools!.damage[SCHOOL.shadow] = 1.15
    plan.schools!.taken[SCHOOL.shadow] = 1.1
    plan.schools!.damage[SCHOOL.fire] = 2
    const bolt = addSpell(plan, { min: 100, max: 100 })
    line(plan, addCaster(plan, bolt))
    const row = addGrave(plan, 200)
    for (const d of damages(plan, row, 1)) expect(d).toBeCloseTo(200 * 1.15 * 1.1 * (1 - RESIST), 9)
  })

  it('procs as a DoT lands, never on its ticks, and not from a spell that fires no procs', () => {
    const plan = casterPlan(30000)
    const dot = addSpell(plan, { school: SCHOOL.shadow, dotTicks: 6, dotTickMs: 3000, dotTickDamage: 100 })
    line(plan, addCaster(plan, dot), at(plan, 0))
    const row = addGrave(plan, 100)
    const sim = run(plan, 1)
    expect(counter(sim, plan.spells![dot].source, FIELD.hits)).toBe(6)
    expect(counter(sim, row, FIELD.casts)).toBe(1)
    // A triggered spell that fires no procs (a seal's damage) doesn't proc it either.
    const quiet = casterPlan(15000)
    const seal = addSpell(quiet, { min: 100, max: 100, triggersProcs: false })
    line(quiet, addCaster(quiet, seal))
    const quietRow = addGrave(quiet, 100)
    expect(counter(run(quiet, 1), quietRow, FIELD.casts)).toBe(0)
  })

  it('holds its 1 s internal cooldown: spells landing every 0.5 s proc it every other time', () => {
    const cast = (icdMs: number) => {
      const plan = casterPlan(60000)
      const bolt = addSpell(plan, { min: 100, max: 100 })
      line(plan, addCaster(plan, bolt, { gcdMs: 500 }))
      const row = addGrave(plan, 100, 1, icdMs)
      const sim = run(plan, 1)
      return [counter(sim, plan.spells![bolt].source, FIELD.casts), counter(sim, row, FIELD.casts)]
    }
    expect(cast(0)).toEqual([120, 120])
    expect(cast(TOUCH_OF_THE_GRAVE.icdMs)).toEqual([120, 60])
  })

  it('procs from an attack that deals damage (Thunder Clap), not one that deals none (Sunder Armor, Demoralizing Shout)', () => {
    for (const [make, procs] of [
      [sunderArmor, 0],
      [thunderClap, 1],
      [demoralizingShout, 0],
    ] as const) {
      const plan = armsPlan(1000)
      alwaysLandNoCrit(plan)
      plan.stats.spellHit = 100
      plan.weapons = [plan.weapons[0], null]
      rageAtPull(plan, 100)
      const ability = addAbility(plan, make(PROFILES.forever))
      line(plan, ability, at(plan, 0))
      const row = addGrave(plan, 100)
      const sim = run(plan, 1)
      const name = plan.abilities[ability].id
      expect(counter(sim, plan.abilities[ability].source, FIELD.hits), name).toBe(1)
      // The fight's one white swing, at the pull, lands and procs it too.
      const white = plan.sources.findIndex((x) => x.id === 'mainHand')
      expect(counter(sim, white, FIELD.hits), name).toBe(1)
      expect(counter(sim, row, FIELD.casts), name).toBe(1 + procs)
    }
  })

  it('procs from landed white swings, not missed ones', () => {
    const plan = armsPlan(60000)
    alwaysLandNoCrit(plan)
    const row = addGrave(plan, 100)
    const sim = run(plan, 1)
    const white = plan.sources.findIndex((s) => s.id === 'mainHand')
    const landed = (['hits', 'crits', 'glances', 'blocks'] as const).reduce((n, f) => n + counter(sim, white, FIELD[f]), 0)
    expect(landed).toBeGreaterThan(10)
    expect(counter(sim, row, FIELD.casts)).toBe(landed)
  })
})

// --- What procs it, on the real abilities (character-stats.md#touch-of-the-grave "What procs it") --------

/** A row's landed events: hits, crits, glances and blocks (a DoT's or bleed's are its ticks). */
const landed = (sim: Sim, row: number) => (['hits', 'crits', 'glances', 'blocks'] as const).reduce((n, f) => n + counter(sim, row, FIELD[f]), 0)
/** A row's uses that landed: its casts less its misses, dodges and parries (a DoT's or bleed's applications). */
const applied = (sim: Sim, row: number) => counter(sim, row, FIELD.casts) - (['misses', 'dodges', 'parries'] as const).reduce((n, f) => n + counter(sim, row, FIELD[f]), 0)
const rowOf = (plan: Plan, id: string) => {
  const i = plan.sources.findIndex((s) => s.id === id)
  expect(i, id).toBeGreaterThanOrEqual(0)
  return i
}

/**
 * `spec`'s default plan for `race` (a fight of exactly `durationSec`, these buffs), with only the
 * rotation lines of these abilities, no prepull casts, and no proc but a Touch of the Grave of
 * 100 a drain at 100% with `icdMs`, on its own row: each landing that procs it counts one cast.
 */
function realPlan(spec: SpecId, race: string | undefined, lines: string[], o: { durationSec?: number; icdMs?: number; enabled?: string[] } = {}) {
  const d = defaultConfig(spec, race)
  const plan = buildPlan({ ...d, buffs: { raid: d.buffs.raid, enabled: o.enabled ?? d.buffs.enabled }, fight: { ...d.fight, durationSec: o.durationSec ?? 60, durationVariationPct: 0 } }).plan
  for (const id of lines) expect(plan.rotation.some((r) => plan.abilities[r.ability].id === id), `${spec} ${id}`).toBe(true)
  plan.rotation = plan.rotation.filter((r) => lines.includes(plan.abilities[r.ability].id))
  plan.prepull = { ...plan.prepull, casts: [] }
  plan.procs = []
  plan.triggers = Array.from({ length: TRIGGER_COUNT }, () => [])
  return { plan, row: addGrave(plan, 100, 1, o.icdMs ?? 0) }
}

describe('What procs Touch of the Grave, on the real abilities (character-stats.md#touch-of-the-grave)', () => {
  it('a dodged or parried special doesn’t proc it, nor a dodged or parried swing; a landed one does', () => {
    const plan = armsPlan(120000)
    plan.stats.hit = 100
    plan.stats.crit = -100
    Object.assign(plan.fight, { front: true, bossCanDodge: true, bossCanParry: true, bossCanBlock: false })
    rageAtPull(plan, 100)
    const ms = addAbility(plan, MORTAL_STRIKE)
    line(plan, ms)
    const row = addGrave(plan, 100)
    const sim = run(plan, 3)
    const strike = plan.abilities[ms].source
    const white = rowOf(plan, 'mainHand')
    for (const r of [strike, white]) {
      expect(counter(sim, r, FIELD.dodges), plan.sources[r].id).toBeGreaterThan(0)
      expect(counter(sim, r, FIELD.parries), plan.sources[r].id).toBeGreaterThan(0)
    }
    expect(counter(sim, strike, FIELD.misses)).toBe(0)
    expect(landed(sim, strike)).toBeGreaterThan(10)
    expect(counter(sim, row, FIELD.casts)).toBe(landed(sim, strike) + landed(sim, white))
  })

  it('a bleed procs it as it’s applied, never on its ticks (Rend)', () => {
    const plan = armsPlan(24000)
    alwaysLandNoCrit(plan)
    rageAtPull(plan, 100)
    const rend = addAbility(plan, REND)
    line(plan, rend, at(plan, 0))
    const row = addGrave(plan, 100)
    const sim = run(plan, 1)
    const r = plan.abilities[rend].source
    // One application, its 7 ticks 3 s apart; the swings land and proc it too.
    expect([counter(sim, r, FIELD.casts), counter(sim, r, FIELD.hits)]).toEqual([1, 7])
    const whites = landed(sim, rowOf(plan, 'mainHand'))
    expect(whites).toBeGreaterThan(0)
    expect(counter(sim, row, FIELD.casts)).toBe(1 + whites)
  })

  it('an Undead rogue’s Rupture procs it as it’s applied, never on its ticks; Hemorrhage and the swings each proc it', () => {
    const { plan, row } = realPlan('rogue-subtlety', UNDEAD, ['hemorrhage', 'rupture'])
    const sim = run(plan, 3)
    const rupture = rowOf(plan, 'rupture')
    const strike = rowOf(plan, 'hemorrhage')
    const whites = landed(sim, rowOf(plan, 'mainHand')) + landed(sim, rowOf(plan, 'offHand'))
    const ruptures = applied(sim, rupture)
    expect(ruptures).toBeGreaterThan(3)
    expect(landed(sim, rupture)).toBeGreaterThan(2 * ruptures)
    expect(counter(sim, row, FIELD.casts)).toBe(whites + landed(sim, strike) + ruptures)
  })

  it.each([
    ['priest-shadow', 'shadowWordPain'],
    ['warlock-affliction', 'corruption'],
  ] as const)('an Undead %s’s %s procs it as it lands, never on its ticks', (spec, id) => {
    const { plan, row } = realPlan(spec, UNDEAD, [id])
    const sim = run(plan, 3)
    const dot = rowOf(plan, id)
    const applications = applied(sim, dot)
    expect(applications).toBeGreaterThan(3)
    expect(landed(sim, dot)).toBeGreaterThan(3 * applications)
    expect(counter(sim, row, FIELD.casts)).toBe(applications)
  })

  it('EZ-Thro Dark Bomb, an item’s spell, doesn’t proc it; the same bomb as a spell of yours would', () => {
    const bomb = (itemSpell: boolean) => {
      const { plan, row } = realPlan('mage-fire', UNDEAD, [EZ_THRO_DARK_BOMB.id], { durationSec: 180, enabled: [EZ_THRO_DARK_BOMB.id] })
      const spell = plan.spells!.find((s) => plan.sources[s.source].id === EZ_THRO_DARK_BOMB.id)!
      expect(spell.itemSpell).toBe(true)
      spell.itemSpell = itemSpell
      const sim = run(plan, 20)
      return [landed(sim, spell.source), counter(sim, row, FIELD.casts)]
    }
    const [thrown, procs] = bomb(true)
    expect(thrown).toBeGreaterThan(20)
    expect(procs).toBe(0)
    const [yours, yourProcs] = bomb(false)
    expect(yourProcs).toBe(yours)
  })

  it('each Arcane Missiles missile procs it, subject to its 1 s cooldown', () => {
    const missiles = (icdMs: number, tickMs?: number) => {
      const { plan, row } = realPlan('mage-arcane', UNDEAD, ['arcaneMissiles'], { durationSec: 30, icdMs })
      const a = plan.abilities.findIndex((x) => x.id === 'arcaneMissiles')
      if (tickMs) plan.abilities[a].rageTickMs = tickMs
      const sim = run(plan, 3)
      return [landed(sim, rowOf(plan, 'arcaneMissiles')), counter(sim, row, FIELD.casts)]
    }
    // No cooldown: every missile that lands procs it.
    const [n, procs] = missiles(0)
    expect(n).toBeGreaterThan(3 * 20)
    expect(procs).toBe(n)
    // The 1 s cooldown: missiles 1 s apart all proc it, as the cooldown is over when the next lands.
    expect(missiles(TOUCH_OF_THE_GRAVE.icdMs)).toEqual([n, n])
    // Missiles 0.5 s apart: the cooldown lets about every other one proc it.
    const [fast, fastProcs] = missiles(TOUCH_OF_THE_GRAVE.icdMs, 500)
    expect(missiles(0, 500)).toEqual([fast, fast])
    expect(fastProcs).toBeLessThan(0.6 * fast)
    expect(fastProcs).toBeGreaterThan(0.45 * fast)
  })

  it('a hunter’s landed Auto Shots, shots and Serpent Sting’s application each proc it, not the sting’s ticks or the pet’s attacks (the engine’s trigger; no hunter is Undead)', () => {
    const { plan, row } = realPlan('hunter-beast-mastery', undefined, ['multiShot', 'arcaneShot', 'serpentSting'])
    const sim = run(plan, 3)
    const auto = rowOf(plan, 'autoShot')
    const sting = rowOf(plan, 'serpentSting')
    const shots = landed(sim, rowOf(plan, 'arcaneShot')) + landed(sim, rowOf(plan, 'multiShot'))
    expect(landed(sim, auto)).toBeGreaterThan(3 * 15)
    expect(shots).toBeGreaterThan(3 * 5)
    expect(applied(sim, sting)).toBeGreaterThan(3)
    expect(landed(sim, sting)).toBeGreaterThan(2 * applied(sim, sting))
    const pet = plan.sources.flatMap((s, i) => (s.pet ? [i] : []))
    expect(pet.length).toBeGreaterThan(0)
    expect(pet.reduce((n, i) => n + counter(sim, i, FIELD.damage), 0)).toBeGreaterThan(0)
    expect(counter(sim, row, FIELD.casts)).toBe(landed(sim, auto) + shots + applied(sim, sting))
  })
})

describe('Touch of the Grave on real setups', () => {
  function result(config: SimConfig, fights = 300, seed = 777) {
    const bundle = buildPlan({ ...config, run: { mode: 'fixed', iterations: fights, seed } })
    const sim = new Sim(bundle.plan)
    let agg = emptyAggregate(bundle.plan.sources.length, bundle.plan.auras.length)
    for (let k = 0; k * CHUNK_SIZE < fights; k++) agg = mergeChunk(agg, runChunk(bundle.plan, k, Math.min(CHUNK_SIZE, fights - k * CHUNK_SIZE), sim))
    return toResult(bundle, agg, 0)
  }

  it('is deterministic by seed: the same Undead setup and seed give the same result, another seed another', () => {
    const config = defaultConfig('paladin-protection', UNDEAD)
    const a = result(config)
    const b = result(config)
    expect(b).toEqual(a)
    const row = a.abilities.find((x) => x.id === 'touchOfTheGrave')!
    expect(row.casts).toBeGreaterThan(0)
    expect(row.crits + row.misses).toBe(0)
    const other = result(config, 300, 778)
    expect(other.tps.mean).not.toBe(a.tps.mean)
  })

  it('an Undead Protection warrior’s drain and heal make its stance’s threat, and a Protection paladin’s none of Righteous Fury’s', () => {
    for (const spec of ['warrior-protection', 'paladin-protection'] as const) {
      const bundle = buildPlan(defaultConfig(spec, UNDEAD))
      const r = result(defaultConfig(spec, UNDEAD), 50)
      const row = r.abilities.find((x) => x.id === 'touchOfTheGrave')!
      // Damage threat plus the heal's 0.5 a point, × the global multiplier (stance, Defiance, gloves);
      // Righteous Fury (×1.6) is Holy's only, and no paladin heal's ×0.5 on a racial.
      const global = bundle.plan.threatMult * (bundle.plan.stances?.find((s) => s.stance === bundle.plan.stance)?.threat ?? 1)
      expect(row.threat / row.damage, spec).toBeCloseTo(global * (1 + THREAT_PER_HEAL), 6)
    }
  })
})
