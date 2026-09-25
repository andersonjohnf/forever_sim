// Searing Pain and Demonic Brand (docs/classes/warlock.md §3.1, §11.3, issue #17): Searing Pain's row
// against the Forever client and with the talents that name it, the brand's charges and damage as the
// client's formula has them, the pet core's two additions (charges its landed attacks use up, and damage
// it deals from a proc) on a hand-built plan, and Demonology's Searing Pain row: on only with the talent
// and a demon out, and a default plan without it unchanged.
import { describe, expect, it } from 'vitest'
import spellsJson from '@/data/client/spells.json'
import talentsJson from '@/data/client/talents.json'
import type { ClientSpells, ClientTalents } from '@/data/client/types'
import { spellCritMultiplier } from '../../core/formulas'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { addCast, addPlanAura, rangedPlan, withPet } from '../../engine/ranged-helpers'
import { FIELD, Sim } from '../../engine/sim'
import { addProc, at, counter, line } from '../../engine/test-helpers'
import { buildPlan } from '../../plan/build'
import { ACTION, type Plan, SCHOOL, TRIGGER } from '../../plan/types'
import { emptyAggregate, mergeChunk, toResult } from '../../run/aggregate'
import type { SimConfig } from '../../types'
import { talentRanksByName } from '../index'
import { unusedSettings } from '../rotation'
import { SEARING_PAIN } from './abilities'
import { DEMONOLOGY_IDS as ID } from './demonology'
import { DEMO_CURVE, DEMONIC_BRAND_HIT, demonicBrandAura, demonicBrandProc } from './demons'
import { withTalents } from './talents'

const spells = (spellsJson as unknown as ClientSpells).spells
const clientTalents = (talentsJson as unknown as ClientTalents).classes.warlock.talents
const spell = (id: number) => spells[String(id)]
const curve = (name: string, index = 0) => clientTalents.find((t) => t.name === name)!.rankEffects.find((r) => r.effectIndex === index)!.values
/** Demonology's default with Demonic Embrace's 2 and Master Summoner's 1 in Demonic Brand 3/3 (warlock.md §11.6). */
const BRAND_BUILD = '-0305003221020301351-0450305003'
const DEFAULT = defaultConfig('warlock-demonology')
const BRAND = talentRanksByName(TALENT_DATA.warlock, BRAND_BUILD)
const config = (rotation: SimConfig['rotation'] = {}, talents = BRAND_BUILD): SimConfig => ({
  ...DEFAULT,
  talents,
  rotation: { ...DEFAULT.rotation, ...rotation },
  run: { mode: 'fixed', iterations: 400, seed: 2701 },
})

describe('Searing Pain r6 (17923) against the Forever client (warlock.md §3.1)', () => {
  it('114 ± 8.1%, +1.2 a level from 58: 107.16–125.64 at 60, coefficient 0.429, Fire, 168 mana, a 1.5 s cast', () => {
    const e = spell(17923).effects.find((x) => x.effectIndex === 0)!
    const grow = e.effectRealPointsPerLevel! * (60 - spell(17923).levels!.baseLevel!)
    const s = SEARING_PAIN.spellDef!
    expect(s.min).toBeCloseTo(e.effectBasePointsF! * (1 - e.variance! / 2) + grow, 9)
    expect(s.max).toBeCloseTo(e.effectBasePointsF! * (1 + e.variance! / 2) + grow, 9)
    expect([s.min, s.max]).toEqual([expect.closeTo(107.16, 2), expect.closeTo(125.64, 2)])
    expect(s.spCoefficient).toBe(e.effectBonusCoefficient)
    expect(s.school).toBe('fire')
    expect(spell(17923).misc!.schoolMask).toBe(4)
    expect(SEARING_PAIN.costTenths).toBe(10 * spell(17923).power![0].manaCost!)
    expect(SEARING_PAIN.castMs).toBe(spell(17923).castTime!.base)
  })

  it('takes the Destruction talents its class mask (256) is in: Cataclysm, Ruin, Agonizing Flames’ damage and crit, Decimation', () => {
    // Ruin's and Cataclysm's mask 997, Agonizing Flames' #1 421 and #0 256, Decimation's #3 257 (warlock.md §11.3).
    for (const [name, index] of [['Ruin', 0], ['Cataclysm', 0], ['Agonizing Flames', 0], ['Agonizing Flames', 1], ['Decimation', 3]] as const) {
      const t = clientTalents.find((x) => x.name === name)!
      expect(spell(t.spellId).effects.find((e) => e.effectIndex === index)!.effectSpellClassMask![0] & 256, `${name} #${index}`).toBe(256)
    }
    const sp = withTalents(SEARING_PAIN, talentRanksByName(TALENT_DATA.warlock, DEFAULT.talents))
    // Cataclysm 3/3: 168 × 0.9 = 151.2, rounded down; Ruin 5/5 ×2.0; Agonizing Flames 3/3 +10% and +10% crit; Decimation 2/2 +6% below 35%.
    expect(sp.costTenths).toBe(1510)
    expect(sp.spellDef!.critMultiplier).toBe(spellCritMultiplier(100))
    expect(sp.spellDef!.damageMult).toBeCloseTo(1.1, 12)
    expect(sp.spellDef!.bonusCrit).toBe(10)
    expect(sp.spellDef).toMatchObject({ lowHealthPct: 6, lowHealthBelowPct: 35 })
    expect(sp.castMs).toBe(1500)
  })
})

