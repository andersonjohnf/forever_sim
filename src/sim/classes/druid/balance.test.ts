// The Balance druid (docs/classes/druid.md §11): its spells and talents against the Forever client
// data, the worked examples (§11.7), its priority list (§11.5), the engine's pieces it brought
// (Nature's Grace's GCD, Eclipse's charges, Omen of Clarity on spells), a golden run, determinism,
// and the feral specs left as they were.
import { describe, expect, it } from 'vitest'
import spellsJson from '@/data/client/spells.json'
import talentsJson from '@/data/client/talents.json'
import type { ClientSpell, ClientSpells } from '@/data/client/types'
import { encodeTalentCode } from '@/data/talents/types'
import { averageResist, levelResistance } from '../../core/attack-table'
import { GCD_MS, hastedCastMs, spiritRegenTickTenths, spellCritMultiplier } from '../../core/formulas'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { Sim } from '../../engine/sim'
import { timeline } from '../../engine/test-helpers'
import { normalizeConfig } from '../../config/normalize'
import { buildPlan } from '../../plan/build'
import { COND, type Plan } from '../../plan/types'
import { type Aggregate, emptyAggregate, mergeChunk, toResult } from '../../run/aggregate'
import type { RotationValue, SimConfig } from '../../types'
import { talentRanksByName } from '../index'
import { BALANCE_IDS as ID, BALANCE_OPTIONS, balanceRotation, balanceUnusedSettings } from './balance'
import {
  balanceCost,
  ECLIPSE,
  ECLIPSE_AURA,
  ECLIPSE_MS,
  FAERIE_FIRE_MOONKIN,
  IMPROVED_MOONFIRE_PCT_PER_RANK,
  INNERVATE,
  INNERVATE_MANA,
  INSECT_SWARM,
  INSECT_SWARM_SPELL,
  MOONFIRE,
  MOONFIRE_SPELL,
  MOONGLOW_PCT,
  NATURES_GRACE,
  NATURES_GRACE_AURA,
  omenOfClaritySpells,
  STARFIRE,
  STARFIRE_SPELL,
  VENGEANCE_PCT_PER_RANK,
  withBalanceTalents,
  WRATH,
  WRATH_SPELL,
} from './balance-abilities'
import { atLevel60, spread } from '../paladin/spells'

const BALANCE = 'druid-balance'
const spells = (spellsJson as unknown as ClientSpells).spells
const spell = (id: number): ClientSpell => {
  const s = spells[String(id)]
  expect(s, `client spell ${id}`).toBeDefined()
  return s
}
const effect = (id: number, index: number) => spell(id).effects.find((e) => e.effectIndex === index)!
type ClientTalent = { name: string; rankEffects: { effectIndex: number; values: number[] }[] }
const curve = (name: string, index: number) =>
  (talentsJson as unknown as { classes: { druid: { talents: ClientTalent[] } } }).classes.druid.talents
    .find((t) => t.name === name)!
    .rankEffects.find((e) => e.effectIndex === index)!.values

const DEFAULT_TALENTS = talentRanksByName(TALENT_DATA.druid, defaultConfig(BALANCE).talents)
const resolved = (def: Parameters<typeof withBalanceTalents>[0]) => withBalanceTalents(def, DEFAULT_TALENTS)

/** A build code from druid talent ranks by name. */
function talentCode(ranks: Record<string, number>): string {
  const data = TALENT_DATA.druid
  const byName = new Map(data.trees.flatMap((t) => t.talents).map((t) => [t.name, t.id]))
  return encodeTalentCode(data, Object.fromEntries(Object.entries(ranks).map(([n, r]) => [byName.get(n)!, r])))
}

