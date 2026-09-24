// The Demonology warlock (docs/classes/warlock.md §11): its demons' spells and talents against the
// Forever client, the worked examples (§11.8), the engine's Demonology pieces (the demon as a pet,
// Demonic Pact, the passives on you, Demonic Energies, Decimation), its settings' notes, a golden run
// and determinism.
import { describe, expect, it } from 'vitest'
import spellsJson from '@/data/client/spells.json'
import talentsJson from '@/data/client/talents.json'
import type { ClientSpells, ClientTalents } from '@/data/client/types'
import { executePhaseStart } from '../../core/formulas'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { addCast, addPlanAura } from '../../engine/ranged-helpers'
import { FIELD, FIELD_COUNT, Sim } from '../../engine/sim'
import { buildPlan } from '../../plan/build'
import { COND, type Plan, SCHOOL } from '../../plan/types'
import { type Aggregate, emptyAggregate, mergeChunk, toResult } from '../../run/aggregate'
import type { SimConfig } from '../../types'
import { talentRanksByName } from '../index'
import { unusedSettings } from '../rotation'
import { lifeTap } from './abilities'
import { DEMONOLOGY_IDS } from './demonology'
import {
  DEMO_CURVE,
  DEMON_INHERITS,
  DEMON_STATS,
  DEMON_WEAPON,
  demonicKnowledge,
  demonPet,
  demonRegenTenths,
  FIREBOLT,
  LASH_OF_PAIN,
  masterDemonologist,
  SOUL_FIRE,
  SOUL_LINK,
  SOUL_LINK_PCT,
} from './demons'
import { CURVE, withTalents } from './talents'

const spells = (spellsJson as unknown as ClientSpells).spells
const clientTalents = (talentsJson as unknown as ClientTalents).classes.warlock.talents
const spell = (id: number) => spells[String(id)]
const effect = (id: number, index: number) => spell(id).effects.find((e) => e.effectIndex === index)!
const manaCost = (id: number) => (spell(id).power ?? [])[0]?.manaCost ?? 0
const curve = (name: string, index = 0) => clientTalents.find((t) => t.name === name)!.rankEffects.find((r) => r.effectIndex === index)!.values
const DEMONOLOGY = talentRanksByName(TALENT_DATA.warlock, defaultConfig('warlock-demonology').talents)
const ranks = (entries: [string, number][]) => new Map(entries)