describe('Demonic Brand (1293695; warlock.md §11.3)', () => {
  it('brands for 2/4/6 of your demon’s attacks (its #1 curve), 10 s, and each deals 65–68 + 0.078 × your spell damage at 60', () => {
    expect(curve('Demonic Brand', 1)).toEqual(DEMO_CURVE.demonicBrandCharges)
    expect([1, 2, 3].map((r) => demonicBrandAura(new Map([['Demonic Brand', r]]))?.petLandedCharges)).toEqual([2, 4, 6])
    expect(demonicBrandAura(new Map())).toBeNull()
    expect(demonicBrandAura(BRAND)).toMatchObject({ id: 'demonicBrand', durationMs: 10000, petLandedCharges: 6 })
    // ((60 − 26) × 1.5 + 14 … 17), the client's description variables 1016–1018.
    expect(DEMONIC_BRAND_HIT).toEqual({ min: 65, max: 68, spCoefficient: 0.078 })
    // The brand (1293696): 10 s on the target, its proc on every attack the target takes.
    expect(spell(1293696).duration!.duration).toBe(10000)
    expect(spell(1293696).auraOptions).toMatchObject({ procChance: 100, procTypeMask: [139944, 0] })
    // The talent's #1 mods its charges (aura 107, misc 4), on the brand's class mask.
    const charges = spell(1293695).effects.find((e) => e.effectIndex === 1)!
    expect(charges).toMatchObject({ effectAura: 107, effectMiscValue: [4, 0] })
    expect(charges.effectSpellClassMask![3] & spell(1293696).classOptions!.spellClassMask![3]).not.toBe(0)
    // Its hits: Shadow (1293697) and Fire (1293698), both Always Hit (Attributes[3] 0x40000).
    expect([1293697, 1293698].map((id) => spell(id).misc!.schoolMask)).toEqual([32, 4])
    for (const id of [1293697, 1293698]) expect(spell(id).misc!.attributes![3] & 0x40000, String(id)).toBe(0x40000)
  })

  it('deals Fire with the Imp and Shadow with the Succubus, Master Demonologist folded in; Shadow with the Felhunter, which has none', () => {
    const imp = demonicBrandProc('imp', BRAND)!
    expect(imp).toMatchObject({ trigger: 'petLanded', requiresAura: 'demonicBrand', chance: { pct: 100 } })
    expect(imp.action).toEqual({ kind: 'petSpellDamage', school: 'fire', min: expect.closeTo(71.5, 9), max: expect.closeTo(74.8, 9), spCoefficient: expect.closeTo(0.0858, 12) })
    expect(demonicBrandProc('succubus', BRAND)!.action).toMatchObject({ school: 'shadow', min: expect.closeTo(71.5, 9) })
    expect(demonicBrandProc('felhunter', BRAND)!.action).toMatchObject({ school: 'shadow', min: 65, max: 68, spCoefficient: 0.078 })
    expect(demonicBrandProc('none', BRAND)).toBeNull()
    expect(demonicBrandProc('imp', talentRanksByName(TALENT_DATA.warlock, DEFAULT.talents))).toBeNull()
  })

  it('worked example 10 (warlock.md §11.8): with 600 Fire spell damage and the Imp’s Master Demonologist 5/5, 124.63 a hit on average; 141.21 with Unholy Power and Soul Link; Searing Pain 411.18', () => {
    const a = demonicBrandProc('imp', BRAND)!.action as { min: number; max: number; spCoefficient: number }
    const avg = (a.min + a.max) / 2 + a.spCoefficient * 600
    expect(avg).toBeCloseTo(124.63, 9)
    expect(avg * 1.1 * 1.03).toBeCloseTo(141.2058, 4)
    // Searing Pain with Agonizing Flames 3/3: (116.4 + 0.429 × 600) × 1.1 = 411.18.
    const sp = withTalents(SEARING_PAIN, talentRanksByName(TALENT_DATA.warlock, DEFAULT.talents)).spellDef!
    expect(((sp.min + sp.max) / 2 + sp.spCoefficient * 600) * sp.damageMult).toBeCloseTo(411.18, 9)
  })
})

