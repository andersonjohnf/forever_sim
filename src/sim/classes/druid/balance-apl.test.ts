// Balance's rotation as a priority list (decision D31; docs/classes/druid.md §11.5 "Balance's
// priority list"): the rows cover every setting, the default order plays exactly as Balance played
// before the list, the compiler follows the stored order, the rows a row that casts on every global
// cooldown leaves nothing say so, and a setup saved before the list loads as it was.
import { describe, expect, it } from 'vitest'
import { talentRanksByName } from '..'
import { normalizeConfig } from '../../config/normalize'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { DEMONIC_RUNE, MAJOR_MANA_POTION, POWER_INFUSION } from '../../effects/buffs'
import { CHUNK_SIZE, runChunk } from '../../engine/chunk'
import { Sim } from '../../engine/sim'
import { rotationPreset, unusedRotationSettings } from '../../index'
import { buildPlan } from '../../plan/build'
import type { Plan } from '../../plan/types'
import { emptyAggregate, mergeChunk } from '../../run/aggregate'
import { DEFAULT_APL_PRESET, defaultAplOrder, moveAplRow, normalizeAplOrder } from '../apl'
import { planJson } from '../warrior/fury-apl-cases'
import { BALANCE_APL, BALANCE_IDS as ID, BALANCE_OPTIONS, balanceRotation, balanceUnusedSettings } from './balance'
import { balanceCases, fingerprint } from './balance-apl-cases'

const TALENTS = talentRanksByName(TALENT_DATA.druid, defaultConfig('druid-balance').talents)
const CONTEXT = { consumables: [POWER_INFUSION, MAJOR_MANA_POTION, DEMONIC_RUNE], maxMana: 6000 }
/** Clearcasting's and Eclipse's auras, as the plan builder resolves them. */
const auraIndex = (id: string) => (id === 'clearcasting' ? 0 : id === 'eclipse' ? 1 : -1)
type Rot = ReturnType<typeof balanceRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
/** The order with `id` moved to just before `before`. */
const moved = (id: string, before: string, from = defaultAplOrder(BALANCE_APL)) =>
  moveAplRow(BALANCE_APL, from, id, from.indexOf(before) - (from.indexOf(id) < from.indexOf(before) ? 1 : 0))!
const rotation = (values: Record<string, string | number | boolean>, order?: string[]) => balanceRotation(values, TALENTS, auraIndex, CONTEXT, order)

/** druid.md §11.5's order, with Power Infusion and both mana consumables selected. */
const DEFAULT_IDS = ['powerInfusion', 'majorManaPotion', 'demonicRune', 'innervate', 'insectSwarm', 'moonfire', 'starfire', 'starfire', 'wrath', 'starfire', 'wrath']