describe('rows against the Forever client (warlock.md §11.1)', () => {
  it('Firebolt r7 (11763): 44 ± 11.36%, +0.6 a level from 58, 0.571, 115 mana, a 2 s cast and a 1 s GCD', () => {
    const e = effect(11763, 0)
    const grow = e.effectRealPointsPerLevel! * (60 - spell(11763).levels!.baseLevel!)
    expect(FIREBOLT.min).toBeCloseTo(e.effectBasePointsF! * (1 - e.variance! / 2) + grow, 9)
    expect(FIREBOLT.max).toBeCloseTo(e.effectBasePointsF! * (1 + e.variance! / 2) + grow, 9)
    expect(FIREBOLT.spCoefficient).toBe(e.effectBonusCoefficient)
    expect(FIREBOLT.costTenths).toBe(10 * manaCost(11763))
    expect(FIREBOLT.castMs).toBe(spell(11763).castTime!.base)
    expect(FIREBOLT.gcdMs).toBe(spell(11763).cooldowns!.startRecoveryTime)
  })

  it('Lash of Pain r6 (11780): 50 Shadow at 0.429, 160 mana, instant, a 12 s cooldown', () => {
    const e = effect(11780, 0)
    expect([LASH_OF_PAIN.min, LASH_OF_PAIN.max, LASH_OF_PAIN.spCoefficient]).toEqual([e.effectBasePointsF, e.effectBasePointsF, e.effectBonusCoefficient])
    expect(LASH_OF_PAIN.costTenths).toBe(10 * manaCost(11780))
    expect(spell(11780).castTime?.base ?? 0).toBe(0)
    expect(LASH_OF_PAIN.cooldownMs).toBe(spell(11780).cooldowns!.categoryRecoveryTime)
    expect(LASH_OF_PAIN.gcdMs).toBe(spell(11780).cooldowns!.startRecoveryTime)
  })

  it('Soul Fire r2 (17924): 431 ± 22.47%, +1.9 a level from 56, coefficient 1, 335 mana, a 6 s cast, 60 s cooldown', () => {
    const e = effect(17924, 0)
    const s = SOUL_FIRE.spellDef!
    const grow = e.effectRealPointsPerLevel! * (60 - spell(17924).levels!.baseLevel!)
    expect(s.min).toBeCloseTo(e.effectBasePointsF! * (1 - e.variance! / 2) + grow, 9)
    expect(s.max).toBeCloseTo(e.effectBasePointsF! * (1 + e.variance! / 2) + grow, 9)
    expect(s.spCoefficient).toBe(e.effectBonusCoefficient)
    expect(SOUL_FIRE.costTenths).toBe(10 * manaCost(17924))
    expect(SOUL_FIRE.castMs).toBe(spell(17924).castTime!.base)
    expect(SOUL_FIRE.cooldownMs).toBe(spell(17924).cooldowns!.categoryRecoveryTime)
  })

  it('Soul Link (25228) and Master Demonologist’s auras (23759 Fire, 23761 Shadow)', () => {
    expect(effect(25228, 0)).toMatchObject({ effectAura: 79, effectBasePointsF: SOUL_LINK_PCT, effectMiscValue: [127, 0] })
    expect(SOUL_LINK.aura!.mods.schoolDamage).toBe(SOUL_LINK_PCT)
    expect(effect(23759, 0)).toMatchObject({ effectAura: 79, effectMiscValue: [4, 0] })
    expect(effect(23761, 0)).toMatchObject({ effectAura: 79, effectMiscValue: [32, 0] })
    // Summon Felguard and Metamorphosis are Season of Discovery data: no class learns them (§11.1).
    expect(spell(427733)).toBeDefined()
    expect(spell(403789)).toBeDefined()
  })

  it('the talents’ curves are the client’s', () => {
    expect(curve('Improved Imp', 1)).toEqual(DEMO_CURVE.improvedImp)
    expect(curve('Improved Imp', 2)).toEqual(DEMO_CURVE.improvedImpCast)
    expect(curve('Unholy Power')).toEqual(DEMO_CURVE.unholyPower)
    expect(curve('Improved Sayaad')).toEqual(DEMO_CURVE.improvedSayaad)
    expect(curve('Fel Vitality')).toEqual(DEMO_CURVE.felVitality)
    expect(curve('Demonic Energies', 1)).toEqual(DEMO_CURVE.demonicEnergies)
    expect(curve('Demonic Knowledge')).toEqual(DEMO_CURVE.demonicKnowledge)
    expect(curve('Master Demonologist', 0)).toEqual(DEMO_CURVE.masterDemonologist)
    expect(curve('Master Demonologist', 2)).toEqual(DEMO_CURVE.masterDemonologist)
    expect(curve('Decimation', 0).map((v) => -v)).toEqual(CURVE.decimationCast)
    expect(curve('Decimation', 1).map((v) => -v)).toEqual(CURVE.decimationCooldown)
    expect(curve('Decimation', 3)).toEqual(CURVE.decimationDamage)
    expect(curve('Bane', 1).map((v) => -v)).toEqual(CURVE.baneSoulFireCast)
    // Decimation's threshold is 35% (#2).
    expect(effect(440870, 2).effectBasePointsF).toBe(35)
  })
})