describe('the pet core’s additions for it (docs/mechanics/ranged-and-pets.md §9)', () => {
  /** A pet swinging every 2 s from the pull, never missing or critting; a 3-charge brand put up at 1 ms; its damage as a proc. */
  function brandPlan(patch: { spellCrit?: number } = {}): { plan: Plan; brand: number; row: number } {
    const plan = withPet(rangedPlan(10000), { spellCrit: patch.spellCrit ?? -100, damageMult: 1.2 })
    plan.ranged = undefined
    plan.stats.fireSpellDamage = 1000
    const brand = addPlanAura(plan, 'brand', 60000, { petLandedCharges: 3 })
    line(plan, addCast(plan, brand), at(plan, 1))
    plan.sources.push({ id: 'brandHit', name: 'Brand', icon: 'x', pet: 'Cat' })
    const row = plan.sources.length - 1
    addProc(plan, { trigger: TRIGGER.petLanded, chance: [1, 1], hands: 0, action: ACTION.petSpellDamage, amount: 0, a: 100, b: 100, spCoefficient: 0.1, school: SCHOOL.fire, source: row, requiresAura: brand })
    return { plan, brand, row }
  }

  it('the brand’s charges go with the pet’s landed attacks, after their procs: 3 hits, then it drops', () => {
    const { plan, brand, row } = brandPlan()
    const sim = new Sim(plan)
    const hits: number[] = []
    sim.damageTrace = (s, d) => {
      if (s === row) hits.push(d)
    }
    sim.runFight(0)
    // Swings at 0 (before the brand), 2000, 4000 and 6000 (its 3 charges), 8000 (after it).
    expect(counter(sim, row, FIELD.casts)).toBe(3)
    expect(counter(sim, row, FIELD.hits)).toBe(3)
    expect(counter(sim, row, FIELD.misses)).toBe(0)
    expect(sim.auraApplications[brand]).toBe(1)
    const s = sim as unknown as { resistFactor: Float64Array; schTaken: Float64Array; spSchool: Float64Array }
    expect(s.spSchool[SCHOOL.fire]).toBe(1000)
    // (100 + 0.1 × 1000) × the pet's 1.2, × the boss's Fire damage taken and average resist.
    for (const d of hits) expect(d).toBeCloseTo(200 * 1.2 * s.schTaken[SCHOOL.fire] * s.resistFactor[SCHOOL.fire], 9)
    // It's the pet's damage: none of your threat.
    expect(counter(sim, row, FIELD.threat)).toBe(0)
  })

  it('crits at the pet’s spell crit, ×1.5, on the pet’s stream', () => {
    const { plan, row } = brandPlan({ spellCrit: 200 })
    const sim = new Sim(plan)
    const hits: number[] = []
    sim.damageTrace = (s, d) => {
      if (s === row) hits.push(d)
    }
    sim.runFight(0)
    expect(counter(sim, row, FIELD.crits)).toBe(3)
    const s = sim as unknown as { resistFactor: Float64Array; schTaken: Float64Array }
    for (const d of hits) expect(d).toBeCloseTo(200 * 1.2 * 1.5 * s.schTaken[SCHOOL.fire] * s.resistFactor[SCHOOL.fire], 9)
  })
})