describe('the Balance spells against the Forever client (druid.md §11.2)', () => {
  it('Starfire r7, Wrath r8, Moonfire r10 and Insect Swarm r5 have the client’s damage, coefficients, casts and costs', () => {
    const sf = effect(25298, 0)
    const [sfMin, sfMax] = spread(sf.effectBasePointsF!, sf.variance!)
    expect([STARFIRE_SPELL.min, STARFIRE_SPELL.max]).toEqual([sfMin, sfMax])
    expect(spell(25298).levels!.baseLevel).toBe(60)
    expect(STARFIRE_SPELL.spCoefficient).toBe(sf.effectBonusCoefficient)
    expect(STARFIRE.castMs).toBe(spell(25298).castTime!.base)
    expect(STARFIRE.costTenths).toBe(10 * spell(25298).power![0].manaCost!)
    expect(spell(25298).misc!.schoolMask).toBe(64)

    const w = effect(9912, 0)
    const grow = atLevel60(0, w.effectRealPointsPerLevel!, spell(9912).levels!.baseLevel!, spell(9912).levels!.maxLevel!)
    const [wMin, wMax] = spread(w.effectBasePointsF!, w.variance!)
    expect(WRATH_SPELL.min).toBeCloseTo(wMin + grow, 9)
    expect(WRATH_SPELL.max).toBeCloseTo(wMax + grow, 9)
    expect([WRATH_SPELL.min, WRATH_SPELL.max].map((x) => Math.round(x * 100) / 100)).toEqual([61.78, 68.62])
    expect(WRATH_SPELL.spCoefficient).toBe(w.effectBonusCoefficient)
    expect([WRATH.castMs, WRATH.costTenths]).toEqual([spell(9912).castTime!.base, 10 * spell(9912).power![0].manaCost!])
    expect(spell(9912).misc!.schoolMask).toBe(8)

    const hit = effect(9835, 1)
    const dot = effect(9835, 0)
    const mfGrow = atLevel60(0, hit.effectRealPointsPerLevel!, spell(9835).levels!.baseLevel!, spell(9835).levels!.maxLevel!)
    expect(MOONFIRE_SPELL.min).toBeCloseTo(spread(hit.effectBasePointsF!, hit.variance!)[0] + mfGrow, 9)
    expect(MOONFIRE_SPELL.spCoefficient).toBe(hit.effectBonusCoefficient)
    expect([MOONFIRE_SPELL.dotTickDamage, MOONFIRE_SPELL.dotSpCoefficient, MOONFIRE_SPELL.dotTickMs]).toEqual([dot.effectBasePointsF, dot.effectBonusCoefficient, dot.effectAuraPeriod])
    expect(MOONFIRE_SPELL.dotTicks! * MOONFIRE_SPELL.dotTickMs!).toBe(spell(9835).duration!.duration)
    expect(MOONFIRE.costTenths).toBe(10 * spell(9835).power![0].manaCost!)

    const is = effect(24977, 0)
    expect([INSECT_SWARM_SPELL.dotTickDamage, INSECT_SWARM_SPELL.dotSpCoefficient, INSECT_SWARM_SPELL.dotTickMs]).toEqual([is.effectBasePointsF, is.effectBonusCoefficient, is.effectAuraPeriod])
    expect(INSECT_SWARM_SPELL.dotTicks! * INSECT_SWARM_SPELL.dotTickMs!).toBe(spell(24977).duration!.duration)
    // Its −2% hit (aura 54) is an effect besides damage: binary (spells.md §3).
    expect(effect(24977, 1).effectAura).toBe(54)
    expect(INSECT_SWARM_SPELL.binary).toBe(true)
    expect(INSECT_SWARM.costTenths).toBe(10 * spell(24977).power![0].manaCost!)
  })

  it('flags Moonfire’s and Insect Swarm’s ticks as periodic crits, as Forever’s SpellMisc does (Attributes[8] 0x200)', () => {
    for (const id of [9835, 24977]) expect(spell(id).misc!.attributes![8] & 0x200, String(id)).toBe(0x200)
    expect([MOONFIRE_SPELL.dotCanCrit, INSECT_SWARM_SPELL.dotCanCrit]).toEqual([true, true])
  })

  it('every Balance spell is magic-class, on the 1.5 s GCD, castable in Moonkin Form; Faerie Fire and Innervate as the client has them', () => {
    for (const id of [25298, 9912, 9835, 24977, 9907, 29166]) {
      expect(spell(id).categories!.defenseType, String(id)).toBe(1)
      expect(spell(id).cooldowns!.startRecoveryTime, String(id)).toBe(GCD_MS)
      expect(spell(id).shapeshift!.shapeshiftMask![0] & (1 << 30), String(id)).toBe(1 << 30)
    }
    expect(FAERIE_FIRE_MOONKIN.costTenths).toBe(10 * spell(9907).power![0].manaCost!)
    expect(FAERIE_FIRE_MOONKIN.aura!.mods.targetArmor).toBe(-effect(9907, 0).effectBasePointsF!)
    expect(INNERVATE_MANA).toBe(62)
    expect(INNERVATE.cooldownMs).toBe(spell(29166).cooldowns!.recoveryTime)
    expect(INNERVATE.aura!.durationMs).toBe(spell(29166).duration!.duration)
    expect(INNERVATE.aura!.mods).toEqual({ spiritRegen: effect(29166, 1).effectBasePointsF, castingRegen: effect(29166, 0).effectBasePointsF })
  })
})