describe('worked examples (warlock.md §11.8)', () => {
  it('1. Firebolt: 42.70–47.70 at 60; 113.63 with Demonic Knowledge, Improved Imp and Master Demonologist; 128.74 with Unholy Power and Soul Link', () => {
    expect(FIREBOLT.min).toBeCloseTo(42.7, 6)
    expect(FIREBOLT.max).toBeCloseTo(47.7, 6)
    const imp = demonPet('imp', DEMONOLOGY)!
    const bolt = imp.abilities[0]
    const avg = (bolt.min + bolt.max) / 2 + bolt.spCoefficient * imp.stats.spellDamage!
    expect(avg).toBeCloseTo(113.6278, 4)
    expect(avg * imp.damageMult).toBeCloseTo(128.7403, 3)
  })

  it('2. Lash of Pain: 108.31, and 122.71 with Unholy Power and Soul Link', () => {
    const succubus = demonPet('succubus', DEMONOLOGY)!
    const lash = succubus.abilities[0]
    const avg = lash.min + lash.spCoefficient * succubus.stats.spellDamage!
    expect(avg).toBeCloseTo(108.3082, 4)
    expect(avg * succubus.damageMult).toBeCloseTo(122.713, 3)
  })

  it('3. The Succubus’s swing: 240 attack power, 90.74 on average before armor, glancing and crits', () => {
    const { plan } = buildPlan(fixed())
    expect(plan.pet!.ap).toBe(240)
    const avg = ((DEMON_WEAPON.min + DEMON_WEAPON.max) / 2 + (plan.pet!.ap / 14) * DEMON_WEAPON.speedSec) * plan.pet!.damageMult
    expect(avg).toBeCloseTo(90.737, 3)
  })

  it('4. Demonic Knowledge: 19 / 40 / 60 spell damage', () => {
    expect([1, 2, 3].map((r) => demonicKnowledge(ranks([['Demonic Knowledge', r]])))).toEqual([19, 40, 60])
  })

  it('5. The Imp’s mana: 2,182.7 with Fel Vitality 3/3, 57.25 every 2 s, and all of a Life Tap with Demonic Energies 2/2', () => {
    expect(demonPet('imp', DEMONOLOGY)!.power).toMatchObject({ maxTenths: 21827, tickTenths: 572, tickMs: 2000 })
    expect(demonRegenTenths(DEMON_STATS.imp.spi)).toBe(572)
    const { plan } = buildPlan(fixed({ [DEMONOLOGY_IDS.demon]: 'imp', [DEMONOLOGY_IDS.sacrifice]: 'succubus' }))
    const tap = plan.abilities.find((a) => a.id === 'lifeTap')!
    expect(tap.petPowerTenths).toBe(tap.manaTenths)
    expect(lifeTap(220, 2).manaTenths).toBe(7728)
  })

  it('6. Soul Fire with Bane 5/5 and Decimation 2/2: a 2.4 s cast, a 6 s cooldown', () => {
    const sf = withTalents(SOUL_FIRE, ranks([['Bane', 5], ['Decimation', 2]]))
    expect([sf.castMs, sf.cooldownMs]).toEqual([2400, 6000])
    expect(withTalents(SOUL_FIRE, ranks([])).castMs).toBe(6000)
  })

  it('8. What the Succubus inherits: 253.8 attack power, 108.6 spell damage, your 11.73% crit (9.33% on its swings vs the boss), 13% spell miss; Lash of Pain 156.49', () => {
    const { plan } = buildPlan(fixed())
    expect(plan.pet).toMatchObject({ crit: 0, spellCrit: 0, hit: 0, spellHit: 0, ...DEMON_INHERITS })
    const sim = new Sim(plan)
    sim.runFight(0)
    const s = sim as unknown as { ap: number; derived: { spellCrit: number; spellHit: number }; spSchool: Float64Array; petAp: number; petCritPct: number; petSpellCritNow: number; petSpecCrit: number; petSpellMissPct: number }
    expect(s.ap).toBe(138)
    expect(s.petAp).toBeCloseTo(253.8, 9)
    expect(s.derived.spellCrit).toBeCloseTo(11.7325, 9)
    expect([s.petCritPct, s.petSpellCritNow]).toEqual([s.derived.spellCrit, s.derived.spellCrit])
    // Its swings: − 0.6 for its skill of 300, − 1.8 as aura crit (combat-tables §4.4) = 9.33%.
    expect(s.petSpecCrit).toBeCloseTo(9.3325, 9)
    expect(s.derived.spellHit).toBe(4)
    expect(s.petSpellMissPct).toBe(13)
    // Lash of Pain's spell damage: Demonic Knowledge's 60 + 10% of your 486 Shadow (426 + your own 60).
    expect(s.spSchool[SCHOOL.shadow]).toBe(486)
    const lash = plan.pet!.abilities[0]
    const sp = plan.pet!.spellDamage + DEMON_INHERITS.spellDamageFromOwner * s.spSchool[SCHOOL.shadow]
    expect(sp).toBeCloseTo(108.6, 9)
    expect((lash.min + lash.spCoefficient * sp) * plan.pet!.damageMult).toBeCloseTo(156.493, 3)
  })

  it('9. Improved Imp’s hidden effect as Firebolt’s cast time: 1.7 / 1.3 / 1 s', () => {
    expect([1, 2, 3].map((r) => demonPet('imp', ranks([['Improved Imp', r]]))!.abilities[0].castMs)).toEqual([1700, 1300, 1000])
    expect(demonPet('imp', ranks([]))!.abilities[0].castMs).toBe(FIREBOLT.castMs)
  })

  it('7. Shadow in the default: ×1.30295 from Burning Shadow, Master Demonologist and Soul Link', () => {
    const { plan } = buildPlan(fixed())
    const shadow = ['burningShadow', 'masterDemonologist', 'soulLink'].map((id) => plan.auras.find((a) => a.id === id)!)
    for (const a of shadow) expect(a.schoolMask! & (1 << SCHOOL.shadow), a.id).not.toBe(0)
    expect(shadow.reduce((m, a) => m * (1 + a.schoolDamage! / 100), 1)).toBeCloseTo(1.30295, 10)
  })
})

