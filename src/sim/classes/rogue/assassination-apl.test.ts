// The Assassination rogue's rotation as a priority list (decision D31; docs/classes/rogue.md §6.2
// "The priority list"): the rows cover every setting, the list in its default order plays exactly as
// Assassination played before it, the compiler follows the stored order, and a setup saved before
// the list loads unchanged.
import { describe, expect, it } from 'vitest'
import { talentRanksByName } from '..'
import { defaultConfig, TALENT_DATA } from '../../defaults'
import { JUJU_FLURRY } from '../../effects/buffs'
import { normalizeConfig } from '../../config/normalize'
import { rotationPreset } from '../../index'
import { buildPlan } from '../../plan/build'
import { activeAplPreset, aplPresets, CUSTOM_APL_PRESET, DEFAULT_APL_PRESET, defaultAplOrder, moveAplRow, normalizeAplOrder } from '../apl'
import { THISTLE_TEA } from './abilities'
import { ASSASSINATION_APL, ASSASSINATION_IDS as ID, ASSASSINATION_OPTIONS, assassinationRotation } from './assassination'
import { assassinationCases } from './assassination-apl-cases'
import { expectRowsCoverOptions, fingerprint, planJson } from './combat-apl-cases'

const TALENTS = talentRanksByName(TALENT_DATA.rogue, defaultConfig('rogue-assassination').talents)
const CONTEXT = { race: 'horde-orc', items: [], consumables: [THISTLE_TEA, JUJU_FLURRY], weaponTypes: ['dagger', 'dagger'] as const }
type Rot = ReturnType<typeof assassinationRotation>
const ids = (r: Rot) => r.rotation.map((e) => r.abilities[e.ability].id)
const DEFAULT_ORDER = defaultAplOrder(ASSASSINATION_APL)