describe('the Balance talents against the client (druid.md §11.3)', () => {
  it('reads each rank’s value from its curve', () => {
    expect(curve('Improved Wrath', 0)).toEqual([-100, -200, -300, -400, -500])
    expect(curve('Improved Wrath', 1)).toEqual([-10, -20, -30, -40, -50])
    expect(curve('Improved Starfire', 0)).toEqual([-100, -200, -300, -400, -500])
    expect(curve('Moonglow', 0).map((x) => -x)).toEqual(MOONGLOW_PCT.slice(1))
    expect(curve('Improved Moonfire', 0)).toEqual([IMPROVED_MOONFIRE_PCT_PER_RANK, 2 * IMPROVED_MOONFIRE_PCT_PER_RANK])
    expect(curve('Vengeance', 0)).toEqual([1, 2, 3, 4, 5].map((r) => r * VENGEANCE_PCT_PER_RANK))
    expect(curve('Eclipse', 1).map((x) => -x)).toEqual(ECLIPSE_MS.slice(1))
    expect(curve('Moonfury', 0)).toEqual([2, 4, 6, 8, 10])
    expect(curve('Genesis', 0)).toEqual([1, 2, 3, 4, 5])
  })

  it('Nature’s Grace is +10% casting speed and −10% GCD for 3 s on any spell crit; Eclipse’s and Moonkin Form’s rows', () => {
    expect(effect(16886, 0)).toMatchObject({ effectAura: 65, effectBasePointsF: NATURES_GRACE_AURA.mods.castHaste })
    expect(effect(16886, 1)).toMatchObject({ effectAura: 108, effectBasePointsF: -NATURES_GRACE_AURA.mods.gcdPct!, effectMiscValue: [21, 0] })
    expect(spell(16886).duration!.duration).toBe(NATURES_GRACE_AURA.durationMs)
    expect(spell(16880).auraOptions!.procChance).toBe(100)
    // Moonkin Form: +100% chance and −50% proc cooldown on Omen of Clarity (16864's class mask).
    expect(effect(24858, 4)).toMatchObject({ effectAura: 108, effectBasePointsF: 100, effectMiscValue: [18, 0], effectSpellClassMask: spell(16864).classOptions!.spellClassMask })
    expect(effect(24858, 5)).toMatchObject({ effectAura: 108, effectBasePointsF: -50, effectMiscValue: [38, 0] })
    expect(spell(16864).auraOptions!.procCategoryRecovery).toBe(10000)
    expect(omenOfClaritySpells(true)).toMatchObject({ chance: { ppmCast: 4 }, icdMs: 5000 })
    expect(omenOfClaritySpells(false)).toMatchObject({ chance: { ppmCast: 2 }, icdMs: 10000 })
    // Moonkin Aura: party aura 290, +3.
    expect(effect(24907, 0)).toMatchObject({ effectAura: 290, effectBasePointsF: 3 })
  })

  it('Clearcasting pays for Starfire, Moonfire and Insect Swarm, not Wrath (16870’s class mask)', () => {
    const mask = effect(16870, 0).effectSpellClassMask![0] >>> 0
    const bit = (id: number) => (spell(id).classOptions!.spellClassMask![0] & mask) !== 0
    expect([bit(25298), bit(9835), bit(24977), bit(9912)]).toEqual([true, true, true, false])
    expect([STARFIRE.clearcastable, MOONFIRE.clearcastable, INSECT_SWARM.clearcastable, WRATH.clearcastable]).toEqual([true, true, true, undefined])
  })
})