function runFights(plan: Plan, fights: number): Aggregate {
  const sim = new Sim(plan)
  let agg = emptyAggregate(plan.sources.length, plan.auras.length)
  for (let k = 0; k * CHUNK_SIZE < fights; k++) agg = mergeChunk(agg, runChunk(plan, k, Math.min(CHUNK_SIZE, fights - k * CHUNK_SIZE), sim))
  return agg
}
function fixed(rotation: SimConfig['rotation'] = {}, extra: Partial<SimConfig> = {}): SimConfig {
  const d = defaultConfig('warlock-demonology')
  return { ...d, ...extra, rotation: { ...d.rotation, ...rotation }, run: { mode: 'fixed', iterations: 500, seed: 4242 } }
}
/** The Succubus out with the Imp sacrificed, Soul Fire off: the Shadow build (warlock.md §11.6). */
const SUCCUBUS = { [DEMONOLOGY_IDS.demon]: 'succubus', [DEMONOLOGY_IDS.sacrifice]: 'imp', [DEMONOLOGY_IDS.soulFire]: false }
const row = (plan: Plan, id: string) => plan.sources.findIndex((s) => s.id === id)
const perFight = (plan: Plan, agg: Aggregate, id: string, field: keyof typeof FIELD) => agg.counters[row(plan, id) * FIELD_COUNT + FIELD[field]] / agg.fights
const prepull = (plan: Plan) => plan.prepull.casts.map((c) => [plan.abilities[c.ability].id, c.atMs])