describe('the Assassination rogue’s priority list (D31)', () => {
  it('has a row or a spec-wide place for every setting, and nothing pinned', () => {
    expectRowsCoverOptions(ASSASSINATION_APL, ASSASSINATION_OPTIONS)
    expect(DEFAULT_ORDER).toEqual(['racial', 'onUseItems', 'sliceAndDice', 'venom', 'exposeArmor', 'coldBlood', 'eviscerate', 'builder'])
    expect(ASSASSINATION_APL.specWide).toEqual([ID.tea, ID.teaEnergy, ID.juju])
    expect(aplPresets(ASSASSINATION_APL).map((p) => p.label)).toEqual(['Default'])
  })

  it('gives 200 random setups the plan they had before the list', () => {
    // The snapshot is of the plans before the priority list (A2), whole, taken on the code before it,
    // with no order stored; the default order stored gives the same plans.
    // Re-taken 2026-09-25 only for Eviscerate's attack power, 3% → 4% per point (a player's Discord tests, rogue.md
    // §3.4): the plan carries the coefficient, and with 0.03 the earlier snapshot still matched.
    // Re-taken 2026-09-25 again only for the poisons' attack power (a player's Discord tests, rogue.md §4.1, §4.2):
    // their procs carry `apCoefficient`, and without it the earlier snapshot still matched.
    const cases = assassinationCases(ASSASSINATION_OPTIONS, 200)
    const plans = cases.map((config) => buildPlan(config).plan)
    const hashes = plans.map((plan) => fingerprint(planJson(plan)))
    expect(cases.map((config) => fingerprint(planJson(buildPlan({ ...config, rotationOrder: DEFAULT_ORDER }).plan)))).toEqual(hashes)
    expect(new Set(hashes).size).toBeGreaterThan(150)
    // They cover Mutilate and Sinister Strike, Venom and Cold Blood.
    const has = (id: string) => plans.filter((p) => p.abilities.some((a) => a.id === id)).length
    expect(has('mutilate')).toBeGreaterThan(30)
    expect(has('sinisterStrike')).toBeGreaterThan(30)
    expect(has('venom')).toBeGreaterThan(20)
    expect(has('coldBlood')).toBeGreaterThan(30)
    for (const plan of plans) expect(plan.rotation.length).toBeGreaterThan(0)
    expect(hashes).toMatchSnapshot()
  })

  it('gives the same list in the default order as with none, and builds it in the stored order', () => {
    const values = { [ID.venom]: true, [ID.expose]: true }
    const none = assassinationRotation(values, TALENTS, CONTEXT)
    expect(assassinationRotation(values, TALENTS, CONTEXT, DEFAULT_ORDER)).toEqual(none)
    // rogue.md §6.2's order.
    expect(ids(none)).toEqual(['bloodFury', 'thistleTea', 'jujuFlurry', 'sliceAndDice', 'venom', 'exposeArmor', 'coldBlood', 'eviscerate', 'mutilate'])
    // Cold Blood below Eviscerate, and Venom above Slice and Dice: each keeps its own lines. Cold
    // Blood still waits for Eviscerate's Energy, which it reads by definition.
    let order = moveAplRow(ASSASSINATION_APL, DEFAULT_ORDER, 'coldBlood', DEFAULT_ORDER.indexOf('eviscerate'))!
    order = moveAplRow(ASSASSINATION_APL, order, 'venom', order.indexOf('sliceAndDice'))!
    const r = assassinationRotation(values, TALENTS, CONTEXT, order)
    expect(ids(r)).toEqual(['bloodFury', 'thistleTea', 'jujuFlurry', 'venom', 'sliceAndDice', 'exposeArmor', 'eviscerate', 'coldBlood', 'mutilate'])
    const conditions = (rot: Rot, id: string) => rot.rotation.filter((e) => rot.abilities[e.ability].id === id).map((e) => e.conditions.map((c) => [c.code, c.b]))
    for (const id of ['venom', 'sliceAndDice', 'coldBlood', 'eviscerate']) expect(conditions(r, id), id).toEqual(conditions(none, id))
    const coldBlood = (rot: Rot) => rot.rotation.find((e) => rot.abilities[e.ability].id === 'coldBlood')!.conditions
    expect(coldBlood(r)).toEqual(coldBlood(none))
    // The builder first: it takes every global cooldown it can pay for.
    const builderUp = moveAplRow(ASSASSINATION_APL, DEFAULT_ORDER, 'builder', 0)!
    expect(ids(assassinationRotation({}, TALENTS, CONTEXT, builderUp))[0]).toBe('mutilate')
  })

  it('skips a row that’s off, wherever it sits; the builder, which has no switch, falls back to Sinister Strike', () => {
    const order = moveAplRow(ASSASSINATION_APL, DEFAULT_ORDER, 'coldBlood', 0)!
    expect(ids(assassinationRotation({}, TALENTS, CONTEXT, order))[0]).toBe('coldBlood')
    const off = assassinationRotation({ [ID.coldBlood]: false, [ID.mutilate]: false }, TALENTS, CONTEXT, order)
    expect(ids(off)).toEqual(['bloodFury', 'thistleTea', 'jujuFlurry', 'sliceAndDice', 'eviscerate', 'sinisterStrike'])
    // Cold Blood needs Eviscerate: with it off, Cold Blood isn't used either, wherever it sits.
    expect(ids(assassinationRotation({ [ID.eviscerate]: false }, TALENTS, CONTEXT, order))).not.toContain('coldBlood')
    // Without a dagger in each hand, Sinister Strike builds.
    expect(ids(assassinationRotation({}, TALENTS, { ...CONTEXT, weaponTypes: ['sword', 'dagger'] }, order)).at(-1)).toBe('sinisterStrike')
  })

  it('places the rows a stored order doesn’t name, and drops what it doesn’t know', () => {
    // The rows before Cold Blood by default, none of them named, go first in their order; Eviscerate
    // follows Cold Blood, as it does by default.
    expect(normalizeAplOrder(ASSASSINATION_APL, ['builder', 'coldBlood'])).toEqual([
      'racial',
      'onUseItems',
      'sliceAndDice',
      'venom',
      'exposeArmor',
      'builder',
      'coldBlood',
      'eviscerate',
    ])
    // A row added in a later version (here, Venom missing) lands between its default neighbours.
    expect(normalizeAplOrder(ASSASSINATION_APL, DEFAULT_ORDER.filter((id) => id !== 'venom'))).toEqual(DEFAULT_ORDER)
    expect(normalizeAplOrder(ASSASSINATION_APL, ['nope', 3])).toEqual(DEFAULT_ORDER)
  })

  it('loads a setup saved before the list byte-identical, and reads it as the Default', () => {
    const before = defaultConfig('rogue-assassination')
    const { config, warnings } = normalizeConfig(JSON.parse(JSON.stringify(before)))
    expect(warnings).toEqual([])
    expect(JSON.stringify(config)).toBe(JSON.stringify(before))
    expect(fingerprint(planJson(buildPlan(config).plan))).toBe(fingerprint(planJson(buildPlan({ ...before, rotationOrder: DEFAULT_ORDER }).plan)))
    expect(rotationPreset(config)).toBe(DEFAULT_APL_PRESET)
    const active = (saved: Record<string, number | boolean>, order?: string[]) => activeAplPreset(ASSASSINATION_APL, ASSASSINATION_OPTIONS, saved, order, TALENTS)
    expect(active({ [ID.juju]: false })).toBe(DEFAULT_APL_PRESET)
    expect(active({ [ID.venom]: true })).toBe(CUSTOM_APL_PRESET)
    expect(active({}, moveAplRow(ASSASSINATION_APL, DEFAULT_ORDER, 'venom', 6)!)).toBe(CUSTOM_APL_PRESET)
  })
})