describe('worked examples (druid.md §11.7)', () => {
  const resist = 1 - averageResist(levelResistance(63, 60), 60)
  const moonfury = 1.1
  const mid = (s: { min: number; max: number }) => (s.min + s.max) / 2

  it('B1, B2: Starfire and Wrath at 500 spell damage with Moonfury, and Vengeance’s ×2.0 crits', () => {
    const sf = resolved(STARFIRE).spellDef!
    expect((mid(sf) + 500) * moonfury * resist).toBeCloseTo(910.95, 2)
    expect(sf.critMultiplier).toBe(spellCritMultiplier(100))
    expect((mid(sf) + 500) * moonfury * resist * sf.critMultiplier).toBeCloseTo(1821.91, 2)
    const w = resolved(WRATH).spellDef!
    expect((mid(w) + 0.571 * 500) * moonfury * resist).toBeCloseTo(362.62, 2)
    expect((mid(w) + 0.571 * 500) * moonfury * resist * 2).toBeCloseTo(725.25, 2)
  })

  it('B3: Moonfire with Improved Moonfire, Genesis, Nature’s Splendor and Moonfury', () => {
    const mf = resolved(MOONFIRE).spellDef!
    expect(mf.bonusCrit).toBe(10)
    expect((mid(mf) + 0.15 * 500) * mf.damageMult * moonfury * resist).toBeCloseTo(244.09, 2)
    const tick = (mf.dotTickDamage! + mf.dotSpCoefficient! * 500) * mf.damageMult * moonfury * resist
    expect(tick).toBeCloseTo(149.28, 2)
    expect(mf.dotTicks).toBe(5)
    expect(tick * mf.dotTicks!).toBeCloseTo(746.42, 2)
    expect(resolved(MOONFIRE).aura!.durationMs).toBe(15000)
  })

  it('B4: Insect Swarm’s ticks, binary, and its whole-resist chance', () => {
    const is = resolved(INSECT_SWARM).spellDef!
    const tick = (is.dotTickDamage! + is.dotSpCoefficient! * 500) * moonfury
    expect(tick).toBeCloseTo(127.05, 9)
    expect(is.dotTicks).toBe(7)
    expect(tick * 7).toBeCloseTo(889.35, 9)
    const whole = (miss: number) => miss + (100 - miss) * averageResist(levelResistance(63, 60), 60)
    expect(whole(17)).toBeCloseTo(21.98, 9)
    expect(whole(2)).toBeCloseTo(7.88, 9)
  })

  it('B5: cast times under Nature’s Grace and Eclipse, and the GCD', () => {
    const sf = resolved(STARFIRE)
    expect(sf.castMs).toBe(3000)
    expect(hastedCastMs(sf.castMs, 1.1)).toBe(2727)
    expect(sf.castMs - sf.chargeCastMs!).toBe(2500)
    expect(hastedCastMs(sf.castMs - sf.chargeCastMs!, 1.1)).toBe(2273)
    expect(resolved(WRATH).castMs).toBe(1500)
    expect(hastedCastMs(1500, 1.1)).toBe(1364)
    expect(Math.round(GCD_MS * (1 - NATURES_GRACE_AURA.mods.gcdPct! / 100))).toBe(1350)
  })

  it('B6: mana, the talents’ percentages multiplied and rounded down', () => {
    expect([STARFIRE, WRATH, MOONFIRE, INSECT_SWARM].map((a) => resolved(a).costTenths / 10)).toEqual([255, 45, 281, 120])
    expect(balanceCost(120, [50, 25])).toBe(45)
    expect(INNERVATE_MANA).toBe(62)
  })

  it('B7: Omen of Clarity’s chance in Moonkin Form from each spell’s cast time', () => {
    const { plan } = buildPlan(defaultConfig(BALANCE))
    const ooc = plan.procs.find((p) => p.id === 'omenOfClaritySpells')!
    const castMs = (id: string) => plan.spells!.find((s) => s.id === id)!.procCastMs!
    expect((ooc.ppmCast! * castMs('starfire')) / 60000).toBeCloseTo(0.2, 12)
    for (const id of ['wrath', 'moonfire', 'insectSwarm']) expect((ooc.ppmCast! * castMs(id)) / 60000, id).toBeCloseTo(0.1, 12)
    expect(ooc.icdMs).toBe(5000)
  })

  it('B8: Innervate at 200 Spirit', () => {
    expect(spiritRegenTickTenths(200) / 10).toBe(55)
    expect(((spiritRegenTickTenths(200) / 10) * (1 + INNERVATE.aura!.mods.spiritRegen! / 100) * 20000) / 2000).toBe(2750)
  })
})