describe('the engine’s Demonology pieces (warlock.md §11.2–§11.5)', () => {
  it('keeps the Succubus out with the Imp sacrificed (Demonic Pact), its passives up before the pull', () => {
    const { plan } = buildPlan(fixed())
    expect(prepull(plan)).toEqual([
      ['demonicSacrifice', -3000],
      ['soulLink', -2000],
      ['masterDemonologist', -2000],
      ['demonicKnowledge', -2000],
    ])
    expect(plan.pet).toMatchObject({ id: 'succubus', name: 'Succubus', weapon: DEMON_WEAPON, glances: true, front: false, spellDamage: 60 })
    expect(plan.pet!.abilities.map((a) => a.id)).toEqual(['lashOfPain'])
    // The demon's rows name it (ranged-and-pets.md §10).
    expect(plan.sources.filter((s) => s.pet).map((s) => [s.id, s.pet])).toEqual([
      ['succubus.melee', 'Succubus'],
      ['succubus.lashOfPain', 'Succubus'],
    ])
    expect(plan.auras.find((a) => a.id === 'demonicKnowledge')).toMatchObject({ spellDamage: 60 })
  })

  it('a demon out cancels the sacrifice without Demonic Pact, and summoning the sacrificed demon does too', () => {
    const noPact = buildPlan(fixed({}, { talents: defaultConfig('warlock-demonology').talents.replace('0001351-', '0001350-') })).plan
    expect(prepull(noPact).map(([id]) => id)).not.toContain('demonicSacrifice')
    const same = buildPlan(fixed({ [DEMONOLOGY_IDS.demon]: 'imp', [DEMONOLOGY_IDS.sacrifice]: 'imp' })).plan
    expect(prepull(same).map(([id]) => id)).not.toContain('demonicSacrifice')
    const none = buildPlan(fixed({ [DEMONOLOGY_IDS.demon]: 'none' })).plan
    expect(prepull(none)).toEqual([['demonicSacrifice', -3000]])
    expect(none.pet).toBeUndefined()
  })

  it('the Felhunter swings and gives you no Master Demonologist damage; the Imp only casts', () => {
    expect(masterDemonologist('felhunter', DEMONOLOGY)).toBeNull()
    const fel = buildPlan(fixed({ [DEMONOLOGY_IDS.demon]: 'felhunter' })).plan
    expect(fel.pet!.abilities).toEqual([])
    expect(fel.pet!.power).toBeNull()
    const imp = buildPlan(fixed({ [DEMONOLOGY_IDS.demon]: 'imp', [DEMONOLOGY_IDS.sacrifice]: 'succubus' })).plan
    expect(imp.pet!.weapon).toBeNull()
    expect(imp.auras.find((a) => a.id === 'masterDemonologist')!.schoolMask).toBe(1 << SCHOOL.fire)
    const agg = runFights(imp, 200)
    expect(perFight(imp, agg, 'imp.firebolt', 'casts')).toBeGreaterThan(80)
    expect(perFight(imp, agg, 'imp.firebolt', 'damage')).toBeGreaterThan(0)
  })

  it('Demonic Energies keeps the Imp casting: without it, it runs dry', () => {
    const cfg = fixed({ [DEMONOLOGY_IDS.demon]: 'imp', [DEMONOLOGY_IDS.sacrifice]: 'succubus' })
    const withDE = buildPlan(cfg).plan
    const without = buildPlan({ ...cfg, talents: cfg.talents.replace('03250032', '03250030') }).plan
    expect(without.abilities.find((a) => a.id === 'lifeTap')!.petPowerTenths).toBeUndefined()
    const a = perFight(withDE, runFights(withDE, 200), 'imp.firebolt', 'casts')
    const b = perFight(without, runFights(without, 200), 'imp.firebolt', 'casts')
    expect(b).toBeLessThan(a * 0.85)
  })

  it('Decimation: Soul Fire only once the boss is below 35%, and Shadow Bolt +6% there', () => {
    const { plan } = buildPlan(fixed({ [DEMONOLOGY_IDS.soulFire]: true }))
    const sf = plan.abilities.findIndex((a) => a.id === 'soulFire')
    expect(plan.abilities[sf]).toMatchObject({ castMs: 2400, cooldownMs: 6000 })
    expect(plan.rotation.find((e) => e.ability === sf)!.conditions).toEqual([{ code: COND.healthAtMost, a: 35, b: 0 }])
    const bolt = plan.spells!.find((s) => plan.sources[s.source].id === 'shadowBolt')!
    expect([bolt.lowHealthPct, bolt.lowHealthBelowPct]).toEqual([6, 35])
    const steady: Plan = { ...plan, fight: { ...plan.fight, variation: 0 } }
    const sim = new Sim(steady)
    const casts: number[] = []
    sim.castTrace = (a, t) => {
      if (a === sf) casts.push(t)
    }
    for (let i = 0; i < 20; i++) sim.runFight(i)
    expect(casts.length).toBeGreaterThan(100)
    expect(Math.min(...casts)).toBeGreaterThanOrEqual(executePhaseStart(steady.fight.durationMs, 35))
  })

  it('COND.healthAtMost at its bounds: 100 holds from the pull, 0 never', () => {
    const { plan } = buildPlan(fixed({ [DEMONOLOGY_IDS.soulFire]: true }))
    const sf = plan.abilities.findIndex((a) => a.id === 'soulFire')
    const at = (pct: number) => {
      const p: Plan = { ...plan, rotation: plan.rotation.map((e) => (e.ability === sf ? { ...e, conditions: [{ code: COND.healthAtMost, a: pct, b: 0 }] } : e)) }
      const sim = new Sim(p)
      const casts: number[] = []
      sim.castTrace = (a, t) => {
        if (a === sf) casts.push(t)
      }
      for (let i = 0; i < 10; i++) sim.runFight(i)
      return casts
    }
    expect(Math.min(...at(100))).toBeLessThan(10000)
    expect(at(0)).toEqual([])
  })

  it('the Rotation tab says why a sacrifice does nothing', () => {
    const setup = (talents: string) => ({ race: 'horde-orc', raceName: 'Orc', othersBleed: false, buffGroups: new Set<string>(), talents: talentRanksByName(TALENT_DATA.warlock, talents) })
    const talents = defaultConfig('warlock-demonology').talents
    const same = unusedSettings('warlock-demonology', { [DEMONOLOGY_IDS.demon]: 'imp', [DEMONOLOGY_IDS.sacrifice]: 'imp' }, setup(talents))
    expect(same[DEMONOLOGY_IDS.sacrifice]).toBe('Not used: summoning the demon you sacrificed cancels its buff.')
    const noPact = unusedSettings('warlock-demonology', {}, setup(talents.replace('0001351-', '0001350-')))
    expect(noPact[DEMONOLOGY_IDS.sacrifice]).toBe('Not used: summoning your demon cancels it without Demonic Pact.')
    expect(unusedSettings('warlock-demonology', {}, setup(talents))[DEMONOLOGY_IDS.sacrifice]).toBeUndefined()
    expect(unusedSettings('warlock-demonology', { [DEMONOLOGY_IDS.demon]: 'none' }, setup(talents.replace('0001351-', '0001350-')))[DEMONOLOGY_IDS.sacrifice]).toBeUndefined()
  })

  it('its Standard raid keeps the boss’s armor debuffs for the Succubus’s swings', () => {
    const { plan } = buildPlan(fixed())
    expect(plan.fight.targetArmor).toBeLessThan(1000)
    const result = toResult(buildPlan(fixed()), runFights(plan, 100), 0)
    expect(result.abilities.filter((a) => a.pet).map((a) => a.name)).toEqual(['Auto attack', 'Lash of Pain'])
    expect(result.assumptions.map((a) => a.id)).toEqual(expect.arrayContaining(['demonOut', 'demonStats', 'demonInherits', 'demonTable', 'demonMana', 'masterDemonologist']))
    expect(result.assumptions.map((a) => a.id)).not.toContain('warlockNoPet')
    // Improved Imp's cast time is the Imp's alone (Q19).
    expect(result.assumptions.map((a) => a.id)).not.toContain('improvedImpCast')
    const imp = buildPlan(fixed({ [DEMONOLOGY_IDS.demon]: 'imp', [DEMONOLOGY_IDS.sacrifice]: 'succubus' }))
    expect(imp.assumptions.find((a) => a.id === 'improvedImpCast')!.text).toContain('its 2 s cast becomes 1 s')
  })

  it('the demon’s crit and hit follow yours, and its spells never read your school auras', () => {
    const { plan } = buildPlan(fixed())
    const agg = (p: Plan) => runFights(p, 300)
    const base = agg(plan)
    // No inherited crit or hit: fewer crits and more misses on both of the Succubus's rows.
    const own: Plan = { ...plan, pet: { ...plan.pet!, critFromOwnerSpellCrit: 0, hitFromOwnerSpellHit: 0 } }
    const lone = agg(own)
    for (const id of ['succubus.melee', 'succubus.lashOfPain']) {
      expect(perFight(own, lone, id, 'crits'), id).toBe(0)
      expect(perFight(own, lone, id, 'misses'), id).toBeGreaterThan(perFight(plan, base, id, 'misses'))
    }
    // docs/classes/warlock.md §11.4: your Burning Shadow, Master Demonologist and Soul Link auras are
    // yours; the demon's own talents are in its damage already. Without them your damage falls and
    // its is the same to the last point.
    const mine = new Set(['burningShadow', 'masterDemonologist', 'soulLink'])
    const bare: Plan = { ...plan, auras: plan.auras.map((a) => (mine.has(a.id) ? { ...a, schoolDamage: 0 } : a)) }
    const without = agg(bare)
    for (const id of ['succubus.melee', 'succubus.lashOfPain']) expect(perFight(bare, without, id, 'damage'), id).toBe(perFight(plan, base, id, 'damage'))
    expect(perFight(bare, without, 'shadowBolt', 'damage')).toBeLessThan(perFight(plan, base, 'shadowBolt', 'damage'))
  })

  it('the demon’s crit follows your spell crit as it changes mid-fight, and its swings take the aura-crit suppression', () => {
    const { plan } = buildPlan(fixed(SUCCUBUS))
    // A +10% spell crit aura on you for 5 s every 20 s, cast first on the list.
    const aura = addPlanAura(plan, 'testSpellCrit', 5000, { spellCrit: 10 })
    const cast = addCast(plan, aura, 20000)
    plan.rotation = [{ ability: cast, conditions: [], unqueueBelowTenths: 0 }, ...plan.rotation]
    const sim = new Sim(plan)
    const s = sim as unknown as { derived: { spellCrit: number }; auraActive: Uint8Array | boolean[]; petCritPct: number; petSpellCritNow: number; petSpecCrit: number }
    const seen = { on: new Set<string>(), off: new Set<string>() }
    sim.damageTrace = () => {
      const key = [s.derived.spellCrit, s.petCritPct, s.petSpellCritNow, s.petSpecCrit].map((x) => x.toFixed(6)).join(' ')
      seen[s.auraActive[aura] ? 'on' : 'off'].add(key)
    }
    sim.runFight(0)
    const parse = (set: Set<string>) => [...set].map((k) => k.split(' ').map(Number))
    const off = parse(seen.off)
    const on = parse(seen.on)
    expect(off.length).toBe(1)
    expect(on.length).toBe(1)
    const [[mine, crit, spellCrit, special]] = off
    // Off: your 11.73% is its crit, melee and spells alike; its specials lose 0.6 (skill 300) and 1.8 (aura crit).
    expect(mine).toBeCloseTo(11.7325, 9)
    expect([crit, spellCrit]).toEqual([mine, mine])
    expect(special).toBeCloseTo(mine - 0.6 - 1.8, 6)
    // On: +10 on you and on it.
    expect(on[0][0]).toBeCloseTo(mine + 10, 6)
    expect(on[0][1]).toBeCloseTo(mine + 10, 6)
    expect(on[0][2]).toBeCloseTo(mine + 10, 6)
    expect(on[0][3]).toBeCloseTo(mine + 10 - 0.6 - 1.8, 6)
  })

  it('Improved Shadow Bolt’s assumption names its rank’s Shadow Vulnerability: +12% at 3/5, +20% at 5/5', () => {
    const text = (talents?: string) => {
      const bundle = buildPlan(fixed({}, talents ? { talents } : {}))
      return bundle.assumptions.find((a) => a.id === 'improvedShadowBolt')!.text
    }
    expect(text()).toContain('+12% Shadow damage taken from you (4% a rank)')
    expect(text()).not.toContain('{detail}')
    // Improved Shadow Bolt 5/5 for two of Agonizing Flames' points.
    const talents = defaultConfig('warlock-demonology').talents.replace(/-0350305003$/, '-0550305001')
    expect(talentRanksByName(TALENT_DATA.warlock, talents).get('Improved Shadow Bolt')).toBe(5)
    expect(text(talents)).toContain('+20% Shadow damage taken from you')
  })
})