describe('Demonology’s Searing Pain row (warlock.md §6.4, §11.5)', () => {
  it('with Demonic Brand and the Imp out: Searing Pain puts the brand up, and the Imp’s Firebolts deal its Fire on a row named for it', () => {
    const bundle = buildPlan(config())
    const { plan } = bundle
    const sp = plan.abilities.find((a) => a.id === 'searingPain')!
    expect(plan.auras[sp.aura]).toMatchObject({ id: 'demonicBrand', durationMs: 10000, petLandedCharges: 6 })
    const proc = plan.procs.find((p) => p.id === 'demonicBrand')!
    expect(proc).toMatchObject({ trigger: TRIGGER.petLanded, action: ACTION.petSpellDamage, school: SCHOOL.fire, requiresAura: sp.aura })
    expect(plan.sources[proc.source]).toMatchObject({ name: 'Demonic Brand', pet: 'Imp' })
    const brand = bundle.assumptions.find((a) => a.id === 'demonicBrand')!
    expect(brand.text).toContain('your demon’s next 6 landed attacks, swings and spells alike, each deal 65–68 Fire damage more, plus 7.8% of your Fire spell damage')

    const sim = new Sim(plan)
    let agg = emptyAggregate(plan.sources.length, plan.auras.length)
    for (let k = 0; k * CHUNK_SIZE < 400; k++) agg = mergeChunk(agg, runChunk(plan, k, Math.min(CHUNK_SIZE, 400 - k * CHUNK_SIZE), sim))
    const result = toResult(bundle, agg, 0)
    const row = (id: string) => result.abilities.find((a) => a.id === id)!
    const searing = row('searingPain')
    const hits = row('demonicBrand')
    // Never more than 6 a landed Searing Pain, never a miss.
    expect(hits.hits + hits.crits).toBeLessThanOrEqual(6 * (searing.hits + searing.crits))
    expect(hits.hits + hits.crits).toBeGreaterThan(3 * (searing.hits + searing.crits))
    expect(hits.misses).toBe(0)
    expect(hits.pet).toBe('Imp')
  })

  it('with the Succubus out the brand is Shadow; with no demon out, or the row off, there’s no Searing Pain', () => {
    const succubus = buildPlan(config({ [ID.demon]: 'succubus', [ID.sacrifice]: 'imp' })).plan
    expect(succubus.procs.find((p) => p.id === 'demonicBrand')).toMatchObject({ school: SCHOOL.shadow })
    for (const rotation of [{ [ID.demon]: 'none' }, { [ID.searingPain]: false }]) {
      const { plan } = buildPlan(config(rotation))
      expect(plan.abilities.some((a) => a.id === 'searingPain')).toBe(false)
      expect(plan.procs.some((p) => p.id === 'demonicBrand')).toBe(false)
    }
  })

  it('without the talent nothing changes: the default plan has no Searing Pain, brand or charges', () => {
    const { plan } = buildPlan(config({}, DEFAULT.talents))
    expect(plan.abilities.some((a) => a.id === 'searingPain')).toBe(false)
    expect(plan.procs.some((p) => p.id === 'demonicBrand')).toBe(false)
    expect(plan.auras.some((a) => a.petLandedCharges)).toBe(false)
  })

  it('says the row is unused with no demon out', () => {
    const setup = (talents: string) => ({ race: 'horde-orc', raceName: 'Orc', othersBleed: false, buffGroups: new Set<string>(), talents: talentRanksByName(TALENT_DATA.warlock, talents) })
    const note = (talents: string, demon: string) => unusedSettings('warlock-demonology', { [ID.demon]: demon }, setup(talents))[ID.searingPain]
    expect(note(BRAND_BUILD, 'none')).toBe('Not used: Demonic Brand needs your demon out.')
    expect(note(BRAND_BUILD, 'imp')).toBeUndefined()
    // Without the talent the switch is locked by its `requires`, not a note.
    expect(note(DEFAULT.talents, 'none')).toBeUndefined()
  })
})