/** The default Balance plan, with these settings and its spells always landing, and crits as asked. */
function balancePlan(rotation: Record<string, RotationValue> = {}, crit: 'never' | 'always' = 'never', durationSec = 60): Plan {
  const config: SimConfig = { ...defaultConfig(BALANCE), rotation, fight: { ...defaultConfig(BALANCE).fight, durationSec, durationVariationPct: 0 } }
  const { plan } = buildPlan(config)
  plan.stats.spellHit = 100
  plan.stats.spellCrit = crit === 'always' ? 200 : -200
  return plan
}
const idx = (plan: Plan, id: string) => plan.abilities.findIndex((a) => a.id === id)

describe('the engine’s Balance pieces (druid.md §11.3)', () => {
  it('Eclipse: a landed Wrath gives 2 charges, and the next two Starfires cast 0.5 s faster', () => {
    const plan = balancePlan()
    const { uses } = timeline(plan)
    const sf = uses[idx(plan, 'starfire')]
    const wrath = uses[idx(plan, 'wrath')]
    // Insect Swarm at 0, Moonfire at 1.5 s, then Wrath (no charges) at 3 s: 1.5 s; two Starfires of 2.5 s.
    expect(uses[idx(plan, 'insectSwarm')][0]).toBe(0)
    expect(uses[idx(plan, 'moonfire')][0]).toBe(1500)
    expect(wrath.slice(0, 2)).toEqual([3000, 9500])
    expect(sf.slice(0, 2)).toEqual([4500, 7000])
    expect(plan.auras.find((a) => a.id === ECLIPSE_AURA.id)).toMatchObject({ maxStacks: 4, durationMs: 15000 })
  })

  it('without Eclipse, Starfire is the filler at its 3 s cast', () => {
    const plan = balancePlan({ [ID.eclipse]: false })
    const { uses } = timeline(plan)
    expect(uses[idx(plan, 'starfire')].slice(0, 3)).toEqual([3000, 6000, 9000])
    expect(uses[idx(plan, 'wrath')] ?? []).toEqual([])
  })

  it('Nature’s Grace: after a crit, casts are 10% faster and the GCD 1.35 s', () => {
    const plan = balancePlan({}, 'always')
    const { uses } = timeline(plan)
    // Moonfire crits at 1.5 s: Wrath at 3 s takes 1,364 ms; its crit refreshes the grace, and the
    // Starfire after it, with a charge, takes (3,000 − 500) / 1.1 = 2,273 ms.
    expect(uses[idx(plan, 'wrath')][0]).toBe(3000)
    expect(uses[idx(plan, 'starfire')].slice(0, 2)).toEqual([4364, 6637])
  })

  it('Nature’s Grace cuts an instant’s GCD to 1,350 ms', () => {
    // Moonfire only, then Insect Swarm: Moonfire's crit at 0 gives the grace, and the GCD it started is its own.
    const plan = balancePlan({ [ID.eclipse]: false, [ID.innervate]: false }, 'always')
    const mf = idx(plan, 'moonfire')
    const is = idx(plan, 'insectSwarm')
    // Moonfire first, then Insect Swarm with the grace up.
    plan.rotation = [
      { ability: mf, conditions: [{ code: COND.abilityAuraRefresh, a: mf, b: 0 }], unqueueBelowTenths: 0 },
      { ability: is, conditions: [{ code: COND.abilityAuraRefresh, a: is, b: 0 }], unqueueBelowTenths: 0 },
      { ability: idx(plan, 'starfire'), conditions: [], unqueueBelowTenths: 0 },
    ]
    const { uses } = timeline(plan)
    expect(uses[mf][0]).toBe(0)
    expect(uses[is][0]).toBe(1500)
    // Insect Swarm is a pure DoT, so it never crits as it lands; the grace from Moonfire (0–3 s) cuts its GCD.
    expect(uses[idx(plan, 'starfire')][0]).toBe(1500 + 1350)
  })

  it('Omen of Clarity on spells makes the next Starfire free, and the rotation casts Starfire on it', () => {
    const { plan } = buildPlan(defaultConfig(BALANCE))
    const cc = plan.auras.findIndex((a) => a.id === 'clearcasting')
    expect(plan.freeCastAura).toBe(cc)
    expect(plan.rotation.some((e) => plan.abilities[e.ability].id === 'starfire' && e.conditions.some((c) => c.code === COND.auraUp && c.a === cc))).toBe(true)
    // The melee Omen of Clarity isn't there: a moonkin never swings.
    expect(plan.procs.some((p) => p.id === 'omenOfClarity')).toBe(false)
    expect(plan.weapons).toEqual([null, null])
  })
})