describe('golden runs (fixed config and seed)', () => {
  // Snapshot history (update only deliberately, and say why here):
  // - H3: the default Demonology warlock (warlock.md §11.5, §11.6): the Succubus out, the Imp sacrificed
  //   with Demonic Pact, Soul Link, Master Demonologist and Demonic Knowledge, Immolate, Corruption, Bane
  //   of Doom then Agony, Shadow Bolt, Life Tap at 10%; 492.8 DPS over 20,000 fights on seed 2701 (§11.6).
  // - H3 review (DM4): the demon inherits 10% of your attack power and spell damage, and your spell crit
  //   and hit (§11.2, D29): 491.39 → 500.64 here (+1.9%); 492.8 → 502.0 over 20,000 fights.
  // - H3 verification (DV3): the crit the demon inherits is aura crit, so its swings lose 1.8% of it
  //   against the boss (combat-tables §4.4): 500.64 → 499.89 here; 502.0 → 501.3 over 20,000 fights.
  it('keeps the default warlock-demonology’s result unchanged', () => {
    const bundle = buildPlan({ ...defaultConfig('warlock-demonology'), run: { mode: 'fixed', iterations: 1000, seed: 12345 } })
    const result = toResult(bundle, runFights(bundle.plan, 1000), 0)
    expect({
      dps: result.dps,
      abilities: result.abilities.map((a) => [a.id, a.pet ?? null, a.damage, a.casts, a.hits, a.crits, a.misses, a.glances]),
      cooldowns: result.cooldowns.map((c) => [c.id, c.castsPerFight, c.uptimePct]),
      mana: result.mana,
    }).toMatchSnapshot()
  })

  it('is deterministic: the same config and seed give the same result, for each demon', () => {
    for (const demon of ['succubus', 'imp', 'felhunter']) {
      const run = () => {
        const bundle = buildPlan({ ...fixed({ [DEMONOLOGY_IDS.demon]: demon }), run: { mode: 'fixed', iterations: 500, seed: 777 } })
        return JSON.stringify(toResult(bundle, runFights(bundle.plan, 500), 0).abilities)
      }
      expect(run()).toBe(run())
    }
  })
})