describe('Balance’s priority list (D31)', () => {
  it('has a row or a spec-wide place for every setting, and only its own', () => {
    const known = new Set(BALANCE_OPTIONS.map((o) => o.id))
    const placed = new Set([...BALANCE_APL.rows.flatMap((r) => [...(r.enabledId ? [r.enabledId] : []), ...r.optionIds]), ...BALANCE_APL.specWide])
    expect([...known].filter((id) => !placed.has(id))).toEqual([])
    expect([...placed].filter((id) => !known.has(id))).toEqual([])
    expect(BALANCE_APL.specWide).toEqual([ID.manaPotion, ID.manaPotionMissing, ID.rune, ID.runeMissing])
    for (const row of BALANCE_APL.rows) {
      if (row.enabledId) expect(BALANCE_OPTIONS.find((o) => o.id === row.enabledId)?.kind, row.id).toBe('toggle')
      for (const part of row.summary ?? []) if (part.option) expect([row.enabledId, ...row.optionIds], row.id).toContain(part.option)
      if (!row.enabledId) expect(row.help, row.id).toBeTruthy()
    }
    expect(new Set(BALANCE_APL.rows.map((r) => r.id)).size).toBe(BALANCE_APL.rows.length)
    // The DoTs share their fight-left setting, which sits in both rows.
    expect(BALANCE_APL.rows.filter((r) => r.optionIds.includes(ID.dotsLeft)).map((r) => r.id)).toEqual(['insectSwarm', 'moonfire'])
    // Only Moonkin Form before the pull is pinned, first. Its only preset is the implicit Default.
    expect(BALANCE_APL.rows.filter((r) => r.pinned).map((r) => r.id)).toEqual(['prepull'])
    expect(BALANCE_APL.presets).toEqual([])
    expect(defaultAplOrder(BALANCE_APL)).toEqual(['prepull', 'racial', 'trinkets', 'powerInfusion', 'innervate', 'faerieFire', 'insectSwarm', 'moonfire', 'clearcasting', 'eclipse', 'filler'])
  })

  it('gives the same list in the default order as with none', () => {
    const none = rotation({})
    expect(rotation({}, defaultAplOrder(BALANCE_APL))).toEqual(none)
    expect(ids(none)).toEqual(DEFAULT_IDS)
  })

  it('gives 200 random setups the plan they had before the list', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before it:
    // a change to it is a change to what the default order plays.
    const cases = balanceCases(BALANCE_OPTIONS, 200)
    const plans = cases.map((config) => buildPlan({ ...config, rotationOrder: defaultAplOrder(BALANCE_APL) }).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover the potion, Power Infusion, Faerie Fire and Insect Swarm each on and off, and a rotation each.
    const has = (id: string) => plans.filter((p) => p.abilities.some((a) => a.id === id)).length
    for (const id of ['majorManaPotion', 'powerInfusion', 'faerieFire', 'insectSwarm']) {
      expect(has(id), id).toBeGreaterThan(20)
      expect(has(id), id).toBeLessThan(190)
    }
    for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
    expect(hashes).toMatchSnapshot()
  })

  it('builds the list in the stored order', () => {
    // Moonfire above Insect Swarm, and the Filler above Wrath for Eclipse.
    const r = rotation({}, moved('filler', 'eclipse', moved('moonfire', 'insectSwarm')))
    expect(ids(r)).toEqual(['powerInfusion', 'majorManaPotion', 'demonicRune', 'innervate', 'moonfire', 'insectSwarm', 'starfire', 'starfire', 'wrath', 'starfire', 'wrath'])
    // Innervate first: the mana consumables come just before it, the first row on the global cooldown,
    // then the cooldowns off it. The pre-pull stays first, and can't move.
    const first = rotation({}, moved('innervate', 'racial'))
    expect(ids(first).slice(0, 4)).toEqual(['majorManaPotion', 'demonicRune', 'innervate', 'powerInfusion'])
    expect(moveAplRow(BALANCE_APL, defaultAplOrder(BALANCE_APL), 'innervate', 0)).toBeNull()
    expect(moveAplRow(BALANCE_APL, defaultAplOrder(BALANCE_APL), 'prepull', 3)).toBeNull()
    // Each row's lines are the same wherever it sits.
    const lines = (rot: Rot, id: string) => rot.rotation.filter((e) => rot.abilities[e.ability].id === id).map((e) => e.conditions)
    expect(lines(first, 'innervate')).toEqual(lines(rotation({}), 'innervate'))
  })

  it('skips a row that’s off', () => {
    expect(ids(rotation({ [ID.moonfire]: false, [ID.innervate]: false }))).toEqual(DEFAULT_IDS.filter((id) => id !== 'moonfire' && id !== 'innervate'))
    // Wrath for Eclipse off: only the filler's Starfire, then Wrath without the mana for it.
    expect(ids(rotation({ [ID.eclipse]: false }))).toEqual([...DEFAULT_IDS.slice(0, 7), 'starfire', 'wrath'])
    expect(ids(rotation({ [ID.eclipse]: false, [ID.filler]: 'wrath' }))).toEqual([...DEFAULT_IDS.slice(0, 7), 'wrath'])
    // Faerie Fire on, its duty, after Innervate.
    expect(ids(rotation({ [ID.faerieFire]: true })).slice(3, 5)).toEqual(['innervate', 'faerieFire'])
  })

  it('says which rows a row that casts on every global cooldown leaves nothing, in the order they sit', () => {
    const unused = (values: Record<string, string | number | boolean>, order?: string[], talents = TALENTS) => balanceUnusedSettings(values, talents, order)
    // The default: the filler, below Wrath for Eclipse.
    expect(Object.keys(unused({}))).toEqual([ID.filler])
    expect(unused({ [ID.eclipse]: false })).toEqual({})
    expect(unused({}, undefined, new Map([...TALENTS].filter(([name]) => name !== 'Eclipse')))).toEqual({})
    // The Filler above Wrath for Eclipse: Eclipse is the one left nothing.
    expect(unused({}, moved('filler', 'eclipse'))).toEqual({ [ID.eclipse]: 'Below the Filler: used only while you haven’t the mana for Wrath.' })
    // Moonfire and Innervate moved below Wrath for Eclipse; Faerie Fire there too, but it's off.
    let order = moved('moonfire', 'filler')
    order = moved('innervate', 'filler', order)
    order = moved('faerieFire', 'filler', order)
    const below = 'Below Wrath for Eclipse: used only while you haven’t the mana for Wrath.'
    expect(unused({}, order)).toEqual({ [ID.filler]: expect.stringMatching(/^Not used while “Wrath for Eclipse” is on/), [ID.moonfire]: below, [ID.innervate]: below })
    // With Eclipse off, they're below the Filler instead.
    expect(unused({ [ID.eclipse]: false }, order)).toEqual({})
    expect(unused({ [ID.eclipse]: false }, moved('filler', 'moonfire', order))).toEqual({
      [ID.moonfire]: 'Below the Filler: used only while you haven’t the mana for Wrath.',
      [ID.innervate]: 'Below the Filler: used only while you haven’t the mana for Wrath.',
    })
    // The app reads the stored order.
    const config = { ...defaultConfig('druid-balance'), rotationOrder: moved('filler', 'eclipse') }
    expect(Object.keys(unusedRotationSettings(config))).toContain(ID.eclipse)
    expect(Object.keys(unusedRotationSettings(config))).not.toContain(ID.filler)
  })

  it('reads a stored order: unknown ids dropped, a missing row at its default place, the pre-pull first', () => {
    const def = defaultAplOrder(BALANCE_APL)
    expect(normalizeAplOrder(BALANCE_APL, undefined)).toEqual(def)
    expect(normalizeAplOrder(BALANCE_APL, ['bogus', 7, 'filler', 'prepull'])).toEqual(def)
    // The Filler first: Moonkin Form stays before it, the rest follow in their default order.
    expect(normalizeAplOrder(BALANCE_APL, ['filler', 'racial'])).toEqual(['prepull', 'filler', ...def.slice(1, -1)])
    // A row an order leaves out (as one added later would be) goes after its default neighbour.
    const withoutCc = moved('eclipse', 'racial', def.filter((id) => id !== 'clearcasting'))
    expect(normalizeAplOrder(BALANCE_APL, withoutCc)).toEqual(['prepull', 'eclipse', 'racial', 'trinkets', 'powerInfusion', 'innervate', 'faerieFire', 'insectSwarm', 'moonfire', 'clearcasting', 'filler'])
  })

  it('loads a setup saved before the list as it was, and plays a moved order differently', () => {
    const saved = { ...defaultConfig('druid-balance'), rotation: { [ID.innervateMana]: 30, [ID.faerieFire]: true } }
    const { config } = normalizeConfig(saved)
    expect(config.rotationOrder).toBeUndefined()
    expect(planJson(buildPlan(config).plan)).toBe(planJson(buildPlan({ ...saved, rotationOrder: defaultAplOrder(BALANCE_APL) }).plan))
    expect(rotationPreset(config)).toBe('custom')
    expect(rotationPreset(normalizeConfig(defaultConfig('druid-balance')).config)).toBe(DEFAULT_APL_PRESET)
    const order = moved('filler', 'eclipse')
    expect(normalizeConfig({ ...saved, rotationOrder: order }).config.rotationOrder).toEqual(order)
    const run = (plan: Plan) => {
      const sim = new Sim(plan)
      return mergeChunk(emptyAggregate(plan.sources.length, plan.auras.length), runChunk(plan, 0, Math.min(CHUNK_SIZE, 100), sim)).dps.mean
    }
    const fixed = { ...defaultConfig('druid-balance'), run: { mode: 'fixed' as const, iterations: 100, seed: 99 } }
    const none = buildPlan(fixed).plan
    // Faerie Fire is off by default, so moving it changes nothing it plays; the Filler above Eclipse does.
    expect(run(buildPlan({ ...fixed, rotationOrder: moved('faerieFire', 'racial') }).plan)).toBe(run(none))
    expect(run(buildPlan({ ...fixed, rotationOrder: order }).plan)).not.toBe(run(none))
  })
})