describe('the Balance plan and priority (druid.md §11.1, §11.5, §11.6)', () => {
  it('fights in Moonkin Form, with its aura’s crit, Moonfury, the talents and its own Moonkin Aura in place of the Buffs tab’s', () => {
    const { plan, sheet } = buildPlan(defaultConfig(BALANCE))
    expect(plan.forms!.map((f) => f.id)).toEqual(['caster', 'cat', 'bear', 'moonkin'])
    expect(plan.form).toBe(3)
    expect(plan.schools!.damage[4]).toBeCloseTo(1.1, 12) // Arcane
    expect(plan.schools!.damage[3]).toBeCloseTo(1.1, 12) // Nature
    expect(plan.procs.map((p) => p.id).sort()).toEqual([ECLIPSE.id, NATURES_GRACE.id, 'omenOfClaritySpells'].sort())
    expect(sheet.spell?.caster).toBeDefined()
    // Moonkin Aura: the talent's, not the Buffs tab's too (+3% once), and no Leader of the Pack.
    const without = buildPlan({ ...defaultConfig(BALANCE), talents: talentCode({ 'Improved Wrath': 5, Genesis: 5, Moonglow: 3, 'Improved Moonfire': 2, "Nature's Majesty": 2, "Nature's Reach": 2, "Nature's Splendor": 1, 'Insect Swarm': 1, Vengeance: 5, 'Improved Starfire': 5, "Nature's Grace": 1, Eclipse: 3, Moonfury: 5, 'Heart of the Wild': 5 }) })
    expect(without.plan.form).toBe(0)
    expect(sheet.spell!.critPct - without.sheet.spell!.critPct).toBeCloseTo(0, 9) // its aura replaces the tab's +3
  })

  it('lists the default priority: Innervate, the DoTs, Starfire with Clearcasting, Eclipse’s Starfire and Wrath, the filler', () => {
    const { plan } = buildPlan(defaultConfig(BALANCE))
    const onGcd = plan.rotation.filter((e) => plan.abilities[e.ability].gcdMs > 0).map((e) => plan.abilities[e.ability].id)
    expect(onGcd).toEqual(['innervate', 'insectSwarm', 'moonfire', 'starfire', 'starfire', 'wrath', 'starfire', 'wrath'])
    expect(plan.abilities.find((a) => a.id === 'starfire')).toMatchObject({ castMs: 3000, costTenths: 2550, gcdCut: true, chargeCastMs: 500 })
    expect(plan.abilities.find((a) => a.id === 'innervate')!.gcdCut).toBe(false)
  })

  it('its settings: Faerie Fire as a duty, the filler, and requirements', () => {
    const talents = DEFAULT_TALENTS
    const ids = (values: Record<string, RotationValue>) => balanceRotation(values, talents, () => -1).abilities.map((a) => a.id)
    expect(ids({})).not.toContain('faerieFire')
    expect(ids({ [ID.faerieFire]: true })).toContain('faerieFire')
    expect(ids({ [ID.insectSwarm]: false, [ID.moonfire]: false })).toEqual(['innervate', 'starfire', 'wrath'])
    expect(balanceRotation({}, new Map(), () => -1).abilities.map((a) => a.id)).not.toContain('insectSwarm')
    expect(BALANCE_OPTIONS.find((o) => o.id === ID.eclipse)).toMatchObject({ requires: { talent: 'Eclipse' } })
  })
})

function runFights(plan: Plan, fights: number): Aggregate {
  const sim = new Sim(plan)
  let agg = emptyAggregate(plan.sources.length, plan.auras.length)
  for (let k = 0; k * CHUNK_SIZE < fights; k++) agg = mergeChunk(agg, runChunk(plan, k, Math.min(CHUNK_SIZE, fights - k * CHUNK_SIZE), sim))
  return agg
}

describe('golden run and determinism (docs/doctrine.md#4-engine)', () => {
  // Snapshot history (update only deliberately, and say why here):
  // - K6: the default Balance druid (druid.md §11.5, §11.6): Tauren, 41/5/0, the Balance pre-raid BiS,
  //   the casters' Standard raid; Innervate at 40%, the DoTs while 10 s is left, the potion at 2,000
  //   missing. On this seed's 1,000 fights about 425 DPS.
  it('keeps the default Balance druid’s result unchanged', () => {
    const bundle = buildPlan({ ...defaultConfig(BALANCE), run: { mode: 'fixed', iterations: 1000, seed: 12345 } })
    const result = toResult(bundle, runFights(bundle.plan, 1000), 0)
    expect({
      dps: result.dps,
      durationSec: result.durationSec,
      abilities: result.abilities.map((a) => [a.id, a.damage, a.casts, a.hits, a.crits, a.misses]),
      mana: result.mana,
      assumptions: result.assumptions.map((a) => a.id),
    }).toMatchSnapshot()
  })

  it('gives the same result for the same config and seed', () => {
    const bundle = buildPlan({ ...defaultConfig(BALANCE), run: { mode: 'fixed', iterations: 500, seed: 7 } })
    const a = toResult(bundle, runFights(bundle.plan, 500), 0)
    const b = toResult(buildPlan({ ...defaultConfig(BALANCE), run: { mode: 'fixed', iterations: 500, seed: 7 } }), runFights(bundle.plan, 500), 0)
    expect(b).toEqual(a)
  })
})

describe('the feral specs are as they were', () => {
  it('have only their three forms, no Balance procs, their melee Omen of Clarity, and no caster entries', () => {
    for (const spec of ['druid-feral-cat', 'druid-feral-bear'] as const) {
      const { plan, sheet } = buildPlan(defaultConfig(spec))
      expect(plan.forms!.map((f) => f.id), spec).toEqual(['caster', 'cat', 'bear'])
      expect(plan.procs.some((p) => p.id === 'omenOfClarity'), spec).toBe(true)
      expect(plan.procs.some((p) => p.id === 'omenOfClaritySpells' || p.id === NATURES_GRACE.id || p.id === ECLIPSE.id), spec).toBe(false)
      expect(plan.mana, spec).toEqual({ maxTenths: plan.mana!.maxTenths, regenTickTenths: plan.mana!.regenTickTenths, fiveSecondRuleMs: 5000 })
      expect(sheet.spell?.caster, spec).toBeUndefined()
      expect(defaultConfig(spec).buffs.enabled, spec).not.toContain('arcaneBrilliance')
    }
  })
})

describe('the Rotation tab’s notes (docs/ux.md "Rotation")', () => {
  it('says the filler isn’t used while Wrath for Eclipse is on, and is used without it or without the talent', () => {
    const unused = (values: Record<string, RotationValue>, talents = DEFAULT_TALENTS) => balanceUnusedSettings(values, talents)[ID.filler]
    expect(unused({})).toMatch(/^Not used while “Wrath for Eclipse” is on/)
    // It names the switch to turn off, not an unclear "it" (BD3).
    expect(unused({})).toMatch(/Turn “Wrath for Eclipse” off to cast only the filler\.$/)
    expect(unused({ [ID.eclipse]: false })).toBeUndefined()
    expect(unused({}, new Map())).toBeUndefined()
  })

  it('never lets Innervate’s mana share reach 0%, where it would never be cast: 5% at least (BD2)', () => {
    const option = BALANCE_OPTIONS.find((o) => o.id === ID.innervateMana)
    expect(option).toMatchObject({ kind: 'number', min: 5, max: 100, step: 5, default: 40 })
    const d = defaultConfig('druid-balance')
    const { config, warnings } = normalizeConfig({ ...d, rotation: { ...d.rotation, [ID.innervateMana]: 0 } })
    expect(config.rotation[ID.innervateMana]).toBe(5)
    expect(warnings).toContain('Innervate at or below was out of range and was set to 5.')
  })
})
